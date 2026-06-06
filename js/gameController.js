import { GAME_STATE, MAX_UNDO_STEPS, MAX_SHUFFLE_RETRIES, recalcLayout, recalcTileSizeOnly, setBoardLayout, DIR } from './constants.js';
import { createBoardFromDeck, cloneState, countRemainingTiles } from './boardState.js';
import { findAllPairs, hasAnyPair, eliminateTiles, resolveNewPairChain, checkVictory, reshuffleRemainingTiles } from './gameLogic.js?v=20260607-4';
import { findHint } from './hintSystem.js';
import { renderBoard, resetGroupTransform, getTileElement } from './renderer.js';
import { runDealAnimation, runEliminationSequence, animateSlide, animateRevert, animateHint, animateInvalidTile, clearHintAnimation } from './animationController.js?v=20260607-4';
import { SoundController } from './soundController.js';
import { TILE_TYPES, generateDeck, shuffleDeck } from './tileDefinitions.js';
import { applySlide } from './movementLogic.js?v=20260607-4';
import { hideTutorial } from './tutorial.js?v=20260607-4';

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

const COMBO_WINDOW_MS = 10000;
const TEACHING_LAYOUT = { width: 9, height: 5 };
const TEACHING_STEPS = [
  {
    action: 'click',
    label: '教学 1/5',
    text: '从高亮的一万开始。同行两张相同牌之间没有阻挡，点击任意一张即可消除。',
    clickPair: [
      { row: 2, col: 1 },
      { row: 2, col: 5 },
    ],
    highlights: [
      { row: 2, col: 1, role: 'target' },
      { row: 2, col: 5, role: 'target' },
    ],
  },
  {
    action: 'click',
    label: '教学 2/5',
    text: '这次看同一列。高亮的两张南中间是空的，点击其中一张即可消除。',
    clickPair: [
      { row: 1, col: 4 },
      { row: 4, col: 4 },
    ],
    highlights: [
      { row: 1, col: 4, role: 'target' },
      { row: 4, col: 4, role: 'target' },
    ],
  },
  {
    action: 'drag',
    label: '教学 3/5',
    text: '按住黄色七万向右拖，让它落到绿色七万下方。同列对齐后松手就会消除。',
    drag: {
      direction: DIR.HORIZONTAL,
      delta: 4,
      group: [
        { row: 3, col: 3 },
      ],
      pairAfter: [
        { row: 1, col: 7 },
        { row: 3, col: 7 },
      ],
    },
    highlights: [
      { row: 3, col: 3, role: 'target' },
      { row: 1, col: 7, role: 'anchor' },
    ],
  },
  {
    action: 'drag',
    label: '教学 4/5',
    text: '从左侧黄色三万开始向右拖，旁边的四筒会一起移动。让黄色四筒对齐绿色四筒。',
    drag: {
      direction: DIR.HORIZONTAL,
      delta: 4,
      group: [
        { row: 3, col: 1 },
        { row: 3, col: 2 },
      ],
      pairAfter: [
        { row: 1, col: 6 },
        { row: 3, col: 6 },
      ],
    },
    highlights: [
      { row: 3, col: 1, role: 'target' },
      { row: 3, col: 2, role: 'target' },
      { row: 1, col: 6, role: 'anchor' },
    ],
  },
  {
    action: 'click',
    label: '教学 5/5',
    text: '最后来一个更像实战的小局面。找到高亮的白板，点击任意一张完成教学。',
    clickPair: [
      { row: 2, col: 0 },
      { row: 2, col: 8 },
    ],
    highlights: [
      { row: 2, col: 0, role: 'target' },
      { row: 2, col: 8, role: 'target' },
    ],
  },
];
const TEACHING_COMPLETE = {
  label: '自由练习',
  text: '很好，规则已经走完了。剩下的牌都能按正常规则继续消除，试着把这盘清完。',
};

let isTeachingMode = false;
let teachingStepIndex = 0;
let teachingCompleted = false;
let comboCount = 0;
let lastComboAt = 0;
let comboResetTimer = null;

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

// 暂停/恢复计时器（覆盖层显示时调用）
let timerPaused = false;
let timerPausedAt = 0;

function pauseTimer() {
  if (timerInterval === null || timerPaused) return;
  timerPaused = true;
  timerPausedAt = Date.now();
  clearInterval(timerInterval);
  timerInterval = null;
}

