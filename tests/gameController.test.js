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
} from '../js/gameController.js';
import { MAX_UNDO_STEPS } from '../js/constants.js';

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
      <p id="victory-time-display"></p>
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
