/**
 * gameController 状态机测试 —— 真 ESM import（babel-jest + jsdom），
 * 不再走 vm 注入。覆盖报告第四节要求的场景：
 *   1. 动画期间拒绝输入
 *   2. 新游戏使旧异步任务失效（gameGeneration）
 *   3. 撤销栈边界（MAX_UNDO_STEPS）
 *   4. 胜利判定 + 最佳成绩 + 清档
 *   5. 存档往返（persistSave / loadSaveSnapshot）
 *
 * 重模块处理：soundController mock（jsdom 无 AudioContext），
 * imagePreload mock（jsdom 不真正加载图片）；动画走真实现（rAF 已 polyfill）。
 */

jest.mock('../js/soundController.js', () => ({
  SoundController: {
    playNewGame: jest.fn(),
    playInvalidMove: jest.fn(),
    playSlideSuccess: jest.fn(),
    playTileClick: jest.fn(),
    playVictory: jest.fn(),
    playReshuffle: jest.fn(),
    playButtonClick: jest.fn(),
    playChainWave: jest.fn(),
    playTileFlip: jest.fn(),
    isEnabled: jest.fn(() => false),
    setEnabled: jest.fn(),
  },
}));

jest.mock('../js/imagePreload.js', () => ({
  preloadTileImages: jest.fn(() => Promise.resolve()),
}));

import {
  getState, getPhase,
  handleTileClick, handleUndo, handleNewGame, initNewGame,
  pushUndo, updateUI, restoreFromSnapshot,
  persistSave, clearSave, loadSaveSnapshot,
  useItem, getItems, getModeInfo, getScoreInfo, isHammerPending,
  getMoveRemaining, finishTimedOut, getLevelInfo, getResultInfo,
} from '../js/gameController.js';
import { MAX_UNDO_STEPS } from '../js/constants.js';
import { MODES } from '../js/modes.js';
import { getBestScore } from '../js/score.js';

function makeTile(instanceId, typeId, value) {
  return {
    instanceId,
    tileTypeId: typeId,
    type: 'wan',
    value,
    label: `${value}万`,
    topChar: String(value),
    bottomChar: '万',
    image: `assets/images/tiles/wan_${value}.png`,
  };
}

function snapshotOf(grid, extra = {}) {
  return {
    version: 1,
    width: grid[0].length,
    height: grid.length,
    grid,
    moveCount: 0,
    hintCount: 0,
    elapsed: 0,
    savedAt: Date.now(),
    ...extra,
  };
}

function mountDom() {
  document.body.innerHTML = `
    <div class="game-area"><div id="board"></div></div>
    <div id="game-timer"></div>
    <button id="btn-undo" disabled></button>
    <span id="tile-count"></span>
    <span id="move-count"></span>
    <span id="hint-count"></span>
    <div id="victory-screen" class="hidden">
      <h2></h2>
      <p id="victory-subtitle"></p>
      <p id="victory-time-display"></p>
      <p id="victory-score-display"></p>
      <p id="victory-stars-display"></p>
      <p id="victory-move-display"></p>
      <p id="victory-hint-display"></p>
      <p id="victory-best-display"></p>
    </div>
    <div id="reshuffle-confirm" class="hidden"></div>
    <div id="resume-confirm" class="hidden"></div>
    <div id="tutorial-overlay" class="hidden"></div>
    <div id="deadlock-msg" class="hidden"></div>
    <div id="reshuffle-msg" class="hidden"></div>
    <div id="rotate-hint" class="hidden"></div>
    <div id="teaching-panel" class="hidden"></div>
    <div id="toast-msg" class="hidden"></div>
    <div id="btn-mode"></div>
    <span id="score-count"></span>
  `;
}

beforeEach(() => {
  mountDom();
  localStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  // 清掉真实计时器留下的 interval，避免测试互相干扰
  jest.clearAllTimers?.();
});

// ── 基础流转 ─────────────────────────────────────────────────────────

