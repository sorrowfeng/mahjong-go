// tests/hintSystem.test.js

function makeTile(tileTypeId, instanceId) {
  return { instanceId: instanceId ?? tileTypeId, tileTypeId, type: 'wan', value: 1, label: 'test', topChar: '', bottomChar: '' };
}

function buildBoard(grid2d) {
  const height = grid2d.length;
  const width = grid2d[0].length;
  let id = 0;
  const grid = grid2d.map(row =>
    row.map(v => (v === null ? null : makeTile(v, id++)))
  );
  return { grid, width, height };
}

describe('findHint()', () => {
  test('空棋盘（无牌）返回 null', () => {
    const board = createEmptyBoard();
    expect(findHint(board)).toBeNull();
  });

  test('只有一张牌（无法移动配对）返回 null', () => {
    let board = createEmptyBoard();
    board = setTile(board, 0, 0, makeTile(1, 99));
    expect(findHint(board)).toBeNull();
  });

  test('棋盘上有可行移动时返回提示对象', () => {
    // row0: [1, null, 1] — typeId=1 在 col0 和 col2
    // 将 col0 的牌向右移动 1 格 → [null, 1, 1] → 产生配对
    const board = buildBoard([[1, null, 1]]);
    const hint = findHint(board);
    expect(hint).not.toBeNull();
    expect(hint).toHaveProperty('group');
    expect(hint).toHaveProperty('direction');
    expect(hint).toHaveProperty('delta');
    expect(hint.delta).not.toBe(0);
  });

  test('提示中的 direction 为合法值', () => {
    const board = buildBoard([[1, null, 1]]);
    const hint = findHint(board);
    if (hint) {
      expect([DIR.HORIZONTAL, DIR.VERTICAL]).toContain(hint.direction);
    }
  });

  test('按提示执行后确实产生配对', () => {
    const board = buildBoard([
      [1, null, 1, null, null],
    ]);
    const hint = findHint(board);
    expect(hint).not.toBeNull();
    const proposed = applySlide(board, hint.group, hint.direction, hint.delta);
    const pairs = findAllPairs(proposed);
    expect(pairs.length).toBeGreaterThan(0);
  });

  test('死局棋盘：无任何可配对移动，返回 null', () => {
    // 所有牌都不同，且无法通过移动让两张相同牌相邻或无遮挡
    // 构造：每列只有一张牌，且相邻行的牌类型全不同，同类牌都不在同行/列
    const board = buildBoard([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    // 这个棋盘每行每列各有不同类型的牌，移动后只能沿同行/列移动，
    // 同行的牌类型都不同，移动后仍不会产生相同牌相邻 → 死局
    // 注意：移动一行中的牌不会让两张相同类型的牌配对，因为每行只有不同类型
    expect(findHint(board)).toBeNull();
  });

  test('可以通过垂直移动触发配对', () => {
    // col0: row0=typeId5, row1=null, row2=typeId5
    // 将 row0 的牌向下移 1 → row1=5，row0=null → row1和row2的5相邻 → 配对
    const board = buildBoard([
      [5],
      [null],
      [5],
    ]);
    const hint = findHint(board);
    expect(hint).not.toBeNull();
    const proposed = applySlide(board, hint.group, hint.direction, hint.delta);
    expect(findAllPairs(proposed).length).toBeGreaterThan(0);
  });

  test('消除初始配对后能找到提示（开局可解性）', () => {
    // 满棋盘（8×17=136格全满）无空格，无法滑动，findHint 永远返回 null。
    // 正确流程：先用 resolveChainElimination 消除初始配对，产生空格后再检查提示。
    // 经过消除，几乎必然能找到可行步骤。
    let found = false;
    for (let i = 0; i < 10; i++) {
      let state = createBoardFromDeck(shuffleDeck(generateDeck()));
      // 先消除初始直接配对
      const waves = resolveChainElimination(state);
      if (waves.length > 0) {
        state = waves[waves.length - 1].stateAfter;
      }
      // 消除后检查：已全清（直接胜利）或有可行移动
      if (checkVictory(state) || findHint(state) !== null) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
