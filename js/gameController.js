// gameController.js — 游戏状态机（主协调器）

let gameState = GAME_STATE.IDLE;
let boardState = null;
let undoStack = [];
let gameGeneration = 0; // 每次新游戏自增，使旧 async 任务失效

// 统计数据
let moveCount = 0;  // 有效操作步数（拖动产生消除 + 点击消除）
let hintCount = 0;  // 使用提示次数

// 计时器状态
let timerInterval = null;
let timerStart = 0;
let timerElapsed = 0;

function formatTime(secs) {
  const h = Math.floor(secs / 3600).toString().padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function startTimer() {
  timerStart = Date.now();
  timerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - timerStart) / 1000);
    const el = document.getElementById('game-timer');
    if (el) el.textContent = formatTime(secs);
  }, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerElapsed = Math.floor((Date.now() - timerStart) / 1000);
  return timerElapsed;
}

function resetTimer() {
  stopTimer();
  timerStart = 0;
  timerElapsed = 0;
  const el = document.getElementById('game-timer');
  if (el) el.textContent = '00:00:00';
}

// 暴露给 dragController 使用
window._gameState = null;

function getBoardEl() {
  return document.getElementById('board');
}

// 同步游戏阶段到全局（供 dragController 检查）
function syncPhase(state) {
  window._gamePhase = state;
}

// 初始化新游戏
async function initNewGame() {
  gameGeneration++;
  const myGeneration = gameGeneration;

  undoStack = [];
  moveCount = 0;
  hintCount = 0;
  resetTimer();
  gameState = GAME_STATE.ANIMATING;
  syncPhase('ANIMATING');

  // 根据当前视口重算牌尺寸
  recalcTileSize();

  SoundController.playNewGame();

  const deck = generateDeck();
  let state = null;

  // 开局流程：洗牌 → 确保满棋盘有直接可消除配对（供用户手动操作）
  for (let attempt = 0; attempt <= MAX_SHUFFLE_RETRIES; attempt++) {
    const shuffled = shuffleDeck(deck);
    const candidate = createBoardFromDeck(shuffled);

    // 满棋盘无法滑动，只需确认有直接配对即可开始游戏
    if (findAllPairs(candidate).length > 0) {
      state = candidate;
      break;
    }
  }

  // 极罕见：所有尝试均无直接配对，取最后一次洗牌结果
  if (!state) {
    state = createBoardFromDeck(shuffleDeck(deck));
  }

  boardState = state;
  window._gameState = boardState;

  renderBoard(boardState, getBoardEl());
  updateUI();

  // 发牌动画：背面朝上，从底行到顶行逐行翻起
  await runDealAnimation(getBoardEl(), boardState.height);

  if (gameGeneration === myGeneration) {
    gameState = GAME_STATE.IDLE;
    syncPhase('IDLE');
    startTimer();
  }
}

// 处理拖拽结束事件（由 dragController 调用）
async function handleDragEnd({ group, direction, delta }) {
  // 动画期间不接受操作，重置可能残留的 transform
  if (gameState !== GAME_STATE.IDLE) {
    resetGroupTransform(group);
    return;
  }
  if (delta === 0) {
    resetGroupTransform(group);
    return;
  }

  const myGeneration = gameGeneration; // 捕获当前局代号

  clearHintAnimation(getBoardEl());

  const proposedState = applySlide(boardState, group, direction, delta);
  // 只连锁消除移动后"新产生"的配对，不自动消除存量配对
  const waves = resolveNewPairChain(boardState, proposedState);
  const hasMatch = waves.length > 0;

  gameState = GAME_STATE.ANIMATING;
  syncPhase('ANIMATING');

  try {
    if (hasMatch) {
      pushUndo(boardState);
      moveCount++;
      SoundController.playSlideSuccess();
      await animateSlide(group, direction, delta);

      if (gameGeneration !== myGeneration) return; // 新游戏已启动，放弃
      boardState = proposedState;
      window._gameState = boardState;

      await runEliminationSequence(waves, (stateAfter) => {
        if (gameGeneration === myGeneration) {
          boardState = stateAfter;
          window._gameState = boardState;
        }
      });
    } else {
      SoundController.playInvalidMove();
      await animateRevert(group);
    }
  } finally {
    // 无论是否异常，都解锁游戏状态
    if (gameGeneration === myGeneration) {
      gameState = GAME_STATE.IDLE;
      syncPhase('IDLE');
      updateUI();
    }
  }

  if (gameGeneration !== myGeneration) return;

  if (hasMatch) {
    if (checkVictory(boardState)) {
      showVictory();
      return;
    }
    if (findAllPairs(boardState).length === 0 && findHint(boardState) === null) {
      showDeadlock();
    }
  }
}

