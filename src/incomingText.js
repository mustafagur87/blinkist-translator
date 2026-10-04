// Text selected in another app (Blinkist) arrives as a deep link:
//   blinkisttranslator://translate?text=<selected text>
// On Android the native side turns "Translate EN + TR" / "Share" intents into
// this link (see plugins/withTextSelectionIntent.js).

export const SCHEME = 'blinkisttranslator';

export function textFromUrl(url) {
  if (!url || !url.startsWith(`${SCHEME}://`)) return null;
  const match = url.match(/[?&]text=([^&#]*)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1].replace(/\+/g, ' ')) || null;
  } catch {
    return null;
  }
}
