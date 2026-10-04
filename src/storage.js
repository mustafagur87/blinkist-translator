import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'settings.v1';
const HISTORY_KEY = 'history.v1';
const HISTORY_LIMIT = 50;

export const DEFAULT_SETTINGS = { bookLanguage: 'auto', autoPaste: true };

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; ignore storage failures.
  }
}

export async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Adds a result to the front of the history, replacing an older lookup of the same word.
export function addToHistory(history, result) {
  const key = result.text.toLowerCase();
  const next = [
    { ...result, at: Date.now() },
    ...history.filter((h) => h.text.toLowerCase() !== key),
  ].slice(0, HISTORY_LIMIT);
  AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function clearHistory() {
  AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
  return [];
}