// 处理点击消除（用户点击有配对的牌时调用）
async function handleTileClick({ row, col }) {
  if (gameState !== GAME_STATE.IDLE) return;

  const myGeneration = gameGeneration;

  clearHintAnimation(getBoardEl());

  // 查找点击牌所参与的直接可消除配对
  const allPairs = findAllPairs(boardState);
  const pair = allPairs.find(({ a, b }) =>
    (a.row === row && a.col === col) || (b.row === row && b.col === col)
  );

  if (!pair) return; // 点击的牌暂无可消除配对，忽略

  SoundController.playTileClick();
  pushUndo(boardState);
  moveCount++;

  const { a, b } = pair;
  const stateAfterFirst = eliminateTiles(boardState, [
    { row: a.row, col: a.col },
    { row: b.row, col: b.col },
  ]);

  // 点击只消除用户选中的那一对，不触发自动连锁（用户手动找下一对）
  const allWaves = [{ eliminated: [{ a, b }], stateAfter: stateAfterFirst }];

  gameState = GAME_STATE.ANIMATING;
  syncPhase('ANIMATING');

  try {
    await runEliminationSequence(allWaves, (stateAfter) => {
      if (gameGeneration === myGeneration) {
        boardState = stateAfter;
        window._gameState = boardState;
      }
    });
  } finally {
    if (gameGeneration === myGeneration) {
      gameState = GAME_STATE.IDLE;
      syncPhase('IDLE');
      updateUI();
    }
  }

  if (gameGeneration !== myGeneration) return;

  if (checkVictory(boardState)) {
    showVictory();
    return;
  }

  if (findAllPairs(boardState).length === 0 && findHint(boardState) === null) {
    showDeadlock();
  }
}

// 提示功能
function handleHint() {
  if (gameState !== GAME_STATE.IDLE) return;

  clearHintAnimation(getBoardEl());
  hintCount++;

  // 优先提示直接可消除的配对（点击即可消除）
  const directPairs = findAllPairs(boardState);
  if (directPairs.length > 0) {
    const { a, b } = directPairs[0];
    animateHint([a, b]);
    updateUI();
    return;
  }

  // 再查找需要移动的步骤
  const hint = findHint(boardState);
  if (hint) {
    animateHint(hint.group);
    updateUI();
  } else {
    // 死局：弹窗询问用户是否重排
    showReshuffleConfirm();
  }
}

// 撤销
function handleUndo() {
  if (gameState !== GAME_STATE.IDLE) return;
  if (undoStack.length === 0) return;

  clearHintAnimation(getBoardEl());

  const prev = undoStack.pop();
  boardState = prev;
  window._gameState = boardState;

  renderBoard(boardState, getBoardEl());
  updateUI();
}

// 新游戏
function handleNewGame() {
  clearHintAnimation(getBoardEl());
  hideVictoryScreen();
  initNewGame();
}

// 撤销栈管理
function pushUndo(state) {
  undoStack.push(cloneState(state));
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }
}

// UI 状态更新
function updateUI() {
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0;
  }

  const remaining = countRemainingTiles(boardState);
  const countEl = document.getElementById('tile-count');
  if (countEl) {
    countEl.textContent = remaining;
  }

  const moveEl = document.getElementById('move-count');
  if (moveEl) moveEl.textContent = moveCount;

  const hintEl = document.getElementById('hint-count');
  if (hintEl) hintEl.textContent = hintCount;
}

// 胜利界面
function showVictory() {
  gameState = GAME_STATE.VICTORY;
  SoundController.playVictory();
  const elapsed = stopTimer();
  const timeEl = document.getElementById('victory-time-display');
  if (timeEl) timeEl.textContent = `用时：${formatTime(elapsed)}`;
  const moveEl = document.getElementById('victory-move-display');
  if (moveEl) moveEl.textContent = `有效操作：${moveCount} 步`;
  const hintEl = document.getElementById('victory-hint-display');
  if (hintEl) hintEl.textContent = `使用提示：${hintCount} 次`;
  const screen = document.getElementById('victory-screen');
  if (screen) screen.classList.remove('hidden');
}

function hideVictoryScreen() {
  const screen = document.getElementById('victory-screen');
  if (screen) screen.classList.add('hidden');
}

// 死局提示
function showDeadlock() {
  const msg = document.getElementById('deadlock-msg');
  if (msg) {
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
  }
}

// 重排提示
function showReshuffle() {
  const msg = document.getElementById('reshuffle-msg');
  if (msg) {
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
  }
}

// 重排确认弹窗
function showReshuffleConfirm() {
  const dialog = document.getElementById('reshuffle-confirm');
  if (!dialog) return;
  dialog.classList.remove('hidden');
}

function hideReshuffleConfirm() {
  const dialog = document.getElementById('reshuffle-confirm');
  if (dialog) dialog.classList.add('hidden');
}

function doReshuffle() {
  hideReshuffleConfirm();
  const newState = reshuffleRemainingTiles(boardState);
  boardState = newState;
  window._gameState = boardState;
  renderBoard(boardState, getBoardEl());
  updateUI();
  SoundController.playReshuffle();
  showReshuffle();
}
