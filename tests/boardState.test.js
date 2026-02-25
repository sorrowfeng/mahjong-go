// tests/boardState.test.js

describe('boardState', () => {

  // ─── createEmptyBoard ───────────────────────────────────────────────────────
  describe('createEmptyBoard()', () => {
    test('返回正确行列数', () => {
      const board = createEmptyBoard();
      expect(board.height).toBe(BOARD_ROWS);
      expect(board.width).toBe(BOARD_COLS);
      expect(board.grid).toHaveLength(BOARD_ROWS);
      expect(board.grid[0]).toHaveLength(BOARD_COLS);
    });

    test('所有格子为 null', () => {
      const board = createEmptyBoard();
      for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
          expect(board.grid[r][c]).toBeNull();
        }
      }
    });
  });

  // ─── createBoardFromDeck ─────────────────────────────────────────────────────
  describe('createBoardFromDeck()', () => {
    let deck, board;
    beforeEach(() => {
      deck = generateDeck();
      board = createBoardFromDeck(deck);
    });

    test('返回正确尺寸', () => {
      expect(board.height).toBe(BOARD_ROWS);
      expect(board.width).toBe(BOARD_COLS);
    });

    test('136格均非null', () => {
      expect(countRemainingTiles(board)).toBe(136);
    });

    test('牌按行优先顺序填入', () => {
      // 第一张牌在 (0,0)
      expect(board.grid[0][0].instanceId).toBe(deck[0].instanceId);
      // 第17张牌在 (0,16)
      expect(board.grid[0][16].instanceId).toBe(deck[16].instanceId);
      // 第18张牌在 (1,0)
      expect(board.grid[1][0].instanceId).toBe(deck[17].instanceId);
      // 最后一张牌在 (7,16)
      expect(board.grid[7][16].instanceId).toBe(deck[135].instanceId);
    });
  });

  // ─── getTile ─────────────────────────────────────────────────────────────────
  describe('getTile()', () => {
    let board;
    beforeEach(() => {
      board = createBoardFromDeck(generateDeck());
    });

    test('正常位置返回牌对象', () => {
      const tile = getTile(board, 0, 0);
      expect(tile).not.toBeNull();
      expect(tile).toHaveProperty('instanceId');
    });

    test('越界：负行返回 null', () => {
      expect(getTile(board, -1, 0)).toBeNull();
    });

    test('越界：负列返回 null', () => {
      expect(getTile(board, 0, -1)).toBeNull();
    });

    test('越界：超出行数返回 null', () => {
      expect(getTile(board, BOARD_ROWS, 0)).toBeNull();
    });

    test('越界：超出列数返回 null', () => {
      expect(getTile(board, 0, BOARD_COLS)).toBeNull();
    });

    test('边界：最大行列返回牌对象', () => {
      const tile = getTile(board, BOARD_ROWS - 1, BOARD_COLS - 1);
      expect(tile).not.toBeNull();
    });

    test('空棋盘返回 null', () => {
      const empty = createEmptyBoard();
      expect(getTile(empty, 0, 0)).toBeNull();
    });
  });

  // ─── setTile ─────────────────────────────────────────────────────────────────
  describe('setTile()', () => {
    let board;
    beforeEach(() => {
      board = createEmptyBoard();
    });

    test('返回新对象（不可变性）', () => {
      const fakeTile = { instanceId: 999, tileTypeId: 0 };
      const newBoard = setTile(board, 0, 0, fakeTile);
      expect(newBoard).not.toBe(board);
    });

    test('原 state 不变', () => {
      const fakeTile = { instanceId: 999, tileTypeId: 0 };
      setTile(board, 0, 0, fakeTile);
      expect(board.grid[0][0]).toBeNull();
    });

    test('新 state 中目标格子已更新', () => {
      const fakeTile = { instanceId: 999, tileTypeId: 0 };
      const newBoard = setTile(board, 2, 3, fakeTile);
      expect(newBoard.grid[2][3]).toBe(fakeTile);
    });

    test('其他格子不受影响', () => {
      const fakeTile = { instanceId: 999, tileTypeId: 0 };
      const newBoard = setTile(board, 2, 3, fakeTile);
      expect(newBoard.grid[0][0]).toBeNull();
      expect(newBoard.grid[7][16]).toBeNull();
    });

    test('可以清除格子（设为 null）', () => {
      const filledBoard = createBoardFromDeck(generateDeck());
      const cleared = setTile(filledBoard, 0, 0, null);
      expect(cleared.grid[0][0]).toBeNull();
      expect(filledBoard.grid[0][0]).not.toBeNull(); // 原 state 不变
    });
  });

  // ─── setTiles ────────────────────────────────────────────────────────────────
  describe('setTiles()', () => {
    test('批量设置多个格子', () => {
      const board = createEmptyBoard();
      const t1 = { instanceId: 1, tileTypeId: 0 };
      const t2 = { instanceId: 2, tileTypeId: 1 };
      const newBoard = setTiles(board, [
        { row: 0, col: 0, tile: t1 },
        { row: 3, col: 5, tile: t2 },
      ]);
      expect(newBoard.grid[0][0]).toBe(t1);
      expect(newBoard.grid[3][5]).toBe(t2);
    });

    test('原 state 不变', () => {
      const board = createEmptyBoard();
      const t1 = { instanceId: 1, tileTypeId: 0 };
      setTiles(board, [{ row: 0, col: 0, tile: t1 }]);
      expect(board.grid[0][0]).toBeNull();
    });

    test('空操作列表返回等价 state', () => {
      const board = createEmptyBoard();
      const newBoard = setTiles(board, []);
      expect(countRemainingTiles(newBoard)).toBe(0);
    });

    test('同一格子多次设置取最后一次', () => {
      const board = createEmptyBoard();
      const t1 = { instanceId: 1, tileTypeId: 0 };
      const t2 = { instanceId: 2, tileTypeId: 1 };
      const newBoard = setTiles(board, [
        { row: 0, col: 0, tile: t1 },
        { row: 0, col: 0, tile: t2 },
      ]);
      expect(newBoard.grid[0][0]).toBe(t2);
    });
  });

  // ─── countRemainingTiles ──────────────────────────────────────────────────────
  describe('countRemainingTiles()', () => {
    test('全满棋盘返回 136', () => {
      const board = createBoardFromDeck(generateDeck());
      expect(countRemainingTiles(board)).toBe(136);
    });

    test('空棋盘返回 0', () => {
      expect(countRemainingTiles(createEmptyBoard())).toBe(0);
    });

    test('部分格子有牌', () => {
      let board = createEmptyBoard();
      const t1 = { instanceId: 1, tileTypeId: 0 };
      const t2 = { instanceId: 2, tileTypeId: 1 };
      board = setTile(board, 0, 0, t1);
      board = setTile(board, 3, 5, t2);
      expect(countRemainingTiles(board)).toBe(2);
    });
  });

  // ─── cloneState ──────────────────────────────────────────────────────────────
  describe('cloneState()', () => {
    test('返回新对象引用', () => {
      const board = createBoardFromDeck(generateDeck());
      const clone = cloneState(board);
      expect(clone).not.toBe(board);
    });

    test('grid 行数组为新引用（深拷贝）', () => {
      const board = createBoardFromDeck(generateDeck());
      const clone = cloneState(board);
      expect(clone.grid[0]).not.toBe(board.grid[0]);
    });

    test('修改 clone 不影响原 state', () => {
      const board = createBoardFromDeck(generateDeck());
      const clone = cloneState(board);
      const originalTile = board.grid[0][0];
      clone.grid[0][0] = null;
      expect(board.grid[0][0]).toBe(originalTile);
    });

    test('clone 的 width/height 与原 state 相同', () => {
      const board = createBoardFromDeck(generateDeck());
      const clone = cloneState(board);
      expect(clone.width).toBe(board.width);
      expect(clone.height).toBe(board.height);
    });
  });

});
