import * as SecureStore from 'expo-secure-store';
import type { Account, AccountsState } from '../types';
import * as settingsLib from './settings';

const ACCOUNTS_KEY = 'airtable_accounts_v1';

function randomUUID(): string {
  // Simple UUID v4-ish generator; good enough for local IDs.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function defaultAccountName(baseId: string): string {
  return baseId ? `Account (${baseId.slice(0, 10)}…)` : 'Airtable Account';
}

export async function loadAccountsState(): Promise<AccountsState> {
  const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
  if (!raw) return { activeId: null, accounts: [] };
  try {
    const parsed = JSON.parse(raw) as AccountsState;
    return parsed;
  } catch {
    return { activeId: null, accounts: [] };
  }
}

export async function saveAccountsState(state: AccountsState): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(state));
}

export async function migrateLegacySettingsToAccounts(): Promise<AccountsState> {
  const existing = await loadAccountsState();
  if (existing.accounts.length > 0) return existing;

  const legacy = await settingsLib.loadSettings();
  const token = legacy.airtable_access_token;
  const baseId = legacy.airtable_base_id;
  const tableName = legacy.airtable_table_name ?? 'Tasks';

  if (token && baseId) {
    const account: Account = {
      id: randomUUID(),
      name: defaultAccountName(baseId),
      authType: 'pat',
      token,
      baseId,
      tableName,
    };
    const next: AccountsState = { activeId: account.id, accounts: [account] };
    await saveAccountsState(next);

    // Prevent the legacy single-account fields from recreating the account
    // on the next app start (only migrate once).
    await settingsLib.saveSettings({
      airtable_access_token: '',
      airtable_base_id: '',
      airtable_table_name: '',
    });
    return next;
  }

  return existing;
}

export async function addAccount(data: Omit<Account, 'id'>): Promise<AccountsState> {
  const state = await loadAccountsState();
  const account: Account = { ...data, id: randomUUID() };
  const next: AccountsState = {
    activeId: state.activeId ?? account.id,
    accounts: [...state.accounts, account],
  };
  await saveAccountsState(next);
  return next;
}

export async function updateAccount(
  id: string,
  updates: Partial<Omit<Account, 'id'>>,
): Promise<AccountsState> {
  const state = await loadAccountsState();
  const idx = state.accounts.findIndex((a) => a.id === id);
  if (idx === -1) return state;

  const nextAccounts = state.accounts.slice();
  nextAccounts[idx] = { ...nextAccounts[idx], ...updates };
  const next: AccountsState = { ...state, accounts: nextAccounts };
  await saveAccountsState(next);
  return next;
}

export async function deleteAccount(id: string): Promise<AccountsState> {
  const state = await loadAccountsState();
  const nextAccounts = state.accounts.filter((a) => a.id !== id);
  const nextActive = state.activeId === id ? nextAccounts[0]?.id ?? null : state.activeId;
  const next: AccountsState = { activeId: nextActive, accounts: nextAccounts };
  await saveAccountsState(next);
  return next;
}

export async function setActiveAccount(id: string): Promise<AccountsState> {
  const state = await loadAccountsState();
  if (!state.accounts.some((a) => a.id === id)) return state;
  const next: AccountsState = { ...state, activeId: id };
  await saveAccountsState(next);
  return next;
}

