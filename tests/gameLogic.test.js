// tests/gameLogic.test.js

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/** 创建一张最简牌，只需 tileTypeId（instanceId 随便给） */
function makeTile(tileTypeId, instanceId = tileTypeId) {
  return { instanceId, tileTypeId, type: 'wan', value: 1, label: 'test', topChar: '', bottomChar: '' };
}

/**
 * 构建小型棋盘用于测试，grid 是二维数组（null 或 tileTypeId 数字）
 * 例如: buildBoard([[1, null, 1], [null, 2, null]]) 生成 2行3列
 */
function buildBoard(grid2d) {
  const height = grid2d.length;
  const width = grid2d[0].length;
  const grid = grid2d.map(row =>
    row.map((v, col) => (v === null ? null : makeTile(v, v * 100 + col)))
  );
  return { grid, width, height };
}

/** 将 tiles 数组格式化为 scanLineForPairs 期望的输入 */
function makeLineItems(items) {
  // items: [{row, col, typeId}]
  return items.map(({ row, col, typeId }, i) => ({
    row,
    col,
    tile: makeTile(typeId, i),
  }));
}

// ─── scanLineForPairs ────────────────────────────────────────────────────────
describe('scanLineForPairs()', () => {
  test('空行返回空数组', () => {
    expect(scanLineForPairs([])).toEqual([]);
  });

  test('单张牌无配对', () => {
    const tiles = makeLineItems([{ row: 0, col: 0, typeId: 1 }]);
    expect(scanLineForPairs(tiles)).toHaveLength(0);
  });

  test('两张不同牌无配对', () => {
    const tiles = makeLineItems([
      { row: 0, col: 0, typeId: 1 },
      { row: 0, col: 1, typeId: 2 },
    ]);
    expect(scanLineForPairs(tiles)).toHaveLength(0);
  });

  test('两张相同牌配对', () => {
    const tiles = makeLineItems([
      { row: 0, col: 0, typeId: 5 },
      { row: 0, col: 3, typeId: 5 }, // 中间有空格，但已是有序序列的相邻项
    ]);
    const pairs = scanLineForPairs(tiles);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0].col).toBe(0);
    expect(pairs[0][1].col).toBe(3);
  });

  test('[A, A, B] — 只有一对 AA', () => {
    const tiles = makeLineItems([
      { row: 0, col: 0, typeId: 1 },
      { row: 0, col: 1, typeId: 1 },
      { row: 0, col: 2, typeId: 2 },
    ]);
    const pairs = scanLineForPairs(tiles);
    expect(pairs).toHaveLength(1);
  });

  test('[A, B, A] — 中间有 B，AA 不相邻，无配对', () => {
    const tiles = makeLineItems([
      { row: 0, col: 0, typeId: 1 },
      { row: 0, col: 1, typeId: 2 },
      { row: 0, col: 2, typeId: 1 },
    ]);
    expect(scanLineForPairs(tiles)).toHaveLength(0);
  });

  test('[A, A, A, A] — 配成两对', () => {
    const tiles = makeLineItems([
      { row: 0, col: 0, typeId: 3 },
      { row: 0, col: 1, typeId: 3 },
      { row: 0, col: 2, typeId: 3 },
      { row: 0, col: 3, typeId: 3 },
    ]);
    // 第0配第1，第2配第3 → 两对
    expect(scanLineForPairs(tiles)).toHaveLength(2);
  });

  test('[A, A, A] — 只配一对（跳过第二个A）', () => {
    const tiles = makeLineItems([
      { row: 0, col: 0, typeId: 7 },
      { row: 0, col: 1, typeId: 7 },
      { row: 0, col: 2, typeId: 7 },
    ]);
    // 第0配第1，跳过第2（i++后第2变成检查对象）→ 一对
    expect(scanLineForPairs(tiles)).toHaveLength(1);
  });
});

// ─── findAllPairs ────────────────────────────────────────────────────────────
describe('findAllPairs()', () => {
  test('空棋盘无配对', () => {
    const board = createEmptyBoard();
    expect(findAllPairs(board)).toHaveLength(0);
  });

  test('同行相邻相同牌配对', () => {
    // row0: [1, 1, null...]
    const board = buildBoard([
      [1, 1, null, null],
      [null, null, null, null],
    ]);
    const pairs = findAllPairs(board);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    // 验证行配对
    const rowPair = pairs.find(p => p.a.row === 0 && p.b.row === 0);
    expect(rowPair).toBeDefined();
  });

  test('同列相邻相同牌配对', () => {
    // col0: row0=typeId5, row1=typeId5
    const board = buildBoard([
      [5, null],
      [5, null],
    ]);
    const pairs = findAllPairs(board);
    const colPair = pairs.find(p => p.a.col === 0 && p.b.col === 0);
    expect(colPair).toBeDefined();
  });

  test('同行无遮挡相同牌配对（中间有空格）', () => {
    // row0: [2, null, null, 2] → 有序序列只有 col0 和 col3，相邻且相同
    const board = buildBoard([
      [2, null, null, 2],
    ]);
    const pairs = findAllPairs(board);
    expect(pairs).toHaveLength(1);
  });

  test('中间有遮挡不配对（规则2不满足）', () => {
    // row0: [2, 3, 2] → 有序序列 [2,3,2]，2和3不同，3和2不同 → 无配对
    const board = buildBoard([
      [2, 3, 2],
    ]);
    expect(findAllPairs(board)).toHaveLength(0);
  });
});