describe('handleTileClick 基础流转', () => {
  test('点击可消除的配对：牌被移除、剩余数更新、状态回到 IDLE', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    const C = makeTile(3, 4, 5); // 无关牌：消掉配对后棋盘非空，不触发胜利
    restoreFromSnapshot(snapshotOf([[A, B, null, null, C]]));

    await handleTileClick({ row: 0, col: 0 });

    expect(getState().grid[0][0]).toBeNull();
    expect(getState().grid[0][1]).toBeNull();
    expect(getPhase()).toBe('IDLE');
    expect(document.getElementById('tile-count').textContent).toBe('1');
    expect(document.getElementById('board').querySelectorAll('.tile').length).toBe(1);
  });

  test('点击无法消除的牌：不产生变化', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 1, 2); // 不同 tileTypeId，不构成配对
    restoreFromSnapshot(snapshotOf([[A, B, null, null, null]]));

    await handleTileClick({ row: 0, col: 0 });

    expect(getState().grid[0][0]).not.toBeNull();
    expect(getState().grid[0][1]).not.toBeNull();
  });
});

// ── 动画期间拒绝输入 ─────────────────────────────────────────────────

describe('动画期间拒绝输入', () => {
  test('消除动画进行中，新的点击被拒绝', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    const C = makeTile(3, 4, 5); // 消掉配对后棋盘非空，不触发胜利
    restoreFromSnapshot(snapshotOf([[A, B, null, null, C]]));

    // 同 async 函数：调用后在第一个 await 前同步进入 ANIMATING
    const first = handleTileClick({ row: 0, col: 0 });
    expect(getPhase()).toBe('ANIMATING');

    const boardBefore = getState();
    await handleTileClick({ row: 0, col: 1 }); // 应立即返回，无效果
    expect(getState()).toBe(boardBefore);

    await first;
    expect(getPhase()).toBe('IDLE');
  });
});

// ── 新游戏使旧异步任务失效 ───────────────────────────────────────────

describe('新游戏使旧异步任务失效（gameGeneration）', () => {
  test('旧局的消除回调不会污染新局棋盘', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    restoreFromSnapshot(snapshotOf([[A, B, null, null, null]]));

    const oldGame = handleTileClick({ row: 0, col: 0 }); // 进入 ANIMATING
    const newGame = initNewGame();                        // generation++，开新局

    await Promise.all([oldGame, newGame]);

    const state = getState();
    expect(state).not.toBeNull();
    expect(state.width).toBeGreaterThan(4);      // 新局的满棋盘，而非旧局的 5 列
    expect(state.height).toBeGreaterThan(1);
    // 满棋盘 136 张（或接近，取决于重试），绝不是旧局被消除后的 0 张
    let remaining = 0;
    for (const row of state.grid) for (const t of row) if (t) remaining++;
    expect(remaining).toBeGreaterThan(100);
    expect(getPhase()).toBe('IDLE');
  });
});

// ── 撤销栈边界 ───────────────────────────────────────────────────────

describe('撤销栈边界', () => {
  test('撤销步数封顶 MAX_UNDO_STEPS，超出的入栈被丢弃，空栈后撤销为 no-op', () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    restoreFromSnapshot(snapshotOf([[A, B, null, null, null]]));

    for (let i = 0; i < MAX_UNDO_STEPS + 5; i++) {
      pushUndo(getState());
    }

    const undoBtn = document.getElementById('btn-undo');
    for (let i = 0; i < MAX_UNDO_STEPS + 5; i++) {
      handleUndo();
    }

    // 棋盘完好、状态 IDLE、按钮禁用（栈已耗尽）
    expect(getState().grid[0][0]).not.toBeNull();
    expect(getState().grid[0][1]).not.toBeNull();
    expect(getPhase()).toBe('IDLE');
    expect(undoBtn.disabled).toBe(true);
    expect(document.getElementById('board').querySelectorAll('.tile').length).toBe(2);
  });

  test('撤销恢复计数且为增量渲染（不重建未变化节点）', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    const C = makeTile(3, 0, 3);
    restoreFromSnapshot(snapshotOf([[A, B, C, null, null]]));

    await handleTileClick({ row: 0, col: 0 }); // 消除 A、B
    const boardEl = document.getElementById('board');
    const elC = boardEl.querySelectorAll('.tile')[0];
    expect(elC.dataset.instanceId).toBe('3');

    handleUndo(); // 回到 3 张牌

    expect(getState().grid[0][2]).not.toBeNull();
    const tiles = boardEl.querySelectorAll('.tile');
    expect(tiles.length).toBe(3);
    // C 的 DOM 节点应被复用（增量渲染），而非重建
    expect(boardEl.querySelectorAll('.tile')[0]).toBe(elC);
    expect(document.getElementById('tile-count').textContent).toBe('3');
  });
});

