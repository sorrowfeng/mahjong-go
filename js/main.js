import { SoundController } from './soundController.js';
import { BgmController } from './bgmController.js';
import { showTutorial, hideTutorial } from './tutorial.js';
import { initDragController } from './dragController.js';
import { handleDragEnd, handleTileClick, handleHint, handleUndo, handleNewGame, doReshuffle, hideReshuffleConfirm, initNewGame, startTeachingLevel, exitTeachingLevel, showRotateHint, refreshTeachingHighlights, getState, getPhase, isTeachingModeActive, loadSaveSnapshot, restoreFromSnapshot, showResumeConfirm, hideResumeConfirm, persistSave, useItem, getItems, getModeInfo, getMoveRemaining, cancelHammer, finishTimedOut, getLevelInfo } from './gameController.js';
import { startTimerFromElapsed, startCountdown } from './timer.js';
import { BOARD_COLS, BOARD_ROWS, recalcLayout, recalcTileSizeOnly, setBoardLayout } from './constants.js';
import { renderBoard } from './renderer.js';
import { loadSettings, saveSettings, resetSettings, applySettings } from './settings.js';
import { showStatsPanel, hideStatsPanel } from './stats.js';
import { THEMES } from './themes.js';
import { MODES, MODE_IDS, getMode, hasTimeBudget } from './modes.js';
import { ITEM_META, getCount } from './items.js';
import { getBestScore } from './score.js';
import { LEVELS, LEVEL_COUNT, loadProgress, isUnlocked } from './levels.js';
import { ACHIEVEMENTS, loadAchievements, unlockCount } from './achievements.js';
import { buildShareText, shareText, drawScoreCard, downloadCard } from './share.js';
import { registerServiceWorker } from './sw-register.js';
import { createKeyboardController } from './keyboardNav.js';
import { getTileElement } from './renderer.js';
import { announce } from './announcer.js';

// main.js — 入口、初始化、按钮绑定

