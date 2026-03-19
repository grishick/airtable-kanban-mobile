import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import type { Task } from '../types';
import TaskCard from '../components/TaskCard';

interface ColumnLayout {
  x: number;
  width: number;
}

interface CardMeasurement {
  y: number;
  height: number;
}

interface DragContextValue {
  draggedTaskId: string | null;
  targetStatus: string | null;
  dropIndex: number;

  startDrag: (
    task: Task,
    fingerX: number,
    fingerY: number,
    cardWidth: number,
    cardHeight: number,
    offsetX: number,
    offsetY: number,
  ) => void;
  updateDrag: (absoluteX: number, absoluteY: number) => void;
  endDrag: () => void;
  cancelDrag: () => void;

  registerColumn: (status: string, layout: ColumnLayout) => void;
  registerCardLayout: (
    status: string,
    index: number,
    layout: CardMeasurement,
  ) => void;
  clearCardLayouts: (status: string) => void;
  setColumnListScreenY: (status: string, y: number) => void;
  setColumnScrollOffset: (status: string, y: number) => void;
}

const DragContext = createContext<DragContextValue | null>(null);

export function useDrag(): DragContextValue {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDrag must be used inside DragProvider');
  return ctx;
}

interface Props {
  children: React.ReactNode;
  onDrop: (
    taskId: string,
    targetStatus: string,
    dropIndex: number,
    sourceStatus: string,
  ) => void;
  scrollViewRef: React.RefObject<ScrollView | null>;
  scrollOffsetRef: React.RefObject<number>;
  boardScreenXRef: React.RefObject<number>;
  screenWidth: number;
}

const AUTO_SCROLL_ZONE = 50;
const AUTO_SCROLL_SPEED = 8;