function resumeTimer() {
  if (!timerPaused) return;
  timerPaused = false;
  // 补偿暂停的时间差
  const pausedDuration = Date.now() - timerPausedAt;
  timerStart += pausedDuration;
  timerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - timerStart) / 1000);
    const el = document.getElementById('game-timer');
    if (el) el.textContent = formatTime(secs);
  }, 1000);
}

// 暴露给 dragController 使用
window._gameState = null;
window._isTeachingMode = false;

function getBoardEl() {
  return document.getElementById('board');
}

// 同步游戏阶段到全局（供 dragController 检查）
function syncPhase(state) {
  window._gamePhase = state;
}

function createTeachingTile(typeId, instanceOffset) {
  const def = TILE_TYPES[typeId];
  return {
    instanceId: 10000 + instanceOffset,
    tileTypeId: def.id,
    type: def.type,
    value: def.value,
    label: def.label,
    topChar: def.topChar,
    bottomChar: def.bottomChar,
    image: def.image,
  };
}

function createTeachingState(tiles) {
  const grid = Array.from(
    { length: TEACHING_LAYOUT.height },
    () => Array(TEACHING_LAYOUT.width).fill(null)
  );

  for (const { row, col, typeId, instanceOffset } of tiles) {
    grid[row][col] = createTeachingTile(typeId, instanceOffset);
  }

  return {
    width: TEACHING_LAYOUT.width,
    height: TEACHING_LAYOUT.height,
    grid,
  };
}

function createTeachingBoard() {
  return createTeachingState([
    { row: 0, col: 0, typeId: 9, instanceOffset: 1 },
    { row: 0, col: 3, typeId: 18, instanceOffset: 2 },
    { row: 0, col: 7, typeId: 18, instanceOffset: 3 },
    { row: 1, col: 0, typeId: 9, instanceOffset: 4 },
    { row: 1, col: 2, typeId: 5, instanceOffset: 5 },
    { row: 1, col: 4, typeId: 28, instanceOffset: 6 },
    { row: 1, col: 5, typeId: 5, instanceOffset: 7 },
    { row: 1, col: 6, typeId: 21, instanceOffset: 8 },
    { row: 1, col: 7, typeId: 6, instanceOffset: 9 },
    { row: 1, col: 8, typeId: 30, instanceOffset: 10 },
    { row: 2, col: 0, typeId: 33, instanceOffset: 11 },
    { row: 2, col: 1, typeId: 0, instanceOffset: 12 },
    { row: 2, col: 5, typeId: 0, instanceOffset: 13 },
    { row: 2, col: 8, typeId: 33, instanceOffset: 14 },
    { row: 3, col: 0, typeId: 24, instanceOffset: 15 },
    { row: 3, col: 1, typeId: 2, instanceOffset: 16 },
    { row: 3, col: 2, typeId: 21, instanceOffset: 17 },
    { row: 3, col: 3, typeId: 6, instanceOffset: 18 },
    { row: 3, col: 8, typeId: 30, instanceOffset: 19 },
    { row: 4, col: 0, typeId: 24, instanceOffset: 20 },
    { row: 4, col: 1, typeId: 32, instanceOffset: 24 },
    { row: 4, col: 4, typeId: 28, instanceOffset: 21 },
    { row: 4, col: 5, typeId: 2, instanceOffset: 22 },
    { row: 4, col: 8, typeId: 32, instanceOffset: 23 },
  ]);
}

function setTeachingChrome(visible) {
  const panel = document.getElementById('teaching-panel');
  const gameArea = document.querySelector('.game-area');
  if (panel) panel.classList.toggle('hidden', !visible);
  if (gameArea) gameArea.classList.toggle('game-area--teaching', visible);
  document.body.classList.toggle('teaching-mode', visible);
  window._isTeachingMode = visible;
}

function updateTeachingPanel(content) {
  const labelEl = document.getElementById('teaching-step-label');
  const textEl = document.getElementById('teaching-step-text');
  if (labelEl) labelEl.textContent = content.label;
  if (textEl) textEl.textContent = content.text;
}