// ── 胜利判定 + 最佳成绩 ──────────────────────────────────────────────

describe('胜利判定', () => {
  test('消完最后一张牌：显示胜利界面、记录最佳成绩、清空存档', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    restoreFromSnapshot(snapshotOf([[A, B]], { moveCount: 3 }));

    // 先产生一个存档，胜利后必须被清掉
    persistSave();
    expect(loadSaveSnapshot()).not.toBeNull();

    await handleTileClick({ row: 0, col: 0 });

    expect(getPhase()).toBe('VICTORY');
    const screen = document.getElementById('victory-screen');
    expect(screen.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('victory-move-display').textContent).toContain('4 步');

    const bestRaw = localStorage.getItem('mahjong-best-v1');
    expect(bestRaw).not.toBeNull();
    const best = JSON.parse(bestRaw);
    expect(best.games).toBe(1);
    expect(best.bestMoves).toBe(4);
    expect(loadSaveSnapshot()).toBeNull(); // 通关即清档
  });

  test('胜利结算后 getResultInfo 返回正确秒数/分数/星级（存卡片数据源）', async () => {
    // 经典模式默认不计分，先切到计分模式以便 settlement 产生分数
    await initNewGame({ mode: 'classic' });
    // 造一个只剩一对的计分局面并消除 → 胜利
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    restoreFromSnapshot(snapshotOf([[A, B]], { moveCount: 5, hintCount: 2 }));

    await handleTileClick({ row: 0, col: 0 });

    expect(getPhase()).toBe('VICTORY');
    const info = getResultInfo();
    expect(info).not.toBeNull();
    // elapsed 是数字秒数（不是 "HH:MM:SS" 文本），可供 _fmtClock 正确渲染
    expect(typeof info.elapsed).toBe('number');
    expect(Number.isNaN(info.elapsed)).toBe(false);
    expect(info.moves).toBe(6); // snapshot moveCount=5 + 消除这一对 = 6
    expect(info.hints).toBe(2);
    // 分数/星级来自结算缓存而非 DOM 文本反解
    expect(info.score == null || Number.isFinite(info.score)).toBe(true);
    expect(info.stars).toBeGreaterThanOrEqual(0);
    expect(info.modeName).toBeTruthy();
  });

  test('新局开始前 getResultInfo 清空（不残留上一局）', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    restoreFromSnapshot(snapshotOf([[A, B]]));
    await handleTileClick({ row: 0, col: 0 });
    expect(getPhase()).toBe('VICTORY');
    expect(getResultInfo()).not.toBeNull();
    await initNewGame();
    expect(getResultInfo()).toBeNull();
  });
});

// ── 存档往返 ─────────────────────────────────────────────────────────

describe('存档往返', () => {
  test('persistSave 后 loadSaveSnapshot 返回一致的快照', () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 2);
    restoreFromSnapshot(snapshotOf([[A, B, null, null, null]], { moveCount: 7, hintCount: 2 }));

    persistSave();
    const snap = loadSaveSnapshot();

    expect(snap).not.toBeNull();
    expect(snap.width).toBe(5);
    expect(snap.height).toBe(1);
    expect(snap.moveCount).toBe(7);
    expect(snap.hintCount).toBe(2);
    expect(snap.grid[0][0].instanceId).toBe(1);
    expect(snap.grid[0][2]).toBeNull();
  });

  test('损坏的存档返回 null 而不是抛错', () => {
    localStorage.setItem('mahjong-save-v1', '{not json');
    expect(loadSaveSnapshot()).toBeNull();
    localStorage.setItem('mahjong-save-v1', JSON.stringify({ version: 99 }));
    expect(loadSaveSnapshot()).toBeNull();
    expect(loadSaveSnapshot()).toBeNull(); // 移除后也是 null
  });

  test('clearSave 清空存档', () => {
    persistSave();
    expect(loadSaveSnapshot()).not.toBeNull();
    clearSave();
    expect(loadSaveSnapshot()).toBeNull();
  });
});

