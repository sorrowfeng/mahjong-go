// settings.js — 用户设置（主题/音量/动画速度/色弱/左手）
// 存储键 mahjong-settings-v1。所有副作用集中在 applySettings，
// normalize/load/save 保持可独立测试。

import { SoundController } from './soundController.js';
import { BgmController } from './bgmController.js';
import { applyTheme, isValidTheme, DEFAULT_THEME_ID } from './themes.js';
import { setAnimSpeed, ANIM_SPEED_PRESETS } from './constants.js';

const SETTINGS_KEY = 'mahjong-settings-v1';

const DEFAULTS = Object.freeze({
  theme: DEFAULT_THEME_ID,
  soundVolume: 0.42,   // 与 soundController 初始音量一致
  bgmVolume: 0.18,     // 与 bgmController 初始音量一致
  animSpeed: 1,        // 0.5 慢 / 1 正常 / 2 快
  colorBlind: false,   // 色弱辅助：降低牌面饱和度、强化文字
  leftHanded: false,   // 左手模式：工具栏移至底部/右侧
});

const ANIM_SPEEDS = [0.5, 1, 2];

function _clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

// 修补并校验：只接受合法字段，非法值回退默认
function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULTS };

  if (isValidTheme(src.theme)) out.theme = src.theme;

  const sv = _clamp01(src.soundVolume);
  if (sv !== null) out.soundVolume = sv;
  const bv = _clamp01(src.bgmVolume);
  if (bv !== null) out.bgmVolume = bv;

  const speed = Number(src.animSpeed);
  if (ANIM_SPEEDS.includes(speed)) out.animSpeed = speed;

  if (typeof src.colorBlind === 'boolean') out.colorBlind = src.colorBlind;
  if (typeof src.leftHanded === 'boolean') out.leftHanded = src.leftHanded;

  return out;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return normalizeSettings(JSON.parse(raw));
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch (e) { /* 隐私模式或存储不可用 */ }
  return loadSettings();
}

function resetSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) { /* ignore */ }
  return { ...DEFAULTS };
}

// 应用全部副作用：主题、音频音量、动画速度、body 辅助类
function applySettings(settings) {
  const s = normalizeSettings(settings);

  applyTheme(s.theme);
  SoundController.setVolume(s.soundVolume);
  BgmController.setVolume(s.bgmVolume);
  setAnimSpeed(s.animSpeed);

  document.body.classList.toggle('colorblind', s.colorBlind);
  document.body.classList.toggle('left-handed', s.leftHanded);

  return s;
}

export { SETTINGS_KEY, DEFAULTS, ANIM_SPEEDS, normalizeSettings, loadSettings, saveSettings, resetSettings, applySettings };