// ─── applyOneWave ─────────────────────────────────────────────────────────────
describe('applyOneWave()', () => {
  test('无配对时返回空 eliminated', () => {
    const board = createEmptyBoard();
    const { eliminated } = applyOneWave(board);
    expect(eliminated).toHaveLength(0);
  });

  test('有配对时消除并返回新 state', () => {
    const board = buildBoard([[1, 1, null]]);
    const { newState, eliminated } = applyOneWave(board);
    expect(eliminated).toHaveLength(1);
    expect(newState.grid[0][0]).toBeNull();
    expect(newState.grid[0][1]).toBeNull();
  });

  test('原 state 不变（不可变性）', () => {
    const board = buildBoard([[1, 1, null]]);
    applyOneWave(board);
    expect(board.grid[0][0]).not.toBeNull();
  });

  test('去重：同一张牌同时参与行和列配对，只消其中一对', () => {
    // 构造：(0,0) 和 (0,1) 同行配对；(0,0) 和 (1,0) 同列配对
    // 所有牌的 typeId=1
    // 布局:  col0 col1
    // row0:  1    1
    // row1:  1    null
    // row2:  1    null
    // 行扫描: (0,0)+(0,1) 配对
    // 列扫描 col0: (0,0)+(1,0) 配对（(0,0) 被使用了）
    // 去重后: (0,0) 已在 usedKeys 中，所以列配对被跳过
    // 实际消除: 只有 (0,0) 和 (0,1) 被消除
    const board = buildBoard([
      [1, 1],
      [1, null],
      [1, null],
    ]);
    const { eliminated, newState } = applyOneWave(board);
    // 只有一对被消除（行配对优先，列配对中的 (0,0) 已被占用）
    expect(eliminated).toHaveLength(1);
    // (0,0) 和 (0,1) 被消除
    expect(newState.grid[0][0]).toBeNull();
    expect(newState.grid[0][1]).toBeNull();
    // col0 的 (1,0) 和 (2,0) 不受影响
    expect(newState.grid[1][0]).not.toBeNull();
    expect(newState.grid[2][0]).not.toBeNull();
  });
});

// ─── resolveChainElimination ──────────────────────────────────────────────────
describe('resolveChainElimination()', () => {
  test('无配对返回空 waves', () => {
    const board = createEmptyBoard();
    const waves = resolveChainElimination(board);
    expect(waves).toHaveLength(0);
  });

  test('单波消除返回1个 wave', () => {
    const board = buildBoard([[1, 1, 2, 3]]);
    const waves = resolveChainElimination(board);
    expect(waves).toHaveLength(1);
    expect(waves[0].eliminated).toHaveLength(1);
  });

  test('连锁消除：消除后产生新配对', () => {
    // row0: [1, 1, 2, 2]
    // 第一波消除 (1,1) → row0: [null, null, 2, 2]
    // 第二波消除 (2,2) → row0: 全空
    const board = buildBoard([[1, 1, 2, 2]]);
    const waves = resolveChainElimination(board);
    expect(waves.length).toBeGreaterThanOrEqual(1);
    // 最终 state 应该全空
    const finalState = waves[waves.length - 1].stateAfter;
    expect(countRemainingTiles(finalState)).toBe(0);
  });

  test('每个 wave 的 stateAfter 反映消除后的棋盘', () => {
    const board = buildBoard([[1, 1, null, null]]);
    const waves = resolveChainElimination(board);
    expect(waves[0].stateAfter.grid[0][0]).toBeNull();
    expect(waves[0].stateAfter.grid[0][1]).toBeNull();
  });
});

// ─── checkVictory ─────────────────────────────────────────────────────────────
describe('checkVictory()', () => {
  test('空棋盘返回 true（胜利）', () => {
    expect(checkVictory(createEmptyBoard())).toBe(true);
  });

  test('满棋盘返回 false', () => {
    expect(checkVictory(createBoardFromDeck(generateDeck()))).toBe(false);
  });

  test('有一张牌返回 false', () => {
    let board = createEmptyBoard();
    board = setTile(board, 0, 0, makeTile(1));
    expect(checkVictory(board)).toBe(false);
  });

  test('消除所有牌后返回 true', () => {
    // 构造只有一对牌的棋盘
    let board = createEmptyBoard();
    board = setTile(board, 0, 0, makeTile(5, 100));
    board = setTile(board, 0, 1, makeTile(5, 101));
    const { newState } = applyOneWave(board);
    expect(checkVictory(newState)).toBe(true);
  });
});
