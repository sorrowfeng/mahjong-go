// tests/movementLogic.test.js

/** 创建一张测试用牌 */
function makeTile(tileTypeId, instanceId) {
  return { instanceId: instanceId ?? tileTypeId, tileTypeId, type: 'wan', value: 1, label: 'test', topChar: '', bottomChar: '' };
}

/**
 * 构建小型棋盘，grid2d 中数字表示 tileTypeId，null 表示空。
 * instanceId 按 row*100+col 分配（确保唯一）。
 */
function buildBoard(grid2d) {
  const height = grid2d.length;
  const width = grid2d[0].length;
  const grid = grid2d.map((row, r) =>
    row.map((v, c) => (v === null ? null : makeTile(v, r * 100 + c)))
  );
  return { grid, width, height };
}

// ─── selectGroup ──────────────────────────────────────────────────────────────
describe('selectGroup()', () => {
  describe('HORIZONTAL', () => {
    test('单张牌，左右无邻牌，组只有自身', () => {
      const board = buildBoard([
        [null, 1, null, null],
      ]);
      const group = selectGroup(board, 0, 1, DIR.HORIZONTAL);
      expect(group).toHaveLength(1);
      expect(group[0].col).toBe(1);
    });

    test('从中间选择，收集两侧连续牌', () => {
      // row0: [A, B, C] 三张牌相邻
      const board = buildBoard([[1, 2, 3]]);
      const group = selectGroup(board, 0, 1, DIR.HORIZONTAL);
      // 从 col1 出发，左边有 col0，右边有 col2
      expect(group).toHaveLength(3);
      expect(group[0].col).toBe(0);
      expect(group[1].col).toBe(1);
      expect(group[2].col).toBe(2);
    });

    test('右边到边界停止', () => {
      const board = buildBoard([[1, 2, 3]]); // 3列全满
      const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
      expect(group).toHaveLength(3);
    });

    test('遇到空格停止收集', () => {
      // row0: [1, 2, null, 3]
      const board = buildBoard([[1, 2, null, 3]]);
      const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
      // 从 col0 出发，右边 col1 有牌，col2 为 null 停止
      expect(group).toHaveLength(2);
      expect(group.map(g => g.col)).toEqual([0, 1]);
    });

    test('空格子处返回空数组', () => {
      const board = buildBoard([[null, null, null]]);
      const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
      expect(group).toHaveLength(0);
    });
  });

  describe('VERTICAL', () => {
    test('单张牌，上下无邻牌，组只有自身', () => {
      const board = buildBoard([
        [null],
        [1],
        [null],
      ]);
      const group = selectGroup(board, 1, 0, DIR.VERTICAL);
      expect(group).toHaveLength(1);
      expect(group[0].row).toBe(1);
    });

    test('从中间选择，收集上下连续牌', () => {
      const board = buildBoard([[1], [2], [3]]);
      const group = selectGroup(board, 1, 0, DIR.VERTICAL);
      expect(group).toHaveLength(3);
      expect(group[0].row).toBe(0);
      expect(group[2].row).toBe(2);
    });

    test('遇到空行停止', () => {
      const board = buildBoard([[1], [2], [null], [3]]);
      const group = selectGroup(board, 0, 0, DIR.VERTICAL);
      expect(group).toHaveLength(2);
    });
  });
});