export function DragProvider({
  children,
  onDrop,
  scrollViewRef,
  scrollOffsetRef,
  boardScreenXRef,
  screenWidth,
}: Props) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [targetStatus, setTargetStatus] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState(0);

  const draggedTaskRef = useRef<Task | null>(null);
  const sourceStatusRef = useRef<string>('');
  const targetStatusRef = useRef<string | null>(null);
  const dropIndexRef = useRef(0);
  const cardSizeRef = useRef({ width: 0, height: 0 });
  const fingerOffsetRef = useRef({ x: 0, y: 0 });
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFingerRef = useRef({ x: 0, y: 0 });

  const columnLayoutsRef = useRef<Record<string, ColumnLayout>>({});
  const cardLayoutsRef = useRef<Record<string, CardMeasurement[]>>({});
  const columnListScreenYRef = useRef<Record<string, number>>({});
  const columnScrollOffsetRef = useRef<Record<string, number>>({});

  const floatX = useSharedValue(0);
  const floatY = useSharedValue(0);
  const floatVisible = useSharedValue(0);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const registerColumn = useCallback(
    (status: string, layout: ColumnLayout) => {
      columnLayoutsRef.current[status] = layout;
    },
    [],
  );

  const registerCardLayout = useCallback(
    (status: string, index: number, layout: CardMeasurement) => {
      if (!cardLayoutsRef.current[status]) {
        cardLayoutsRef.current[status] = [];
      }
      cardLayoutsRef.current[status][index] = layout;
    },
    [],
  );

  const clearCardLayouts = useCallback((status: string) => {
    cardLayoutsRef.current[status] = [];
  }, []);

  const setColumnListScreenY = useCallback((status: string, y: number) => {
    columnListScreenYRef.current[status] = y;
  }, []);

  const setColumnScrollOffset = useCallback((status: string, y: number) => {
    columnScrollOffsetRef.current[status] = y;
  }, []);

  const findDropTarget = useCallback(
    (fingerX: number, fingerY: number) => {
      const boardX = boardScreenXRef.current ?? 0;
      const scrollOff = scrollOffsetRef.current ?? 0;
      const contentX = fingerX - boardX + scrollOff;

      const columns = columnLayoutsRef.current;
      let foundStatus: string | null = null;

      for (const [status, col] of Object.entries(columns)) {
        if (contentX >= col.x && contentX < col.x + col.width) {
          foundStatus = status;
          break;
        }
      }

      if (!foundStatus) return;

      const listScreenY = columnListScreenYRef.current[foundStatus] ?? 0;
      const scrollOffset = columnScrollOffsetRef.current[foundStatus] ?? 0;
      const fingerInList = fingerY - listScreenY + scrollOffset;

      const cards = cardLayoutsRef.current[foundStatus] ?? [];
      let idx = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card) continue;
        if (fingerInList < card.y + card.height / 2) {
          idx = i;
          break;
        }
      }

      if (
        foundStatus !== targetStatusRef.current ||
        idx !== dropIndexRef.current
      ) {
        targetStatusRef.current = foundStatus;
        dropIndexRef.current = idx;
        setTargetStatus(foundStatus);
        setDropIndex(idx);
      }
    },
    [boardScreenXRef, scrollOffsetRef],
  );

  const startAutoScroll = useCallback(
    (fingerX: number) => {
      stopAutoScroll();

      const nearLeft = fingerX < AUTO_SCROLL_ZONE;
      const nearRight = fingerX > screenWidth - AUTO_SCROLL_ZONE;

      if (!nearLeft && !nearRight) return;

      const direction = nearRight ? 1 : -1;
      autoScrollRef.current = setInterval(() => {
        const sv = scrollViewRef.current;
        if (!sv) return;
        const currentOffset = scrollOffsetRef.current ?? 0;
        const newOffset = Math.max(0, currentOffset + direction * AUTO_SCROLL_SPEED);
        sv.scrollTo({ x: newOffset, animated: false });
      }, 16);
    },
    [screenWidth, scrollViewRef, scrollOffsetRef, stopAutoScroll],
  );

  const startDrag = useCallback(
    (
      task: Task,
      fingerX: number,
      fingerY: number,
      cardWidth: number,
      cardHeight: number,
      offsetX: number,
      offsetY: number,
    ) => {
      draggedTaskRef.current = task;
      sourceStatusRef.current = task.status;
      cardSizeRef.current = { width: cardWidth, height: cardHeight };
      fingerOffsetRef.current = { x: offsetX, y: offsetY };
      lastFingerRef.current = { x: fingerX, y: fingerY };

      floatX.value = fingerX - offsetX;
      floatY.value = fingerY - offsetY;
      floatVisible.value = withSpring(1, { damping: 20, stiffness: 300 });

      setDraggedTask(task);
      setTargetStatus(task.status);
      setDropIndex(0);
      targetStatusRef.current = task.status;
      dropIndexRef.current = 0;
    },
    [floatX, floatY, floatVisible],
  );

  const updateDrag = useCallback(
    (absoluteX: number, absoluteY: number) => {
      floatX.value = absoluteX - fingerOffsetRef.current.x;
      floatY.value = absoluteY - fingerOffsetRef.current.y;
      lastFingerRef.current = { x: absoluteX, y: absoluteY };
      findDropTarget(absoluteX, absoluteY);
      startAutoScroll(absoluteX);
    },
    [floatX, floatY, findDropTarget, startAutoScroll],
  );

  const endDrag = useCallback(() => {
    stopAutoScroll();
    const task = draggedTaskRef.current;
    const target = targetStatusRef.current;
    const idx = dropIndexRef.current;
    const source = sourceStatusRef.current;

    floatVisible.value = withSpring(0, { damping: 20, stiffness: 300 });

    draggedTaskRef.current = null;
    targetStatusRef.current = null;
    dropIndexRef.current = 0;
    setDraggedTask(null);
    setTargetStatus(null);
    setDropIndex(0);

    if (task && target) {
      onDrop(task.id, target, idx, source);
    }
  }, [floatVisible, onDrop, stopAutoScroll]);

  const cancelDrag = useCallback(() => {
    stopAutoScroll();
    floatVisible.value = withSpring(0, { damping: 20, stiffness: 300 });
    draggedTaskRef.current = null;
    targetStatusRef.current = null;
    dropIndexRef.current = 0;
    setDraggedTask(null);
    setTargetStatus(null);
    setDropIndex(0);
  }, [floatVisible, stopAutoScroll]);

  const floatingStyle = useAnimatedStyle(() => ({
    opacity: floatVisible.value,
    transform: [
      { translateX: floatX.value },
      { translateY: floatY.value },
      { scale: 1 + 0.05 * floatVisible.value },
    ],
  }));

  const value = useMemo(
    (): DragContextValue => ({
      draggedTaskId: draggedTask?.id ?? null,
      targetStatus,
      dropIndex,
      startDrag,
      updateDrag,
      endDrag,
      cancelDrag,
      registerColumn,
      registerCardLayout,
      clearCardLayouts,
      setColumnListScreenY,
      setColumnScrollOffset,
    }),
    [
      draggedTask,
      targetStatus,
      dropIndex,
      startDrag,
      updateDrag,
      endDrag,
      cancelDrag,
      registerColumn,
      registerCardLayout,
      clearCardLayouts,
      setColumnListScreenY,
      setColumnScrollOffset,
    ],
  );

  return (
    <DragContext.Provider value={value}>
      {children}
      {draggedTask && (
        <Animated.View
          style={[
            styles.floatingCard,
            { width: cardSizeRef.current.width },
            floatingStyle,
          ]}
          pointerEvents="none"
        >
          <TaskCard task={draggedTask} onPress={() => {}} />
        </Animated.View>
      )}
    </DragContext.Provider>
  );
}

const styles = StyleSheet.create({
  floatingCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
});
