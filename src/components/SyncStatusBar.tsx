import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SyncStatus } from '../types';

interface Props {
  status: SyncStatus;
  onSync: () => void;
  onCreateTable?: () => void;
}

const STATE_COLOR: Record<string, string> = {
  idle: '#36B37E',
  syncing: '#0052CC',
  error: '#FF5630',
  offline: '#FF991F',
  unconfigured: '#6B778C',
  table_not_found: '#FF991F',
};

export default function SyncStatusBar({ status, onSync, onCreateTable }: Props) {
  const label =
    status.state === 'syncing'
      ? 'Syncing…'
      : status.state === 'unconfigured'
        ? 'Airtable not configured'
        : status.state === 'table_not_found'
          ? 'Table not found'
          : status.state === 'offline'
            ? 'Offline'
            : status.state === 'error'
              ? 'Sync error'
              : status.lastSync
                ? `Synced ${formatRelative(status.lastSync)}`
                : 'Never synced';

  const dotColor = STATE_COLOR[status.state] ?? '#6B778C';

  const showError = (status.state === 'error' || status.state === 'offline') && status.error;

  return (
    <View style={styles.container}>
    <View style={styles.bar}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {status.pendingOps > 0 && (
        <Text style={styles.pending}>({status.pendingOps} pending)</Text>
      )}
      <View style={styles.actions}>
        {status.state === 'table_not_found' && onCreateTable && (
          <Pressable style={styles.btn} onPress={onCreateTable}>
            <Text style={styles.btnText}>Create Table</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.btn, (status.state === 'syncing' || status.state === 'unconfigured') && styles.btnDisabled]}
          onPress={onSync}
          disabled={status.state === 'syncing' || status.state === 'unconfigured'}
        >
          <Text style={styles.btnText}>Sync</Text>
        </Pressable>
      </View>
    </View>
    {showError && (
      <Text style={styles.errorDetail} numberOfLines={2}>{status.error}</Text>
    )}
    </View>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DFE1E6',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
  },
  errorDetail: {
    fontSize: 11,
    color: '#FF5630',
    paddingHorizontal: 14,
    paddingBottom: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    fontSize: 12,
    color: '#5E6C84',
  },
  pending: {
    fontSize: 12,
    color: '#FF991F',
    flexShrink: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#0052CC',
    borderRadius: 5,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
});
