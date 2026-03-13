import React, { useState } from 'react';
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
import { useApp } from '../context/AppContext';

export default function SettingsScreen() {
  const { settings, saveSettings, triggerSync } = useApp();

  const [token, setToken] = useState(settings.airtable_access_token ?? '');
  const [baseId, setBaseId] = useState(settings.airtable_base_id ?? '');
  const [tableName, setTableName] = useState(settings.airtable_table_name ?? 'Tasks');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({
        airtable_access_token: token.trim(),
        airtable_base_id: baseId.trim(),
        airtable_table_name: tableName.trim() || 'Tasks',
      });
      await triggerSync();
      Alert.alert('Saved', 'Settings saved. Sync started.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Airtable</Text>

        <View style={styles.group}>
          <Text style={styles.label}>ACCESS TOKEN</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="pat…"
            placeholderTextColor="#A5ADBA"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>
            Personal Access Token from airtable.com → Account → Developer hub.{'\n'}
            Required scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write
          </Text>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>BASE ID</Text>
          <TextInput
            style={styles.input}
            value={baseId}
            onChangeText={setBaseId}
            placeholder="app…"
            placeholderTextColor="#A5ADBA"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>Found in the URL: airtable.com/appXXXXXXXX/…</Text>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>TABLE NAME</Text>
          <TextInput
            style={styles.input}
            value={tableName}
            onChangeText={setTableName}
            placeholder="Tasks"
            placeholderTextColor="#A5ADBA"
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save & Sync'}</Text>
        </Pressable>

        <View style={styles.divider} />

        <Text style={styles.versionText}>Airtable Kanban v1.0.1</Text>
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#172B4D',
    marginBottom: 20,
  },
  group: {
    marginBottom: 20,
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
  hint: {
    marginTop: 5,
    fontSize: 12,
    color: '#6B778C',
    lineHeight: 17,
  },
  saveBtn: {
    backgroundColor: '#0052CC',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DFE1E6',
    marginVertical: 28,
  },
  versionText: {
    fontSize: 12,
    color: '#A5ADBA',
    textAlign: 'center',
  },
});