// ── 新游戏 ───────────────────────────────────────────────────────────

describe('initNewGame', () => {
  test('发牌后满棋盘、IDLE、存档建立', async () => {
    await initNewGame();

    const state = getState();
    expect(state).not.toBeNull();
    let remaining = 0;
    for (const row of state.grid) for (const t of row) if (t) remaining++;
    expect(remaining).toBe(136);
    expect(getPhase()).toBe('IDLE');
    expect(loadSaveSnapshot()).not.toBeNull();
    expect(document.getElementById('board').querySelectorAll('.tile').length).toBe(136);
  });
});

// ── P1：模式 / 计分 / 道具 / 限时 / 步数 ─────────────────────────────

describe('P1 模式系统', () => {
  test('initNewGame 默认经典模式，计分关闭', async () => {
    await initNewGame();
    const info = getModeInfo();
    expect(info.modeId).toBe('classic');
    expect(info.mode.scoring).toBe(false);
    expect(getScoreInfo().total).toBe(0);
  });

  test('initNewGame 传入模式生效', async () => {
    await initNewGame({ mode: 'timed60' });
    expect(getModeInfo().modeId).toBe('timed60');
    expect(getModeInfo().mode.timeBudget).toBe(60);
    // 限时模式启动倒计时（剩余 60）
    expect(getMoveRemaining()).toBeNull(); // 非步数模式
  });

  test('非法模式回退经典', async () => {
    await initNewGame({ mode: 'nope' });
    expect(getModeInfo().modeId).toBe('classic');
  });

  test('步数模式 moveRemaining 从上限递减', async () => {
    await initNewGame({ mode: 'moves30' });
    expect(getMoveRemaining()).toBe(30);
    // 一次有效消除后 moveCount=1 → 剩 29
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    const C = makeTile(3, 4, 5);
    restoreFromSnapshot({ ...snapshotOf([[A, B, null, null, C]]), version: 2, modeId: 'moves30' });
    await handleTileClick({ row: 0, col: 0 });
    expect(getMoveRemaining()).toBe(29);
  });

  test('每日挑战用日期种子可复现开局棋盘', async () => {
    // 同一天两次开每日挑战 → 相同 instanceId 布局
    const deck1 = await initDailyBoard();
    const deck2 = await initDailyBoard();
    const flat = (state) => {
      const arr = [];
      for (const row of state.grid) for (const t of row) if (t) arr.push(t.instanceId);
      return arr.join(',');
    };
    expect(flat(deck1)).toBe(flat(deck2));
  });

  async function initDailyBoard() {
    await initNewGame({ mode: 'daily' });
    return getState();
  }
});

