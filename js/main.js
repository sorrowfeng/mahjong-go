import { SoundController } from './soundController.js';
import { BgmController } from './bgmController.js';
import { showTutorial, hideTutorial } from './tutorial.js';
import { initDragController } from './dragController.js';
import { handleDragEnd, handleTileClick, handleHint, handleUndo, handleNewGame, doReshuffle, hideReshuffleConfirm, initNewGame, startTeachingLevel, exitTeachingLevel, showRotateHint, refreshTeachingHighlights, getState, getPhase, isTeachingModeActive, loadSaveSnapshot, restoreFromSnapshot, showResumeConfirm, hideResumeConfirm, persistSave } from './gameController.js';
import { startTimerFromElapsed } from './timer.js';
import { BOARD_COLS, BOARD_ROWS, recalcLayout, recalcTileSizeOnly, setBoardLayout } from './constants.js';
import { renderBoard } from './renderer.js';

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
    startTimerFromElapsed(pendingSnapshot.elapsed || 0);
    persistSave(); // 刷新存档时间戳
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

  // 窗口尺寸变化时：只重算牌尺寸；若行列数也变了，显示"请开始新游戏"提示
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const state = getState();
      if (!state || getPhase() !== 'IDLE') return;
      if (isTeachingModeActive()) {
        setBoardLayout(state.width, state.height);
        recalcTileSizeOnly(state.width, state.height);
        renderBoard(state, document.getElementById('board'));
        refreshTeachingHighlights();
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

  // 键盘快捷键支持
  //
  // 覆盖层（规则弹窗 / 重排确认 / 胜利界面）是全屏遮罩，按钮被盖住点不到，
  // 但 btn.click() 是程序化调用、不受遮挡影响，照样会触发。
  // 若不拦截，在"重排确认"上按 N 会开新局却不关闭遮罩 → 界面被锁死。
  const DECISION_OVERLAYS = ['tutorial-overlay', 'reshuffle-confirm', 'resume-confirm']; // 需要用户先做决定

  const isOpen = (ids) => ids.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isOpen(DECISION_OVERLAYS)) return; // 决策弹窗打开时屏蔽全部快捷键

    const onVictory = isOpen(['victory-screen']);

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
