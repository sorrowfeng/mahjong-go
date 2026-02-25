// boardState.js — 不可变棋盘数据结构与纯函数操作

/**
 * BoardState = {
 *   grid: Array(BOARD_ROWS)[Array(BOARD_COLS)[TileInstance|null]],
 *   width: BOARD_COLS,
 *   height: BOARD_ROWS,
 * }
 * 所有变更返回新 BoardState，不修改原对象。
 */

// 创建空棋盘
function createEmptyBoard() {
  return {
    grid: Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null)),
    width: BOARD_COLS,
    height: BOARD_ROWS,
  };
}

// 从136张牌数组创建已填满的棋盘（按行填入）
function createBoardFromDeck(shuffledDeck) {
  const grid = Array.from({ length: BOARD_ROWS }, (_, row) => {
    return Array.from({ length: BOARD_COLS }, (_, col) => {
      const idx = row * BOARD_COLS + col;
      return shuffledDeck[idx] || null;
    });
  });
  return { grid, width: BOARD_COLS, height: BOARD_ROWS };
}

// 获取指定位置的牌（越界返回 null）
function getTile(state, row, col) {
  if (row < 0 || row >= state.height || col < 0 || col >= state.width) return null;
  return state.grid[row][col];
}

// 返回新 state，在指定位置放置（或清除）牌
function setTile(state, row, col, tile) {
  const newRow = state.grid[row].slice();
  newRow[col] = tile;
  const newGrid = state.grid.slice();
  newGrid[row] = newRow;
  return { ...state, grid: newGrid };
}

// 批量设置多个格子（positions: [{row, col, tile}]）
function setTiles(state, positions) {
  let newGrid = state.grid.slice();
  for (const { row, col, tile } of positions) {
    const newRow = newGrid[row].slice();
    newRow[col] = tile;
    newGrid = newGrid.slice();
    newGrid[row] = newRow;
  }
  return { ...state, grid: newGrid };
}

// 计算棋盘上剩余牌数
function countRemainingTiles(state) {
  let count = 0;
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      if (state.grid[r][c] !== null) count++;
    }
  }
  return count;
}

// 深拷贝 BoardState（用于撤销栈）
function cloneState(state) {
  return {
    grid: state.grid.map(row => row.slice()),
    width: state.width,
    height: state.height,
  };
}
