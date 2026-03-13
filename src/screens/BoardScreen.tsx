import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import KanbanColumn, { COLUMN_WIDTH } from '../components/KanbanColumn';
import SyncStatusBar from '../components/SyncStatusBar';
import { useApp } from '../context/AppContext';
import { STATUSES } from '../types';
import type { Task } from '../types';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function BoardScreen() {
  const { tasks, syncStatus, triggerSync, createAirtableTable } = useApp();
  const navigation = useNavigation<Nav>();

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) map[s] = [];
    for (const t of tasks) {
      if (map[t.status]) map[t.status].push(t);
    }
    return map;
  }, [tasks]);

  const handleTaskPress = (task: Task) => {
    navigation.navigate('TaskDetail', { taskId: task.id, initialStatus: task.status });
  };

  const handleAddTask = (status: string) => {
    navigation.navigate('TaskDetail', { taskId: null, initialStatus: status });
  };

  const handleCreateTable = () => {
    Alert.alert(
      'Create Airtable Table',
      `Create a new table called "${syncStatus.error?.includes('INVALID') ? 'Tasks' : 'Tasks'}" in your Airtable base?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create', onPress: () => void createAirtableTable() },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <SyncStatusBar
        status={syncStatus}
        onSync={() => void triggerSync()}
        onCreateTable={syncStatus.state === 'table_not_found' ? handleCreateTable : undefined}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.board}
        decelerationRate="fast"
        snapToInterval={COLUMN_WIDTH + 12}
        snapToAlignment="start"
      >
        {STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status] ?? []}
            onTaskPress={handleTaskPress}
            onAddTask={() => handleAddTask(status)}
          />
        ))}
        {/* Right padding */}
        <View style={styles.endPad} />
      </ScrollView>
    </View>
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
    width: 12,
  },
});