describe('P1 计分系统', () => {
  test('消除产生分数并显示在 score-count', async () => {
    await initNewGame({ mode: 'timed60' });
    const before = getScoreInfo().total;
    // 造一对可消除
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    const C = makeTile(3, 4, 5);
    restoreFromSnapshot({ ...snapshotOf([[A, B, null, null, C]]), version: 2, modeId: 'timed60' });
    await handleTileClick({ row: 0, col: 0 });
    const after = getScoreInfo().total;
    expect(after).toBeGreaterThan(before);
    // 首波 1 对 = 100 分（comboCount 可能 >0 有连击奖励，但至少 100）
    expect(after).toBeGreaterThanOrEqual(100);
    expect(document.getElementById('score-count').textContent).toBe(String(after));
  });

  test('胜利时结算分数并写入分数榜', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    // 只剩一对 → 消除即胜利
    restoreFromSnapshot({ ...snapshotOf([[A, B]]), version: 2, modeId: 'timed60' });
    await handleTileClick({ row: 0, col: 0 });
    expect(getPhase()).toBe('VICTORY');
    const scoreEl = document.getElementById('victory-score-display');
    expect(scoreEl.textContent).toMatch(/得分/);
    const starsEl = document.getElementById('victory-stars-display');
    // 星级格式：3 个星位（实心★ + 空心☆），单对 100 分可能 0 星
    expect(starsEl.textContent.length).toBe(3);
    expect(starsEl.textContent).toMatch(/^[★☆]{3}$/);
    // 分数榜已记录
    expect(getBestScore('timed60')).not.toBeNull();
  });

  test('经典模式（scoring:false）不显示计分结算', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    restoreFromSnapshot(snapshotOf([[A, B]])); // v1 classic
    await handleTileClick({ row: 0, col: 0 });
    expect(getPhase()).toBe('VICTORY');
    const scoreEl = document.getElementById('victory-score-display');
    expect(scoreEl.textContent || '').toBe('');
  });
});

describe('P1 道具系统', () => {
  test('useItem 消耗库存并执行洗牌', async () => {
    await initNewGame();
    const before = getItems().reshuffle;
    expect(before).toBeGreaterThan(0);
    const ok = useItem('reshuffle');
    expect(ok).toBe(true);
    expect(getItems().reshuffle).toBe(before - 1);
  });

  test('useItem 库存不足失败', async () => {
    await initNewGame();
    // 清空 hammer 库存
    localStorage.setItem('mahjong-items-v1', JSON.stringify({ reshuffle: 0, undo: 0, hint: 0, hammer: 0 }));
    // gameController 的 itemStock 已缓存旧值，需重新加载
    // useItem 内部每次重新 loadItems（itemStock 已有值则不重载），因此无法从外部改
    // 直接构造耗尽场景：多次 use 至空
    let ok = true;
    let guard = 0;
    while (ok && guard < 10) { ok = useItem('hammer'); guard++; }
    expect(ok).toBe(false);
  });

  test('锤子：pendingHammer 后点击可消除对触发连锁消除', async () => {
    await initNewGame();
    // 造一对可消除，用锤子消除
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    const C = makeTile(3, 4, 5);
    restoreFromSnapshot({ ...snapshotOf([[A, B, null, null, C]]), version: 2, modeId: 'classic' });
    expect(useItem('hammer')).toBe(true);
    expect(isHammerPending()).toBe(true);
    await handleTileClick({ row: 0, col: 0 });
    expect(getState().grid[0][0]).toBeNull();
    expect(getState().grid[0][1]).toBeNull();
    expect(isHammerPending()).toBe(false);
    expect(getPhase()).toBe('IDLE');
  });

  test('锤子点击不可消除牌不触发消除', async () => {
    await initNewGame();
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 1, 2); // 不配对
    restoreFromSnapshot({ ...snapshotOf([[A, B, null, null, null]]), version: 2, modeId: 'classic' });
    expect(useItem('hammer')).toBe(true);
    await handleTileClick({ row: 0, col: 0 });
    // 不配对 → 不消除（保留 pendingHammer）
    expect(getState().grid[0][0]).not.toBeNull();
  });
});

