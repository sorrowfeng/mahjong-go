// keyboardNav.test.js — 键盘可玩纯逻辑测试
import {
  stepCursor,
  nearestTile,
  tileHasDirectPair,
  buildKeyboardDrag,
  previewStepDrag,
} from '../js/keyboardNav.js';
import { DIR } from '../js/constants.js';

// 构造一个已知棋盘
// 3 行 × 5 列，手动摆牌
function makeBoard() {
  const state = { width: 5, height: 3, grid: [] };
  for (let r = 0; r < 3; r++) {
    state.grid.push(Array(5).fill(null));
  }
  // 手动放置：给每格一个有唯一 instanceId 的牌
  let n = 0;
  const defs = [
    { type: 'wan', value: 1, label: '1', topChar: '一', bottomChar: '万', image: null },
  ];
  function tile() {
    const d = defs[0];
    return {
      instanceId: 1000 + (n++),
      tileTypeId: 0,
      type: d.type,
      value: d.value,
      label: d.label,
      topChar: d.topChar,
      bottomChar: d.bottomChar,
      image: d.image,
    };
  }
  // 摆放：
  // row0: [X] [X] [X] [X] [X]
  // row1: [X] [null] [X] [X] [X]
  // row2: [X] [X] [null] [X] [X]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      if ((r === 1 && c === 1) || (r === 2 && c === 2)) continue; // 空
      state.grid[r][c] = tile();
    }
  }
  return state;
}

describe('stepCursor', () => {
  test('向右移动跳过空格找到下一张牌', () => {
    const s = makeBoard();
    // row1: [X] [null] [X] [X] [X]，从 (1,1) 出发 → (1,0) 或 (1,2)
    expect(stepCursor(s, 1, 1, 0, 1)).toEqual({ row: 1, col: 2 });
  });

  test('向左移动跨过空格', () => {
    const s = makeBoard();
    expect(stepCursor(s, 2, 2, 0, -1)).toEqual({ row: 2, col: 1 });
  });

  test('向上/向下移动', () => {
    const s = makeBoard();
    // (1,2) 有牌，向上 (0,2) 有牌 → (0,2)
    expect(stepCursor(s, 1, 2, -1, 0)).toEqual({ row: 0, col: 2 });
    // (1,2) 向下：(2,2) 是空格被跳过，继续向下回绕到 (0,2)
    expect(stepCursor(s, 1, 2, 1, 0)).toEqual({ row: 0, col: 2 });
  });

  test('方向越界时回绕', () => {
    const s = makeBoard();
    // row0 col4 向右应回绕到 col0（row0 满）
    expect(stepCursor(s, 0, 4, 0, 1)).toEqual({ row: 0, col: 0 });
  });

  test('返回当前格自身对应的下一个（当前位置是牌则至少能步进）', () => {
    const s = makeBoard();
    // (0,0) 有牌，向右 (0,1) 有牌
    const next = stepCursor(s, 0, 0, 0, 1);
    expect(next).not.toBeNull();
  });
});

describe('nearestTile', () => {
  test('自身有牌直接返回', () => {
    const s = makeBoard();
    expect(nearestTile(s, 0, 0)).toEqual({ row: 0, col: 0 });
  });

  test('空格跳到最近有牌格', () => {
    const s = makeBoard();
    // (1,1) 是空格，最近 (1,0) 或 (1,2) 或 (0,1)/(2,1)
    const n = nearestTile(s, 1, 1);
    expect(n).not.toBeNull();
    expect(s.grid[n.row][n.col]).toBeTruthy();
  });
});

describe('tileHasDirectPair', () => {
  test('构造棋盘所有牌 tileTypeId 相同，任意两格可配对', () => {
    const s = makeBoard();
    expect(tileHasDirectPair(s, 0, 0)).toBe(true);
    expect(tileHasDirectPair(s, 2, 4)).toBe(true);
  });
});

describe('buildKeyboardDrag', () => {
  test('向右拖：group 只含拖动侧连续牌', () => {
    const s = makeBoard();
    // row1: (1,2),(1,3),(1,4) 连续，(1,1) 空。起点 (1,2) 向右 sign+1：
    // group 含 col2,3,4 共 3 张；但 group 顶到右边界 → delta 钳为 0
    const built = buildKeyboardDrag(s, 1, 2, DIR.HORIZONTAL, 1, 1);
    expect(built).not.toBeNull();
    expect(built.group.map(g => g.col)).toEqual([2, 3, 4]);
    expect(built.delta).toBe(0);
  });

  test('向右拖 delta 被钳制到边界', () => {
    const s = makeBoard();
    // row1: (1,0) 有牌，(1,1) 空。从 (1,0) 向右：group 仅 [col0]，
    // 右侧下一个障碍在 (1,2) → maxPositive = 1，拖 99 应钳为 1
    const built = buildKeyboardDrag(s, 1, 0, DIR.HORIZONTAL, 1, 99);
    expect(built.delta).toBe(1);
  });

  test('左侧有障碍时向左位移受限', () => {
    const s = makeBoard();
    // row1: (1,4) 有牌，(1,3) 有牌，(1,1) 空。从 (1,4) 向左：group [col4]，
    // 左侧 (1,3) 是牌 → maxNegative = 0？ 不，(1,3) 相邻即障碍 → maxNegative=0
    // 改用 (1,2)：group [col2]，左侧 (1,1) 空 → 找下一个障碍 (1,0) 有牌
    // maxNegative = minCol - c - 1 = 2 - 0 - 1 = 1 → delta -1
    const built = buildKeyboardDrag(s, 1, 2, DIR.HORIZONTAL, -1, 99);
    expect(built.delta).toBe(-1);
  });

  test('空格起点返回 null', () => {
    const s = makeBoard();
    expect(buildKeyboardDrag(s, 1, 1, DIR.HORIZONTAL, 1, 1)).toBeNull();
  });
});

describe('previewStepDrag', () => {
  test('返回 wouldMatch 布尔与 delta', () => {
    const s = makeBoard();
    const pre = previewStepDrag(s, 0, 0, DIR.HORIZONTAL, 1);
    expect(typeof pre.wouldMatch).toBe('boolean');
    expect([0, 1]).toContain(Math.abs(pre.delta));
  });

  test('无法移动时 delta 为 0', () => {
    // 单列单格：起点两侧都无空间 → 无法移动
    const single = { width: 1, height: 1, grid: [[{ instanceId: 1, tileTypeId: 0, type: 'wan', value: 1, label: '1', topChar: '一', bottomChar: '万', image: null }]] };
    const pre = previewStepDrag(single, 0, 0, DIR.VERTICAL, 1);
    expect(pre.delta).toBe(0);
    expect(pre.wouldMatch).toBe(false);
  });
});
