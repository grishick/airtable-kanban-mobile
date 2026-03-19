import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import DraggableTaskCard from './DraggableTaskCard';
import type { Task } from '../types';
import { useDrag } from '../context/DragContext';

const PAGE_SIZE = 10;

interface Props {
  status: string;
  tasks: Task[];
  columnWidth: number;
  onTaskPress: (task: Task) => void;
  onAddTask: () => void;
}

export default function KanbanColumn({
  status,
  tasks,
  columnWidth,
  onTaskPress,
  onAddTask,
}: Props) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const {
    draggedTaskId,
    targetStatus,
    dropIndex,
    registerColumn,
    registerCardLayout,
    clearCardLayouts,
    setColumnListScreenY,
    setColumnScrollOffset,
  } = useDrag();

  const columnRef = useRef<View>(null);

  const visibleTasks = tasks.slice(0, displayCount);
  const hiddenCount = tasks.length - displayCount;
  const loadMoreCount = Math.min(PAGE_SIZE, hiddenCount);

  const isDropTarget = draggedTaskId != null && targetStatus === status;

  const handleColumnLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      registerColumn(status, { x, width });
    },
    [status, registerColumn],
  );

  const handleListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      e.target.measureInWindow((_x: number, y: number) => {
        setColumnListScreenY(status, y);
      });
    },
    [status, setColumnListScreenY],
  );

  const handleListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setColumnScrollOffset(status, e.nativeEvent.contentOffset.y);
    },
    [status, setColumnScrollOffset],
  );

  const handleCardLayout = useCallback(
    (index: number, e: LayoutChangeEvent) => {
      const { y, height } = e.nativeEvent.layout;
      registerCardLayout(status, index, { y, height });
    },
    [status, registerCardLayout],
  );

  useEffect(() => {
    clearCardLayouts(status);
  }, [tasks.length, status, clearCardLayouts]);

  const renderItem = useCallback(
    ({ item, index }: { item: Task; index: number }) => {
      const isDragged = item.id === draggedTaskId;
      const showIndicator = isDropTarget && dropIndex === index;

      return (
        <>
          {showIndicator && <View style={styles.dropIndicator} />}
          <DraggableTaskCard
            task={item}
            onPress={() => onTaskPress(item)}
            isDragged={isDragged}
            onCardLayout={(e) => handleCardLayout(index, e)}
          />
        </>
      );
    },
    [draggedTaskId, isDropTarget, dropIndex, onTaskPress, handleCardLayout],
  );

  const showEndIndicator =
    isDropTarget && dropIndex >= visibleTasks.length;

  return (
    <View
      ref={columnRef}
      style={[
        styles.column,
        { width: columnWidth },
        isDropTarget && styles.columnHighlight,
      ]}
      onLayout={handleColumnLayout}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{status}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{tasks.length}</Text>
        </View>
      </View>

      <FlatList
        data={visibleTasks}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onLayout={handleListLayout}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        scrollEnabled={draggedTaskId == null}
        ListFooterComponent={
          <>
            {showEndIndicator && <View style={styles.dropIndicator} />}
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
    borderWidth: 2,
    borderColor: 'transparent',
  },
  columnHighlight: {
    backgroundColor: '#E8F0FE',
    borderColor: '#4C9AFF',
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
  dropIndicator: {
    height: 3,
    backgroundColor: '#0052CC',
    borderRadius: 2,
    marginVertical: 2,
    marginHorizontal: 4,
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