function clearTeachingHighlights(boardEl) {
  if (!boardEl) return;
  boardEl
    .querySelectorAll('.tile--teaching-target, .tile--teaching-anchor')
    .forEach(el => {
      el.classList.remove('tile--teaching-target', 'tile--teaching-anchor');
    });
}

function showTeachingTargetHint(step = TEACHING_STEPS[teachingStepIndex]) {
  const boardEl = getBoardEl();
  if (!step || !boardState || !boardEl) return;

  clearHintAnimation(boardEl);
  clearTeachingHighlights(boardEl);

  const hintGroup = [];
  for (const mark of step.highlights || []) {
    const tile = boardState.grid[mark.row]?.[mark.col];
    if (!tile) continue;

    const el = getTileElement(tile.instanceId);
    if (!el) continue;

    el.classList.add(mark.role === 'anchor'
      ? 'tile--teaching-anchor'
      : 'tile--teaching-target');
    hintGroup.push({ row: mark.row, col: mark.col, tile });
  }

  if (hintGroup.length > 0) {
    animateHint(hintGroup);
  }
}

function refreshTeachingHighlights() {
  if (!isTeachingMode || teachingCompleted) return;
  showTeachingTargetHint();
}

function positionKey(pos) {
  return `${pos.row}:${pos.col}`;
}

function positionsMatch(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  const expectedKeys = new Set(expected.map(positionKey));
  return actual.every(pos => expectedKeys.has(positionKey(pos)));
}

function pairMatchesPositions(pair, expected) {
  return positionsMatch([
    { row: pair.a.row, col: pair.a.col },
    { row: pair.b.row, col: pair.b.col },
  ], expected);
}

function isExpectedTeachingClick(pair) {
  if (!isTeachingMode || teachingCompleted) return true;

  const step = TEACHING_STEPS[teachingStepIndex];
  return step?.action === 'click'
    && pairMatchesPositions(pair, step.clickPair);
}

function getExpectedTeachingDragPair(group, direction, delta, waves) {
  if (!isTeachingMode || teachingCompleted) return null;

  const step = TEACHING_STEPS[teachingStepIndex];
  if (step?.action !== 'drag' || !step.drag) return null;
  if (direction !== step.drag.direction || delta !== step.drag.delta) return null;
  if (!positionsMatch(group.map(({ row, col }) => ({ row, col })), step.drag.group)) return null;

  for (const wave of waves) {
    const pair = wave.eliminated.find(p => pairMatchesPositions(p, step.drag.pairAfter));
    if (pair) return pair;
  }
  return null;
}

function waveForSinglePair(state, pair) {
  return {
    eliminated: [{ a: pair.a, b: pair.b }],
    stateAfter: eliminateTiles(state, [
      { row: pair.a.row, col: pair.a.col },
      { row: pair.b.row, col: pair.b.col },
    ]),
  };
}

function hideTeachingPanel() {
  clearTeachingHighlights(getBoardEl());
  setTeachingChrome(false);
  teachingCompleted = false;
}

function prepareTeachingLayout() {
  setBoardLayout(TEACHING_LAYOUT.width, TEACHING_LAYOUT.height);
  recalcTileSizeOnly(TEACHING_LAYOUT.width, TEACHING_LAYOUT.height);
}

function loadTeachingStep() {
  const step = TEACHING_STEPS[teachingStepIndex];
  clearHintAnimation(getBoardEl());
  clearTeachingHighlights(getBoardEl());
  updateTeachingPanel(step);
  showTeachingTargetHint(step);
  updateUI();
}

function completeTeachingLevel() {
  teachingCompleted = true;
  clearHintAnimation(getBoardEl());
  clearTeachingHighlights(getBoardEl());
  updateTeachingPanel(TEACHING_COMPLETE);
  const panel = document.getElementById('teaching-panel');
  if (panel) panel.classList.add('hidden');
  SoundController.playVictory();
  updateUI();
}

function advanceTeachingAfterAction(action) {
  if (!isTeachingMode || teachingCompleted) return false;

  const step = TEACHING_STEPS[teachingStepIndex];
  if (!step || step.action !== action) return false;

  if (teachingStepIndex < TEACHING_STEPS.length - 1) {
    teachingStepIndex++;
    loadTeachingStep();
  } else {
    completeTeachingLevel();
  }
  return true;
}

function leaveTeachingMode() {
  isTeachingMode = false;
  teachingStepIndex = 0;
  hideTeachingPanel();
}