// ─── calcMaxSlide ──────────────────────────────────────────────────────────────
describe('calcMaxSlide()', () => {
  describe('HORIZONTAL', () => {
    test('单牌在最左列，maxNegative=0', () => {
      const board = buildBoard([[1, null, null, null]]);
      const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
      const { maxNegative, maxPositive } = calcMaxSlide(board, group, DIR.HORIZONTAL);
      expect(maxNegative).toBe(0);
      expect(maxPositive).toBe(3); // 可移动到 col3
    });

    test('单牌在最右列，maxPositive=0', () => {
      const board = buildBoard([[null, null, null, 1]]);
      const group = selectGroup(board, 0, 3, DIR.HORIZONTAL);
      const { maxNegative, maxPositive } = calcMaxSlide(board, group, DIR.HORIZONTAL);
      expect(maxPositive).toBe(0);
      expect(maxNegative).toBe(3);
    });

    test('左侧有障碍牌', () => {
      // row0: [X, null, null, A, null] — A在col3，X在col0
      const board = buildBoard([[2, null, null, 1, null]]);
      const group = selectGroup(board, 0, 3, DIR.HORIZONTAL);
      const { maxNegative } = calcMaxSlide(board, group, DIR.HORIZONTAL);
      // X在col0，A在col3，中间空格为 col1, col2 → 可向左移动 2 格（停在 col2 前一格=col1 是不对的，col1 到 col0 之间有 col0=障碍，所以最多移 2 格到 col1）
      // minCol=3, X 在 c=0, maxNegative = minCol - c - 1 = 3 - 0 - 1 = 2
      expect(maxNegative).toBe(2);
    });

    test('右侧有障碍牌', () => {
      // row0: [null, A, null, X] — A在col1，X在col3
      const board = buildBoard([[null, 1, null, 2]]);
      const group = selectGroup(board, 0, 1, DIR.HORIZONTAL);
      const { maxPositive } = calcMaxSlide(board, group, DIR.HORIZONTAL);
      // maxCol=1, X在c=3, maxPositive = 3 - 1 - 1 = 1
      expect(maxPositive).toBe(1);
    });

    test('多牌组的最大滑动', () => {
      // row0: [A, A, null, null, null] — 两张牌在 col0-1
      const board = buildBoard([[1, 2, null, null, null]]);
      const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
      expect(group).toHaveLength(2);
      const { maxPositive, maxNegative } = calcMaxSlide(board, group, DIR.HORIZONTAL);
      expect(maxNegative).toBe(0); // col0 已是最左
      expect(maxPositive).toBe(3); // maxCol=1，右到 col4，可移 3 格
    });
  });

  describe('VERTICAL', () => {
    test('单牌在顶行，maxNegative=0', () => {
      const board = buildBoard([[1], [null], [null]]);
      const group = selectGroup(board, 0, 0, DIR.VERTICAL);
      const { maxNegative, maxPositive } = calcMaxSlide(board, group, DIR.VERTICAL);
      expect(maxNegative).toBe(0);
      expect(maxPositive).toBe(2);
    });

    test('上方有障碍', () => {
      // col0: row0=X, row1=null, row2=A
      const board = buildBoard([[2], [null], [1]]);
      const group = selectGroup(board, 2, 0, DIR.VERTICAL);
      const { maxNegative } = calcMaxSlide(board, group, DIR.VERTICAL);
      // minRow=2, X在r=0, maxNegative = 2-0-1 = 1
      expect(maxNegative).toBe(1);
    });
  });
});

