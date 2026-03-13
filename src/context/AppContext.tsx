import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as db from '../lib/db';
import * as settingsLib from '../lib/settings';
import { SyncEngine } from '../lib/sync';
import type { Task, SyncStatus, TagOption, Settings } from '../types';

interface AppContextValue {
  tasks: Task[];
  tagOptions: TagOption[];
  syncStatus: SyncStatus;
  settings: Settings;
  loading: boolean;
  createTask: (data: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  triggerSync: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
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

  const syncRef = useRef<SyncEngine | null>(null);

  // Initialize DB, load data, start sync engine
  useEffect(() => {
    let mounted = true;

    async function init() {
      await db.initDB();
      const [allTasks, allTags, savedSettings] = await Promise.all([
        db.getAllTasks(),
        db.getTagOptions(),
        settingsLib.loadSettings(),
      ]);

      if (!mounted) return;
      setTasks(allTasks);
      setTagOptions(allTags);
      setSettings(savedSettings);

      const engine = new SyncEngine(
        (status) => { if (mounted) setSyncStatus(status); },
        (updated) => { if (mounted) setTasks(updated); },
        (opts) => { if (mounted) setTagOptions(opts); },
      );
      syncRef.current = engine;

      await engine.reinit({
        token: savedSettings.airtable_access_token,
        baseId: savedSettings.airtable_base_id,
        tableName: savedSettings.airtable_table_name,
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

  const saveSettingsFn = async (s: Settings): Promise<void> => {
    await settingsLib.saveSettings(s);
    const updated = { ...settings, ...s };
    setSettings(updated);
    await syncRef.current?.reinit({
      token: updated.airtable_access_token,
      baseId: updated.airtable_base_id,
      tableName: updated.airtable_table_name,
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
        loading,
        createTask,
        updateTask,
        deleteTask,
        triggerSync,
        saveSettings: saveSettingsFn,
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
