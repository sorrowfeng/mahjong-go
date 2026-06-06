import { SoundController } from './soundController.js';
import { BgmController } from './bgmController.js';
import { showTutorial, hideTutorial } from './tutorial.js?v=20260607-2';
import { initDragController } from './dragController.js?v=20260607-2';
import { handleDragEnd, handleTileClick, handleHint, handleUndo, handleNewGame, doReshuffle, hideReshuffleConfirm, initNewGame, startTeachingLevel, exitTeachingLevel, showRotateHint, refreshTeachingHighlights } from './gameController.js?v=20260607-2';
import { BOARD_COLS, BOARD_ROWS, recalcLayout, recalcTileSizeOnly, setBoardLayout } from './constants.js';
import { renderBoard } from './renderer.js';

// main.js — 入口、初始化、按钮绑定

document.addEventListener('DOMContentLoaded', () => {
  const boardEl = document.getElementById('board');

  // 初始化拖拽控制器
  initDragController(boardEl, handleDragEnd, handleTileClick);

  // 游戏内按钮绑定
  const btnHint = document.getElementById('btn-hint');
  const hintMenu = document.getElementById('hint-menu');
  const setHintMenuOpen = (open) => {
    hintMenu.classList.toggle('hidden', !open);
    btnHint.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  btnHint.addEventListener('click', () => {
    setHintMenuOpen(hintMenu.classList.contains('hidden'));
  });
  document.getElementById('btn-show-hint').addEventListener('click', () => {
    setHintMenuOpen(false);
    handleHint();
  });
  document.getElementById('btn-teaching').addEventListener('click', () => {
    setHintMenuOpen(false);
    startTeachingLevel();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hint-menu-wrap')) setHintMenuOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setHintMenuOpen(false);
  });

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

  // 首次进入页面：展示规则动画，BGM 在用户点击"开始"后启动
  showTutorial(true);

  // 窗口尺寸变化时：只重算牌尺寸；若行列数也变了，显示"请开始新游戏"提示
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!window._gameState || window._gamePhase !== 'IDLE') return;
      if (window._isTeachingMode) {
        setBoardLayout(window._gameState.width, window._gameState.height);
        recalcTileSizeOnly(window._gameState.width, window._gameState.height);
        renderBoard(window._gameState, document.getElementById('board'));
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
      renderBoard(window._gameState, document.getElementById('board'));
    }, 200);
  });

  // 键盘快捷键支持
  document.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
      setHintMenuOpen(false);
      handleHint();
    }
    if (e.key === 'n' || e.key === 'N') document.getElementById('btn-new').click();
    if (e.key === 'u' || e.key === 'U') document.getElementById('btn-undo').click();
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
