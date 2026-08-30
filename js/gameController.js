import { GAME_STATE, MAX_UNDO_STEPS, MAX_SHUFFLE_RETRIES, recalcLayout, recalcTileSizeOnly, setBoardLayout, DIR } from './constants.js';
import { createBoardFromDeck, cloneState, countRemainingTiles } from './boardState.js';
import { findAllPairs, hasAnyPair, eliminateTiles, resolveNewPairChain, resolveChainElimination, checkVictory, isDeadlock, reshuffleRemainingTiles } from './gameLogic.js';
import { findHint } from './hintSystem.js';
import { renderBoard, diffRenderBoard, resetGroupTransform, getTileElement } from './renderer.js';
import { runDealAnimation, runEliminationSequence, animateSlide, animateRevert, animateHint, animateInvalidTile, clearHintAnimation } from './animationController.js';
import { SoundController } from './soundController.js';
import { formatTime, getElapsedSeconds, startTimer, startTimerFromElapsed, stopTimer, resetTimer, pauseTimer, resumeTimer, startCountdown, getRemainingSeconds, stopCountdown } from './timer.js';
import { preloadTileImages } from './imagePreload.js';
import { TILE_TYPES, generateDeck, shuffleDeck } from './tileDefinitions.js';
import { applySlide } from './movementLogic.js';
import { hideTutorial } from './tutorial.js';
import { recordGameStart, recordGameResult } from './stats.js';
import { burstAtElement, confetti } from './particles.js';
import { MODES, getMode, hasTimeBudget, hasMoveBudget, resolveRng, mulberry32, hashSeed } from './modes.js';
import { createScore, addWave, settleScore, defaultStarThresholds, recordScore } from './score.js';
import { loadItems, saveItems, spendItem, getCount } from './items.js';
import { getLevel, loadProgress, saveProgress, recordLevelResult, levelStarThresholds } from './levels.js';
import { recordEvent } from './achievements.js';

// gameController.js — 游戏状态机（主协调器）

let gameState = GAME_STATE.IDLE;
let boardState = null;
let undoStack = [];
let gameGeneration = 0; // 每次新游戏自增，使旧 async 任务失效

// 统计数据
let moveCount = 0;  // 有效操作步数（拖动产生消除 + 点击消除）
let hintCount = 0;  // 使用提示次数

// 本局累计（上报给 stats.js）
let pairsThisGame = 0;    // 本局累计消除对数
let maxComboThisGame = 0; // 本局最高连击

// 当前模式与计分/道具状态（P1 游戏性）
let currentMode = null;        // 当前模式对象（modes.js 里的定义）
let modeId = 'classic';        // 当前模式 id
let scoreAcc = null;           // 计分累计器（score.js createScore 产物）
let chainIndex = 0;            // 当前连锁进行到的波数（同一次消除操作的连锁编号）
let itemStock = null;          // 道具库存（items.js 加载）
let pendingHammer = false;     // 锤子待消除态：下一次点击任一可消除对即触发
let hammerPairCache = null;    // 锤子选中的待消除对（用于 UI 高亮，可选）
let timedOut = false;          // 限时模式是否已超时结算
let lastScoreGain = 0;         // 最近一次得分增量（供 UI 飘字/动画）
let maxChainThisGame = 0;      // 本局最长连锁波数
let undoUsedThisGame = 0;      // 本局已用撤销次数（模式 undoLimit 限制）
let currentLevel = null;       // 当前关卡（关卡模式时非 null，levels.js 定义）

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

// 供 dragController / main.js 依赖注入使用的只读访问器。
// 取代原先的 window._gameState / _gamePhase / _isTeachingMode 全局通信。
function getState() {
  return boardState;
}

function getPhase() {
  return gameState;
}

function isTeachingModeActive() {
  return isTeachingMode;
}

function getBoardEl() {
  return document.getElementById('board');
}

// P1 只读访问器（供 main.js 渲染模式/计分/道具 UI）
function getModeInfo() {
  return { modeId, mode: currentMode || null };
}

function getScoreInfo() {
  return {
    total: scoreAcc ? scoreAcc.total : 0,
    pairs: scoreAcc ? scoreAcc.pairs : 0,
    maxCombo: maxComboThisGame,
    maxChain: maxChainThisGame,
    lastGain: lastScoreGain,
  };
}

function getItems() {
  return itemStock ? { ...itemStock } : {};
}

function isHammerPending() {
  return pendingHammer;
}

function getMoveRemaining() {
  if (!currentMode || !hasMoveBudget(currentMode)) return null;
  return Math.max(0, currentMode.moveBudget - moveCount);
}

