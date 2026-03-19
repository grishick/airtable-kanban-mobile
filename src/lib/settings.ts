import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Settings } from '../types';

const TOKEN_KEY = 'airtable_access_token';
const BASE_ID_KEY = 'airtable_base_id';
const TABLE_NAME_KEY = 'airtable_table_name';
const OAUTH_LAMBDA_URL_KEY = 'oauth_lambda_url';
const DEFAULT_OAUTH_LAMBDA_URL = 'https://airtable-kanban.widgeterian.com';

export async function loadSettings(): Promise<Settings> {
  const [token, baseId, tableName, oauthLambdaUrl] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    AsyncStorage.getItem(BASE_ID_KEY),
    AsyncStorage.getItem(TABLE_NAME_KEY),
    AsyncStorage.getItem(OAUTH_LAMBDA_URL_KEY),
  ]);
  return {
    oauth_lambda_url: (oauthLambdaUrl && oauthLambdaUrl.trim())
      ? oauthLambdaUrl.trim().replace(/\/+$/, '')
      : DEFAULT_OAUTH_LAMBDA_URL,
    airtable_access_token: token ?? undefined,
    airtable_base_id: baseId ?? undefined,
    airtable_table_name: tableName ?? undefined,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const ops: Promise<unknown>[] = [];

  if (settings.oauth_lambda_url !== undefined) {
    ops.push(
      settings.oauth_lambda_url
        ? AsyncStorage.setItem(OAUTH_LAMBDA_URL_KEY, settings.oauth_lambda_url)
        : AsyncStorage.removeItem(OAUTH_LAMBDA_URL_KEY),
    );
  }

  if (settings.airtable_access_token !== undefined) {
    ops.push(
      settings.airtable_access_token
        ? SecureStore.setItemAsync(TOKEN_KEY, settings.airtable_access_token)
        : SecureStore.deleteItemAsync(TOKEN_KEY),
    );
  }

  if (settings.airtable_base_id !== undefined) {
    ops.push(
      settings.airtable_base_id
        ? AsyncStorage.setItem(BASE_ID_KEY, settings.airtable_base_id)
        : AsyncStorage.removeItem(BASE_ID_KEY),
    );
  }

  if (settings.airtable_table_name !== undefined) {
    ops.push(
      settings.airtable_table_name
        ? AsyncStorage.setItem(TABLE_NAME_KEY, settings.airtable_table_name)
        : AsyncStorage.removeItem(TABLE_NAME_KEY),
    );
  }

  await Promise.all(ops);
}
