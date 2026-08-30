// tests/hintReproducibility.test.js

import { DIR } from '../js/constants.js';
import { generateDeck, shuffleDeck } from '../js/tileDefinitions.js';
import { createBoardFromDeck } from '../js/boardState.js';
import { selectGroup, collectDragGroup, applySlide } from '../js/movementLogic.js';
import { findHint } from '../js/hintSystem.js';
import { hasAnyPair, isDeadlock, resolveChainElimination } from '../js/gameLogic.js';

//
// 回归测试：提示（findHint）给出的方案必须是玩家用拖拽能真实复现的。
//
// 背景缺陷：hintSystem.js 用 selectGroup() 双向收集整段连续牌，
// 而 dragController.js 只从按下点向拖动侧单向收集。
// 因此当 findHint 返回负 delta（向左/向上）时，提示的牌组比玩家实际
// 能选中的牌组更大 —— 玩家照提示操作必然失败，且游戏不会判定为死局
// （因为 findHint 非 null），导致硬卡死。
//
// 修复：两边统一使用 movementLogic.collectDragGroup()，
// 且 findHint 额外返回 start —— 玩家应该按住的那张牌。
// 本文件守住"提示可按住起点原样复现"这个长期不变量。
//
// 注意：下面的 dragGroup 是刻意复制的一份玩家侧行为实现，
// 不直接调用 collectDragGroup，否则两边一起改错时测试就发现不了。

function makeTile(tileTypeId, instanceId) {
  return { instanceId, tileTypeId, type: 'wan', value: 1, label: 't', topChar: '', bottomChar: '' };
}

function buildBoard(grid2d) {
  let id = 0;
  const grid = grid2d.map(row => row.map(v => (v === null ? null : makeTile(v, id++))));
  return { grid, width: grid[0].length, height: grid.length };
}

// 复刻 dragController.js 的选组规则：只从按下点向拖动侧延伸
function dragGroup(state, startRow, startCol, direction, sign) {
  const group = [{ row: startRow, col: startCol, tile: state.grid[startRow][startCol] }];
  if (direction === DIR.HORIZONTAL) {
    if (sign > 0) {
      for (let c = startCol + 1; c < state.width; c++) {
        const t = state.grid[startRow][c];
        if (!t) break;
        group.push({ row: startRow, col: c, tile: t });
      }
    } else {
      for (let c = startCol - 1; c >= 0; c--) {
        const t = state.grid[startRow][c];
        if (!t) break;
        group.unshift({ row: startRow, col: c, tile: t });
      }
    }
  } else {
    if (sign > 0) {
      for (let r = startRow + 1; r < state.height; r++) {
        const t = state.grid[r][startCol];
        if (!t) break;
        group.push({ row: r, col: startCol, tile: t });
      }
    } else {
      for (let r = startRow - 1; r >= 0; r--) {
        const t = state.grid[r][startCol];
        if (!t) break;
        group.unshift({ row: r, col: startCol, tile: t });
      }
    }
  }
  return group;
}

function keyOf(group) {
  return group.map(g => `${g.row},${g.col}`).join('|');
}

describe('提示可复现性（最小复现局面）', () => {
  // 2 行 × 5 列：
  //   row0: [null, Y, X, null, null]
  //   row1: [null, X, null, null, null]
  //
  // 正确提示：按住 (0,2)X 向左拖 1 格 → 带动 (0,1)Y 一起左移
  //   → X 落到 col1，与 row1 的 X 同列相邻 → 配对成立
  //
  // 修复前的行为：提示 (0,1)Y+(0,2)X 整段左移，但玩家从 (0,1) 向左拖
  // 时左边是空列，只能选中 Y 一张 → X 留在 col2 → 无配对 → 回弹
  const board = () => buildBoard([
    [null, 1, 2, null, null],
    [null, 2, null, null, null],
  ]);

  test('局面前提：无直接配对，但存在可移动步骤', () => {
    expect(hasAnyPair(board())).toBe(false);
    expect(findHint(board())).not.toBeNull();
  });

  test('提示的牌组应等于玩家从起点拖拽时实际选中的牌组', () => {
    const b = board();
    const hint = findHint(b);
    const sign = hint.delta > 0 ? 1 : -1;
    const real = dragGroup(b, hint.start.row, hint.start.col, hint.direction, sign);
    expect(keyOf(hint.group)).toEqual(keyOf(real));
  });

  test('玩家照提示操作后应能产生配对', () => {
    const b = board();
    const hint = findHint(b);
    const sign = hint.delta > 0 ? 1 : -1;
    const real = dragGroup(b, hint.start.row, hint.start.col, hint.direction, sign);
    const after = applySlide(b, real, hint.direction, hint.delta);
    expect(hasAnyPair(after)).toBe(true);
  });

  test('起点必须是牌组内、且位于拖动方向末端的那张牌', () => {
    const b = board();
    const hint = findHint(b);
    const keys = hint.group.map(g => `${g.row},${g.col}`);
    expect(keys).toContain(`${hint.start.row},${hint.start.col}`);
    // 向左/上拖时起点是牌组里最靠后的一张，向右/下拖时是最靠前的一张
    const sign = hint.delta > 0 ? 1 : -1;
    const expected = sign > 0 ? hint.group[0] : hint.group[hint.group.length - 1];
    expect(`${hint.start.row},${hint.start.col}`)
      .toEqual(`${expected.row},${expected.col}`);
  });
});

describe('提示可复现性 - 随机对局统计', () => {
  test('任何提示（正/负 delta）都必须 100% 可复现', () => {
    let checked = 0;
    let groupMismatch = 0;
    let noPair = 0;

    for (let iter = 0; iter < 60; iter++) {
      let state = createBoardFromDeck(shuffleDeck(generateDeck()));
      for (let k = 0; k < 3; k++) {
        const waves = resolveChainElimination(state);
        if (!waves.length) break;
        state = waves[waves.length - 1].stateAfter;
      }
      if (hasAnyPair(state)) continue;

      const hint = findHint(state);
      if (!hint) continue;
      checked++;

      const sign = hint.delta > 0 ? 1 : -1;
      const real = dragGroup(state, hint.start.row, hint.start.col, hint.direction, sign);
      if (keyOf(hint.group) !== keyOf(real)) groupMismatch++;

      const after = applySlide(state, real, hint.direction, hint.delta);
      if (!hasAnyPair(after)) noPair++;
    }

    expect(checked).toBeGreaterThan(0);
    expect(groupMismatch).toBe(0);
    expect(noPair).toBe(0);
  });
});

describe('isDeadlock() 死局判定', () => {
  test('整行填满、无法移动但行内已有相邻同类牌 → 不是死局', () => {
    // 旧判定只看 findHint === null，这里会误报死局，
    // 但实际上玩家点一下 (0,0)/(0,1) 就能消掉。
    const board = buildBoard([[1, 1, 2]]);
    expect(hasAnyPair(board)).toBe(true);
    expect(findHint(board)).toBeNull();
    expect(isDeadlock(board)).toBe(false);
  });

  test('确实无路可走 → 是死局', () => {
    // 牌型两两不同，且无空格可移动
    const board = buildBoard([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(isDeadlock(board)).toBe(true);
  });

  test('存在可移动步骤 → 不是死局（即使当前没有直接配对）', () => {
    const board = buildBoard([
      [null, 1, 2, null, null],
      [null, 2, null, null, null],
    ]);
    expect(hasAnyPair(board)).toBe(false);
    expect(findHint(board)).not.toBeNull();
    expect(isDeadlock(board)).toBe(false);
  });
});