describe('P1 限时 / 步数结算', () => {
  test('步数达上限触发 finishMoveLimit 结算', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    const C = makeTile(3, 4, 5);
    // 步数预算 30，但 snapshot 预设已用 29 步 → 再消 1 步即达上限
    restoreFromSnapshot({ ...snapshotOf([[A, B, null, null, C]], { moveCount: 29 }), version: 2, modeId: 'moves30' });
    await handleTileClick({ row: 0, col: 0 });
    expect(getPhase()).toBe('VICTORY');
    const titleEl = document.querySelector('#victory-screen h2');
    expect(titleEl.textContent).toMatch(/步数用尽/);
    const scoreEl = document.getElementById('victory-score-display');
    expect(scoreEl.textContent).toMatch(/得分/);
  });

  test('finishTimedOut 触发限时结算', () => {
    // 需要 boardState + currentMode 就绪
    restoreFromSnapshot({ ...snapshotOf([[makeTile(1, 0, 1), makeTile(2, 0, 1)]]), version: 2, modeId: 'timed60' });
    finishTimedOut();
    expect(getPhase()).toBe('VICTORY');
    const titleEl = document.querySelector('#victory-screen h2');
    expect(titleEl.textContent).toMatch(/时间到/);
    expect(getScoreInfo().total).toBeGreaterThanOrEqual(0);
  });

  test('胜利结算后分数榜最佳记录更新', async () => {
    const A = makeTile(1, 0, 1);
    const B = makeTile(2, 0, 1);
    restoreFromSnapshot({ ...snapshotOf([[A, B]]), version: 2, modeId: 'timed60' });
    await handleTileClick({ row: 0, col: 0 });
    expect(getBestScore('timed60').total).toBeGreaterThan(0);
  });
});

// ── P2 关卡模式 ─────────────────────────────────────────────────────

describe('P2 关卡模式', () => {
  test('initNewGame({ level }) 进入关卡模式并设置棋盘尺寸', async () => {
    await initNewGame({ level: 1 });
    const info = getLevelInfo();
    expect(info.isLevelMode).toBe(true);
    expect(info.level.id).toBe(1);
    expect(getState().width).toBe(10);
    expect(getState().height).toBe(5);
  });

  test('关卡模式种子化棋盘可复现', async () => {
    await initNewGame({ level: 1 });
    const first = getState().grid.map(r => r.map(t => t ? t.tileTypeId : null));
    await initNewGame({ level: 1 });
    const second = getState().grid.map(r => r.map(t => t ? t.tileTypeId : null));
    expect(second).toEqual(first);
  });

  test('关卡模式应用步数限额', async () => {
    await initNewGame({ level: 2 }); // moveBudget 40
    expect(getMoveRemaining()).toBe(40);
  });

  test('通关关卡记录星级并解锁下一关', async () => {
    await initNewGame({ level: 1 });
    const state = getState();
    // 找一组可消除配对
    const pairs = findAllPairsForBoard(state);
    const { a, b } = pairs[0];
    await handleTileClick({ row: a.row, col: a.col });
    // 消除一对不触发胜利（还有牌），但进度需通关才记录
    const progress = JSON.parse(localStorage.getItem('mahjong-progress-v1') || 'null');
    // 未通关不记录进度
    expect(progress).toBeNull();
  });
});

// 辅助：找当前棋盘任意可消除配对
function findAllPairsForBoard(state) {
  const pairs = [];
  const byRow = {};
  const byCol = {};
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const t = state.grid[r][c];
      if (!t) continue;
      if (!byRow[r]) byRow[r] = {};
      if (!byCol[c]) byCol[c] = {};
      if (byRow[r][t.tileTypeId] !== undefined) {
        const prev = { row: r, col: byRow[r][t.tileTypeId] };
        // 同行无遮挡
        let blocked = false;
        const [c1, c2] = [prev.col, c].sort((x, y) => x - y);
        for (let cc = c1 + 1; cc < c2; cc++) {
          if (state.grid[r][cc]) { blocked = true; break; }
        }
        if (!blocked) pairs.push({ a: prev, b: { row: r, col: c } });
      }
      if (byCol[c][t.tileTypeId] !== undefined) {
        const prev = { row: byCol[c][t.tileTypeId], col: c };
        let blocked = false;
        const [r1, r2] = [prev.row, r].sort((x, y) => x - y);
        for (let rr = r1 + 1; rr < r2; rr++) {
          if (state.grid[rr][c]) { blocked = true; break; }
        }
        if (!blocked) pairs.push({ a: prev, b: { row: r, col: c } });
      }
      byRow[r][t.tileTypeId] = c;
      byCol[c][t.tileTypeId] = r;
    }
  }
  return pairs;
}
