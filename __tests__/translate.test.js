import { cleanSelection, guessLanguage, translateSelection } from '../src/translate';

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
}

// Fake network: routes each request to a handler by host.
function fakeFetch(handlers) {
  const calls = [];
  const impl = (url) => {
    calls.push(url);
    for (const [host, handler] of Object.entries(handlers)) {
      if (url.includes(host)) return handler(new URL(url));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  impl.calls = calls;
  return impl;
}

describe('cleanSelection', () => {
  it('strips quotes, punctuation and extra whitespace', () => {
    expect(cleanSelection('  „Gelassenheit“,  ')).toBe('Gelassenheit');
    expect(cleanSelection('(resilience).')).toBe('resilience');
    expect(cleanSelection('take   it\neasy!')).toBe('take it easy');
    expect(cleanSelection('')).toBe('');
  });
});

describe('guessLanguage', () => {
  it('recognises German', () => {
    expect(guessLanguage('Gelassenheit')).toBe('de');
    expect(guessLanguage('übermäßig')).toBe('de');
    expect(guessLanguage('das ist nicht gut')).toBe('de');
  });

  it('defaults to English', () => {
    expect(guessLanguage('serendipity')).toBe('en');
    expect(guessLanguage('the power of habit')).toBe('en');
  });
});

describe('translateSelection', () => {
  const googleDe = (url) => {
    const tl = url.searchParams.get('tl');
    const trans = { en: 'serenity', tr: 'dinginlik' }[tl];
    return jsonResponse({
      src: 'de',
      sentences: [{ trans, orig: 'Gelassenheit' }],
      dict: [{ pos: 'noun', terms: [trans, `${trans}2`] }],
    });
  };
  const dictionary = () =>
    jsonResponse([
      {
        phonetic: '/səˈrɛnɪti/',
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'The state of being calm.' }], synonyms: ['calm'] }],
      },
    ]);

  it('translates a German word into English and Turkish at once', async () => {
    const fetchImpl = fakeFetch({ 'translate.googleapis.com': googleDe, 'dictionaryapi.dev': dictionary });
    const result = await translateSelection('„Gelassenheit“', { fetchImpl });

    expect(result.text).toBe('Gelassenheit');
    expect(result.sourceLanguage).toBe('de');
    expect(result.english.translation).toBe('serenity');
    expect(result.turkish.translation).toBe('dinginlik');
    expect(result.english.alternatives[0]).toEqual({ pos: 'noun', terms: ['serenity', 'serenity2'] });
    // The English translation gets an English definition too
    expect(result.definitions.meanings[0].definitions[0]).toBe('The state of being calm.');
    expect(fetchImpl.calls.some((u) => u.includes('/en/serenity'))).toBe(true);
  });

  it('passes the chosen book language to the translator', async () => {
    const fetchImpl = fakeFetch({ 'translate.googleapis.com': googleDe, 'dictionaryapi.dev': dictionary });
    await translateSelection('Kind', { bookLanguage: 'de', fetchImpl });
    const googleCalls = fetchImpl.calls.filter((u) => u.includes('googleapis'));
    expect(googleCalls).toHaveLength(2);
    googleCalls.forEach((u) => expect(u).toContain('sl=de'));
  });

  it('shows English definitions for an English book', async () => {
    const fetchImpl = fakeFetch({
      'translate.googleapis.com': (url) =>
        jsonResponse({
          src: 'en',
          sentences: [{ trans: url.searchParams.get('tl') === 'tr' ? 'sükunet' : 'serenity' }],
        }),
      'dictionaryapi.dev': dictionary,
    });
    const result = await translateSelection('serenity', { fetchImpl });
    expect(result.sourceLanguage).toBe('en');
    expect(result.turkish.translation).toBe('sükunet');
    expect(result.definitions.phonetic).toBe('/səˈrɛnɪti/');
  });

  it('falls back to MyMemory when Google fails', async () => {
    const fetchImpl = fakeFetch({
      'translate.googleapis.com': () => jsonResponse({}, false),
      'mymemory.translated.net': (url) => {
        const pair = url.searchParams.get('langpair');
        const trans = { 'de|en': 'serenity', 'de|tr': 'dinginlik' }[pair];
        return jsonResponse({ responseStatus: 200, responseData: { translatedText: trans } });
      },
      'dictionaryapi.dev': () => jsonResponse({}, false),
    });
    const result = await translateSelection('Gelassenheit', { fetchImpl });
    expect(result.sourceLanguage).toBe('de');
    expect(result.english.translation).toBe('serenity');
    expect(result.turkish.translation).toBe('dinginlik');
    expect(result.definitions).toEqual({ phonetic: null, meanings: [] });
  });

  it('reports a clear error when offline', async () => {
    const fetchImpl = () => Promise.reject(new Error('Network request failed'));
    await expect(translateSelection('Gelassenheit', { fetchImpl })).rejects.toThrow(/internet/);
  });

  it('rejects empty selections', async () => {
    await expect(translateSelection(' ,. ', { fetchImpl: fakeFetch({}) })).rejects.toThrow(/Nothing/);
  });
});
