// pairDetection.js — 配对判定叶子模块（零依赖）
//
// 消除规则（统一规则1+2）：
//   对每行/每列，获取该行/列中非null牌的有序序列。
//   相邻两个 tileTypeId 相同的牌即为一对，无论中间是否有空格。
//   规则1是特例（物理相邻），规则2是同行/列无遮挡。
//
// "有序序列"指按位置排列的非null牌；"相邻"指在有序序列中紧挨着。
//
// 本模块是 **叶子模块**：不 import 任何其他业务模块，因此可被
// gameLogic、hintSystem、keyboardNav、gameController 等任意引用，
// 避免 gameLogic ↔ hintSystem 循环依赖。

// 扫描一行/列，返回可消除的牌对 [{row, col, instanceId}][]
export function scanLineForPairs(tiles) {
  // tiles: [{row, col, tile}]，已按位置排序
  // 返回所有相邻同类候选对。批量消除时再去重，避免用户点击三连中的任一可配对牌时漏判。
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
export function findAllPairs(state) {
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

// 轻量级检查：是否存在至少一对可消除的牌（找到即返回 true，不扫描全部）
export function hasAnyPair(state) {
  // 扫描每行
  for (let r = 0; r < state.height; r++) {
    let prev = null;
    for (let c = 0; c < state.width; c++) {
      const cur = state.grid[r][c];
      if (cur === null) continue;
      if (prev && prev.tileTypeId === cur.tileTypeId) return true;
      prev = cur;
    }
  }
  // 扫描每列
  for (let c = 0; c < state.width; c++) {
    let prev = null;
    for (let r = 0; r < state.height; r++) {
      const cur = state.grid[r][c];
      if (cur === null) continue;
      if (prev && prev.tileTypeId === cur.tileTypeId) return true;
      prev = cur;
    }
  }
  return false;
}
