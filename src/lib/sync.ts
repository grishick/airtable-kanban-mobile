import * as db from './db';
import { AirtableClient, AirtableFields, AirtableRecord } from './airtable';
import type { AuthType, SyncStatus, Task, TagOption, PendingOp } from '../types';
import type { OAuthTokens } from './oauth';
import { refreshOAuthToken } from './oauth';

const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRIES = 5;

export class SyncEngine {
  private client: AirtableClient | null = null;
  private state: SyncStatus['state'] = 'idle';
  private lastSync: string | null = null;
  private lastError: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private initTimer: ReturnType<typeof setTimeout> | null = null;
  private authType: AuthType = 'pat';
  private baseId = '';
  private tableName = 'Tasks';
  private positionFieldEnsured = false;

  private oauthLambdaUrl: string | null = null;
  private oauthRefreshToken: string | null = null;
  private oauthTokenExpiresAt: string | null = null;
  private onOAuthTokensRefreshed: ((tokens: OAuthTokens) => Promise<void>) | null = null;

  constructor(
    private onStatusChange: (status: SyncStatus) => void,
    private onTasksChange: (tasks: Task[]) => void,
    private onTagOptionsChange: (options: TagOption[]) => void,
  ) {}

  async reinit(settings: {
    authType?: AuthType;
    token?: string;
    baseId?: string;
    tableName?: string;
    oauthLambdaUrl?: string;
    oauthRefreshToken?: string;
    oauthTokenExpiresAt?: string;
    onOAuthTokensRefreshed?: ((tokens: OAuthTokens) => Promise<void>) | null;
  }): Promise<void> {
    const {
      authType = 'pat',
      token = '',
      baseId = '',
      tableName = 'Tasks',
      oauthLambdaUrl,
      oauthRefreshToken,
      oauthTokenExpiresAt,
      onOAuthTokensRefreshed,
    } = settings;

    this.authType = authType;
    this.baseId = baseId;
    this.tableName = tableName;
    this.positionFieldEnsured = false;

    if (authType === 'oauth') {
      this.oauthLambdaUrl = oauthLambdaUrl ?? null;
      this.oauthRefreshToken = oauthRefreshToken ?? null;
      this.oauthTokenExpiresAt = oauthTokenExpiresAt ?? null;
      this.onOAuthTokensRefreshed = onOAuthTokensRefreshed ?? null;
    } else {
      this.oauthLambdaUrl = null;
      this.oauthRefreshToken = null;
      this.oauthTokenExpiresAt = null;
      this.onOAuthTokensRefreshed = null;
    }

    if (token && baseId) {
      this.client = new AirtableClient(token, baseId, tableName);
      if (this.state === 'unconfigured') this.state = 'idle';
    } else {
      this.client = null;
      this.state = 'unconfigured';
    }

    await this.broadcastStatus();
  }

  start(): void {
    this.initTimer = setTimeout(() => {
      void this.sync();
      this.scheduleLoop();
    }, 3000);
  }

