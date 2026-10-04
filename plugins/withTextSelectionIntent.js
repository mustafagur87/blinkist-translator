// Expo config plugin (Android only).
//
// 1. Registers the app for ACTION_PROCESS_TEXT, so "EN + TR" shows up in the
//    menu that appears when you select text in other apps (like Blinkist),
//    and for ACTION_SEND text/plain, so it is also a target in the Share sheet.
// 2. Rewrites those intents in MainActivity into a deep link
//    (blinkisttranslator://translate?text=...) that React Native's Linking API
//    understands, both on cold start and when the app is already running.

const { withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const MENU_LABEL = 'EN + TR';
const MARKER = '// blinkist-translator: text selection';

function withIntentFilters(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const activity = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!activity) throw new Error('withTextSelectionIntent: MainActivity not found in AndroidManifest.xml');

    activity['intent-filter'] = activity['intent-filter'] || [];
    const hasAction = (name) =>
      activity['intent-filter'].some((f) => f.action?.some((a) => a.$['android:name'] === name));

    for (const action of ['android.intent.action.PROCESS_TEXT', 'android.intent.action.SEND']) {
      if (hasAction(action)) continue;
      activity['intent-filter'].push({
        $: { 'android:label': MENU_LABEL },
        action: [{ $: { 'android:name': action } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }
    return cfg;
  });
}

const KOTLIN_HELPER = `
  ${MARKER}
  private fun convertSelectedTextIntent(intent: android.content.Intent?) {
    if (intent == null) return
    val text = when (intent.action) {
      android.content.Intent.ACTION_PROCESS_TEXT ->
        intent.getCharSequenceExtra(android.content.Intent.EXTRA_PROCESS_TEXT)
      android.content.Intent.ACTION_SEND ->
        intent.getCharSequenceExtra(android.content.Intent.EXTRA_TEXT)
      else -> null
    } ?: return
    intent.action = android.content.Intent.ACTION_VIEW
    intent.data = android.net.Uri.Builder()
      .scheme("blinkisttranslator")
      .authority("translate")
      .appendQueryParameter("text", text.toString())
      .build()
  }

  override fun onNewIntent(intent: android.content.Intent) {
    convertSelectedTextIntent(intent)
    super.onNewIntent(intent)
  }
`;

function withIntentConversion(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withTextSelectionIntent: only Kotlin MainActivity is supported');
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const onCreate = /override fun onCreate\(savedInstanceState: Bundle\?\) \{\n/;
    if (!onCreate.test(src)) throw new Error('withTextSelectionIntent: onCreate not found in MainActivity');
    if (/override fun onNewIntent/.test(src)) {
      throw new Error('withTextSelectionIntent: MainActivity already overrides onNewIntent');
    }

    src = src.replace(onCreate, (m) => `${m}    convertSelectedTextIntent(intent)\n`);
    // Add the helper right after the class declaration line.
    src = src.replace(/(class MainActivity\s*:\s*ReactActivity\(\)\s*\{\n)/, `$1${KOTLIN_HELPER}`);
    if (!src.includes(MARKER)) throw new Error('withTextSelectionIntent: MainActivity class not found');

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withTextSelectionIntent(config) {
  return withIntentConversion(withIntentFilters(config));
};
