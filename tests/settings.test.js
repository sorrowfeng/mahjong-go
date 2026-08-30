// settings.test.js — 设置模块：normalize/load/save/apply 纯逻辑
// applySettings 涉及 soundController/bgmController 的 AudioContext，
// 这里 mock 掉音频控制器，只验证状态机与 DOM 副作用。

jest.mock('../js/soundController.js', () => ({
  SoundController: {
    setVolume: jest.fn(),
  },
}));

jest.mock('../js/bgmController.js', () => ({
  BgmController: {
    setVolume: jest.fn(),
  },
}));

const {
  SETTINGS_KEY, DEFAULTS, ANIM_SPEEDS,
  normalizeSettings, loadSettings, saveSettings, resetSettings, applySettings,
} = require('../js/settings.js');
const { SoundController } = require('../js/soundController.js');
const { BgmController } = require('../js/bgmController.js');

function setStored(raw) {
  localStorage.setItem(SETTINGS_KEY, raw);
}

describe('settings.normalizeSettings', () => {
  test('非法输入回退全部默认值', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULTS);
    expect(normalizeSettings('garbage')).toEqual(DEFAULTS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULTS);
  });

  test('仅接受合法主题/音量/速度/布尔值，其余回退默认', () => {
    const s = normalizeSettings({
      theme: 'dark',
      soundVolume: 0.8,
      bgmVolume: 0.2,
      animSpeed: 2,
      colorBlind: true,
      leftHanded: true,
    });
    expect(s).toMatchObject({
      theme: 'dark', soundVolume: 0.8, bgmVolume: 0.2,
      animSpeed: 2, colorBlind: true, leftHanded: true,
    });

    // 非法值回退
    const bad = normalizeSettings({
      theme: 'nonexistent', soundVolume: 7, bgmVolume: -3,
      animSpeed: 3, colorBlind: 'yes', leftHanded: 1,
    });
    expect(bad).toMatchObject({
      theme: DEFAULTS.theme, soundVolume: 1, bgmVolume: 0,
      animSpeed: DEFAULTS.animSpeed, colorBlind: false, leftHanded: false,
    });
  });

  test('音量钳制到 [0,1]，动画速度限白名单', () => {
    expect(normalizeSettings({ soundVolume: 1.5 }).soundVolume).toBe(1);
    expect(normalizeSettings({ soundVolume: -1 }).soundVolume).toBe(0);
    expect(ANIM_SPEEDS).toEqual([0.5, 1, 2]);
  });
});

describe('settings.load/save/reset', () => {
  beforeEach(() => localStorage.clear());

  test('无存档返回默认', () => {
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  test('损坏存档返回默认', () => {
    setStored('{{{ not json');
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  test('save 规范化后持久化并回读', () => {
    const saved = saveSettings({ theme: 'fresh', soundVolume: 0.9, animSpeed: 0.5, leftHanded: true });
    expect(saved.theme).toBe('fresh');
    expect(loadSettings()).toMatchObject({ theme: 'fresh', animSpeed: 0.5, leftHanded: true });
  });

  test('reset 清空存档并返回默认', () => {
    saveSettings({ theme: 'dark' });
    expect(resetSettings()).toEqual(DEFAULTS);
    expect(loadSettings()).toEqual(DEFAULTS);
  });
});

describe('settings.applySettings', () => {
  let body;
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    body = document.body;
    body.classList.remove('colorblind', 'left-handed');
    jest.clearAllMocks();
  });

  test('应用主题属性到 <html>，非法主题回退默认', () => {
    applySettings({ theme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applySettings({ theme: 'bad-theme' });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  test('同步音量到音频控制器', () => {
    applySettings({ soundVolume: 0.66, bgmVolume: 0.33 });
    expect(SoundController.setVolume).toHaveBeenCalledWith(0.66);
    expect(BgmController.setVolume).toHaveBeenCalledWith(0.33);
  });

  test('切换色弱/左手 body 辅助类', () => {
    applySettings({ colorBlind: true, leftHanded: true });
    expect(body.classList.contains('colorblind')).toBe(true);
    expect(body.classList.contains('left-handed')).toBe(true);
    applySettings({ colorBlind: false, leftHanded: false });
    expect(body.classList.contains('colorblind')).toBe(false);
    expect(body.classList.contains('left-handed')).toBe(false);
  });
});
