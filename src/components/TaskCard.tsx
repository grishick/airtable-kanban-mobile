import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Task } from '../types';

interface Props {
  task: Task;
  onPress: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  High: '#FF5630',
  Medium: '#FF991F',
  Low: '#36B37E',
};

export default function TaskCard({ task, onPress }: Props) {
  const tags = task.tags
    ? task.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const hasPending = !task.airtable_id || !task.synced_at;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      android_ripple={{ color: '#e6f4fe' }}
    >
      {/* Pending sync dot */}
      {hasPending && <View style={styles.syncDot} />}

      <Text style={styles.title} numberOfLines={2}>{task.title}</Text>

      {task.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}

      <View style={styles.meta}>
        {task.priority ? (
          <View style={[styles.badge, { backgroundColor: PRIORITY_COLOR[task.priority] ?? '#6B778C' }]}>
            <Text style={styles.badgeText}>{task.priority}</Text>
          </View>
        ) : null}

        {task.due_date ? (
          <View style={styles.dueBadge}>
            <Text style={styles.dueText}>{formatDate(task.due_date)}</Text>
          </View>
        ) : null}
      </View>

      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
          {tags.length > 3 && (
            <Text style={styles.tagsMore}>+{tags.length - 3}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isOverdue = d < now;
  const str = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return isOverdue ? `⚠ ${str}` : str;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    position: 'relative',
  },
  cardPressed: {
    opacity: 0.85,
  },
  syncDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF991F',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#172B4D',
    marginBottom: 4,
    paddingRight: 12,
  },
  description: {
    fontSize: 12,
    color: '#6B778C',
    marginBottom: 8,
    lineHeight: 17,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  dueBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#F4F5F7',
  },
  dueText: {
    fontSize: 11,
    color: '#5E6C84',
    fontWeight: '500',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  tag: {
    backgroundColor: '#E6F4FE',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
    color: '#0052CC',
  },
  tagsMore: {
    fontSize: 11,
    color: '#6B778C',
    alignSelf: 'center',
  },
});
