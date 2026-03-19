import React, { useCallback, useMemo, useRef } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import KanbanColumn from '../components/KanbanColumn';
import SyncStatusBar from '../components/SyncStatusBar';
import { useApp } from '../context/AppContext';
import { DragProvider, useDrag } from '../context/DragContext';
import { STATUSES } from '../types';
import type { Task } from '../types';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const COL_GAP = 12;

function calculatePosition(
  tasks: Task[],
  taskId: string,
  insertBeforeIndex: number,
): number {
  const others = tasks.filter((t) => t.id !== taskId);
  const originalIndex = tasks.findIndex((t) => t.id === taskId);
  let idx = insertBeforeIndex;
  if (originalIndex >= 0 && originalIndex < insertBeforeIndex) idx--;
  idx = Math.max(0, Math.min(idx, others.length));

  if (others.length === 0) return 1000;
  if (idx === 0) return others[0].position - 1000;
  if (idx >= others.length) return others[others.length - 1].position + 1000;
  return (others[idx - 1].position + others[idx].position) / 2;
}

interface BoardInnerProps {
  scrollViewRef: React.RefObject<ScrollView | null>;
  columnWidth: number;
  tasksByStatus: Record<string, Task[]>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onBoardLayout: (e: LayoutChangeEvent) => void;
  onTaskPress: (task: Task) => void;
  onAddTask: (status: string) => void;
}

function BoardInner({
  scrollViewRef,
  columnWidth,
  tasksByStatus,
  onScroll,
  onBoardLayout,
  onTaskPress,
  onAddTask,
}: BoardInnerProps) {
  const { draggedTaskId } = useDrag();
  const isDragging = draggedTaskId != null;

  return (
    <ScrollView
      ref={scrollViewRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.board}
      decelerationRate="fast"
      snapToInterval={columnWidth + COL_GAP}
      snapToAlignment="start"
      onScroll={onScroll}
      scrollEventThrottle={16}
      onLayout={onBoardLayout}
      scrollEnabled={!isDragging}
    >
      {STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tasks={tasksByStatus[status] ?? []}
          columnWidth={columnWidth}
          onTaskPress={onTaskPress}
          onAddTask={() => onAddTask(status)}
        />
      ))}
      <View style={styles.endPad} />
    </ScrollView>
  );
}

export default function BoardScreen() {
  const { tasks, updateTask, syncStatus, triggerSync, createAirtableTable } =
    useApp();
  const navigation = useNavigation<Nav>();
  const { width, height } = useWindowDimensions();

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const boardScreenXRef = useRef(0);

  const isLandscape = width > height;
  const columnWidth = isLandscape
    ? Math.floor(width * 0.44)
    : Math.floor(width * 0.82);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) map[s] = [];
    for (const t of tasks) {
      if (map[t.status]) map[t.status].push(t);
    }
    for (const s of STATUSES) {
      map[s].sort((a, b) => a.position - b.position);
    }
    return map;
  }, [tasks]);

  const handleTaskPress = useCallback(
    (task: Task) => {
      navigation.navigate('TaskDetail', {
        taskId: task.id,
        initialStatus: task.status,
      });
    },
    [navigation],
  );

  const handleAddTask = useCallback(
    (status: string) => {
      navigation.navigate('TaskDetail', {
        taskId: null,
        initialStatus: status,
      });
    },
    [navigation],
  );

  const handleCreateTable = () => {
    Alert.alert(
      'Create Airtable Table',
      'Create a new table called "Tasks" in your Airtable base?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create', onPress: () => void createAirtableTable() },
      ],
    );
  };

  const handleDrop = useCallback(
    (
      taskId: string,
      targetStatus: string,
      dropIdx: number,
      sourceStatus: string,
    ) => {
      const targetTasks = tasksByStatus[targetStatus] ?? [];
      const newPosition = calculatePosition(targetTasks, taskId, dropIdx);

      const updates: Partial<Task> =
        targetStatus !== sourceStatus
          ? { status: targetStatus, position: newPosition }
          : { position: newPosition };

      void updateTask(taskId, updates);
    },
    [tasksByStatus, updateTask],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );

  const handleBoardLayout = useCallback((e: LayoutChangeEvent) => {
    e.target.measureInWindow((x: number) => {
      boardScreenXRef.current = x;
    });
  }, []);

  return (
    <DragProvider
      onDrop={handleDrop}
      scrollViewRef={scrollViewRef}
      scrollOffsetRef={scrollOffsetRef}
      boardScreenXRef={boardScreenXRef}
      screenWidth={width}
    >
      <View style={styles.container}>
        <SyncStatusBar
          status={syncStatus}
          onSync={() => void triggerSync()}
          onCreateTable={
            syncStatus.state === 'table_not_found'
              ? handleCreateTable
              : undefined
          }
        />

        <BoardInner
          scrollViewRef={scrollViewRef}
          columnWidth={columnWidth}
          tasksByStatus={tasksByStatus}
          onScroll={handleScroll}
          onBoardLayout={handleBoardLayout}
          onTaskPress={handleTaskPress}
          onAddTask={handleAddTask}
        />
      </View>
    </DragProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E6F0FA',
  },
  board: {
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  endPad: {
    width: COL_GAP,
  },
});
