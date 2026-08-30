// tests/pairDetection.test.js — 配对判定叶子模块（零依赖）独立测试
//
// 该模块不 import 任何业务模块，专门承载 scanLineForPairs / findAllPairs / hasAnyPair，
// 用于打破 gameLogic ↔ hintSystem 循环依赖。此处直接从 pairDetection.js 导入，
// 证明其作为叶子模块可被独立消费。

import { scanLineForPairs, findAllPairs, hasAnyPair } from '../js/pairDetection.js';

// ─── 辅助 ────────────────────────────────────────────────────────────────
function makeTile(tileTypeId, instanceId = tileTypeId) {
  return { instanceId, tileTypeId, type: 'wan', value: 1, label: 'test', topChar: '', bottomChar: '' };
}

/** grid 为 null 或 tileTypeId 数字的二维数组 */
function buildBoard(grid2d) {
  const height = grid2d.length;
  const width = grid2d[0].length;
  const grid = grid2d.map((row, r) =>
    row.map((v, c) => (v === null ? null : makeTile(v, v * 100 + r * width + c)))
  );
  return { grid, width, height };
}

/** 构造 scanLineForPairs 输入：tiles 数组 [{row, col, typeId}] */
function makeLineItems(items) {
  return items.map(({ row, col, typeId }, i) => ({
    row,
    col,
    tile: makeTile(typeId, i),
  }));
}

// ─── scanLineForPairs ────────────────────────────────────────────────────
describe('scanLineForPairs', () => {
  test('相邻同类返回一对', () => {
    const items = makeLineItems([
      { row: 0, col: 0, typeId: 1 },
      { row: 0, col: 1, typeId: 1 },
    ]);
    expect(scanLineForPairs(items)).toHaveLength(1);
  });

  test('非相邻/不同类不产生对', () => {
    const items = makeLineItems([
      { row: 0, col: 0, typeId: 1 },
      { row: 0, col: 1, typeId: 2 },
      { row: 0, col: 2, typeId: 3 },
    ]);
    expect(scanLineForPairs(items)).toHaveLength(0);
  });

  test('三连返回两对（避免三连中点击任一对漏判）', () => {
    const items = makeLineItems([
      { row: 0, col: 0, typeId: 1 },
      { row: 0, col: 1, typeId: 1 },
      { row: 0, col: 2, typeId: 1 },
    ]);
    expect(scanLineForPairs(items)).toHaveLength(2);
  });

  test('空输入返回空数组', () => {
    expect(scanLineForPairs([])).toHaveLength(0);
  });
});

// ─── findAllPairs ─────────────────────────────────────────────────────────
describe('findAllPairs', () => {
  test('行内跨空格配对（规则2：同行无遮挡）', () => {
    const s = buildBoard([
      [1, null, 1],
      [2, 3, 4],
    ]);
    const pairs = findAllPairs(s);
    // 行0 的 col0/col2 同为 1 → 一对
    const rowPair = pairs.filter((p) => p.a.row === 0 && p.b.row === 0);
    expect(rowPair).toHaveLength(1);
    expect(rowPair[0].a.col).toBe(0);
    expect(rowPair[0].b.col).toBe(2);
  });

  test('列内跨空格配对', () => {
    const s = buildBoard([
      [1, 2],
      [null, 2],
    ]);
    const pairs = findAllPairs(s);
    // 列1 的 row0/row1 同为 2 → 一对
    const colPair = pairs.filter((p) => p.a.col === 1 && p.b.col === 1);
    expect(colPair).toHaveLength(1);
  });

  test('无配对返回空', () => {
    const s = buildBoard([
      [1, 2],
      [3, 4],
    ]);
    expect(findAllPairs(s)).toHaveLength(0);
  });
});

// ─── hasAnyPair ───────────────────────────────────────────────────────────
describe('hasAnyPair', () => {
  test('存在任一配对返回 true', () => {
    expect(hasAnyPair(buildBoard([[1, 1], [2, 3]]))).toBe(true);
  });

  test('列向配对返回 true', () => {
    expect(hasAnyPair(buildBoard([[1, 2], [null, 2]]))).toBe(true);
  });

  test('无配对返回 false', () => {
    expect(hasAnyPair(buildBoard([[1, 2], [3, 4]]))).toBe(false);
  });

  test('空棋盘返回 false', () => {
    const s = buildBoard([[null, null], [null, null]]);
    expect(hasAnyPair(s)).toBe(false);
  });

  test('findAllPairs 与 hasAnyPair 结论一致', () => {
    const boards = [
      [[1, null, 1], [2, 3, 4]],
      [[1, 2], [3, 4]],
      [[1, 2], [null, 2]],
    ];
    for (const b of boards) {
      const s = buildBoard(b);
      expect(hasAnyPair(s)).toBe(findAllPairs(s).length > 0);
    }
  });
});
