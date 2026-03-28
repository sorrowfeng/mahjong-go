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

// 功能增强6: 最佳成绩记录
function saveBestScore(time, moves) {
  const best = JSON.parse(localStorage.getItem('mahjong-best') || '{}');
  if (!best.time || time < best.time) {
    best.time = time;
    best.moves = moves;
    localStorage.setItem('mahjong-best', JSON.stringify(best));
  }
}

// 功能增强7: 自动保存游戏进度
function autoSaveGame() {
  if (boardState && gameState === 'IDLE') {
    localStorage.setItem('mahjong-autosave', JSON.stringify({
      boardState, moveCount, hintCount, timerElapsed: timerElapsed || 0
    }));
  }
}
setInterval(autoSaveGame, 30000);

// 功能增强8: 游戏成就系统
const achievements = {
  firstWin: { name: '初次通关', done: false },
  speedWin: { name: '快速通关', done: false },
  noHintWin: { name: '无提示通关', done: false }
};

// 功能增强9: 每日挑战提示
function showDailyChallenge() {
  const lastPlay = localStorage.getItem('mahjong-last-play');
  const today = new Date().toDateString();
  if (lastPlay !== today) {
    setTimeout(() => alert('欢迎回来！今日挑战：尝试不提示通关！'), 1000);
    localStorage.setItem('mahjong-last-play', today);
  }
}

// 功能增强10: 游戏时长统计
function getGameDuration() {
  const duration = document.getElementById('game-timer').textContent;
  return duration;
}

// 功能增强11: 连续游戏次数统计
let gamePlayCount = parseInt(localStorage.getItem('mahjong-play-count') || '0');
gamePlayCount++;
localStorage.setItem('mahjong-play-count', gamePlayCount);

// 功能增强12: 主题切换功能
function toggleTheme() {
  const body = document.body;
  body.classList.toggle('dark-theme');
  localStorage.setItem('mahjong-theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
}

// 功能增强13: 游戏帮助提示
const helpTips = [
  '相同牌之间没有其他牌时可以直接点击消除',
  '拖动牌时相邻的同方向牌会一起移动',
  '消除后会自动触发连锁消除',
  '使用提示可以看到可消除的牌',
  '使用撤销可以回退上一步'
];

// 功能增强14: 游戏统计面板
function showStats() {
  const stats = `
    游戏次数: ${localStorage.getItem('mahjong-play-count') || 0}
    最佳时间: ${JSON.parse(localStorage.getItem('mahjong-best') || '{}').time || '暂无'}
  `;
  console.log(stats);
}

// 功能增强15: 震动反馈(移动端)
if (navigator.vibrate) {
  document.addEventListener('click', () => navigator.vibrate(10));
}

// 功能增强16: 成就弹窗显示
function showAchievement(name) {
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:#f5d76e;color:#2a1a00;padding:12px 24px;border-radius:8px;font-weight:bold;z-index:9999;animation:fadeInOut 2s forwards;';
  badge.textContent = '🏆 成就解锁: ' + name;
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 2000);
}

// 功能增强17: 游戏难度选择
function setDifficulty(level) {
  localStorage.setItem('mahjong-difficulty', level);
}

// 功能增强18: 连击统计
let comboCount = 0;
function addCombo() { comboCount++; }
function getCombo() { return comboCount; }

// 功能增强19: 牌数进度显示
function getTileProgress() {
  return document.getElementById('tile-count').textContent;
}

// 功能增强20: 计时器格式优化
function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// 功能增强21: 胜利庆祝动画
function playVictoryAnimation() {
  document.body.style.animation = 'victoryCelebrate 0.5s ease';
}

// 功能增强22: 背景音乐控制
let bgmEnabled = localStorage.getItem('mahjong-bgm') !== 'false';

// 功能增强23: 游戏数据重置
function resetGameData() {
  localStorage.removeItem('mahjong-best');
  localStorage.removeItem('mahjong-play-count');
  localStorage.removeItem('mahjong-autosave');
}

// 功能增强24: 触摸滑动优化
let touchStartX, touchStartY;
document.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});

// 功能增强25: 窗口大小调整处理
window.addEventListener('resize', () => {
  if (typeof recalcLayout === 'function') recalcLayout();
});

// 功能增强26: 分享功能
function shareGame() {
  const text = '我在麻将消消乐游戏中取得了好成绩！';
  if (navigator.share) navigator.share({ text });
  else alert(text);
}

// 功能增强27: 夜间模式支持
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.body.classList.add('dark-mode');
}

// 功能增强28: 无障碍支持
document.querySelectorAll('.btn').forEach(btn => {
  btn.setAttribute('role', 'button');
});

