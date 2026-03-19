import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as db from '../lib/db';
import * as settingsLib from '../lib/settings';
import * as accountsLib from '../lib/accounts';
import { SyncEngine } from '../lib/sync';
import type { Account, Settings, Task, SyncStatus, TagOption } from '../types';
import type { OAuthTokens } from '../lib/oauth';

interface AppContextValue {
  tasks: Task[];
  tagOptions: TagOption[];
  syncStatus: SyncStatus;
  settings: Settings;
  accounts: Account[];
  activeAccountId: string | null;
  loading: boolean;
  createTask: (data: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  triggerSync: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
  addAccount: (data: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Omit<Account, 'id'>>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  createAirtableTable: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'idle',
    lastSync: null,
    error: null,
    pendingOps: 0,
  });
  const [settings, setSettings] = useState<Settings>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  const syncRef = useRef<SyncEngine | null>(null);
  const activeAccountIdRef = useRef<string | null>(null);

  // Initialize DB, load data, start sync engine
  useEffect(() => {
    let mounted = true;

    async function init() {
      // Accounts (multi-account support) + legacy migration
      const accountsState = await accountsLib.migrateLegacySettingsToAccounts();
      const savedSettings = await settingsLib.loadSettings();

      const activeAccount = accountsState.accounts.find((a) => a.id === accountsState.activeId) ?? accountsState.accounts[0] ?? null;
      const activeId = activeAccount?.id ?? null;

      await db.initDBForAccountId(activeId ?? undefined);

      const [allTasks, allTags] = await Promise.all([db.getAllTasks(), db.getTagOptions()]);

      if (!mounted) return;
      setTasks(allTasks);
      setTagOptions(allTags);
      setSettings(savedSettings);
      setAccounts(accountsState.accounts);
      setActiveAccountId(activeId);
      activeAccountIdRef.current = activeId;

      const engine = new SyncEngine(
        (status) => { if (mounted) setSyncStatus(status); },
        (updated) => { if (mounted) setTasks(updated); },
        (opts) => { if (mounted) setTagOptions(opts); },
      );
      syncRef.current = engine;

      const token = activeAccount?.authType === 'oauth'
        ? (activeAccount.oauthAccessToken ?? '')
        : (activeAccount?.token ?? '');
      const authType = activeAccount?.authType ?? 'pat';

      await engine.reinit({
        authType,
        token,
        baseId: activeAccount?.baseId ?? '',
        tableName: activeAccount?.tableName ?? 'Tasks',
        oauthLambdaUrl: savedSettings.oauth_lambda_url,
        oauthRefreshToken: activeAccount?.oauthRefreshToken,
        oauthTokenExpiresAt: activeAccount?.oauthTokenExpiresAt,
        onOAuthTokensRefreshed: async (tokens: OAuthTokens) => {
          const accountId = activeAccountIdRef.current;
          if (!accountId) return;
          const next = await accountsLib.updateAccount(accountId, {
            oauthAccessToken: tokens.accessToken,
            oauthRefreshToken: tokens.refreshToken,
            oauthTokenExpiresAt: tokens.expiresAt,
          });
          setAccounts(next.accounts);
          setActiveAccountId(next.activeId);
          activeAccountIdRef.current = next.activeId;
        },
      });

      engine.start();
      setLoading(false);
    }

    void init();

    return () => {
      mounted = false;
      syncRef.current?.stop();
    };
  }, []);

