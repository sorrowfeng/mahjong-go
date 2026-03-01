// movementLogic.js — 牌组选中、移动验证、碰撞检测

/**
 * 选中连续牌组：
 * 从起始位置出发，沿指定方向收集与其连续相邻（无间隔）的所有牌。
 * 返回 [{row, col, tile}]，已按位置排序。
 */
function selectGroup(state, startRow, startCol, direction) {
  const group = [];
  const startTile = getTile(state, startRow, startCol);
  if (!startTile) return group;

  group.push({ row: startRow, col: startCol, tile: startTile });

  if (direction === DIR.HORIZONTAL) {
    // 向左收集
    for (let c = startCol - 1; c >= 0; c--) {
      const t = getTile(state, startRow, c);
      if (!t) break;
      group.unshift({ row: startRow, col: c, tile: t });
    }
    // 向右收集
    for (let c = startCol + 1; c < state.width; c++) {
      const t = getTile(state, startRow, c);
      if (!t) break;
      group.push({ row: startRow, col: c, tile: t });
    }
  } else {
    // VERTICAL
    // 向上收集
    for (let r = startRow - 1; r >= 0; r--) {
      const t = getTile(state, r, startCol);
      if (!t) break;
      group.unshift({ row: r, col: startCol, tile: t });
    }
    // 向下收集
    for (let r = startRow + 1; r < state.height; r++) {
      const t = getTile(state, r, startCol);
      if (!t) break;
      group.push({ row: r, col: startCol, tile: t });
    }
  }

  return group;
}

/**
 * 计算牌组可移动的最大格数（正方向和负方向）。
 * 方向：HORIZONTAL → 正=右/负=左；VERTICAL → 正=下/负=上
 *
 * 返回 { maxPositive, maxNegative }（均为非负整数）
 */
function calcMaxSlide(state, group, direction) {
  if (direction === DIR.HORIZONTAL) {
    const row = group[0].row;
    const minCol = Math.min(...group.map(g => g.col));
    const maxCol = Math.max(...group.map(g => g.col));

    // 向左：找左边第一个障碍
    let maxNegative = minCol; // 最多移到列0
    for (let c = minCol - 1; c >= 0; c--) {
      if (getTile(state, row, c) !== null) {
        maxNegative = minCol - c - 1;
        break;
      }
    }

    // 向右：找右边第一个障碍
    let maxPositive = state.width - 1 - maxCol; // 最多移到最右列
    for (let c = maxCol + 1; c < state.width; c++) {
      if (getTile(state, row, c) !== null) {
        maxPositive = c - maxCol - 1;
        break;
      }
    }

    return { maxPositive, maxNegative };
  } else {
    // VERTICAL
    const col = group[0].col;
    const minRow = Math.min(...group.map(g => g.row));
    const maxRow = Math.max(...group.map(g => g.row));

    // 向上
    let maxNegative = minRow;
    for (let r = minRow - 1; r >= 0; r--) {
      if (getTile(state, r, col) !== null) {
        maxNegative = minRow - r - 1;
        break;
      }
    }

    // 向下
    let maxPositive = state.height - 1 - maxRow;
    for (let r = maxRow + 1; r < state.height; r++) {
      if (getTile(state, r, col) !== null) {
        maxPositive = r - maxRow - 1;
        break;
      }
    }

    return { maxPositive, maxNegative };
  }
}

/**
 * 应用滑动：将牌组移动 delta 格，返回新 BoardState。
 * delta 正数=右/下，负数=左/上。
 * 假设已通过碰撞检测（delta在合法范围内）。
 */
function applySlide(state, group, direction, delta) {
  if (delta === 0) return state;

  const clearOps = group.map(g => ({ row: g.row, col: g.col, tile: null }));
  const setOps = group.map(g => {
    if (direction === DIR.HORIZONTAL) {
      return { row: g.row, col: g.col + delta, tile: g.tile };
    } else {
      return { row: g.row + delta, col: g.col, tile: g.tile };
    }
  });

  // 先清除，再放置
  let newState = setTiles(state, clearOps);
  newState = setTiles(newState, setOps);
  return newState;
}

/**
 * 将像素偏移量转换为格数（向零取整），并钳制到最大范围。
 */
function pixelsToCells(pixels, direction) {
  if (direction === DIR.HORIZONTAL) {
    return Math.round(pixels / (TILE_WIDTH + TILE_GAP));
  } else {
    return Math.round(pixels / (TILE_HEIGHT + TILE_GAP));
  }
}

/**
 * 钳制 delta 到合法范围
 */
function clampDelta(delta, maxPositive, maxNegative) {
  // || 0 消除 JavaScript 的 -0（当 maxNegative=0 时 -maxNegative=-0）
  return Math.max(-maxNegative, Math.min(maxPositive, delta)) || 0;
}
