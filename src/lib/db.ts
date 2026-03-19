import * as SQLite from 'expo-sqlite';
import type { Task, PendingOp, TagOption } from '../types';

let db: SQLite.SQLiteDatabase | null = null;
let currentDbFile: string | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized — call initDB() first');
  return db;
}

function now(): string {
  return new Date().toISOString();
}

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Init ────────────────────────────────────────────────────────────────────

export async function initDB(): Promise<void> {
  await initDBForAccountId(undefined);
}

export async function initDBForAccountId(accountId?: string): Promise<void> {
  const file = accountId ? `kanban-${accountId}.db` : 'kanban.db';
  const prev = db;
  currentDbFile = file;

  // Ensure we actually switch the underlying DB file on account switch.
  // `expo-sqlite` supports `closeAsync()` on the database instance in modern SDKs,
  // but we keep this defensive in case the method isn't available.
  if (prev && typeof (prev as any).closeAsync === 'function') {
    try {
      await (prev as any).closeAsync();
    } catch {
      // Best-effort; we'll still attempt to open the next DB.
    }
  }

  // Some runtimes may cache connections by name; request a new connection if supported.
  db = await (SQLite as any).openDatabaseAsync(file, { useNewConnection: true });
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate();
}

async function migrate(): Promise<void> {
  await getDb().execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tag_options (
      name  TEXT PRIMARY KEY,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      airtable_id TEXT UNIQUE,
      title       TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'Not Started',
      priority    TEXT,
      due_date    TEXT,
      assigned_to TEXT,
      tags        TEXT,
      position    REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      synced_at   TEXT,
      is_deleted  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pending_ops (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      op_type     TEXT NOT NULL,
      task_id     TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT
    );
  `);
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function getAllTasks(): Promise<Task[]> {
  return getDb().getAllAsync<Task>(
    'SELECT * FROM tasks WHERE is_deleted = 0 ORDER BY status, position ASC',
  );
}

export async function getTask(id: string): Promise<Task | null> {
  return getDb().getFirstAsync<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
}

export async function getTaskByAirtableId(airtableId: string): Promise<Task | null> {
  return getDb().getFirstAsync<Task>(
    'SELECT * FROM tasks WHERE airtable_id = ?',
    [airtableId],
  );
}

export async function createTask(data: Partial<Task>): Promise<Task> {
  const d = getDb();
  const status = data.status ?? 'Not Started';
  const maxRow = await d.getFirstAsync<{ m: number | null }>(
    'SELECT MAX(position) as m FROM tasks WHERE status = ? AND is_deleted = 0',
    [status],
  );
  const position = data.position ?? (maxRow?.m ?? 0) + 1000;

  const task: Task = {
    id: data.id ?? randomUUID(),
    airtable_id: data.airtable_id ?? null,
    title: data.title ?? 'Untitled',
    description: data.description ?? '',
    status,
    priority: data.priority ?? null,
    due_date: data.due_date ?? null,
    assigned_to: data.assigned_to ?? null,
    tags: data.tags ?? null,
    position,
    created_at: data.created_at ?? now(),
    updated_at: data.updated_at ?? now(),
    synced_at: data.synced_at ?? null,
    is_deleted: 0,
  };

  await d.runAsync(
    `INSERT OR REPLACE INTO tasks
       (id, airtable_id, title, description, status, priority, due_date,
        assigned_to, tags, position, created_at, updated_at, synced_at, is_deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      task.id, task.airtable_id, task.title, task.description, task.status,
      task.priority, task.due_date, task.assigned_to, task.tags, task.position,
      task.created_at, task.updated_at, task.synced_at, task.is_deleted,
    ],
  );
  return task;
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const existing = await getTask(id);
  if (!existing) return null;
  const merged: Task = { ...existing, ...updates, id: existing.id, updated_at: now() };
  await getDb().runAsync(
    `UPDATE tasks SET
       title = ?, description = ?, status = ?, priority = ?, due_date = ?,
       assigned_to = ?, tags = ?, position = ?, updated_at = ?,
       airtable_id = ?, synced_at = ?
     WHERE id = ?`,
    [
      merged.title, merged.description, merged.status, merged.priority, merged.due_date,
      merged.assigned_to, merged.tags, merged.position, merged.updated_at,
      merged.airtable_id, merged.synced_at, merged.id,
    ],
  );
  return merged;
}

export async function softDeleteTask(id: string): Promise<void> {
  await getDb().runAsync(
    'UPDATE tasks SET is_deleted = 1, updated_at = ? WHERE id = ?',
    [now(), id],
  );
}

export async function hardDeleteTask(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM tasks WHERE id = ?', [id]);
}

export async function getMaxPosition(status: string): Promise<number> {
  const row = await getDb().getFirstAsync<{ m: number | null }>(
    'SELECT MAX(position) as m FROM tasks WHERE status = ? AND is_deleted = 0',
    [status],
  );
  return row?.m ?? 0;
}

// ── Pending Ops ──────────────────────────────────────────────────────────────

export async function getPendingOps(): Promise<PendingOp[]> {
  return getDb().getAllAsync<PendingOp>('SELECT * FROM pending_ops ORDER BY id ASC');
}

export async function getPendingOpByTaskAndType(
  taskId: string,
  opType: string,
): Promise<PendingOp | null> {
  return getDb().getFirstAsync<PendingOp>(
    'SELECT * FROM pending_ops WHERE task_id = ? AND op_type = ?',
    [taskId, opType],
  );
}

export async function addPendingOp(op: {
  op_type: string;
  task_id: string;
  payload: string;
}): Promise<number> {
  const result = await getDb().runAsync(
    'INSERT INTO pending_ops (op_type, task_id, payload, created_at, retry_count) VALUES (?,?,?,?,0)',
    [op.op_type, op.task_id, op.payload, now()],
  );
  return result.lastInsertRowId;
}

export async function updatePendingOpPayload(id: number, payload: string): Promise<void> {
  await getDb().runAsync('UPDATE pending_ops SET payload = ? WHERE id = ?', [payload, id]);
}

export async function deletePendingOp(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM pending_ops WHERE id = ?', [id]);
}

export async function deletePendingOpsByTaskId(taskId: string): Promise<void> {
  await getDb().runAsync('DELETE FROM pending_ops WHERE task_id = ?', [taskId]);
}

export async function incrementPendingOpRetry(id: number, error: string): Promise<void> {
  await getDb().runAsync(
    'UPDATE pending_ops SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
    [error, id],
  );
}

// ── Tag Options ──────────────────────────────────────────────────────────────

export async function getTagOptions(): Promise<TagOption[]> {
  return getDb().getAllAsync<TagOption>(
    'SELECT name, color FROM tag_options ORDER BY name ASC',
  );
}

export async function replaceTagOptions(options: TagOption[]): Promise<void> {
  await getDb().withTransactionAsync(async () => {
    await getDb().runAsync('DELETE FROM tag_options');
    for (const opt of options) {
      await getDb().runAsync(
        'INSERT INTO tag_options (name, color) VALUES (?, ?)',
        [opt.name, opt.color],
      );
    }
  });
}
