# Blinkist Translator

Look up words while you read on Blinkist. Select or copy a word from a **German or English** book and you get its **English and Turkish** translations at the same time.

- 🇬🇧 + 🇹🇷 translations side by side, with alternative meanings (noun / verb / adjective…)
- English books: shows the English **meaning/definition** and synonyms, plus the Turkish translation
- Book language: **Auto**, **Deutsch** or **English** (choose it if a short word gets detected wrong, e.g. "Kind", "Gift")
- 🔊 pronunciation for the original word and both translations
- History of recent words
- No account or API key needed

## How to use it with Blinkist

**Android, with the text-selection menu (best).** Long-press a word in Blinkist, open the menu (⋮) and tap **EN + TR**. You can also pick **Share → EN + TR**. The translator opens with the result, and Back takes you to your book.

**Android or iPhone, with copy.** Select the word in Blinkist, tap **Copy**, then switch to the translator. It translates the copied word automatically. You can turn this off with the *Auto-translate copied text* switch, and use **📋 Paste** or the text field instead.

> Whether Blinkist shows the system text menu (Copy / Share / EN + TR) depends on the Blinkist version. If **EN + TR** doesn't appear, Copy will still work.

## Install on your phone

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

### Quickest try-out (Expo Go, copy mode only)

1. Install **Expo Go** from the Play Store / App Store.
2. Run `npm start` and scan the QR code with your phone.

### Full Android app with the "EN + TR" menu (APK)

The selection-menu integration needs a real build. Expo builds it in the cloud, so you don't need Android Studio:

```bash
npx eas-cli@latest login            # free Expo account
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, open the link on your phone and install the APK.

If you have Android Studio, you can build and run locally instead with `npm run android`.

## Development

```bash
npm test        # unit tests for translation logic
npm start       # dev server
```

| File | Purpose |
| --- | --- |
| `App.js` | The screen: input, settings, results, history |
| `src/translate.js` | Language detection plus translation (Google Translate, falls back to MyMemory) and English definitions (dictionaryapi.dev) |
| `src/incomingText.js` | Reads text handed over from Blinkist through a deep link |
| `src/storage.js` | Saved settings and history |
| `plugins/withTextSelectionIntent.js` | Android: adds **EN + TR** to the text-selection and share menus |

Translations come from free public services, so you need an internet connection.
