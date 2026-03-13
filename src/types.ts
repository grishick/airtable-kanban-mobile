export interface Task {
  id: string;
  airtable_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_to: string | null;
  tags: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  is_deleted: number;
}

export interface PendingOp {
  id: number;
  op_type: string;
  task_id: string;
  payload: string;
  created_at: string;
  retry_count: number;
  last_error: string | null;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'offline' | 'unconfigured' | 'table_not_found';
  lastSync: string | null;
  error: string | null;
  pendingOps: number;
}

export interface Settings {
  airtable_access_token?: string;
  airtable_base_id?: string;
  airtable_table_name?: string;
}

export interface TagOption {
  name: string;
  color: string | null;
}

export type TaskStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Deferred'
  | 'Waiting'
  | 'Completed';

export const STATUSES: TaskStatus[] = [
  'Not Started',
  'In Progress',
  'Deferred',
  'Waiting',
  'Completed',
];