function resetCombo() {
  comboCount = 0;
  lastComboAt = 0;
  if (comboResetTimer !== null) {
    clearTimeout(comboResetTimer);
    comboResetTimer = null;
  }
}

function registerCombo() {
  const now = Date.now();
  const withinWindow = lastComboAt > 0 && now - lastComboAt <= COMBO_WINDOW_MS;
  comboCount = withinWindow ? comboCount + 1 : 1;
  lastComboAt = now;

  if (comboResetTimer !== null) clearTimeout(comboResetTimer);
  comboResetTimer = setTimeout(resetCombo, COMBO_WINDOW_MS);

  return {
    count: comboCount,
    windowMs: COMBO_WINDOW_MS,
  };
}

// 初始化新游戏
async function initNewGame() {
  gameGeneration++;
  const myGeneration = gameGeneration;

  leaveTeachingMode();
  undoStack = [];
  moveCount = 0;
  hintCount = 0;
  resetCombo();
  resetTimer();
  // 隐藏旋转提示（如有）
  const rotateHint = document.getElementById('rotate-hint');
  if (rotateHint) rotateHint.classList.add('hidden');
  gameState = GAME_STATE.ANIMATING;
  syncPhase('ANIMATING');

  // 根据当前视口重算牌尺寸
  recalcLayout();

  SoundController.playNewGame();

  const deck = generateDeck();
  let state = null;

  // 开局流程：洗牌 → 确保满棋盘有直接可消除配对（供用户手动操作）
  for (let attempt = 0; attempt <= MAX_SHUFFLE_RETRIES; attempt++) {
    const shuffled = shuffleDeck(deck);
    const candidate = createBoardFromDeck(shuffled);

    // 满棋盘无法滑动，只需确认有直接配对即可开始游戏
    if (hasAnyPair(candidate)) {
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

async function startTeachingLevel() {
  gameGeneration++;
  const myGeneration = gameGeneration;

  hideTutorial();
  hideVictoryScreen();
  hideReshuffleConfirm();
  clearHintAnimation(getBoardEl());

  isTeachingMode = true;
  teachingStepIndex = 0;
  teachingCompleted = false;
  setTeachingChrome(true);
  updateTeachingPanel(TEACHING_STEPS[0]);

  undoStack = [];
  moveCount = 0;
  hintCount = 0;
  resetCombo();
  resetTimer();
  gameState = GAME_STATE.ANIMATING;
  syncPhase('ANIMATING');

  prepareTeachingLayout();
  boardState = createTeachingBoard();
  window._gameState = boardState;
  renderBoard(boardState, getBoardEl());
  updateUI();
  SoundController.playNewGame();

  await runDealAnimation(getBoardEl(), boardState.height);

  if (gameGeneration === myGeneration) {
    showTeachingTargetHint(TEACHING_STEPS[0]);
    gameState = GAME_STATE.IDLE;
    syncPhase('IDLE');
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
  let hasMatch = waves.length > 0;
  let wavesToRun = waves;
  if (hasMatch && isTeachingMode && !teachingCompleted) {
    const expectedPair = getExpectedTeachingDragPair(group, direction, delta, waves);
    hasMatch = expectedPair !== null;
    if (expectedPair) {
      wavesToRun = [waveForSinglePair(proposedState, expectedPair)];
    }
  }

  gameState = GAME_STATE.ANIMATING;
  syncPhase('ANIMATING');

  try {
    if (hasMatch) {
      pushUndo(boardState);
      moveCount++;
      const combo = registerCombo();
      SoundController.playSlideSuccess();
      await animateSlide(group, direction, delta);

      if (gameGeneration !== myGeneration) return; // 新游戏已启动，放弃
      boardState = proposedState;
      window._gameState = boardState;

      await runEliminationSequence(wavesToRun, (stateAfter) => {
        if (gameGeneration === myGeneration) {
          boardState = stateAfter;
          window._gameState = boardState;
        }
      }, combo);
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
      if (isTeachingMode && !teachingCompleted && !hasMatch) {
        showTeachingTargetHint();
      }
    }
  }

  if (gameGeneration !== myGeneration) return;

  if (hasMatch) {
    if (advanceTeachingAfterAction('drag')) {
      return;
    }
    if (checkVictory(boardState)) {
      showVictory();
      return;
    }
    if (findHint(boardState) === null) {
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

  if (!pair) {
    SoundController.playInvalidMove();
    animateInvalidTile(boardState.grid[row][col]);
    return;
  }

  if (isTeachingMode && !isExpectedTeachingClick(pair)) {
    SoundController.playInvalidMove();
    animateInvalidTile(boardState.grid[row][col]);
    showTeachingTargetHint();
    return;
  }

  SoundController.playTileClick();
  pushUndo(boardState);
  moveCount++;
  const combo = registerCombo();

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
    }, combo);
  } finally {
    if (gameGeneration === myGeneration) {
      gameState = GAME_STATE.IDLE;
      syncPhase('IDLE');
      updateUI();
    }
  }

  if (gameGeneration !== myGeneration) return;

  if (advanceTeachingAfterAction('click')) {
    return;
  }

  if (checkVictory(boardState)) {
    showVictory();
    return;
  }

  if (findHint(boardState) === null) {
    showDeadlock();
  }
}

// 提示功能
function handleHint() {
  if (gameState !== GAME_STATE.IDLE) return;
  if (!boardState) return;

  clearHintAnimation(getBoardEl());
  hintCount++;

  if (isTeachingMode && !teachingCompleted) {
    showTeachingTargetHint();
    updateUI();
    return;
  }

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
  if (isTeachingMode) return;
  if (undoStack.length === 0) return;

  clearHintAnimation(getBoardEl());
  resetCombo();

  const prev = undoStack.pop();
  boardState = prev.state;
  moveCount = prev.moveCount;
  hintCount = prev.hintCount;
  window._gameState = boardState;

  renderBoard(boardState, getBoardEl());
  updateUI();
}

// 新游戏
function handleNewGame() {
  clearHintAnimation(getBoardEl());
  hideVictoryScreen();
  leaveTeachingMode();
  initNewGame();
}

function exitTeachingLevel() {
  if (!isTeachingMode) return;
  clearHintAnimation(getBoardEl());
  hideVictoryScreen();
  leaveTeachingMode();
  initNewGame();
}

// 撤销栈管理
function pushUndo(state) {
  undoStack.push({
    state: cloneState(state),
    moveCount,
    hintCount,
  });
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }
}

// UI 状态更新
function updateUI() {
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) {
    undoBtn.disabled = isTeachingMode || undoStack.length === 0;
  }

  if (!boardState) return;

  const remaining = countRemainingTiles(boardState);
  setCounterText('tile-count', remaining);
  setCounterText('move-count', moveCount);
  setCounterText('hint-count', hintCount);
}

function setCounterText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  const nextText = String(value);
  if (el.textContent === nextText) return;

  el.textContent = nextText;
  el.classList.remove('stat-pop');
  void el.offsetWidth;
  el.classList.add('stat-pop');
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
  pauseTimer(); // 弹窗时暂停计时
  dialog.classList.remove('hidden');
}

