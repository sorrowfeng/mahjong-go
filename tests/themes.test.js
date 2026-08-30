// themes.test.js — 主题定义与切换

const { THEMES, DEFAULT_THEME_ID, isValidTheme, applyTheme, getAppliedTheme } = require('../js/themes.js');

describe('themes', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  test('提供四套主题（木韵/暗夜/清新/暮色）且默认主题有效', () => {
    expect(THEMES.map(t => t.id)).toEqual(['default', 'dark', 'fresh', 'sunset']);
    expect(THEMES.every(t => t.name && t.id)).toBe(true);
    expect(isValidTheme(DEFAULT_THEME_ID)).toBe(true);
  });

  test('isValidTheme 判定合法/非法主题', () => {
    expect(isValidTheme('dark')).toBe(true);
    expect(isValidTheme('fresh')).toBe(true);
    expect(isValidTheme('sunset')).toBe(true);
    expect(isValidTheme('unknown')).toBe(false);
  });

  test('applyTheme 设置 data-theme，非法 id 回退默认并移除属性', () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getAppliedTheme()).toBe('dark');

    expect(applyTheme('nope')).toBe(DEFAULT_THEME_ID);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(getAppliedTheme()).toBe(DEFAULT_THEME_ID);
  });

  test('默认主题移除 data-theme（即回退到 :root 变量）', () => {
    applyTheme('default');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
