import { textFromUrl } from '../src/incomingText';

describe('textFromUrl', () => {
  it('reads text from the deep link built by the Android intent handler', () => {
    expect(textFromUrl('blinkisttranslator://translate?text=Gelassenheit')).toBe('Gelassenheit');
    expect(textFromUrl('blinkisttranslator://translate?text=%C3%BCberm%C3%A4%C3%9Fig%20gut')).toBe('übermäßig gut');
    expect(textFromUrl('blinkisttranslator://translate?text=take+it')).toBe('take it');
  });

  it('ignores unrelated or broken links', () => {
    expect(textFromUrl(null)).toBeNull();
    expect(textFromUrl('https://example.com?text=hi')).toBeNull();
    expect(textFromUrl('blinkisttranslator://translate')).toBeNull();
    expect(textFromUrl('blinkisttranslator://translate?text=%E0%A4%A')).toBeNull();
  });
});
