// Translation service: takes a word or phrase from a German or English book
// and returns its English and Turkish translations side by side.
//
// Sources (all free, no API key):
//   1. Google Translate public endpoint: translation + dictionary alternatives
//   2. MyMemory: fallback when Google is unreachable or rate-limited
//   3. dictionaryapi.dev: English definitions when the book is already English

const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const DICTIONARY_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

const REQUEST_TIMEOUT_MS = 8000;

const GERMAN_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem',
  'einer', 'und', 'oder', 'aber', 'ist', 'sind', 'war', 'nicht', 'ich', 'du',
  'er', 'sie', 'es', 'wir', 'ihr', 'mit', 'auf', 'für', 'von', 'zu', 'zum',
  'zur', 'im', 'auch', 'sich', 'wie', 'wenn', 'dass', 'noch', 'nur', 'werden',
  'wird', 'hat', 'haben', 'kann', 'können', 'mehr', 'sehr', 'bei', 'nach',
]);

const ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'not',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'with', 'on', 'for', 'of',
  'to', 'in', 'that', 'this', 'have', 'has', 'can', 'will', 'more', 'very',
]);

const GERMAN_PATTERN = /[äöüß]|sch|(ung|heit|keit|schaft|lich|chen|isch)$/i;

// Strips quotes, punctuation and whitespace that come along with a selection.
export function cleanSelection(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'„“”‚‘’«»()[\]{}.,;:!?…–—-]+/, '')
    .replace(/[\s"'„“”‚‘’«»()[\]{}.,;:!?…–—-]+$/, '')
    .slice(0, 500);
}

// Offline guess between German and English. Used when the book language is
// "auto" and the online services could not detect it.
export function guessLanguage(text) {
  const words = text.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean);
  let de = 0;
  let en = 0;
  for (const word of words) {
    if (GERMAN_WORDS.has(word)) de += 2;
    if (ENGLISH_WORDS.has(word)) en += 2;
    if (GERMAN_PATTERN.test(word)) de += 1;
  }
  return de > en ? 'de' : 'en';
}

async function fetchJson(url, fetchImpl) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function googleTranslate(text, source, target, fetchImpl = fetch) {
  const params = [
    'client=gtx',
    `sl=${source}`,
    `tl=${target}`,
    'dt=t',
    'dt=bd',
    'dj=1',
    `q=${encodeURIComponent(text)}`,
  ].join('&');
  const data = await fetchJson(`${GOOGLE_URL}?${params}`, fetchImpl);

  const translation = (data.sentences || [])
    .map((s) => s.trans || '')
    .join('')
    .trim();
  if (!translation) throw new Error('Empty translation');

  const alternatives = (data.dict || []).map((d) => ({
    pos: d.pos || '',
    terms: (d.terms || []).slice(0, 6),
  }));

  return { translation, alternatives, detected: data.src || null };
}

export async function myMemoryTranslate(text, source, target, fetchImpl = fetch) {
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const data = await fetchJson(url, fetchImpl);
  const translation = data?.responseData?.translatedText?.trim();
  if (!translation || data.responseStatus >= 400) {
    throw new Error(data?.responseDetails || 'MyMemory failed');
  }
  return { translation, alternatives: [], detected: null };
}

export async function englishDefinitions(word, fetchImpl = fetch) {
  try {
    const data = await fetchJson(DICTIONARY_URL + encodeURIComponent(word.toLowerCase()), fetchImpl);
    if (!Array.isArray(data) || data.length === 0) return { phonetic: null, meanings: [] };
    const entry = data[0];
    const meanings = (entry.meanings || []).slice(0, 3).map((m) => ({
      pos: m.partOfSpeech || '',
      definitions: (m.definitions || []).slice(0, 2).map((d) => d.definition),
      synonyms: (m.synonyms || []).slice(0, 5),
    }));
    return { phonetic: entry.phonetic || null, meanings };
  } catch {
    return { phonetic: null, meanings: [] };
  }
}

async function translateWithFallback(text, source, target, fetchImpl) {
  try {
    return await googleTranslate(text, source, target, fetchImpl);
  } catch (googleError) {
    const from = source === 'auto' ? guessLanguage(text) : source;
    if (from === target) {
      return { translation: text, alternatives: [], detected: from };
    }
    return { ...(await myMemoryTranslate(text, from, target, fetchImpl)), detected: from };
  }
}

/**
 * Translate a selection into English and Turkish at the same time.
 * @param {string} rawText selected text
 * @param {{bookLanguage?: 'auto'|'de'|'en', fetchImpl?: typeof fetch}} options
 */
export async function translateSelection(rawText, options = {}) {
  const { bookLanguage = 'auto', fetchImpl = fetch } = options;
  const text = cleanSelection(rawText);
  if (!text) throw new Error('Nothing to translate');

  const [english, turkish] = await Promise.allSettled([
    translateWithFallback(text, bookLanguage, 'en', fetchImpl),
    translateWithFallback(text, bookLanguage, 'tr', fetchImpl),
  ]);

  if (english.status === 'rejected' && turkish.status === 'rejected') {
    throw new Error('Could not reach the translation service. Check your internet connection.');
  }

  const detected =
    (bookLanguage !== 'auto' && bookLanguage) ||
    (english.status === 'fulfilled' && english.value.detected) ||
    (turkish.status === 'fulfilled' && turkish.value.detected) ||
    guessLanguage(text);

  const result = {
    text,
    sourceLanguage: detected,
    english: english.status === 'fulfilled' ? english.value : { error: english.reason.message },
    turkish: turkish.status === 'fulfilled' ? turkish.value : { error: turkish.reason.message },
    definitions: null,
  };

  // For English books an "English translation" is just the same word, so show
  // what it means instead. Only worth it for a single word or short phrase.
  const wordCount = text.split(' ').length;
  const englishWord = detected === 'en' ? text : result.english.translation;
  if (englishWord && englishWord.split(' ').length <= 3 && wordCount <= 3) {
    result.definitions = await englishDefinitions(englishWord, fetchImpl);
  }

  return result;
}
