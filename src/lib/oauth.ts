import { Linking } from 'react-native';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(id));
  return controller.signal;
}

function mergeSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      onAbort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

export async function startOAuthFlow(
  lambdaBaseUrl: string,
  signal: AbortSignal,
): Promise<OAuthTokens> {
  if (!lambdaBaseUrl) throw new Error('OAuth Lambda URL is not configured');

  if (signal.aborted) throw new Error('Cancelled');

  // Step 1: start session on lambda
  let startResp: Response;
  try {
    startResp = await fetch(`${lambdaBaseUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: mergeSignals(signal, timeoutSignal(10000)),
    });
  } catch {
    if (signal.aborted) throw new Error('Cancelled');
    throw new Error('Lambda /start failed');
  }

  if (!startResp.ok) {
    throw new Error(`Lambda /start failed: ${startResp.status}`);
  }

  const { authUrl, state } = (await startResp.json()) as { authUrl: string; state: string };

  // Step 2: open browser
  await Linking.openURL(authUrl);

  // Step 3: poll /token until tokens arrive
  const deadline = Date.now() + 85_000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('Cancelled');

    await sleep(1500);
    if (signal.aborted) throw new Error('Cancelled');

    let resp: Response;
    try {
      resp = await fetch(`${lambdaBaseUrl}/token?state=${encodeURIComponent(state)}`, {
        signal: mergeSignals(signal, timeoutSignal(5000)),
      });
    } catch {
      if (signal.aborted) throw new Error('Cancelled');
      // Network hiccup — keep trying until deadline
      continue;
    }

    if (resp.status === 200) {
      return (await resp.json()) as OAuthTokens;
    }

    if (resp.status === 403) {
      throw new Error('Authorization was denied in the browser');
    }

    if (resp.status === 410) {
      throw new Error('Session expired — please try again');
    }

    // 404 = not ready yet, keep polling
  }

  throw new Error('Timed out waiting for Airtable authorization');
}

export async function refreshOAuthToken(
  lambdaBaseUrl: string,
  refreshToken: string,
  signal?: AbortSignal,
): Promise<OAuthTokens> {
  if (!lambdaBaseUrl) throw new Error('OAuth Lambda URL is not configured');
  if (!refreshToken) throw new Error('Missing refresh token');

  const controller = new AbortController();
  const combinedSignal = signal ? mergeSignals(signal, controller.signal) : controller.signal;
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(`${lambdaBaseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: combinedSignal,
    });

    if (!resp.ok) {
      throw new Error(`OAuth refresh failed: ${resp.status}`);
    }

    return (await resp.json()) as OAuthTokens;
  } finally {
    clearTimeout(timer);
  }
}

