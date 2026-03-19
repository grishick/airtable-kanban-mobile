import React, { useMemo, useRef, useState } from 'react';
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
import type { Account, AuthType } from '../types';
import { fetchBases, fetchTables } from '../lib/airtable';
import { OAuthTokens, startOAuthFlow } from '../lib/oauth';

type EditMode = 'none' | 'add' | string; // string = account id being edited
type AuthTab = 'pat' | 'oauth';

export default function SettingsScreen() {
  const {
    settings,
    saveSettings,
    triggerSync,
    accounts,
    activeAccountId,
    switchAccount,
    addAccount,
    updateAccount,
    deleteAccount,
  } = useApp();

  const [editMode, setEditMode] = useState<EditMode>('none');
  const [addAuthTab, setAddAuthTab] = useState<AuthTab>('pat');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [oauthPending, setOauthPending] = useState(false);
  const [oauthTokens, setOauthTokens] = useState<OAuthTokens | null>(null);
  const oauthAbortRef = useRef<AbortController | null>(null);

  const [oauthLambdaUrl, setOauthLambdaUrl] = useState(settings.oauth_lambda_url ?? '');

  const [formName, setFormName] = useState('');
  const [formToken, setFormToken] = useState('');
  const [formBaseId, setFormBaseId] = useState('');
  const [formTableName, setFormTableName] = useState('Tasks');

  const [basesLoading, setBasesLoading] = useState(false);
  const [basesError, setBasesError] = useState('');
  const [bases, setBases] = useState<Array<{ id: string; name: string }>>([]);

  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState('');
  const [tables, setTables] = useState<Array<{ name: string }>>([]);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  const resetForm = () => {
    setFormName('');
    setFormToken('');
    setFormBaseId('');
    setFormTableName('Tasks');
    setBases([]);
    setTables([]);
    setOauthTokens(null);
    setOauthPending(false);
    setBasesLoading(false);
    setBasesError('');
    setTablesLoading(false);
    setTablesError('');
    setStatusMsg(null);
  };

  const startAdd = () => {
    resetForm();
    setEditMode('add');
    setAddAuthTab('pat');
  };

  const startEdit = (account: Account) => {
    resetForm();
    setEditMode(account.id);
    setAddAuthTab(account.authType === 'oauth' ? 'oauth' : 'pat');
    setFormName(account.name);

    if (account.authType === 'pat') {
      setFormToken(account.token ?? '');
    }

    setFormBaseId(account.baseId);
    setFormTableName(account.tableName);
  };

  const cancelEdit = () => {
    oauthAbortRef.current?.abort();
    oauthAbortRef.current = null;
    setEditMode('none');
    setStatusMsg(null);
    setOauthTokens(null);
    setOauthPending(false);
  };

  const performOAuth = async (): Promise<OAuthTokens> => {
    const lambdaUrl = oauthLambdaUrl.trim();
    if (!lambdaUrl) throw new Error('OAuth Lambda URL is not configured in App Settings');

    oauthAbortRef.current?.abort();
    const ctrl = new AbortController();
    oauthAbortRef.current = ctrl;
    const tokens = await startOAuthFlow(lambdaUrl, ctrl.signal);
    return tokens;
  };

  const handleStartOAuth = async () => {
    setOauthPending(true);
    setStatusMsg(null);
    setOauthTokens(null);
    setBasesError('');
    setTablesError('');
    setBases([]);
    setTables([]);

    try {
      const tokens = await performOAuth();
      setOauthTokens(tokens);

      setBasesLoading(true);
      try {
        const loadedBases = await fetchBases(tokens.accessToken);
        setBases(loadedBases);
        if (loadedBases.length > 0) {
          const firstBase = loadedBases[0];
          setFormBaseId(firstBase.id);
          await handleLoadTablesForBase(tokens.accessToken, firstBase.id);
        } else {
          setBasesError('Could not load bases — enter ID manually');
        }
      } catch {
        setBasesError('Could not load bases — enter ID manually');
      } finally {
        setBasesLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly: Record<string, string> = {
        'Authorization was denied in the browser': 'Authorization was denied. Please try again.',
        'Session expired — please try again': 'Session expired. Please try again.',
        'Timed out waiting for Airtable authorization': 'Timed out. Please try again.',
        Cancelled: '',
        'OAuth Lambda URL is not configured in App Settings': 'Set the OAuth Lambda URL in App Settings first.',
      };
      const display = friendly[msg] ?? msg;
      if (display) setStatusMsg({ text: display, isError: true });
    } finally {
      setOauthPending(false);
    }
  };

  const handleLoadTablesForBase = async (token: string, baseId: string): Promise<void> => {
    setTables([]);
    setTablesError('');
    setTablesLoading(true);
    try {
      const loadedTables = await fetchTables(token, baseId);
      setTables(loadedTables);
      if (loadedTables.length > 0) setFormTableName(loadedTables[0].name);
    } catch {
      setTablesError('Could not load tables — enter name manually');
    } finally {
      setTablesLoading(false);
    }
  };

  const handleReauthenticate = async () => {
    if (editMode === 'none' || editMode === 'add') return;
    if (!oauthPending) {
      setOauthPending(true);
      setStatusMsg(null);
      try {
        const tokens = await performOAuth();
        await updateAccount(editMode, {
          oauthAccessToken: tokens.accessToken,
          oauthRefreshToken: tokens.refreshToken,
          oauthTokenExpiresAt: tokens.expiresAt,
        });
        setStatusMsg({ text: 'Re-authenticated successfully.', isError: false });
        setTimeout(() => setEditMode('none'), 800);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== 'Cancelled') setStatusMsg({ text: msg, isError: true });
      } finally {
        setOauthPending(false);
      }
    }
  };

  const handleSubmitAccount = async () => {
    if (saving) return;
    setSaving(true);
    setStatusMsg(null);

    try {
      const name = formName.trim() || defaultNameForForm(formBaseId);
      const baseId = formBaseId.trim();
      const tableName = formTableName.trim() || 'Tasks';

      if (editMode === 'add') {
        if (addAuthTab === 'oauth') {
          if (!oauthTokens) {
            setStatusMsg({ text: 'Complete sign-in with Airtable first.', isError: true });
            return;
          }
          await addAccount({
            name,
            authType: 'oauth',
            oauthAccessToken: oauthTokens.accessToken,
            oauthRefreshToken: oauthTokens.refreshToken,
            oauthTokenExpiresAt: oauthTokens.expiresAt,
            baseId,
            tableName,
          });
          setEditMode('none');
          return;
        }

        // PAT
        await addAccount({
          name,
          authType: 'pat',
          token: formToken.trim(),
          baseId,
          tableName,
        });
        setEditMode('none');
        return;
      }

      if (editMode !== 'none' && editMode !== 'add') {
        const account = accounts.find((a) => a.id === editMode);
        if (!account) return;

        if (account.authType === 'pat') {
          await updateAccount(editMode, {
            name,
            token: formToken.trim(),
            baseId,
            tableName,
          });
        } else {
          await updateAccount(editMode, {
            name,
            baseId,
            tableName,
          });
        }

        setEditMode('none');
      }
    } catch (err) {
      setStatusMsg({ text: err instanceof Error ? err.message : String(err), isError: true });
    } finally {
      setSaving(false);
    }
  };

  const defaultNameForForm = (baseId: string): string => {
    if (baseId) return `Account (${baseId.slice(0, 10)}…)`;
    return 'Airtable Account';
  };

  const handleSaveAppSettings = async () => {
    try {
      await saveSettings({ oauth_lambda_url: oauthLambdaUrl.trim() || undefined });
      await triggerSync();
      Alert.alert('Saved', 'OAuth settings saved. Sync started.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    if (!await confirmDelete(account.name)) return;
    await deleteAccount(id);
    cancelEdit();
  };

  const confirmDelete = async (name: string): Promise<boolean> => {
    return new Promise((resolve) => {
      Alert.alert('Confirm', `Delete "${name}"?`, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Airtable Accounts</Text>

        {/* Accounts list */}
        {accounts.length === 0 && editMode === 'none' && (
          <Text style={styles.emptyText}>No accounts yet. Add one to connect to Airtable.</Text>
        )}

        {accounts.length > 0 && editMode === 'none' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Accounts</Text>
            {accounts.map((a) => (
              <View key={a.id} style={styles.accountRow}>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName}>
                    {a.name} {a.id === activeAccountId ? '(Active)' : ''}
                  </Text>
                  <Text style={styles.accountMeta}>{a.baseId}</Text>
                </View>
                <View style={styles.accountActions}>
                  {a.id !== activeAccountId && (
                    <Pressable style={styles.btnSecondary} onPress={() => switchAccount(a.id)}>
                      <Text style={styles.btnTextSecondary}>Use This</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.btnSecondary} onPress={() => startEdit(a)}>
                    <Text style={styles.btnTextSecondary}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.btnDanger} onPress={() => void handleDelete(a.id)}>
                    <Text style={styles.btnTextDanger}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <Pressable style={styles.btnSecondary} onPress={startAdd}>
              <Text style={styles.btnTextSecondary}>+ Add Account</Text>
            </Pressable>
          </View>
        )}

        {/* Add/Edit form */}
        {editMode !== 'none' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editMode === 'add' ? 'Add Account' : 'Edit Account'}</Text>

            {editMode === 'add' && (
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleBtn, addAuthTab === 'pat' && styles.toggleBtnActive]}
                  onPress={() => setAddAuthTab('pat')}
                >
                  <Text style={styles.toggleBtnText}>Personal Access Token</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, addAuthTab === 'oauth' && styles.toggleBtnActive]}
                  onPress={() => setAddAuthTab('oauth')}
                >
                  <Text style={styles.toggleBtnText}>Sign in with Airtable</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.group}>
              <Text style={styles.label}>ACCOUNT NAME</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="Auto-derived if empty"
                placeholderTextColor="#A5ADBA"
              />
            </View>

            {/* PAT token field */}
            {((editMode === 'add' && addAuthTab === 'pat') ||
              (editMode !== 'add' && accounts.find((x) => x.id === editMode)?.authType !== 'oauth')) && (
              <View style={styles.group}>
                <Text style={styles.label}>PERSONAL ACCESS TOKEN</Text>
                <TextInput
                  style={styles.input}
                  value={formToken}
                  onChangeText={setFormToken}
                  placeholder="pat…"
                  placeholderTextColor="#A5ADBA"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <Text style={styles.hint}>
                  Required scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write
                </Text>
              </View>
            )}

            {/* OAuth sign-in */}
            {editMode === 'add' && addAuthTab === 'oauth' && !oauthPending && !oauthTokens && (
              <Pressable style={styles.btnPrimary} onPress={() => void handleStartOAuth()}>
                <Text style={styles.btnPrimaryText}>Sign in with Airtable</Text>
              </Pressable>
            )}

            {editMode === 'add' && addAuthTab === 'oauth' && oauthPending && (
              <View style={styles.oauthWait}>
                <Text style={styles.hint}>Waiting for browser…</Text>
                <Pressable
                  style={styles.btnSecondary}
                  onPress={() => {
                    oauthAbortRef.current?.abort();
                    oauthAbortRef.current = null;
                    setOauthPending(false);
                  }}
                >
                  <Text style={styles.btnTextSecondary}>Cancel</Text>
                </Pressable>
              </View>
            )}

            {editMode === 'add' && addAuthTab === 'oauth' && oauthTokens && (
              <View style={styles.group}>
                <Text style={styles.label}>BASE ID</Text>
                <TextInput
                  style={styles.input}
                  value={formBaseId}
                  onChangeText={setFormBaseId}
                  placeholder="app…"
                  placeholderTextColor="#A5ADBA"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {basesError ? <Text style={styles.hint}>{basesError}</Text> : null}

                {basesLoading && <Text style={styles.hint}>Loading bases…</Text>}

                {!basesLoading && !basesError && bases.length > 0 && (
                  <ScrollView style={styles.choiceList} keyboardShouldPersistTaps="handled">
                    {bases.map((b) => (
                      <Pressable
                        key={b.id}
                        style={[
                          styles.choiceRow,
                          b.id === formBaseId && styles.choiceRowActive,
                        ]}
                        onPress={() => {
                          setFormBaseId(b.id);
                          void handleLoadTablesForBase(oauthTokens.accessToken, b.id);
                        }}
                      >
                        <Text style={styles.choiceRowText}>{b.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}

                <Text style={styles.label}>TABLE NAME</Text>
                <TextInput
                  style={styles.input}
                  value={formTableName}
                  onChangeText={setFormTableName}
                  placeholder="Tasks"
                  placeholderTextColor="#A5ADBA"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                {tablesError ? <Text style={styles.hint}>{tablesError}</Text> : null}
                {tablesLoading ? <Text style={styles.hint}>Loading tables…</Text> : null}

                {!tablesLoading && !tablesError && tables.length > 0 && (
                  <ScrollView style={styles.choiceList} keyboardShouldPersistTaps="handled">
                    {tables.map((t) => (
                      <Pressable
                        key={t.name}
                        style={[
                          styles.choiceRow,
                          t.name === formTableName && styles.choiceRowActive,
                        ]}
                        onPress={() => setFormTableName(t.name)}
                      >
                        <Text style={styles.choiceRowText}>{t.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* OAuth editing: re-auth */}
            {editMode !== 'none' && editMode !== 'add' && (
              (() => {
                const account = accounts.find((a) => a.id === editMode) ?? null;
                if (!account || account.authType !== 'oauth') return null;
                return (
                  <Pressable style={styles.btnSecondary} onPress={() => void handleReauthenticate()}>
                    <Text style={styles.btnTextSecondary}>Re-authenticate</Text>
                  </Pressable>
                );
              })()
            )}

            {/* Base/table inputs */}
            {((editMode === 'add' && addAuthTab === 'pat') || editMode !== 'add') && (
              <>
                <View style={styles.group}>
                  <Text style={styles.label}>BASE ID</Text>
                  <TextInput
                    style={styles.input}
                    value={formBaseId}
                    onChangeText={setFormBaseId}
                    placeholder="app…"
                    placeholderTextColor="#A5ADBA"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.group}>
                  <Text style={styles.label}>TABLE NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={formTableName}
                    onChangeText={setFormTableName}
                    placeholder="Tasks"
                    placeholderTextColor="#A5ADBA"
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
              </>
            )}

            {statusMsg ? (
              <Text style={[styles.statusText, statusMsg.isError ? styles.statusError : styles.statusOk]}>
                {statusMsg.text}
              </Text>
            ) : null}

            <View style={styles.formActions}>
              <Pressable
                style={[styles.btnPrimary, saving && styles.btnPrimaryDisabled]}
                onPress={() => void handleSubmitAccount()}
                disabled={saving}
              >
                <Text style={styles.btnPrimaryText}>{saving ? 'Saving…' : (editMode === 'add' ? 'Add Account' : 'Save Account')}</Text>
              </Pressable>
              <Pressable style={styles.btnSecondary} onPress={cancelEdit}>
                <Text style={styles.btnTextSecondary}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* App settings */}
        <View style={styles.divider} />
        <Text style={styles.sectionTitleSmall}>App Settings</Text>

        <View style={styles.group}>
          <Text style={styles.label}>OAuth Lambda URL</Text>
          <TextInput
            style={styles.input}
            value={oauthLambdaUrl}
            onChangeText={setOauthLambdaUrl}
            placeholder="https://airtable-kanban.widgeterian.com"
            placeholderTextColor="#A5ADBA"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Used for Airtable OAuth via PKCE so the client_secret stays on your server.
          </Text>
        </View>

        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={() => void handleSaveAppSettings()}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.versionText}>Airtable Kanban v1.0.2</Text>
        </View>
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
    marginBottom: 14,
  },
  sectionTitleSmall: {
    fontSize: 16,
    fontWeight: '700',
    color: '#172B4D',
    marginBottom: 8,
  },
  emptyText: {
    color: '#6B778C',
    marginTop: 8,
    marginBottom: 14,
  },
  card: {
    borderWidth: 1,
    borderColor: '#DFE1E6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    color: '#172B4D',
  },
  group: {
    marginBottom: 14,
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
  accountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#172B4D',
  },
  accountMeta: {
    fontSize: 12,
    color: '#6B778C',
    marginTop: 4,
  },
  accountActions: {
    width: 132,
    gap: 8,
  },
  btnSecondary: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  btnTextSecondary: {
    color: '#172B4D',
    fontWeight: '700',
    fontSize: 12,
  },
  btnDanger: {
    backgroundColor: '#DE350B',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  btnTextDanger: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  btnPrimary: {
    backgroundColor: '#0052CC',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryDisabled: {
    opacity: 0.6,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
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
    marginVertical: 22,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#DCEBFF',
  },
  toggleBtnText: {
    color: '#172B4D',
    fontWeight: '700',
    fontSize: 12,
  },
  oauthWait: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  choiceList: {
    height: 100,
    marginTop: 10,
  },
  choiceRow: {
    borderWidth: 1,
    borderColor: '#DFE1E6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  choiceRowActive: {
    borderColor: '#0052CC',
    backgroundColor: '#DCEBFF',
  },
  choiceRowText: {
    color: '#172B4D',
    fontWeight: '700',
    fontSize: 12,
  },
  statusText: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  statusError: {
    color: '#DE350B',
  },
  statusOk: {
    color: '#2F855A',
  },
  footer: {
    marginTop: 14,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#A5ADBA',
    textAlign: 'center',
  },
});
