// themes.js — 主题定义与切换
// 主题 = <html data-theme="id"> + main.css 中对应变量覆盖块。新增主题只需：
// 1) 在 THEMES 里加一项；2) 在 main.css 加 html[data-theme='id'] 变量覆盖。

const THEMES = [
  { id: 'default', name: '木韵' },
  { id: 'dark', name: '暗夜' },
  { id: 'fresh', name: '清新' },
];

const DEFAULT_THEME_ID = 'default';

function isValidTheme(id) {
  return THEMES.some(t => t.id === id);
}

// 应用主题到 <html data-theme>；非法 id 回退默认。
// 返回实际生效的主题 id，便于调用方持久化。
function applyTheme(id) {
  const themeId = isValidTheme(id) ? id : DEFAULT_THEME_ID;
  const root = document.documentElement;
  if (themeId === DEFAULT_THEME_ID) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', themeId);
  }
  return themeId;
}

function getAppliedTheme() {
  return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME_ID;
}

export { THEMES, DEFAULT_THEME_ID, isValidTheme, applyTheme, getAppliedTheme };
