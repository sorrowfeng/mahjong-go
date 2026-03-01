// gameLogic.js — 消除规则1/2统一实现 + 连锁消除

/**
 * 消除规则（统一规则1+2）：
 * 对每行/每列，获取该行/列中非null牌的有序序列。
 * 相邻两个 tileTypeId 相同的牌即为一对，无论中间是否有空格。
 * 规则1是特例（物理相邻），规则2是同行/列无遮挡。
 *
 * 实现细节：
 * - "有序序列"指按位置排列的非null牌
 * - "相邻"指在有序序列中紧挨着（中间没有其他非null牌）
 * - 这正好对应"中间没有任何牌遮挡"
 */

// 扫描一行/列，返回可消除的牌对 [{row, col, instanceId}][]
function scanLineForPairs(tiles) {
  // tiles: [{row, col, tile}]，已按位置排序
  // 返回所有相邻同类对，去重由上层调用方负责（applyOneWave / handleTileClick）
  const pairs = [];
  for (let i = 0; i < tiles.length - 1; i++) {
    const a = tiles[i];
    const b = tiles[i + 1];
    if (a.tile.tileTypeId === b.tile.tileTypeId) {
      pairs.push([a, b]);
    }
  }
  return pairs;
}

// 找出棋盘上所有可消除的牌对
// 返回 [{ a: {row,col,tile}, b: {row,col,tile} }]
function findAllPairs(state) {
  const pairs = [];

  // 扫描每行
  for (let r = 0; r < state.height; r++) {
    const rowTiles = [];
    for (let c = 0; c < state.width; c++) {
      if (state.grid[r][c] !== null) {
        rowTiles.push({ row: r, col: c, tile: state.grid[r][c] });
      }
    }
    const rowPairs = scanLineForPairs(rowTiles);
    for (const [a, b] of rowPairs) {
      pairs.push({ a, b });
    }
  }

  // 扫描每列
  for (let c = 0; c < state.width; c++) {
    const colTiles = [];
    for (let r = 0; r < state.height; r++) {
      if (state.grid[r][c] !== null) {
        colTiles.push({ row: r, col: c, tile: state.grid[r][c] });
      }
    }
    const colPairs = scanLineForPairs(colTiles);
    for (const [a, b] of colPairs) {
      pairs.push({ a, b });
    }
  }

  return pairs;
}

// 消除一批牌（给定位置列表），返回新 BoardState
function eliminateTiles(state, positions) {
  const ops = positions.map(({ row, col }) => ({ row, col, tile: null }));
  return setTiles(state, ops);
}

// 执行一波消除：找到所有配对，消除它们，返回 { newState, eliminated }
// eliminated: [{a,b}] 本波消除的配对
// 注意：去重处理同一张牌同时参与行和列配对的情况，保证每张牌最多参与一个配对
function applyOneWave(state) {
  const pairs = findAllPairs(state);
  if (pairs.length === 0) return { newState: state, eliminated: [] };

  const usedKeys = new Set();
  const validPairs = [];

  for (const { a, b } of pairs) {
    const keyA = `${a.row},${a.col}`;
    const keyB = `${b.row},${b.col}`;
    if (!usedKeys.has(keyA) && !usedKeys.has(keyB)) {
      validPairs.push({ a, b });
      usedKeys.add(keyA);
      usedKeys.add(keyB);
    }
  }

  const positions = [];
  for (const { a, b } of validPairs) {
    positions.push({ row: a.row, col: a.col });
    positions.push({ row: b.row, col: b.col });
  }
  const newState = eliminateTiles(state, positions);
  return { newState, eliminated: validPairs };
}

/**
 * 连锁消除：循环消除直到无更多配对
 * 返回 waves: [{ eliminated: [{a,b}], stateAfter: BoardState }]
 * waves[0] 是第一波消除，waves[n-1] 是最后一波
 */