  // Pause sync loop while app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!syncRef.current) return;
      if (state === 'active') {
        syncRef.current.stop();
        syncRef.current.start();
        void syncRef.current.sync();
      } else if (state === 'background' || state === 'inactive') {
        syncRef.current.stop();
      }
    });
    return () => sub.remove();
  }, []);

  const createTask = async (data: Partial<Task>): Promise<Task> => {
    const task = await db.createTask(data);
    await db.addPendingOp({ op_type: 'create', task_id: task.id, payload: '{}' });
    setTasks(await db.getAllTasks());
    return task;
  };

  const updateTask = async (id: string, updates: Partial<Task>): Promise<void> => {
    await db.updateTask(id, updates);

    // Coalesce: if create is pending, update its payload is implicit (pushCreate re-reads task)
    // If update is already pending, replace it; otherwise add new update op
    const existingUpdate = await db.getPendingOpByTaskAndType(id, 'update');
    const existingCreate = await db.getPendingOpByTaskAndType(id, 'create');
    if (!existingCreate) {
      if (existingUpdate) {
        await db.updatePendingOpPayload(existingUpdate.id, '{}');
      } else {
        await db.addPendingOp({ op_type: 'update', task_id: id, payload: '{}' });
      }
    }

    setTasks(await db.getAllTasks());
  };

  const deleteTask = async (id: string): Promise<void> => {
    const task = await db.getTask(id);
    const airtableId = task?.airtable_id ?? null;
    await db.softDeleteTask(id);

    // Remove existing create/update ops and add a delete op
    await db.deletePendingOpsByTaskId(id);
    if (airtableId) {
      await db.addPendingOp({
        op_type: 'delete',
        task_id: id,
        payload: JSON.stringify({ airtable_id: airtableId }),
      });
    }

    setTasks(await db.getAllTasks());
  };

  const triggerSync = async (): Promise<void> => {
    await syncRef.current?.sync();
  };

  const reinitForActiveAccount = async (accountId: string): Promise<void> => {
    const account = accounts.find((a) => a.id === accountId) ?? null;

    await db.initDBForAccountId(accountId);
    setTasks(await db.getAllTasks());
    setTagOptions(await db.getTagOptions());

    if (!syncRef.current) return;
    if (!account) {
      await syncRef.current.reinit({ token: '', baseId: '', tableName: 'Tasks' });
      return;
    }

    const token = account.authType === 'oauth'
      ? (account.oauthAccessToken ?? '')
      : (account.token ?? '');

    await syncRef.current.reinit({
      token,
      baseId: account.baseId,
      tableName: account.tableName,
    });
    void syncRef.current.sync();
  };

  const switchAccount = async (id: string): Promise<void> => {
    const next = await accountsLib.setActiveAccount(id);
    setAccounts(next.accounts);
    setActiveAccountId(next.activeId);
    activeAccountIdRef.current = next.activeId;

    // Use next state to avoid stale closure.
    const account = next.accounts.find((a) => a.id === id) ?? null;
    await db.initDBForAccountId(id);
    setTasks(await db.getAllTasks());
    setTagOptions(await db.getTagOptions());

    if (syncRef.current) {
      const token = account?.authType === 'oauth' ? (account.oauthAccessToken ?? '') : (account?.token ?? '');
      const authType = account?.authType ?? 'pat';
      await syncRef.current.reinit({
        authType,
        token,
        baseId: account?.baseId ?? '',
        tableName: account?.tableName ?? 'Tasks',
        oauthLambdaUrl: settings.oauth_lambda_url,
        oauthRefreshToken: account?.oauthRefreshToken,
        oauthTokenExpiresAt: account?.oauthTokenExpiresAt,
        onOAuthTokensRefreshed: async (tokens: OAuthTokens) => {
          const accountId = activeAccountIdRef.current;
          if (!accountId) return;
          const updated = await accountsLib.updateAccount(accountId, {
            oauthAccessToken: tokens.accessToken,
            oauthRefreshToken: tokens.refreshToken,
            oauthTokenExpiresAt: tokens.expiresAt,
          });
          setAccounts(updated.accounts);
          setActiveAccountId(updated.activeId);
          activeAccountIdRef.current = updated.activeId;
        },
      });
      void syncRef.current.sync();
    }
  };

  const addAccountFn = async (data: Omit<Account, 'id'>): Promise<void> => {
    const next = await accountsLib.addAccount(data);
    setAccounts(next.accounts);
    setActiveAccountId(next.activeId);

    if (next.activeId && next.activeId !== activeAccountId) {
      await switchAccount(next.activeId);
    }
  };

  const updateAccountFn = async (id: string, updates: Partial<Omit<Account, 'id'>>): Promise<void> => {
    const next = await accountsLib.updateAccount(id, updates);
    setAccounts(next.accounts);
    setActiveAccountId(next.activeId);

    if (id === activeAccountId && activeAccountId) {
      await switchAccount(activeAccountId);
    }
  };

  const deleteAccountFn = async (id: string): Promise<void> => {
    const next = await accountsLib.deleteAccount(id);
    setAccounts(next.accounts);
    setActiveAccountId(next.activeId);

    if (id === activeAccountId) {
      if (next.activeId) {
        await switchAccount(next.activeId);
      } else {
        await db.initDBForAccountId(undefined);
        setTasks([]);
        setTagOptions([]);
        activeAccountIdRef.current = null;
        await syncRef.current?.reinit({
          authType: 'pat',
          token: '',
          baseId: '',
          tableName: 'Tasks',
          oauthLambdaUrl: settings.oauth_lambda_url,
        });
      }
    }
  };

  const saveSettingsFn = async (s: Settings): Promise<void> => {
    await settingsLib.saveSettings(s);
    const updated = { ...settings, ...s };
    setSettings(updated);

    const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
    const token = activeAccount?.authType === 'oauth'
      ? (activeAccount.oauthAccessToken ?? '')
      : (activeAccount?.token ?? '');
    const authType = activeAccount?.authType ?? 'pat';

    await syncRef.current?.reinit({
      authType,
      token,
      baseId: activeAccount?.baseId ?? '',
      tableName: activeAccount?.tableName ?? 'Tasks',
      oauthLambdaUrl: updated.oauth_lambda_url,
      oauthRefreshToken: activeAccount?.oauthRefreshToken,
      oauthTokenExpiresAt: activeAccount?.oauthTokenExpiresAt,
      onOAuthTokensRefreshed: async (tokens: OAuthTokens) => {
        const accountId = activeAccountIdRef.current;
        if (!accountId) return;
        const next = await accountsLib.updateAccount(accountId, {
          oauthAccessToken: tokens.accessToken,
          oauthRefreshToken: tokens.refreshToken,
          oauthTokenExpiresAt: tokens.expiresAt,
        });
        setAccounts(next.accounts);
        setActiveAccountId(next.activeId);
        activeAccountIdRef.current = next.activeId;
      },
    });
  };

  const createAirtableTable = async (): Promise<void> => {
    await syncRef.current?.createTable();
  };

  return (
    <AppContext.Provider
      value={{
        tasks,
        tagOptions,
        syncStatus,
        settings,
        accounts,
        activeAccountId,
        loading,
        createTask,
        updateTask,
        deleteTask,
        triggerSync,
        saveSettings: saveSettingsFn,
        switchAccount,
        addAccount: addAccountFn,
        updateAccount: updateAccountFn,
        deleteAccount: deleteAccountFn,
        createAirtableTable,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
