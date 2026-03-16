import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import TaskCard from './TaskCard';
import type { Task } from '../types';

const PAGE_SIZE = 10;

interface Props {
  status: string;
  tasks: Task[];
  columnWidth: number;
  onTaskPress: (task: Task) => void;
  onAddTask: () => void;
}

export default function KanbanColumn({ status, tasks, columnWidth, onTaskPress, onAddTask }: Props) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const visibleTasks = tasks.slice(0, displayCount);
  const hiddenCount = tasks.length - displayCount;
  const loadMoreCount = Math.min(PAGE_SIZE, hiddenCount);

  return (
    <View style={[styles.column, { width: columnWidth }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{status}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{tasks.length}</Text>
        </View>
      </View>

      <FlatList
        data={visibleTasks}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TaskCard task={item} onPress={() => onTaskPress(item)} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <>
            {hiddenCount > 0 && (
              <Pressable
                style={styles.loadMoreBtn}
                onPress={() => setDisplayCount((c) => c + PAGE_SIZE)}
              >
                <Text style={styles.loadMoreText}>
                  Load {loadMoreCount} more ({hiddenCount} remaining)
                </Text>
              </Pressable>
            )}
            <Pressable style={styles.addBtn} onPress={onAddTask}>
              <Text style={styles.addBtnText}>+ Add a task</Text>
            </Pressable>
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    marginLeft: 12,
    backgroundColor: '#F4F5F7',
    borderRadius: 10,
    paddingBottom: 8,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5E6C84',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#DFE1E6',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 12,
    color: '#5E6C84',
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  loadMoreBtn: {
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#E4E6EB',
    marginBottom: 4,
  },
  loadMoreText: {
    fontSize: 12,
    color: '#5E6C84',
    fontWeight: '600',
  },
  addBtn: {
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 13,
    color: '#5E6C84',
  },
});