function resolveChainElimination(state) {
  const waves = [];
  let current = state;

  while (true) {
    const { newState, eliminated } = applyOneWave(current);
    if (eliminated.length === 0) break;
    waves.push({ eliminated, stateAfter: newState });
    current = newState;
  }

  return waves;
}

// 检查是否胜利（棋盘全空）
function checkVictory(state) {
  return countRemainingTiles(state) === 0;
}

/**
 * 拖动后专用的连锁消除：
 * 只消除"拖动前不存在"的配对，不碰用户尚未手动处理的存量配对。
 * 用 instanceId 而非坐标识别配对（坐标会因移动而改变）。
 *
 * stateBefore:    拖动前的棋盘状态
 * stateAfterDrag: 拖动后（尚未消除）的棋盘状态
 * 返回 waves: [{ eliminated, stateAfter }]，若无新配对则返回 []
 */
function resolveNewPairChain(stateBefore, stateAfterDrag) {
  // 构建拖动前存量配对的 key 集合（instanceId 排序后拼接）
  const beforeKeys = new Set();
  for (const { a, b } of findAllPairs(stateBefore)) {
    const ids = [a.tile.instanceId, b.tile.instanceId].sort((x, y) => x - y);
    beforeKeys.add(`${ids[0]}-${ids[1]}`);
  }

  function pairKey({ a, b }) {
    const ids = [a.tile.instanceId, b.tile.instanceId].sort((x, y) => x - y);
    return `${ids[0]}-${ids[1]}`;
  }

  function isNewPair(pair) {
    return !beforeKeys.has(pairKey(pair));
  }

  // 第一波：拖动后新出现的配对
  let toEliminate = findAllPairs(stateAfterDrag).filter(isNewPair);
  if (toEliminate.length === 0) return []; // 无新配对 → 移动无效

  const waves = [];
  let current = stateAfterDrag;

  while (toEliminate.length > 0) {
    // 去重：每张牌只参与一对
    const usedIds = new Set();
    const validPairs = [];
    for (const pair of toEliminate) {
      const idA = pair.a.tile.instanceId;
      const idB = pair.b.tile.instanceId;
      if (!usedIds.has(idA) && !usedIds.has(idB)) {
        validPairs.push(pair);
        usedIds.add(idA);
        usedIds.add(idB);
      }
    }
    if (validPairs.length === 0) break;

    const positions = validPairs.flatMap(({ a, b }) => [
      { row: a.row, col: a.col },
      { row: b.row, col: b.col },
    ]);
    const newState = eliminateTiles(current, positions);
    waves.push({ eliminated: validPairs, stateAfter: newState });

    // 下一波：消除后全局扫描，只取新出现的配对（不在 beforeKeys 中）
    toEliminate = findAllPairs(newState).filter(isNewPair);
    current = newState;
  }

  return waves;
}

// 死局重排：保留所有牌的位置，随机重新分配剩余牌型
// 保证重排后至少存在一个可消除配对，最多重试200次
function reshuffleRemainingTiles(state) {
  const occupied = [];
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const tile = state.grid[r][c];
      if (tile !== null) occupied.push({ row: r, col: c, tile });
    }
  }
  if (occupied.length === 0) return state;

  const typeIds = occupied.map(o => o.tile.tileTypeId);

  function fisherYates(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildState(shuffledIds) {
    const ops = occupied.map((o, i) => {
      const def = TILE_TYPES[shuffledIds[i]];
      return {
        row: o.row, col: o.col,
        tile: {
          instanceId: o.tile.instanceId,
          tileTypeId: def.id,
          type: def.type,
          value: def.value,
          label: def.label,
          topChar: def.topChar,
          bottomChar: def.bottomChar,
          image: def.image,
        },
      };
    });
    return setTiles(state, ops);
  }

  for (let attempt = 0; attempt < 200; attempt++) {
    const newState = buildState(fisherYates(typeIds));
    if (findAllPairs(newState).length > 0) return newState;
  }
  return buildState(fisherYates(typeIds));
}