document.addEventListener('DOMContentLoaded', () => {
  const boardEl = document.getElementById('board');

  // 初始化拖拽控制器（依赖注入：状态与阶段访问器 + 回调）
  initDragController(boardEl, {
    getState,
    getPhase,
    onDragEnd: handleDragEnd,
    onTileClick: handleTileClick,
  });

  // 游戏内按钮绑定
  document.getElementById('btn-hint').addEventListener('click', handleHint);

  document.getElementById('btn-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-new').addEventListener('click', handleNewGame);
  document.getElementById('btn-new-victory').addEventListener('click', handleNewGame);
  document.getElementById('btn-reshuffle-ok').addEventListener('click', doReshuffle);
  document.getElementById('btn-reshuffle-cancel').addEventListener('click', hideReshuffleConfirm);
  document.getElementById('btn-teaching-exit').addEventListener('click', exitTeachingLevel);

  // ── 模式选择面板 ─────────────────────────────────────────────────────
  const modeBtn = document.getElementById('btn-mode');
  const modePanel = document.getElementById('mode-panel');
  const modeList = document.getElementById('mode-list');

  function renderModeList() {
    if (!modeList) return;
    modeList.textContent = '';
    for (const id of MODE_IDS) {
      const m = MODES[id];
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mode-item btn btn--secondary';
      item.dataset.mode = id;
      const best = getBestScore(id);
      item.innerHTML = `<span class="mode-item__name">${m.name}</span>` +
        `<span class="mode-item__desc">${modeDesc(m)}</span>` +
        (best ? `<span class="mode-item__best">最佳 ${best.total} 分</span>` : '');
      item.addEventListener('click', () => {
        modePanel.classList.add('hidden');
        startMode(id);
      });
      modeList.appendChild(item);
    }
  }
  function modeDesc(m) {
    const parts = [];
    if (hasTimeBudget(m)) parts.push(`${m.timeBudget} 秒`);
    if (m.moveBudget) parts.push(`限 ${m.moveBudget} 步`);
    if (m.seedType === 'daily') parts.push('每日同题');
    if (m.scoring) parts.push('计分');
    return parts.join(' · ') || '自由消除';
  }
  function startMode(id) {
    cancelHammer();
    // 用新模式开一局
    initNewGame({ mode: id });
    refreshItemBar();
  }
  modeBtn.addEventListener('click', () => {
    renderModeList();
    modePanel.classList.remove('hidden');
  });
  document.getElementById('btn-mode-close').addEventListener('click', () => {
    modePanel.classList.add('hidden');
  });

  // ── 关卡选择面板 ─────────────────────────────────────────────────────
  const levelBtn = document.getElementById('btn-level');
  const levelPanel = document.getElementById('level-panel');
  const levelList = document.getElementById('level-list');

  function renderLevelList() {
    if (!levelList) return;
    const progress = loadProgress();
    levelList.textContent = '';
    for (const lv of LEVELS) {
      const unlocked = isUnlocked(progress, lv.id);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'level-item btn ' + (unlocked ? 'btn--secondary' : 'btn--locked');
      item.dataset.level = lv.id;
      item.disabled = !unlocked;
      const stars = progress.stars[lv.id] || 0;
      item.innerHTML = `<span class="level-item__no">${lv.id}</span>` +
        `<span class="level-item__name">${lv.name}</span>` +
        `<span class="level-item__stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` +
        `<span class="level-item__size">${lv.rows}×${lv.cols} · ${lv.moveBudget != null ? lv.moveBudget + ' 步' : '不限步'}</span>`;
      item.addEventListener('click', () => {
        levelPanel.classList.add('hidden');
        cancelHammer();
        initNewGame({ level: lv.id });
        refreshItemBar();
      });
      levelList.appendChild(item);
    }
  }

  levelBtn.addEventListener('click', () => {
    renderLevelList();
    levelPanel.classList.remove('hidden');
  });
  document.getElementById('btn-level-close').addEventListener('click', () => {
    levelPanel.classList.add('hidden');
  });

  // ── 成就面板 ─────────────────────────────────────────────────────────
  const achievementBtn = document.getElementById('btn-achievement');
  const achievementPanel = document.getElementById('achievement-panel');
  const achievementGrid = document.getElementById('achievement-grid');

  function renderAchievementPanel() {
    if (!achievementGrid) return;
    const acc = loadAchievements();
    achievementGrid.textContent = '';
    for (const a of ACHIEVEMENTS) {
      const unlocked = !!acc.unlocked[a.id];
      const item = document.createElement('div');
      item.className = 'achievement-grid__item' + (unlocked ? '' : ' achievement-grid__item--locked');
      item.innerHTML = `<span class="achievement-grid__icon">${unlocked ? a.icon : '🔒'}</span>` +
        `<span class="achievement-grid__name">${a.name}</span>` +
        `<span class="achievement-grid__desc">${a.desc}</span>`;
      achievementGrid.appendChild(item);
    }
    const title = achievementPanel.querySelector('.panel-title');
    if (title) title.textContent = `成就（${unlockCount(acc)}/${ACHIEVEMENTS.length}）`;
  }

  achievementBtn.addEventListener('click', () => {
    renderAchievementPanel();
    achievementPanel.classList.remove('hidden');
  });
  document.getElementById('btn-achievement-close').addEventListener('click', () => {
    achievementPanel.classList.add('hidden');
  });

  // ── 分享成绩 ─────────────────────────────────────────────────────────
  function showToast(msg) {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }
  function buildShareInfo() {
    const modeInfo = getModeInfo();
    const scoreInfo = getScoreInfo();
    const levelInfo = getLevelInfo();
    return {
      modeName: modeInfo.mode ? modeInfo.mode.name : '经典模式',
      levelId: levelInfo.level ? levelInfo.level.id : null,
      elapsed: formatElapsed(),
      moves: getMoveRemaining() != null
        ? (modeInfo.mode ? modeInfo.mode.moveBudget - getMoveRemaining() : 0)
        : 0,
      hints: 0,
      score: scoreInfo.total > 0 ? scoreInfo.total : null,
      stars: 0,
    };
  }
  function formatElapsed() {
    const t = document.getElementById('game-timer');
    return t ? t.textContent : '00:00';
  }

  const shareBtn = document.getElementById('btn-share');
  const shareImgBtn = document.getElementById('btn-share-img');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const info = buildShareInfo();
      const text = buildShareText(info);
      const res = await shareText(text);
      if (res.method === 'clipboard') showToast('成绩已复制到剪贴板');
      else if (res.method === 'unsupported') showToast('当前环境不支持分享');
    });
  }
  if (shareImgBtn) {
    shareImgBtn.addEventListener('click', () => {
      const info = buildShareInfo();
      const scoreEl = document.getElementById('victory-score-display');
      // 从结算界面读取得分与星级
      const match = scoreEl ? (scoreEl.textContent.match(/(\d+)/) || []) : [];
      const starsEl = document.getElementById('victory-stars-display');
      const starText = starsEl ? starsEl.textContent : '';
      info.score = match.length ? Number(match[0]) : (info.score || 0);
      info.stars = (starText.match(/★/g) || []).length;
      const canvas = drawScoreCard(info);
      if (downloadCard(canvas)) showToast('成绩卡片已保存');
      else showToast('保存失败');
    });
  }

  // ── 道具栏 ───────────────────────────────────────────────────────────
  const itemBar = document.getElementById('item-bar');
  function refreshItemBar() {
    if (!itemBar) return;
    const items = getItems();
    itemBar.textContent = '';
    for (const id of Object.keys(ITEM_META)) {
      const meta = ITEM_META[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item-btn btn btn--secondary';
      btn.dataset.item = id;
      btn.title = meta.name;
      btn.innerHTML = `<span class="item-btn__icon">${meta.icon}</span><span class="item-btn__count">${getCount(items, id)}</span>`;
      btn.addEventListener('click', () => {
        useItem(id);
        refreshItemBar();
      });
      itemBar.appendChild(btn);
    }
  }

  // 统计面板：打开前重渲染（保证拿到最新数据）
  document.getElementById('btn-stats').addEventListener('click', showStatsPanel);
  document.getElementById('btn-stats-close').addEventListener('click', hideStatsPanel);

  // 设置面板：打开/关闭 + 各控件绑定（一次性初始化）
  const settingsEl = document.getElementById('settings-panel');
  const themeSel = document.getElementById('set-theme');
  const soundVol = document.getElementById('set-sound-volume');
  const bgmVol = document.getElementById('set-bgm-volume');
  const animSel = document.getElementById('set-anim-speed');
  const colorBlindChk = document.getElementById('set-colorblind');
  const leftHandedChk = document.getElementById('set-left-handed');

  // 填充主题下拉选项
  for (const t of THEMES) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    themeSel.appendChild(opt);
  }

  // 把当前设置同步到控件（不触发 applySettings 副作用，避免启动重复应用）
  function syncSettingsControls() {
    const s = loadSettings();
    themeSel.value = s.theme;
    soundVol.value = Math.round(s.soundVolume * 100);
    bgmVol.value = Math.round(s.bgmVolume * 100);
    animSel.value = String(s.animSpeed);
    colorBlindChk.checked = s.colorBlind;
    leftHandedChk.checked = s.leftHanded;
  }
  syncSettingsControls();

  document.getElementById('btn-settings').addEventListener('click', () => {
    syncSettingsControls();
    settingsEl.classList.remove('hidden');
  });
  document.getElementById('btn-settings-close').addEventListener('click', () => {
    settingsEl.classList.add('hidden');
  });
  document.getElementById('btn-settings-reset').addEventListener('click', () => {
    const defaults = resetSettings();
    applySettings(defaults);
    syncSettingsControls();
  });

  // 各控件的值变更 → 保存并应用
  themeSel.addEventListener('change', () => {
    applySettings(saveSettings({ ...loadSettings(), theme: themeSel.value }));
  });
  soundVol.addEventListener('input', () => {
    applySettings(saveSettings({ ...loadSettings(), soundVolume: Number(soundVol.value) / 100 }));
  });
  bgmVol.addEventListener('input', () => {
    applySettings(saveSettings({ ...loadSettings(), bgmVolume: Number(bgmVol.value) / 100 }));
  });
  animSel.addEventListener('change', () => {
    applySettings(saveSettings({ ...loadSettings(), animSpeed: Number(animSel.value) }));
  });
  colorBlindChk.addEventListener('change', () => {
    applySettings(saveSettings({ ...loadSettings(), colorBlind: colorBlindChk.checked }));
  });
  leftHandedChk.addEventListener('change', () => {
    applySettings(saveSettings({ ...loadSettings(), leftHanded: leftHandedChk.checked }));
  });

  // 规则按钮
  document.getElementById('btn-rules').addEventListener('click', () => {
    showTutorial(false);
  });

  // 音效 + BGM 开关（单一按钮同时控制两者）
  const btnSound = document.getElementById('btn-sound');
  btnSound.addEventListener('click', () => {
    const on = !SoundController.isEnabled();
    SoundController.setEnabled(on);
    try {
      localStorage.setItem('mahjong-sound', on ? 'true' : 'false');
    } catch (e) { /* 隐私模式或存储不可用 */ }
    if (on) {
      BgmController.play();
    } else {
      BgmController.stop();
    }
    btnSound.textContent = on ? '音效' : '静音';
    btnSound.classList.toggle('btn--muted', !on);
  });

  // 教学界面按钮：首次进入时开始游戏，游戏中查看时直接关闭
  document.getElementById('btn-tutorial-start').addEventListener('click', async () => {
    const isFirst = document.getElementById('btn-tutorial-start').dataset.first === '1';
    hideTutorial();
    if (isFirst) {
      await initNewGame();
      if (SoundController.isEnabled()) {
        BgmController.play();
      }
    }
  });
  document.getElementById('btn-tutorial-teaching').addEventListener('click', () => {
    hideTutorial();
    startTeachingLevel();
  });

  // "继续上一局"弹窗按钮
  let pendingSnapshot = null;
  document.getElementById('btn-resume-continue').addEventListener('click', () => {
    if (!pendingSnapshot) return;
    hideResumeConfirm();
    restoreFromSnapshot(pendingSnapshot);
    // 恢复计时：限时模式用倒计时（剩余 = 预算 - 已用），其余用正计时
    const mode = getMode(pendingSnapshot.modeId);
    const elapsed = pendingSnapshot.elapsed || 0;
    if (hasTimeBudget(mode)) {
      startCountdown(Math.max(0, mode.timeBudget - elapsed), () => {
        finishTimedOut(); // 结算已恢复的局面（未通关）
      });
    } else {
      startTimerFromElapsed(elapsed);
    }
    persistSave(); // 刷新存档时间戳
    refreshItemBar();
    pendingSnapshot = null;
    if (SoundController.isEnabled()) BgmController.play();
  });
  document.getElementById('btn-resume-new').addEventListener('click', () => {
    pendingSnapshot = null;
    handleNewGame(); // initNewGame 内部会清档
    if (SoundController.isEnabled()) BgmController.play();
  });

  // 页面加载：有未完成的存档则先询问"继续上局"，否则展示规则动画
  const savedSnapshot = loadSaveSnapshot();
  if (savedSnapshot && showResumeConfirm(savedSnapshot)) {
    pendingSnapshot = savedSnapshot;
  } else {
    showTutorial(true);
  }

  // 应用已保存的用户设置（主题/音量/动画速度/色弱/左手）
  applySettings(loadSettings());

  // 初始化键盘控制器：对局中启用（方向键+回车可玩），非对局禁用
  syncKeyboardUI();
  // 轮询同步键盘态（对局开始/结束/胜利等 phase 变化由 gameController 驱动，
  // 这里低频兜底，保证键盘控制器跟随状态开关）
  setInterval(syncKeyboardUI, 800);

  // 初始化道具栏（显示库存）
  refreshItemBar();

  // 注册 Service Worker（离线可玩 + 新版本提示；file:// 下自动跳过）
  registerServiceWorker();

  // 窗口尺寸变化时：只重算牌尺寸；若行列数也变了，显示"请开始新游戏"提示
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const state = getState();
      if (!state || getPhase() !== 'IDLE') return;
      const levelInfo = getLevelInfo();
      if (isTeachingModeActive() || levelInfo.isLevelMode) {
        const w = levelInfo.level ? levelInfo.level.cols : state.width;
        const h = levelInfo.level ? levelInfo.level.rows : state.height;
        setBoardLayout(w, h);
        recalcTileSizeOnly(w, h);
        renderBoard(state, document.getElementById('board'));
        if (isTeachingModeActive()) refreshTeachingHighlights();
        return;
      }
      const prevCols = BOARD_COLS;
      const prevRows = BOARD_ROWS;
      recalcLayout();
      if (BOARD_COLS !== prevCols || BOARD_ROWS !== prevRows) {
        showRotateHint();
        setBoardLayout(prevCols, prevRows);
        recalcTileSizeOnly(prevCols, prevRows);
      }
      renderBoard(state, document.getElementById('board'));
    }, 200);
  });

  // 无障碍播报：写入 sr-live 区域（读屏可感知，可视用户不可见）
  // 复用 js/announcer.js 的 announce，键盘控制器 DI 也用它

  // 键盘控制器（可访问性：方向键 + 回车完全可玩）
  const kbHelp = document.getElementById('kb-help');
  const kbController = createKeyboardController({
    getState,
    getPhase,
    getTileElement,
    handleTileClick,
    handleDragEnd,
    announce,
  });

  function syncKeyboardUI() {
    const state = getState();
    const phase = getPhase();
    const inGame = !!state && phase === 'IDLE' && !isTeachingModeActive();
    if (inGame) {
      kbController.enable();
      if (kbHelp) kbHelp.classList.remove('hidden');
    } else {
      kbController.disable();
      if (kbHelp) kbHelp.classList.add('hidden');
    }
  }

  // 键盘快捷键支持
  //
  // 覆盖层（规则弹窗 / 重排确认 / 胜利界面）是全屏遮罩，按钮被盖住点不到，
  // 但 btn.click() 是程序化调用、不受遮挡影响，照样会触发。
  // 若不拦截，在"重排确认"上按 N 会开新局却不关闭遮罩 → 界面被锁死。
  const DECISION_OVERLAYS = ['tutorial-overlay', 'reshuffle-confirm', 'resume-confirm', 'stats-panel', 'settings-panel', 'mode-panel', 'level-panel', 'achievement-panel']; // 需要用户先做决定

  const isOpen = (ids) => ids.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isOpen(DECISION_OVERLAYS)) return; // 决策弹窗打开时屏蔽全部快捷键

    const onVictory = isOpen(['victory-screen']);

    // 方向键 / 回车 / 空格 / Esc：交给键盘控制器（棋盘可玩）
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'].includes(e.key)) {
      const handled = kbController.handleKey(e);
      if (handled !== false) return;
    }

    if (e.key === 'h' || e.key === 'H') {
      if (!onVictory) handleHint();
      return;
    }
    if (e.key === 'n' || e.key === 'N') {
      // handleNewGame 内部会关掉胜利界面与所有覆盖层
      document.getElementById('btn-new').click();
      return;
    }
    if (e.key === 'u' || e.key === 'U') {
      if (!onVictory) document.getElementById('btn-undo').click();
    }
  });

  // 全局按钮点击音效（事件委托，排除音效开关按钮自身）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && btn.id !== 'btn-sound') {
      SoundController.playButtonClick();
    }
  });

  // 音效开关记忆
  try {
    const soundEnabled = localStorage.getItem('mahjong-sound') !== 'false';
    SoundController.setEnabled(soundEnabled);
    btnSound.textContent = soundEnabled ? '音效' : '静音';
    btnSound.classList.toggle('btn--muted', !soundEnabled);
  } catch (e) { /* 隐私模式或存储不可用 */ }
});