// ─── applySlide ────────────────────────────────────────────────────────────────
describe('applySlide()', () => {
  test('delta=0 返回同一 state 引用', () => {
    const board = buildBoard([[1, null, null]]);
    const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
    const result = applySlide(board, group, DIR.HORIZONTAL, 0);
    expect(result).toBe(board);
  });

  test('水平正向移动', () => {
    // [A, null, null] → 移动 1 格 → [null, A, null]
    const board = buildBoard([[1, null, null]]);
    const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
    const newBoard = applySlide(board, group, DIR.HORIZONTAL, 1);
    expect(newBoard.grid[0][0]).toBeNull();
    expect(newBoard.grid[0][1]).not.toBeNull();
    expect(newBoard.grid[0][1].tileTypeId).toBe(1);
  });

  test('水平负向移动', () => {
    // [null, null, A] → 移动 -2 格 → [A, null, null]
    const board = buildBoard([[null, null, 1]]);
    const group = selectGroup(board, 0, 2, DIR.HORIZONTAL);
    const newBoard = applySlide(board, group, DIR.HORIZONTAL, -2);
    expect(newBoard.grid[0][0]).not.toBeNull();
    expect(newBoard.grid[0][2]).toBeNull();
  });

  test('垂直正向移动', () => {
    // col0: [A, null, null]
    const board = buildBoard([[1], [null], [null]]);
    const group = selectGroup(board, 0, 0, DIR.VERTICAL);
    const newBoard = applySlide(board, group, DIR.VERTICAL, 2);
    expect(newBoard.grid[0][0]).toBeNull();
    expect(newBoard.grid[2][0]).not.toBeNull();
  });

  test('多牌组移动保持相对顺序', () => {
    // [A, B, null, null] → 移 1 → [null, A, B, null]
    const board = buildBoard([[1, 2, null, null]]);
    const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
    const newBoard = applySlide(board, group, DIR.HORIZONTAL, 1);
    expect(newBoard.grid[0][0]).toBeNull();
    expect(newBoard.grid[0][1].tileTypeId).toBe(1);
    expect(newBoard.grid[0][2].tileTypeId).toBe(2);
  });

  test('原 state 不变（不可变性）', () => {
    const board = buildBoard([[1, null, null]]);
    const group = selectGroup(board, 0, 0, DIR.HORIZONTAL);
    applySlide(board, group, DIR.HORIZONTAL, 1);
    expect(board.grid[0][0]).not.toBeNull();
    expect(board.grid[0][1]).toBeNull();
  });
});

// ─── pixelsToCells ─────────────────────────────────────────────────────────────
describe('pixelsToCells()', () => {
  test('水平：整格像素正确换算', () => {
    // 一格 = TILE_WIDTH + TILE_GAP = 56 + 4 = 60px
    expect(pixelsToCells(60, DIR.HORIZONTAL)).toBe(1);
    expect(pixelsToCells(120, DIR.HORIZONTAL)).toBe(2);
    expect(pixelsToCells(-60, DIR.HORIZONTAL)).toBe(-1);
  });

  test('水平：不足半格取近值', () => {
    expect(pixelsToCells(29, DIR.HORIZONTAL)).toBe(0);  // 29/60 < 0.5 → 0
    expect(pixelsToCells(31, DIR.HORIZONTAL)).toBe(1);  // 31/60 > 0.5 → 1
  });

  test('垂直：整格像素正确换算', () => {
    // 一格 = TILE_HEIGHT + TILE_GAP = 80 + 4 = 84px
    expect(pixelsToCells(84, DIR.VERTICAL)).toBe(1);
    expect(pixelsToCells(-84, DIR.VERTICAL)).toBe(-1);
  });

  test('零像素返回0', () => {
    expect(pixelsToCells(0, DIR.HORIZONTAL)).toBe(0);
    expect(pixelsToCells(0, DIR.VERTICAL)).toBe(0);
  });
});

// ─── clampDelta ────────────────────────────────────────────────────────────────
describe('clampDelta()', () => {
  test('在范围内时原样返回', () => {
    expect(clampDelta(2, 3, 3)).toBe(2);
    expect(clampDelta(-2, 3, 3)).toBe(-2);
  });

  test('超出正方向上限时钳制', () => {
    expect(clampDelta(5, 3, 3)).toBe(3);
  });

  test('超出负方向下限时钳制', () => {
    expect(clampDelta(-5, 3, 3)).toBe(-3);
  });

  test('maxPositive=0 正向被钳制为0', () => {
    expect(clampDelta(2, 0, 5)).toBe(0);
  });

  test('maxNegative=0 负向被钳制为0', () => {
    expect(clampDelta(-2, 5, 0)).toBe(0);
  });

  test('delta=0 原样返回', () => {
    expect(clampDelta(0, 5, 5)).toBe(0);
  });
});
