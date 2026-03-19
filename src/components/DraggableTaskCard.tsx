import React, { useRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import TaskCard from './TaskCard';
import { useDrag } from '../context/DragContext';
import type { Task } from '../types';

interface Props {
  task: Task;
  onPress: () => void;
  isDragged: boolean;
  onCardLayout: (e: LayoutChangeEvent) => void;
}

export default function DraggableTaskCard({
  task,
  onPress,
  isDragged,
  onCardLayout,
}: Props) {
  const { startDrag, updateDrag, endDrag, cancelDrag, draggedTaskId } =
    useDrag();
  const cardRef = useRef<View>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const isActive = useSharedValue(false);

  const handleLayout = (e: LayoutChangeEvent) => {
    sizeRef.current = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    };
    onCardLayout(e);
  };

  const onDragStart = (absX: number, absY: number) => {
    const { width, height } = sizeRef.current;
    if (!cardRef.current) return;
    cardRef.current.measureInWindow((cardX: number, cardY: number) => {
      const offsetX = absX - cardX;
      const offsetY = absY - cardY;
      startDrag(task, absX, absY, width, height, offsetX, offsetY);
    });
  };

  const onDragUpdate = (absX: number, absY: number) => {
    updateDrag(absX, absY);
  };

  const onDragEnd = () => {
    endDrag();
  };

  const onDragCancel = () => {
    cancelDrag();
  };

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart((e) => {
      'worklet';
      isActive.value = true;
      runOnJS(onDragStart)(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      'worklet';
      runOnJS(onDragUpdate)(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      'worklet';
      isActive.value = false;
      runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      'worklet';
      if (isActive.value) {
        isActive.value = false;
        runOnJS(onDragCancel)();
      }
    })
    .minDistance(0)
    .enabled(draggedTaskId == null || draggedTaskId === task.id);

  const tapGesture = Gesture.Tap().onEnd(() => {
    'worklet';
    runOnJS(onPress)();
  });

  const composed = Gesture.Race(panGesture, tapGesture);

  return (
    <GestureDetector gesture={composed}>
      <View
        ref={cardRef}
        onLayout={handleLayout}
        style={isDragged ? { opacity: 0.3 } : undefined}
      >
        <TaskCard task={task} onPress={() => {}} />
      </View>
    </GestureDetector>
  );
}