  stop(): void {
    if (this.initTimer) {
      clearTimeout(this.initTimer);
      this.initTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleLoop(): void {
    this.timer = setInterval(() => {
      void this.sync();
    }, SYNC_INTERVAL_MS);
  }

  async getStatus(): Promise<SyncStatus> {
    const pendingOps = await db.getPendingOps();
    return {
      state: this.state,
      lastSync: this.lastSync,
      error: this.lastError,
      pendingOps: pendingOps.length,
    };
  }

  private async broadcastStatus(): Promise<void> {
    this.onStatusChange(await this.getStatus());
  }

  private async broadcastTasks(): Promise<void> {
    this.onTasksChange(await db.getAllTasks());
  }

  async createTable(): Promise<void> {
    if (!this.client) throw new Error('Airtable not configured');
    await this.client.createTable();
    this.state = 'idle';
    this.lastError = null;
    await this.broadcastStatus();
    await this.sync();
  }

  async sync(): Promise<void> {
    await this.refreshOAuthTokenIfNeeded();
    if (!this.client) {
      this.state = 'unconfigured';
      await this.broadcastStatus();
      return;
    }

    this.state = 'syncing';
    await this.broadcastStatus();

    try {
      await this.ensurePositionField();
      await this.pushPendingOps();
      await this.pullFromAirtable();
      await this.updateTagOptions();
      this.state = 'idle';
      this.lastSync = new Date().toISOString();
      this.lastError = null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.state = isTableNotFoundError(msg)
        ? 'table_not_found'
        : isNetworkError(msg)
          ? 'offline'
          : 'error';
    }

    await this.broadcastStatus();
    await this.broadcastTasks();
  }

  // ── Schema migration ────────────────────────────────────────────────────

  private async ensurePositionField(): Promise<void> {
    if (this.positionFieldEnsured || !this.client) return;
    try {
      await this.client.ensurePositionField();
      this.positionFieldEnsured = true;
      await this.backfillPositions();
    } catch (err) {
      console.warn('[sync] failed to ensure Position field:', err);
    }
  }

  private async backfillPositions(): Promise<void> {
    if (!this.client) return;
    const allTasks = await db.getAllTasks();
    const pendingOps = await db.getPendingOps();
    const pendingTaskIds = new Set(pendingOps.map((op) => op.task_id));
    const updates = allTasks
      .filter(t => t.airtable_id && !pendingTaskIds.has(t.id))
      .map(t => ({ id: t.airtable_id!, fields: { Position: t.position } as AirtableFields }));

    if (updates.length === 0) return;
    try {
      await this.client.updateRecords(updates);
    } catch (err) {
      console.warn('[sync] position backfill failed:', err);
    }
  }

  // ── Push ──────────────────────────────────────────────────────────────────

  private async pushPendingOps(): Promise<void> {
    const ops = await db.getPendingOps();
    for (const op of ops) {
      if (op.retry_count >= MAX_RETRIES) {
        console.error(`[sync] dropping op ${op.id} after ${MAX_RETRIES} retries`);
        await db.deletePendingOp(op.id);
        continue;
      }
      try {
        if (op.op_type === 'create') await this.pushCreate(op);
        else if (op.op_type === 'update') await this.pushUpdate(op);
        else if (op.op_type === 'delete') await this.pushDelete(op);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.incrementPendingOpRetry(op.id, msg);
        if (isNetworkError(msg)) throw err;
      }
    }
  }

  private async pushCreate(op: PendingOp): Promise<void> {
    const task = await db.getTask(op.task_id);
    if (!task) { await db.deletePendingOp(op.id); return; }
    const record = await this.client!.createRecord(taskToFields(task));
    await db.updateTask(op.task_id, { airtable_id: record.id, synced_at: new Date().toISOString() });
    await db.deletePendingOp(op.id);
  }

  private async pushUpdate(op: PendingOp): Promise<void> {
    const task = await db.getTask(op.task_id);
    if (!task) { await db.deletePendingOp(op.id); return; }
    if (!task.airtable_id) {
      const pendingCreate = await db.getPendingOpByTaskAndType(op.task_id, 'create');
      if (!pendingCreate) {
        console.error(`[sync] dropping orphaned update op ${op.id}`);
        await db.deletePendingOp(op.id);
      }
      return;
    }
    await this.client!.updateRecord(task.airtable_id, taskToFields(task));
    await db.updateTask(op.task_id, { synced_at: new Date().toISOString() });
    await db.deletePendingOp(op.id);
  }

  private async pushDelete(op: PendingOp): Promise<void> {
    const payload = JSON.parse(op.payload) as { airtable_id?: string };
    if (payload.airtable_id) {
      await this.client!.deleteRecord(payload.airtable_id);
    }
    await db.hardDeleteTask(op.task_id);
    await db.deletePendingOp(op.id);
  }

  // ── Tag Options ────────────────────────────────────────────────────────────

  private async updateTagOptions(): Promise<void> {
    try {
      const options = await this.client!.fetchTagOptions();
      if (options.length > 0) {
        await db.replaceTagOptions(options);
        this.onTagOptionsChange(options);
      }
    } catch (err) {
      console.warn('[sync] failed to fetch tag options:', err);
    }
  }

  // ── Pull ──────────────────────────────────────────────────────────────────

  private async pullFromAirtable(): Promise<void> {
    const records = await this.client!.fetchAllRecords();
    const pendingOps = await db.getPendingOps();
    const pendingTaskIds = new Set(pendingOps.map((op) => op.task_id));

    for (const record of records) {
      const existing = await db.getTaskByAirtableId(record.id);
      if (existing) {
        if (pendingTaskIds.has(existing.id)) continue;
        await db.updateTask(existing.id, {
          ...airtableToTaskFields(record),
          synced_at: new Date().toISOString(),
        });
      } else {
        const fields = airtableToTaskFields(record);
        const position = fields.position ?? (await db.getMaxPosition(fields.status ?? 'Not Started')) + 1000;
        await db.createTask({ ...fields, position, airtable_id: record.id });
      }
    }
  }

  private async refreshOAuthTokenIfNeeded(): Promise<void> {
    if (this.authType !== 'oauth') return;
    if (!this.oauthLambdaUrl || !this.oauthRefreshToken) return;
    if (!this.baseId) return;

    const expiry = this.oauthTokenExpiresAt
      ? new Date(this.oauthTokenExpiresAt).getTime()
      : NaN;

    // Refresh when expired, close to expiry, or we currently have no Airtable client.
    const needsRefresh =
      isNaN(expiry) || expiry - Date.now() < 5 * 60 * 1000 || !this.client;

    if (!needsRefresh) return;

    try {
      const tokens = await refreshOAuthToken(this.oauthLambdaUrl, this.oauthRefreshToken);
      this.oauthRefreshToken = tokens.refreshToken;
      this.oauthTokenExpiresAt = tokens.expiresAt;
      this.client = new AirtableClient(tokens.accessToken, this.baseId, this.tableName);
      await this.onOAuthTokensRefreshed?.(tokens);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.client = null;
      this.state = 'unconfigured';
      this.lastError = msg;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function taskToFields(task: Task): AirtableFields {
  const fields: AirtableFields = {
    'Task Name': task.title,
    Status: task.status,
    Position: task.position,
  };
  if (task.description) fields.Description = task.description;
  if (task.priority) fields.Priority = task.priority;
  if (task.due_date) fields['Due Date'] = task.due_date;
  if (task.tags) fields.Tags = task.tags.split(',').map((t) => t.trim()).filter(Boolean);
  return fields;
}

function airtableToTaskFields(record: AirtableRecord): Partial<Task> {
  const f = record.fields;
  const tags = Array.isArray(f.Tags)
    ? f.Tags.join(', ')
    : (f.Tags as string | undefined) ?? null;
  const fields: Partial<Task> = {
    title: f['Task Name'] ?? 'Untitled',
    description: f.Description ?? '',
    status: f.Status ?? 'Not Started',
    priority: f.Priority ?? null,
    due_date: f['Due Date'] ?? null,
    tags,
  };
  if (typeof f.Position === 'number') fields.position = f.Position;
  return fields;
}

function isTableNotFoundError(msg: string): boolean {
  return (
    msg.includes('Airtable 404') ||
    msg.includes('TABLE_NOT_FOUND') ||
    msg.includes('INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND')
  );
}

function isNetworkError(msg: string): boolean {
  return (
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('Network request failed')
  );
}