function hideReshuffleConfirm() {
  const dialog = document.getElementById('reshuffle-confirm');
  if (dialog) dialog.classList.add('hidden');
  resumeTimer(); // 关闭弹窗时恢复计时
}

function doReshuffle() {
  hideReshuffleConfirm();
  pushUndo(boardState); // 支持撤销重排
  resetCombo();
  const newState = reshuffleRemainingTiles(boardState);
  boardState = newState;
  window._gameState = boardState;
  renderBoard(boardState, getBoardEl());
  updateUI();
  SoundController.playReshuffle();
  showReshuffle();
}

// 旋转屏幕提示（仅提示，不强制开新局）
function showRotateHint() {
  const el = document.getElementById('rotate-hint');
  if (!el) return;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

export {
  gameState, boardState, moveCount, hintCount,
  pauseTimer, resumeTimer,
  initNewGame, startTeachingLevel, exitTeachingLevel,
  handleDragEnd, handleTileClick,
  handleHint, handleUndo, handleNewGame,
  doReshuffle, hideReshuffleConfirm, showRotateHint,
  refreshTeachingHighlights,
  pushUndo, updateUI, showVictory, hideVictoryScreen,
  showDeadlock, showReshuffle, showReshuffleConfirm,
  syncPhase, getBoardEl, startTimer, stopTimer, resetTimer,
};
