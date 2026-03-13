import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useApp } from '../context/AppContext';
import { STATUSES } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskDetail'>;

const PRIORITIES = ['', 'High', 'Medium', 'Low'] as const;

export default function TaskDetailScreen({ route, navigation }: Props) {
  const { taskId, initialStatus } = route.params;
  const { tasks, tagOptions, createTask, updateTask, deleteTask } = useApp();

  const existing = taskId ? tasks.find((t) => t.id === taskId) ?? null : null;
  const isNew = !existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [status, setStatus] = useState(existing?.status ?? initialStatus ?? 'Not Started');
  const [priority, setPriority] = useState(existing?.priority ?? '');
  const [dueDate, setDueDate] = useState(existing?.due_date ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    existing?.tags ? existing.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
  );
  const [saving, setSaving] = useState(false);

  // Configure header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'New Task' : 'Edit Task',
      headerRight: () => (
        <Pressable onPress={handleSave} disabled={saving || !title.trim()}>
          <Text style={[styles.headerBtn, (!title.trim() || saving) && styles.headerBtnDisabled]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      ),
    });
  }, [title, saving, status, priority, dueDate, desc, selectedTags]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        description: desc.trim(),
        status,
        priority: priority || null,
        due_date: dueDate || null,
        tags: selectedTags.length > 0 ? selectedTags.join(', ') : null,
      };
      if (isNew) {
        await createTask(data);
      } else {
        await updateTask(existing!.id, data);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Task', 'Delete this task? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTask(existing!.id);
          navigation.goBack();
        },
      },
    ]);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View style={styles.group}>
          <Text style={styles.label}>TASK NAME *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="What needs to be done?"
            placeholderTextColor="#A5ADBA"
            returnKeyType="next"
            autoFocus={isNew}
          />
        </View>

        {/* Description */}
        <View style={styles.group}>
          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={desc}
            onChangeText={setDesc}
            placeholder="Optional details… (Markdown supported)"
            placeholderTextColor="#A5ADBA"
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Status */}
        <View style={styles.group}>
          <Text style={styles.label}>STATUS</Text>
          <View style={styles.chipRow}>
            {STATUSES.map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, status === s && styles.chipSelected]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextSelected]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Priority */}
        <View style={styles.group}>
          <Text style={styles.label}>PRIORITY</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p || 'none'}
                style={[styles.chip, priority === p && styles.chipSelected]}
                onPress={() => setPriority(p)}
              >
                <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>
                  {p || 'None'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Due Date */}
        <View style={styles.group}>
          <Text style={styles.label}>DUE DATE</Text>
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#A5ADBA"
            keyboardType="numbers-and-punctuation"
          />
        </View>

        {/* Tags */}
        {tagOptions.length > 0 && (
          <View style={styles.group}>
            <Text style={styles.label}>TAGS</Text>
            <View style={styles.chipRow}>
              {tagOptions.map((opt) => {
                const active = selectedTags.includes(opt.name);
                return (
                  <Pressable
                    key={opt.name}
                    style={[styles.chip, active && styles.chipSelected]}
                    onPress={() => toggleTag(opt.name)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextSelected]}>
                      {opt.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Delete */}
        {!isNew && (
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>Delete Task</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBtn: {
    color: '#0052CC',
    fontSize: 16,
    fontWeight: '600',
  },
  headerBtnDisabled: {
    opacity: 0.4,
  },
  group: {
    marginBottom: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5E6C84',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#DFE1E6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#172B4D',
    backgroundColor: '#FAFBFC',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#DFE1E6',
    backgroundColor: '#F4F5F7',
  },
  chipSelected: {
    backgroundColor: '#0052CC',
    borderColor: '#0052CC',
  },
  chipText: {
    fontSize: 13,
    color: '#5E6C84',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  deleteBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#FFEBE6',
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#DE350B',
    fontSize: 15,
    fontWeight: '600',
  },
});
