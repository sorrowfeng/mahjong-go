// main.js — 入口、初始化、按钮绑定

document.addEventListener('DOMContentLoaded', () => {
  const boardEl = document.getElementById('board');

  // 初始化拖拽控制器
  initDragController(boardEl, handleDragEnd, handleTileClick);

  // 游戏内按钮绑定
  document.getElementById('btn-hint').addEventListener('click', handleHint);
  document.getElementById('btn-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-new').addEventListener('click', handleNewGame);
  document.getElementById('btn-new-victory').addEventListener('click', handleNewGame);
  document.getElementById('btn-reshuffle-ok').addEventListener('click', doReshuffle);
  document.getElementById('btn-reshuffle-cancel').addEventListener('click', hideReshuffleConfirm);

  // 规则按钮
  document.getElementById('btn-rules').addEventListener('click', () => {
    showTutorial(false);
  });

  // 音效 + BGM 开关（单一按钮同时控制两者）
  const btnSound = document.getElementById('btn-sound');
  btnSound.addEventListener('click', () => {
    const on = !SoundController.isEnabled();
    SoundController.setEnabled(on);
    if (on) {
      BgmController.play();
    } else {
      BgmController.stop();
    }
    btnSound.textContent = on ? '🔊' : '🔇';
    btnSound.classList.toggle('btn--muted', !on);
  });

  // 教学界面按钮：首次进入时开始游戏，游戏中查看时直接关闭
  document.getElementById('btn-tutorial-start').addEventListener('click', () => {
    const isFirst = document.getElementById('btn-tutorial-start').dataset.first === '1';
    hideTutorial();
    if (isFirst) {
      // 首次点击：启动 BGM（浏览器要求用户交互后才能播放音频）
      BgmController.play();
      initNewGame();
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
      const prevCols = BOARD_COLS;
      const prevRows = BOARD_ROWS;
      recalcLayout();
      if (BOARD_COLS !== prevCols || BOARD_ROWS !== prevRows) {
        // 行列数变了（如旋转屏幕）：不强制开新局，提示用户手动开始
        showRotateHint();
        // 强制回退到原行列数，以当前可用空间重算牌尺寸，保持局面可继续
        BOARD_COLS = prevCols;
        BOARD_ROWS = prevRows;
        recalcTileSizeOnly(prevCols, prevRows);
      }
      // 无论行列数是否变化，都用当前（已回退的）行列数重渲染
      renderBoard(window._gameState, document.getElementById('board'));
    }, 200);
  });

  // 全局按钮点击音效（事件委托，排除音效开关按钮自身）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && btn.id !== 'btn-sound') {
      SoundController.playButtonClick();
    }
  });
});

// 功能增强3: 游戏统计功能
let gameStats = { moves: 0, hints: 0, time: 0, eliminations: 0 };

function updateGameStats() {
  document.getElementById('move-count').textContent = gameStats.moves;
  document.getElementById('hint-count').textContent = gameStats.hints;
}

// 功能增强4: 键盘快捷键支持
document.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') document.getElementById('btn-hint').click();
  if (e.key === 'n' || e.key === 'N') document.getElementById('btn-new').click();
  if (e.key === 'u' || e.key === 'U') document.getElementById('btn-undo').click();
});

// 功能增强5: 音效开关记忆
const soundEnabled = localStorage.getItem('mahjong-sound') !== 'false';
SoundController.setEnabled(soundEnabled);
document.getElementById('btn-sound').textContent = soundEnabled ? '🔊' : '🔇';
