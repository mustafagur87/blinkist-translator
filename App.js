import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';

import { cleanSelection, translateSelection } from './src/translate';
import { textFromUrl } from './src/incomingText';
import { addToHistory, clearHistory, loadHistory, loadSettings, saveSettings } from './src/storage';

const BOOK_LANGUAGES = [
  { value: 'auto', label: 'Auto' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

const SPEECH_LOCALES = { de: 'de-DE', en: 'en-US', tr: 'tr-TR' };

// Clipboard text longer than this is probably not a word the user wants looked up.
const MAX_CLIPBOARD_LENGTH = 200;

const COLORS = {
  background: '#F4F7F5',
  card: '#FFFFFF',
  text: '#03314B',
  muted: '#5B6B73',
  accent: '#2CE080', // Blinkist-like green
  accentDark: '#0A9B57',
  border: '#DDE5E1',
  error: '#C0392B',
};

export default function App() {
  return (
    <SafeAreaProvider>
      <TranslatorScreen />
    </SafeAreaProvider>
  );
}

function TranslatorScreen() {
  const [settings, setSettings] = useState(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const settingsRef = useRef(null);
  const lastClipboardRef = useRef(null);
  const requestIdRef = useRef(0);

  const translate = useCallback(async (raw) => {
    const text = cleanSelection(raw);
    if (!text) return;
    Keyboard.dismiss();
    setInput(text);
    setError(null);
    setLoading(true);
    const requestId = ++requestIdRef.current;
    try {
      const bookLanguage = settingsRef.current?.bookLanguage ?? 'auto';
      const next = await translateSelection(text, { bookLanguage });
      if (requestId !== requestIdRef.current) return;
      setResult(next);
      setHistory((h) => addToHistory(h, next));
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const checkClipboard = useCallback(async () => {
    if (!settingsRef.current?.autoPaste) return;
    try {
      if (!(await Clipboard.hasStringAsync())) return;
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text || text.length > MAX_CLIPBOARD_LENGTH || text === lastClipboardRef.current) return;
      lastClipboardRef.current = text;
      translate(text);
    } catch {
      // Clipboard access can be denied; the user can still paste manually.
    }
  }, [translate]);

  // Load saved settings and history, then handle whatever brought us here:
  // a selection from Blinkist (deep link) or a freshly copied word.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedSettings, loadedHistory] = await Promise.all([loadSettings(), loadHistory()]);
      if (cancelled) return;
      settingsRef.current = loadedSettings;
      setSettings(loadedSettings);
      setHistory(loadedHistory);

      const sharedText = textFromUrl(await Linking.getInitialURL());
      if (sharedText) translate(sharedText);
      else checkClipboard();
    })();
    return () => {
      cancelled = true;
    };
  }, [translate, checkClipboard]);

  useEffect(() => {
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      const sharedText = textFromUrl(url);
      if (sharedText) translate(sharedText);
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkClipboard();
    });
    return () => {
      linkSub.remove();
      appStateSub.remove();
    };
  }, [translate, checkClipboard]);

  const updateSettings = (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
  };

  const pasteAndTranslate = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    lastClipboardRef.current = text.trim();
    if (text.trim()) translate(text);
  };

  if (!settings) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={COLORS.accentDark} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <FlatList
        data={history.filter((h) => h.text !== result?.text)}
        keyExtractor={(item) => `${item.text}-${item.at}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Blinkist Translator</Text>
            <Text style={styles.subtitle}>German / English → English + Türkçe</Text>

            <View style={styles.segment}>
              {BOOK_LANGUAGES.map((lang) => {
                const active = settings.bookLanguage === lang.value;
                return (
                  <Pressable
                    key={lang.value}
                    onPress={() => updateSettings({ bookLanguage: lang.value })}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{lang.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>Book language</Text>

            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => translate(input)}
                placeholder="Type or paste a word…"
                placeholderTextColor={COLORS.muted}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable onPress={() => translate(input)} style={styles.button}>
                <Text style={styles.buttonText}>Translate</Text>
              </Pressable>
            </View>

            <View style={styles.optionsRow}>
              <Pressable onPress={pasteAndTranslate} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>📋 Paste</Text>
              </Pressable>
              <View style={styles.switchRow}>
                <Text style={styles.hint}>Auto-translate copied text</Text>
                <Switch
                  value={settings.autoPaste}
                  onValueChange={(autoPaste) => updateSettings({ autoPaste })}
                  trackColor={{ true: COLORS.accent }}
                />
              </View>
            </View>

            {loading && <ActivityIndicator style={styles.loader} color={COLORS.accentDark} />}
            {error && <Text style={styles.error}>{error}</Text>}
            {result && !loading && <ResultView result={result} />}

            {history.length > 0 && (
              <View style={styles.historyHeader}>
                <Text style={styles.sectionTitle}>Recent words</Text>
                <Pressable onPress={() => setHistory(clearHistory())}>
                  <Text style={styles.link}>Clear</Text>
                </Pressable>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setResult(item);
              setInput(item.text);
              setError(null);
            }}
            style={styles.historyItem}
          >
            <Text style={styles.historyWord}>{item.text}</Text>
            <Text style={styles.historyTranslation} numberOfLines={1}>
              🇬🇧 {item.english?.translation ?? '—'}   🇹🇷 {item.turkish?.translation ?? '—'}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function speak(text, lang) {
  Speech.stop();
  Speech.speak(text, { language: SPEECH_LOCALES[lang] ?? 'en-US' });
}

function ResultView({ result }) {
  const sourceLabel = { de: 'German', en: 'English' }[result.sourceLanguage] ?? result.sourceLanguage;
  const isEnglishBook = result.sourceLanguage === 'en';

  return (
    <View>
      <View style={styles.wordRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.word}>{result.text}</Text>
          <Text style={styles.hint}>
            {sourceLabel}
            {isEnglishBook && result.definitions?.phonetic ? `  ·  ${result.definitions.phonetic}` : ''}
          </Text>
        </View>
        <SpeakButton onPress={() => speak(result.text, result.sourceLanguage)} />
      </View>

      <TranslationCard
        flag="🇬🇧"
        title="English"
        data={result.english}
        lang="en"
        hideTranslation={isEnglishBook}
        definitions={result.definitions}
      />
      <TranslationCard flag="🇹🇷" title="Türkçe" data={result.turkish} lang="tr" />
    </View>
  );
}

function TranslationCard({ flag, title, data, lang, hideTranslation, definitions }) {
  const meanings = definitions?.meanings ?? [];
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {flag} {title}
        </Text>
        {data?.translation && <SpeakButton onPress={() => speak(data.translation, lang)} />}
      </View>

      {data?.error ? (
        <Text style={styles.error}>{data.error}</Text>
      ) : (
        <>
          {!hideTranslation && <Text style={styles.translation}>{data.translation}</Text>}
          {data.alternatives?.map((alt) => (
            <Text key={alt.pos} style={styles.alternatives}>
              <Text style={styles.pos}>{alt.pos} </Text>
              {alt.terms.join(', ')}
            </Text>
          ))}
        </>
      )}

      {meanings.length > 0 && (
        <View style={styles.definitions}>
          <Text style={styles.definitionsTitle}>Meaning</Text>
          {meanings.map((m) => (
            <View key={m.pos} style={styles.meaning}>
              <Text style={styles.pos}>{m.pos}</Text>
              {m.definitions.map((d) => (
                <Text key={d} style={styles.definition}>
                  • {d}
                </Text>
              ))}
              {m.synonyms.length > 0 && <Text style={styles.synonyms}>≈ {m.synonyms.join(', ')}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function SpeakButton({ onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel="Pronounce">
      <Text style={styles.speak}>🔊</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.muted, marginBottom: 16 },
  segment: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
  },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentItemActive: { backgroundColor: COLORS.accent },
  segmentText: { color: COLORS.muted, fontWeight: '600' },
  segmentTextActive: { color: COLORS.text },
  hint: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  inputRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: COLORS.text,
  },
  button: { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  buttonText: { fontWeight: '700', color: COLORS.text },
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
  },
  secondaryButtonText: { color: COLORS.text, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loader: { marginTop: 24 },
  error: { color: COLORS.error, marginTop: 12 },
  wordRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 4 },
  word: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase' },
  translation: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: 6 },
  alternatives: { fontSize: 15, color: COLORS.text, marginTop: 6 },
  pos: { fontStyle: 'italic', color: COLORS.accentDark, fontWeight: '600' },
  definitions: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  definitionsTitle: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: 4 },
  meaning: { marginBottom: 8 },
  definition: { fontSize: 15, color: COLORS.text, marginTop: 2 },
  synonyms: { fontSize: 14, color: COLORS.muted, marginTop: 2 },
  speak: { fontSize: 20 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  link: { color: COLORS.accentDark, fontWeight: '600' },
  historyItem: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyWord: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  historyTranslation: { fontSize: 14, color: COLORS.muted, marginTop: 2 },
});