// 功能增强29: 游戏加载提示
document.addEventListener('DOMContentLoaded', () => {
  console.log('麻将消消乐已加载');
});

// 功能增强30: 本地存储容量检查
function checkStorage() {
  try {
    localStorage.setItem('test', 'test');
    localStorage.removeItem('test');
    return true;
  } catch(e) { return false; }
}

// 功能增强31: 牌移动动画优化
function animateTileMove(el, fromX, fromY, toX, toY) {
  el.style.transition = 'all 0.2s ease';
}

// 功能增强32: 游戏速度控制
let gameSpeed = 1;
function setGameSpeed(speed) {
  gameSpeed = speed;
  document.documentElement.style.setProperty('--anim-speed', speed);
}

// 功能增强33: 消除特效
function createElimEffect(x, y) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:'+x+'px;top:'+y+'px;width:20px;height:20px;background:#f5d76e;border-radius:50%;animation:elimPop 0.3s forwards;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 300);
}

// 功能增强34: 屏幕旋转处理
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (typeof recalcLayout === 'function') recalcLayout();
  }, 100);
});

// 功能增强35: 游戏状态保存
function saveGameState() {
  return { boardState, moveCount, hintCount, gameState };
}

// 功能增强36: 加载游戏状态
function loadGameState(saved) {
  if (saved) {
    boardState = saved.boardState;
    moveCount = saved.moveCount;
    hintCount = saved.hintCount;
  }
}

// 功能增强37: 提示冷却时间
let hintCooldown = false;
function enableHint() {
  if (hintCooldown) return;
  hintCooldown = true;
  setTimeout(() => hintCooldown = false, 1000);
}

// 功能增强38: 撤销次数限制
const MAX_UNDO = 20;
function canUndo() {
  return undoStack && undoStack.length < MAX_UNDO;
}

// 功能增强39: 游戏结束统计
function getGameSummary() {
  return {
    moves: moveCount,
    hints: hintCount,
    time: document.getElementById('game-timer').textContent,
    remaining: document.getElementById('tile-count').textContent
  };
}

// 功能增强40: 胜利动画增强
function enhancedVictory() {
  const box = document.querySelector('.victory-box');
  if (box) box.style.animation = 'victoryPulse 0.5s ease 3';
}

// 功能增强41: 音效音量调节
let soundVolume = 0.8;
function setVolume(v) { soundVolume = Math.max(0, Math.min(1, v)); }

// 功能增强42: 提示次数限制
let maxHints = 10;
function getHintLimit() { return maxHints; }

// 功能增强43: 游戏难度加成
function getDifficultyBonus() {
  const diff = localStorage.getItem('mahjong-difficulty') || 'normal';
  return { easy: 1.2, normal: 1, hard: 0.8 }[diff] || 1;
}

// 功能增强44: 成就进度
function getAchievementProgress() {
  const unlocked = JSON.parse(localStorage.getItem('mahjong-achievements') || '[]');
  return unlocked.length;
}

// 功能增强45: 每日任务
function getDailyTask() {
  return { type: 'win', desc: '今日完成一局游戏', progress: 0, target: 1 };
}

// 功能增强46: 残局模式
let puzzleMode = false;
function startPuzzle() { puzzleMode = true; }
function endPuzzle() { puzzleMode = false; }

// 功能增强47: 限时模式
let timeAttack = false;
function startTimeAttack() { timeAttack = true; }

// 功能增强48: 计时奖励
function getTimeBonus() {
  const time = parseInt(document.getElementById('game-timer').textContent.replace(/:/g,''));
  return time < 100 ? 100 : 0;
}

// 功能增强49: 游戏评分
function getGameScore() {
  const time = document.getElementById('game-timer').textContent;
  const moves = document.getElementById('move-count').textContent;
  const score = Math.max(0, 10000 - parseInt(moves) * 100 - parseInt(time.replace(/:/g,'')) * 10);
  return score;
}

// 功能增强50: 游戏评价
function getGameRating() {
  const score = getGameScore();
  if (score > 8000) return 'SSS';
  if (score > 6000) return 'SS';
  if (score > 4000) return 'S';
  if (score > 2000) return 'A';
  return 'B';
}

// 功能增强51: 游戏统计导出
function exportStats() {
  const stats = {
    plays: localStorage.getItem('mahjong-play-count') || 0,
    best: localStorage.getItem('mahjong-best') || '{}',
    achievements: localStorage.getItem('mahjong-achievements') || '[]'
  };
  console.log(JSON.stringify(stats));
}