function getLevelInfo() {
  return {
    level: currentLevel,
    isLevelMode: !!currentLevel,
  };
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

function isTeachingStepAvailable(step = TEACHING_STEPS[teachingStepIndex]) {
  if (!isTeachingMode || teachingCompleted || !step || !boardState) return false;

  if (step.action === 'click') {
    return findAllPairs(boardState).some(pair =>
      pairMatchesPositions(pair, step.clickPair)
    );
  }

  if (step.action === 'drag' && step.drag) {
    return [
      ...step.drag.group,
      ...(step.highlights || []),
    ].every(pos => Boolean(boardState.grid[pos.row]?.[pos.col]));
  }

  return false;
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

function loadNextAvailableTeachingStep() {
  while (teachingStepIndex < TEACHING_STEPS.length && !isTeachingStepAvailable()) {
    teachingStepIndex++;
  }

  if (teachingStepIndex >= TEACHING_STEPS.length) {
    completeTeachingLevel();
    return true;
  }

  loadTeachingStep();
  return true;
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

function advanceTeachingAfterAction(action, matchedExpectedStep = true) {
  if (!isTeachingMode || teachingCompleted || !matchedExpectedStep) return false;

  const step = TEACHING_STEPS[teachingStepIndex];
  if (!step || step.action !== action) return false;

  teachingStepIndex++;
  if (teachingStepIndex >= TEACHING_STEPS.length) {
    completeTeachingLevel();
  } else {
    loadNextAvailableTeachingStep();
  }
  return true;
}

function refreshTeachingAfterFreeAction() {
  if (!isTeachingMode || teachingCompleted) return false;
  return loadNextAvailableTeachingStep();
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

function countEliminatedPairs(waves) {
  return waves.reduce((total, wave) => total + wave.eliminated.length, 0);
}

function registerCombo(gain = 1) {
  const now = Date.now();
  const comboGain = Math.max(1, gain);
  const withinWindow = lastComboAt > 0 && now - lastComboAt <= COMBO_WINDOW_MS;
  comboCount = withinWindow ? comboCount + comboGain : comboGain;
  lastComboAt = now;

  if (comboResetTimer !== null) clearTimeout(comboResetTimer);
  comboResetTimer = setTimeout(resetCombo, COMBO_WINDOW_MS);

  return {
    count: comboCount,
    gain: comboGain,
    windowMs: COMBO_WINDOW_MS,
  };
}

// 初始化新游戏
// options: { mode }  模式 id（缺省 = 经典）。向后兼容：无参数即经典模式。
// 构建关卡棋盘（关卡模式专用）。
// 设置固定布局 + 种子化洗牌（可复现），并保证开局有直接可消除配对。
function _buildLevelState(level) {
  const deck = generateDeck({ tileTypeIds: level.tileTypeIds, copies: level.copies });
  const rng = mulberry32(hashSeed(level.seed));
  let state = null;
  for (let attempt = 0; attempt <= MAX_SHUFFLE_RETRIES; attempt++) {
    const candidate = createBoardFromDeck(shuffleDeck(deck, rng), {
      width: level.cols, height: level.rows,
    });
    if (hasAnyPair(candidate)) { state = candidate; break; }
  }
  if (!state) {
    state = createBoardFromDeck(shuffleDeck(deck, rng), {
      width: level.cols, height: level.rows,
    });
  }
  return state;
}

async function initNewGame(options = {}) {
  gameGeneration++;
  const myGeneration = gameGeneration;

  leaveTeachingMode();
  clearSave();
  undoStack = [];
  moveCount = 0;
  hintCount = 0;
  pairsThisGame = 0;
  maxComboThisGame = 0;
  resetCombo();

  // 模式/计分/道具状态
  modeId = getMode(options.mode).id;
  currentMode = MODES[modeId];
  // 关卡模式：加载关卡并覆盖限额
  currentLevel = options.level ? getLevel(options.level) : null;
  if (currentLevel) {
    currentMode = {
      ...currentMode,
      moveBudget: currentLevel.moveBudget,
      hintLimit: currentLevel.hintLimit,
      undoLimit: currentLevel.undoLimit,
      scoring: true,
      isLevel: true,
    };
    modeId = 'level';
  }
  scoreAcc = createScore();
  chainIndex = 0;
  maxChainThisGame = 0;
  lastScoreGain = 0;
  pendingHammer = false;
  hammerPairCache = null;
  timedOut = false;
  undoUsedThisGame = 0;
  itemStock = loadItems();

  resetTimer();
  recordGameStart(); // 跨局统计：正式局开局 +1（教学模式不走这里）
  // 隐藏旋转提示（如有）
  const rotateHint = document.getElementById('rotate-hint');
  if (rotateHint) rotateHint.classList.add('hidden');
  gameState = GAME_STATE.ANIMATING;

  if (currentLevel) {
    // 关卡模式：固定布局 + 种子化棋盘（不走视口自适应 recalcLayout）
    setBoardLayout(currentLevel.cols, currentLevel.rows);
    recalcTileSizeOnly(currentLevel.cols, currentLevel.rows);
  } else {
    // 根据当前视口重算牌尺寸
    recalcLayout();
  }

  SoundController.playNewGame();

  let state = null;

  if (currentLevel) {
    state = _buildLevelState(currentLevel);
  } else {
    const deck = generateDeck();

    // 解析模式随机源：经典/限时/步数用 Math.random，每日用日期种子（可复现）
    const { rng, dailyDate } = resolveRng(currentMode);
    currentMode.dailyDate = dailyDate; // 记录本局每日日期（用于展示/存档）

    // 开局流程：洗牌 → 确保满棋盘有直接可消除配对（供用户手动操作）
    for (let attempt = 0; attempt <= MAX_SHUFFLE_RETRIES; attempt++) {
      const shuffled = shuffleDeck(deck, rng);
      const candidate = createBoardFromDeck(shuffled);

      // 满棋盘无法滑动，只需确认有直接配对即可开始游戏
      if (hasAnyPair(candidate)) {
        state = candidate;
        break;
      }
    }

    // 极罕见：所有尝试均无直接配对，取最后一次洗牌结果
    if (!state) {
      state = createBoardFromDeck(shuffleDeck(deck, rng));
    }
  }

  boardState = state;

  renderBoard(boardState, getBoardEl());
  updateUI();

  // 先预加载本局用到的牌图（弱网下发牌动画不再跑在图片前面），再发牌
  await preloadTileImages(boardState);

  // 发牌动画：背面朝上，从底行到顶行逐行翻起
  await runDealAnimation(getBoardEl(), boardState.height);

  if (gameGeneration === myGeneration) {
    gameState = GAME_STATE.IDLE;
    if (hasTimeBudget(currentMode)) {
      // 限时模式：倒计时，归零时结束并结算
      startCountdown(currentMode.timeBudget, () => {
        if (gameGeneration === myGeneration) {
          finishTimedOut();
        }
      });
    } else {
      startTimer();
    }
    updateUI();
    persistSave();
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

  prepareTeachingLayout();
  boardState = createTeachingBoard();
  renderBoard(boardState, getBoardEl());
  updateUI();
  SoundController.playNewGame();

  await runDealAnimation(getBoardEl(), boardState.height);

  if (gameGeneration === myGeneration) {
    showTeachingTargetHint(TEACHING_STEPS[0]);
    gameState = GAME_STATE.IDLE;
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
    const myGeneration = gameGeneration;
    clearHintAnimation(getBoardEl());
    gameState = GAME_STATE.ANIMATING;
    SoundController.playInvalidMove();
    try {
      await animateRevert(group);
    } finally {
      if (gameGeneration === myGeneration) {
        gameState = GAME_STATE.IDLE;
        updateUI();
        if (isTeachingMode && !teachingCompleted) {
          showTeachingTargetHint();
        }
      }
    }
    return;
  }

  const myGeneration = gameGeneration; // 捕获当前局代号

  clearHintAnimation(getBoardEl());

  const proposedState = applySlide(boardState, group, direction, delta);
  // 只连锁消除移动后"新产生"的配对，不自动消除存量配对
  const waves = resolveNewPairChain(boardState, proposedState);
  let hasMatch = waves.length > 0;
  let wavesToRun = waves;
  let matchedTeachingDrag = false;
  if (hasMatch && isTeachingMode && !teachingCompleted) {
    const expectedPair = getExpectedTeachingDragPair(group, direction, delta, waves);
    matchedTeachingDrag = expectedPair !== null;
    if (expectedPair) {
      wavesToRun = [waveForSinglePair(proposedState, expectedPair)];
    }
  }

  gameState = GAME_STATE.ANIMATING;

  try {
    if (hasMatch) {
      pushUndo(boardState);
      moveCount++;
      const combo = registerCombo(countEliminatedPairs(wavesToRun));
      pairsThisGame += countEliminatedPairs(wavesToRun);
      maxComboThisGame = Math.max(maxComboThisGame, combo.count);
      // 计分：逐波上报（连锁波数递增），并记录本局最长连锁
      if (scoreAcc) {
        let waveIdx = 1;
        for (const wave of wavesToRun) {
          const res = addWave(scoreAcc, {
            pairs: wave.eliminated.length,
            chainIndex: waveIdx,
            comboCount: combo.count,
          });
          scoreAcc = res;
          chainIndex = waveIdx;
          waveIdx++;
        }
        maxChainThisGame = Math.max(maxChainThisGame, chainIndex);
        if (chainIndex >= 5) {
          _triggerAchievements({ event: 'chain', maxChain: chainIndex });
        }
      }
      SoundController.playSlideSuccess();
      await animateSlide(group, direction, delta);

      if (gameGeneration !== myGeneration) return; // 新游戏已启动，放弃
      boardState = proposedState;

      await runEliminationSequence(wavesToRun, (stateAfter) => {
        if (gameGeneration === myGeneration) {
          boardState = stateAfter;
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
      updateUI();
      if (isTeachingMode && !teachingCompleted && !hasMatch) {
        showTeachingTargetHint();
      }
    }
  }

  if (gameGeneration !== myGeneration) return;

  if (hasMatch) {
    persistSave();
    if (advanceTeachingAfterAction('drag', matchedTeachingDrag)) {
      return;
    }
    if (checkVictory(boardState)) {
      showVictory();
      return;
    }
    if (hasMoveBudget(currentMode) && moveCount >= currentMode.moveBudget) {
      finishMoveLimit();
      return;
    }
    if (refreshTeachingAfterFreeAction()) {
      return;
    }
    if (isDeadlock(boardState)) {
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

  // 锤子待选态：点击可消除对即触发锤子消除（复用连锁算子）
  if (pendingHammer) {
    await applyHammerElimination(pair);
    return;
  }

  const matchedTeachingClick = isTeachingMode && !teachingCompleted
    ? isExpectedTeachingClick(pair)
    : false;

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
  const combo = registerCombo(countEliminatedPairs(allWaves));
  // 计分：点击消除作为独立一波（chainIndex=1）
  if (scoreAcc) {
    scoreAcc = addWave(scoreAcc, {
      pairs: 1,
      chainIndex: 1,
      comboCount: combo.count,
    });
    chainIndex = 1;
    maxChainThisGame = Math.max(maxChainThisGame, 1);
  }

  gameState = GAME_STATE.ANIMATING;

  try {
    await runEliminationSequence(allWaves, (stateAfter) => {
      if (gameGeneration === myGeneration) {
        boardState = stateAfter;
      }
    }, combo);
  } finally {
    if (gameGeneration === myGeneration) {
      gameState = GAME_STATE.IDLE;
      updateUI();
    }
  }

  if (gameGeneration !== myGeneration) return;

  persistSave();

  if (advanceTeachingAfterAction('click', matchedTeachingClick)) {
    return;
  }

  if (checkVictory(boardState)) {
    showVictory();
    return;
  }

  if (hasMoveBudget(currentMode) && moveCount >= currentMode.moveBudget) {
    finishMoveLimit();
    return;
  }

  if (refreshTeachingAfterFreeAction()) {
    return;
  }

  if (isDeadlock(boardState)) {
    showDeadlock();
  }
}

// 提示功能
function handleHint() {
  if (gameState !== GAME_STATE.IDLE) return;
  if (!boardState) return;

  clearHintAnimation(getBoardEl());

  // 模式提示限额（null/Infinity = 不限）
  const hintLimit = currentMode && currentMode.hintLimit;
  if (Number.isFinite(hintLimit) && hintCount >= hintLimit) {
    showToast('提示次数已用完');
    return;
  }

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

  // 再查找需要移动的步骤。
  // 能走到这里说明 directPairs 为空，即 hasAnyPair 为 false，
  // 因此 findHint === null 与 isDeadlock(boardState) 等价。
  const hint = findHint(boardState);
  if (hint) {
    // 传入 hint 本身：动画会标记"按住哪张牌、往哪个方向拖"
    animateHint(hint.group, hint);
    updateUI();
  } else {
    // 死局：弹窗询问用户是否重排
    showReshuffleConfirm();
  }
}

// 撤销：增量 diff 渲染，不做全量重建（避免闪烁、丢缓存）
function handleUndo() {
  if (gameState !== GAME_STATE.IDLE) return;
  if (isTeachingMode) return;
  if (undoStack.length === 0) return;

  // 模式撤销限额（null/Infinity = 不限）
  const undoLimit = currentMode && currentMode.undoLimit;
  if (Number.isFinite(undoLimit) && undoUsedThisGame >= undoLimit) {
    showToast('撤销次数已用完');
    return;
  }

  clearHintAnimation(getBoardEl());
  resetCombo();

  const prevState = boardState;
  const prev = undoStack.pop();
  boardState = prev.state;
  moveCount = prev.moveCount;
  hintCount = prev.hintCount;
  undoUsedThisGame++;

  diffRenderBoard(prevState, boardState, getBoardEl());
  updateUI();
  persistSave();
}

// ── 道具系统 ──────────────────────────────────────────────────────────
// showToast 通用提示（复用 flashElement 的定时隐藏逻辑）
function showToast(msg) {
  const el = document.getElementById('toast-msg');
  if (!el) return;
  el.textContent = msg;
  flashElement(el, 2200);
}

// 用道具：成功返回 true，失败返回 false 并提示原因。
// 洗牌/撤销/提示 复用现有能力；锤子进入"待选牌"状态。
function useItem(itemId) {
  if (gameState !== GAME_STATE.IDLE) return false;
  if (!boardState) return false;
  if (!itemStock) itemStock = loadItems();

  // 库存校验
  if (getCount(itemStock, itemId) <= 0) {
    showToast('该道具已用完');
    return false;
  }

  const spent = spendItem(itemStock, itemId);
  if (!spent.ok) return false;
  itemStock = spent.stock;
  saveItems(itemStock);

  switch (itemId) {
    case 'reshuffle':
      pushUndo(boardState);
      resetCombo();
      boardState = reshuffleRemainingTiles(boardState);
      renderBoard(boardState, getBoardEl());
      SoundController.playReshuffle();
      showToast('已重新洗牌');
      break;
    case 'undo':
      if (undoStack.length > 0) {
        const prev = undoStack.pop();
        boardState = prev.state;
        moveCount = prev.moveCount;
        hintCount = prev.hintCount;
        undoUsedThisGame++;
        diffRenderBoard(boardState, prev.state, getBoardEl());
      } else {
        // 撤销栈为空：退到开局（直接重开本局，消耗一个撤销道具）
        showToast('无步骤可撤销，已重置本局');
        initNewGame({ mode: modeId });
      }
      break;
    case 'hint':
      handleHint();
      break;
    case 'hammer':
      pendingHammer = true;
      hammerPairCache = null;
      showToast('点击任意可消除的一对牌');
      break;
    default:
      return false;
  }
  persistSave();
  updateUI();
  return true;
}

// 取消锤子待选态
function cancelHammer() {
  pendingHammer = false;
  hammerPairCache = null;
}

// 触发锤子消除：传入用户点击选中的某一对，消除后自动连锁。
// 返回新 state（经 runEliminationSequence 异步回调更新 boardState）。
async function applyHammerElimination(pair) {
  const myGeneration = gameGeneration;
  pendingHammer = false;
  hammerPairCache = null;

  pushUndo(boardState);
  moveCount++;

  const { a, b } = pair;
  const stateAfterFirst = eliminateTiles(boardState, [
    { row: a.row, col: a.col },
    { row: b.row, col: b.col },
  ]);
  // 锤子复用连锁算子：消除一对后自动跑剩余新配对连锁
  const waves = resolveChainElimination(stateAfterFirst);
  const allWaves = [{ eliminated: [{ a, b }], stateAfter: stateAfterFirst }, ...waves];

  const totalPairs = allWaves.reduce((n, w) => n + w.eliminated.length, 0);
  pairsThisGame += totalPairs;
  const combo = registerCombo(totalPairs);
  maxComboThisGame = Math.max(maxComboThisGame, combo.count);
  // 计分：逐波上报
  if (scoreAcc) {
    let wi = 1;
    for (const w of allWaves) {
      scoreAcc = addWave(scoreAcc, {
        pairs: w.eliminated.length, chainIndex: wi, comboCount: combo.count,
      });
      chainIndex = wi;
      wi++;
    }
    maxChainThisGame = Math.max(maxChainThisGame, chainIndex);
    if (chainIndex >= 5) {
      _triggerAchievements({ event: 'chain', maxChain: chainIndex });
    }
  }

  gameState = GAME_STATE.ANIMATING;
  SoundController.playSlideSuccess();
  try {
    await runEliminationSequence(allWaves, (stateAfter) => {
      if (gameGeneration === myGeneration) boardState = stateAfter;
    }, combo);
  } finally {
    if (gameGeneration === myGeneration) {
      gameState = GAME_STATE.IDLE;
      updateUI();
    }
  }
  if (gameGeneration !== myGeneration) return;

  persistSave();
  if (checkVictory(boardState)) {
    showVictory();
    return;
  }
  if (hasMoveBudget(currentMode) && moveCount >= currentMode.moveBudget) {
    finishMoveLimit();
    return;
  }
  if (isDeadlock(boardState)) {
    showDeadlock();
  }
}

// 关闭所有可能盖住棋盘的覆盖层。
// 快捷键/按钮可以在遮罩打开时程序化触发新游戏，若不统一兜底关闭，
// 新一局会被 z-index 2000 的遮罩盖住，界面直接锁死。
function closeAllOverlays() {
  hideReshuffleConfirm(); // 内部会 resumeTimer
  hideTutorial();         // 内部会 resumeTimer
  hideVictoryScreen();
  hideResumeConfirm();
  cancelHammer();
}

// 新游戏
function handleNewGame() {
  clearHintAnimation(getBoardEl());
  closeAllOverlays();
  leaveTeachingMode();
  initNewGame();
}

function exitTeachingLevel() {
  if (!isTeachingMode) return;
  clearHintAnimation(getBoardEl());
  closeAllOverlays();
  leaveTeachingMode();
  initNewGame();
}

// ── 存档（localStorage）──────────────────────────────────────────────
// 棋盘快照 + 步数 + 用时。刷新/关闭页面后可"继续上一局"。
// 教学模式与胜利状态不存档。

const SAVE_KEY = 'mahjong-save-v2';
const BEST_KEY = 'mahjong-best-v1';

function buildSnapshot() {
  // 倒计时模式下 elapsed 用"已消耗秒"，正计时用 getElapsedSeconds
  const elapsed = hasTimeBudget(currentMode)
    ? Math.max(0, currentMode.timeBudget - getRemainingSeconds())
    : getElapsedSeconds();
  return {
    version: 2,
    width: boardState.width,
    height: boardState.height,
    grid: boardState.grid,
    moveCount,
    hintCount,
    elapsed,
    modeId,
    levelId: currentLevel ? currentLevel.id : null,
    scoreAcc,
    undoUsedThisGame,
    maxChainThisGame,
    savedAt: Date.now(),
  };
}

function persistSave() {
  if (!boardState || isTeachingMode) return;
  if (gameState === GAME_STATE.VICTORY) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSnapshot()));
  } catch (e) { /* 隐私模式或存储不可用 */ }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}

function loadSaveSnapshot() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap) return null;
    if (snap.version !== 2 && snap.version !== 1) return null;
    if (!Number.isInteger(snap.width) || !Number.isInteger(snap.height)) return null;
    if (!Array.isArray(snap.grid) || snap.grid.length !== snap.height) return null;
    return snap;
  } catch (e) {
    return null;
  }
}

// 从存档快照恢复棋盘与计数（不含计时器 —— 由调用方 startTimerFromElapsed 接管）
function restoreFromSnapshot(snap) {
  gameGeneration++; // 使仍在飞行中的旧 async 任务全部失效
  leaveTeachingMode();
  closeAllOverlays();

  setBoardLayout(snap.width, snap.height);
  recalcTileSizeOnly(snap.width, snap.height);

  // 恢复模式与计分（v1 存档缺省 classic / 空计分）
  const savedMode = getMode(snap.modeId);
  modeId = savedMode.id;
  currentMode = MODES[modeId];
  // 关卡模式：恢复关卡并应用限额
  currentLevel = snap.levelId ? getLevel(snap.levelId) : null;
  if (currentLevel) {
    currentMode = {
      ...currentMode,
      moveBudget: currentLevel.moveBudget,
      hintLimit: currentLevel.hintLimit,
      undoLimit: currentLevel.undoLimit,
      scoring: true,
      isLevel: true,
    };
    modeId = 'level';
  }
  scoreAcc = (snap.scoreAcc && typeof snap.scoreAcc === 'object')
    ? {
        total: snap.scoreAcc.total || 0,
        pairs: snap.scoreAcc.pairs || 0,
        maxChain: snap.scoreAcc.maxChain || 0,
        maxCombo: snap.scoreAcc.maxCombo || 0,
        waves: snap.scoreAcc.waves || 0,
        comboBonus: snap.scoreAcc.comboBonus || 0,
      }
    : createScore();
  chainIndex = 0;
  maxChainThisGame = snap.maxChainThisGame || 0;
  undoUsedThisGame = snap.undoUsedThisGame || 0;
  pendingHammer = false;
  hammerPairCache = null;
  timedOut = false;
  itemStock = loadItems();

  boardState = { grid: snap.grid, width: snap.width, height: snap.height };
  moveCount = snap.moveCount || 0;
  hintCount = snap.hintCount || 0;
  undoStack = []; // 撤销栈不入档，恢复后从当前局面重新开始
  resetCombo();
  gameState = GAME_STATE.IDLE;

  renderBoard(boardState, getBoardEl());
  updateUI();
}

// 记录/更新最佳成绩（最短用时、最少步数、局数）
function recordBest(elapsedSecs, moves) {
  try {
    const prev = JSON.parse(localStorage.getItem(BEST_KEY) || 'null') || {};
    const best = {
      bestTime: Math.min(prev.bestTime == null ? Infinity : prev.bestTime, elapsedSecs),
      bestMoves: Math.min(prev.bestMoves == null ? Infinity : prev.bestMoves, moves),
      games: (prev.games || 0) + 1,
    };
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
    return best;
  } catch (e) {
    return null;
  }
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

  // 步数：步数模式显示"剩余步数"，其余显示已用步数
  const moveRemaining = getMoveRemaining();
  const moveLabel = document.getElementById('move-count');
  if (moveLabel) {
    const text = moveRemaining != null ? `${moveRemaining}（剩）` : String(moveCount);
    if (moveLabel.textContent !== text) {
      moveLabel.textContent = text;
      moveLabel.classList.remove('stat-pop');
      void moveLabel.offsetWidth;
      moveLabel.classList.add('stat-pop');
    }
  }

  setCounterText('hint-count', hintCount);

  // 得分显示（计分模式）
  const scoreEl = document.getElementById('score-count');
  if (scoreEl) {
    const total = scoreAcc ? scoreAcc.total : 0;
    scoreEl.textContent = String(total);
  }

  // 模式按钮文案
  const modeBtn = document.getElementById('btn-mode');
  if (modeBtn && currentMode) {
    modeBtn.textContent = currentMode.name;
  }
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

// 统一停止本局计时：正计时返回已用秒，倒计时返回剩余秒（限时模式结算用）
let _lastCountdownRemaining = 0; // 停止倒计时时缓存剩余秒（供结算读取）
function stopGameTimer() {
  if (hasTimeBudget(currentMode)) {
    const remaining = stopCountdown();
    _lastCountdownRemaining = remaining;
    // 已用秒 = 总预算 - 剩余
    return Math.max(0, currentMode.timeBudget - remaining);
  }
  return stopTimer();
}

// 计算本局计分结算（供胜利/超时/步数上限统一调用）
function computeSettlement() {
  if (!scoreAcc || !currentMode || !currentMode.scoring) {
    return null;
  }
  // 关卡模式用关卡星级门槛；其余模式用默认比例门槛
  const thresholds = currentLevel
    ? levelStarThresholds(currentLevel, idealScoreForLevel())
    : defaultStarThresholds();
  const moveRemaining = hasMoveBudget(currentMode)
    ? Math.max(0, currentMode.moveBudget - moveCount)
    : null;
  const secondRemaining = hasTimeBudget(currentMode)
    ? Math.max(0, _lastCountdownRemaining)
    : null;
  return settleScore({
    acc: scoreAcc,
    moveRemaining,
    secondRemaining,
    starThresholds: thresholds,
  });
}

// 关卡的"理想满分"估算：满盘每对 100 + 步数奖励近似
function idealScoreForLevel() {
  if (!currentLevel || !boardState) return 0;
  const pairCount = (currentLevel.cols * currentLevel.rows) / 2;
  return pairCount * 100 + (currentLevel.moveBudget != null ? currentLevel.moveBudget * 10 : 0);
}

// 结算展示辅助：填充胜利界面的分数与星级行
function renderSettlementIntoVictory(settlement, mode) {
  if (!settlement || !mode) return;
  const scoreEl = document.getElementById('victory-score-display');
  if (scoreEl) {
    const bonus = settlement.breakdown.steps + settlement.breakdown.time;
    const bonusText = bonus > 0 ? `（含奖励 +${bonus}）` : '';
    scoreEl.textContent = `得分：${settlement.total}${bonusText}`;
  }
  const starsEl = document.getElementById('victory-stars-display');
  if (starsEl) {
    starsEl.textContent = '★'.repeat(settlement.stars) + '☆'.repeat(3 - settlement.stars);
    starsEl.dataset.stars = String(settlement.stars);
  }
}

// 限时模式超时结算（未通关，按当前得分结算并展示失败信息）
function finishTimedOut() {
  if (timedOut) return;
  timedOut = true;
  const elapsed = currentMode.timeBudget; // 已用完整个预算
  const remaining = stopCountdown();
  _lastCountdownRemaining = 0; // 超时剩余 0 秒（无时间奖励）
  recordGameResult({
    won: false, elapsed, moves: moveCount,
    pairs: pairsThisGame, maxCombo: maxComboThisGame, hints: hintCount,
  });
  const settlement = computeSettlement();
  if (settlement) {
    recordScore({ mode: modeId, total: settlement.total, stars: settlement.stars, elapsed, moves: moveCount });
  }
  _triggerAchievements({ event: 'victory', won: false, mode: modeId, isLevel: !!currentLevel,
    stars: 0, moves: moveCount, hints: hintCount, undoUsed: undoUsedThisGame,
    isDaily: modeId === 'daily' });
  gameState = GAME_STATE.VICTORY;
  SoundController.playVictory();
  clearSave();
  showResultScreen({
    title: '时间到',
    subtitle: '未能在限时内清盘',
    elapsed, remaining,
    settlement, mode: currentMode,
  });
}

// 步数模式达上限结算（未通关）
function finishMoveLimit() {
  const elapsed = stopGameTimer();
  recordGameResult({
    won: false, elapsed, moves: moveCount,
    pairs: pairsThisGame, maxCombo: maxComboThisGame, hints: hintCount,
  });
  const settlement = computeSettlement();
  if (settlement) {
    recordScore({ mode: modeId, total: settlement.total, stars: settlement.stars, elapsed, moves: moveCount });
  }
  _triggerAchievements({ event: 'victory', won: false, mode: modeId, isLevel: !!currentLevel,
    stars: 0, moves: moveCount, hints: hintCount, undoUsed: undoUsedThisGame,
    isDaily: modeId === 'daily' });
  gameState = GAME_STATE.VICTORY;
  SoundController.playVictory();
  clearSave();
  showResultScreen({
    title: '步数用尽',
    subtitle: `已达 ${currentMode.moveBudget} 步上限`,
    elapsed, remaining: null,
    settlement, mode: currentMode,
  });
}

// 通用结算界面（胜利/超时/步数上限共用）
function showResultScreen({ title, subtitle, elapsed, remaining, settlement, mode }) {
  const screen = document.getElementById('victory-screen');
  if (!screen) return;
  const titleEl = screen.querySelector('h2');
  if (titleEl) titleEl.textContent = title;
  const subEl = screen.querySelector('.victory-subtitle');
  if (subEl) subEl.textContent = subtitle || '所有麻将已全部消除';
  const timeEl = document.getElementById('victory-time-display');
  if (timeEl) timeEl.textContent = remaining != null
    ? `剩余：${formatTime(remaining)}`
    : `用时：${formatTime(elapsed)}`;
  const moveEl = document.getElementById('victory-move-display');
  if (moveEl) moveEl.textContent = `有效操作：${moveCount} 步`;
  const hintEl = document.getElementById('victory-hint-display');
  if (hintEl) hintEl.textContent = `使用提示：${hintCount} 次`;
  const bestEl = document.getElementById('victory-best-display');
  if (bestEl) bestEl.textContent = '';
  renderSettlementIntoVictory(settlement, mode);
  screen.classList.remove('hidden');
}

// 胜利界面
function showVictory() {
  gameState = GAME_STATE.VICTORY;
  SoundController.playVictory();
  const elapsed = stopGameTimer();
  const best = recordBest(elapsed, moveCount);
  clearSave(); // 通关即清档
  // 跨局统计上报（胜利局，累计消除/连击/用时/步数）
  recordGameResult({
    won: true,
    elapsed,
    moves: moveCount,
    pairs: pairsThisGame,
    maxCombo: maxComboThisGame,
    hints: hintCount,
  });
  // 计分结算（计分模式）
  const settlement = computeSettlement();
  if (settlement) {
    recordScore({ mode: modeId, total: settlement.total, stars: settlement.stars, elapsed, moves: moveCount });
  }
  // 关卡：记录通关星级并解锁下一关
  if (currentLevel && settlement) {
    const prog = loadProgress();
    saveProgress(recordLevelResult(prog, currentLevel.id, settlement.stars));
  }
  // 成就触发（胜利/连锁/累计消除）
  _triggerAchievements({ event: 'victory', won: true, mode: modeId, isLevel: !!currentLevel,
    stars: settlement ? settlement.stars : 0, moves: moveCount, hints: hintCount,
    undoUsed: undoUsedThisGame, isDaily: modeId === 'daily' });
  confetti(); // 通关彩带（Canvas 层，reduced-motion 自动禁用）
  showResultScreen({
    title: '恭喜通关！',
    subtitle: '所有麻将已全部消除',
    elapsed, remaining: null,
    settlement, mode: currentMode,
  });
  const bestEl = document.getElementById('victory-best-display');
  if (bestEl && best) {
    bestEl.textContent = `最佳：${formatTime(best.bestTime)} · 最少 ${best.bestMoves} 步 · 第 ${best.games} 局`;
  }
}

// 成就触发统一入口：合并跨局统计 + 本局快照，判定并 toast 通知
function _triggerAchievements(ctx) {
  const stats = { victories: 0, totalPairs: 0 };
  try {
    const raw = localStorage.getItem('mahjong-stats-v1');
    if (raw) {
      const p = JSON.parse(raw);
      stats.victories = p.victories || 0;
      stats.totalPairs = p.totalPairs || 0;
    }
  } catch (e) { /* ignore */ }
  recordEvent(ctx, stats, (ach) => showToast(`🎉 成就达成：${ach.name}`));
  // 关卡专属成就：任一 3 星 / 全部通关（需要 event:'level' 快照）
  if (currentLevel && ctx.won) {
    const prog = loadProgress();
    const allDone = _allLevelsDone(prog);
    recordEvent({ event: 'level', starsCount: ctx.stars || 0, levelId: currentLevel.id, allLevelsDone: allDone },
      stats, (ach) => showToast(`🎉 成就达成：${ach.name}`));
  }
}

// 是否已全部 12 关通关（每关都记录过星级）
function _allLevelsDone(progress) {
  if (!progress || !progress.stars) return false;
  for (let i = 1; i <= 12; i++) {
    if (!(progress.stars[i])) return false;
  }
  return true;
}

function hideVictoryScreen() {
  const screen = document.getElementById('victory-screen');
  if (screen) screen.classList.add('hidden');
}

// 死局提示
// 临时提示的自动隐藏：句柄必须保存，否则重复触发会叠加定时器，
// 后启动的 3s 定时器把先到的顶掉，提示提前消失。
const _flashTimers = new Map();

function flashElement(el, durationMs) {
  if (!el) return;
  const prev = _flashTimers.get(el);
  if (prev) clearTimeout(prev);
  el.classList.remove('hidden');
  _flashTimers.set(el, setTimeout(() => {
    el.classList.add('hidden');
    _flashTimers.delete(el);
  }, durationMs));
}

// 死局提示
function showDeadlock() {
  flashElement(document.getElementById('deadlock-msg'), 3000);
}

// 重排提示
function showReshuffle() {
  flashElement(document.getElementById('reshuffle-msg'), 3000);
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
  renderBoard(boardState, getBoardEl());
  updateUI();
  SoundController.playReshuffle();
  showReshuffle();
  persistSave();
}

// "继续上一局"弹窗（进入对局前弹出，此时计时器尚未启动）
function showResumeConfirm(snap) {
  const dialog = document.getElementById('resume-confirm');
  if (!dialog) return false;
  const desc = document.getElementById('resume-desc');
  if (desc) {
    let remaining = 0;
    for (const row of snap.grid) for (const t of row) if (t) remaining++;
    desc.textContent = `剩余 ${remaining} 张 · 已用 ${formatTime(snap.elapsed || 0)} · 步数 ${snap.moveCount || 0}`;
  }
  dialog.classList.remove('hidden');
  return true;
}

function hideResumeConfirm() {
  const dialog = document.getElementById('resume-confirm');
  if (dialog) dialog.classList.add('hidden');
}

// 旋转屏幕提示（仅提示，不强制开新局）
function showRotateHint() {
  flashElement(document.getElementById('rotate-hint'), 5000);
}

export {
  gameState, boardState, moveCount, hintCount,
  getState, getPhase, isTeachingModeActive,
  initNewGame, startTeachingLevel, exitTeachingLevel,
  handleDragEnd, handleTileClick,
  handleHint, handleUndo, handleNewGame,
  doReshuffle, hideReshuffleConfirm, showRotateHint,
  refreshTeachingHighlights,
  pushUndo, updateUI, showVictory, hideVictoryScreen,
  showDeadlock, showReshuffle, showReshuffleConfirm,
  getBoardEl,
  persistSave, clearSave, loadSaveSnapshot, restoreFromSnapshot,
  showResumeConfirm, hideResumeConfirm,
  // P1 游戏性：模式/计分/道具
  getModeInfo, getScoreInfo, getItems, isHammerPending, getMoveRemaining,
  useItem, cancelHammer, finishTimedOut,
  // P2 长线：关卡
  getLevelInfo,
};
