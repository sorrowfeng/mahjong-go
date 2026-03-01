// constants.js — 全局常量定义

const TOTAL_TILES = 136;

// 行列数：运行时由 recalcTileSize() 根据屏幕动态设置
let BOARD_COLS = 17;
let BOARD_ROWS = 8;

// 牌尺寸：运行时由 recalcTileSize() 覆盖
let TILE_WIDTH   = 60;
let TILE_HEIGHT  = 80;
let TILE_GAP     = 4;
let BOARD_PADDING = 12;

/**
 * 根据当前可用视口同时计算最优行列数和牌尺寸，并同步到 CSS 变量。
 * 必须在 createEmptyBoard / renderBoard 之前调用。
 *
 * 算法：
 *  1. 枚举所有满足 cols*rows >= 136 的 (cols, rows) 组合（cols 2-34，rows 向上取整）
 *  2. 对每个组合按可用空间计算能放下的最大牌宽 w
 *  3. 选 w 最大的组合（牌最大 = 最好看最易操作）
 *  4. 横屏默认保持 17×8，不超过桌面上限 60px
 */
function recalcTileSize() {
  const BASE_GAP      = 4;
  const BASE_PADDING  = 12;
  const RATIO         = 4 / 3;   // 宽高比 3:4
  const MIN_TILE_W    = 28;       // 最小触控尺寸
  const MAX_TILE_W    = 60;       // 桌面上限

  // 可用区域（减去页面 chrome：标题+工具栏+间距+padding）
  const CHROME_H = 165;
  const CHROME_W = 32;
  const availW = window.innerWidth  - CHROME_W;
  const availH = window.innerHeight - CHROME_H;

  // 给定行列数，计算能放下的最大牌宽
  function maxTileW(cols, rows) {
    const byW = Math.floor((availW - BASE_PADDING * 2 + BASE_GAP) / cols) - BASE_GAP;
    const byH = Math.floor(((availH - BASE_PADDING * 2 + BASE_GAP) / rows - BASE_GAP) * RATIO);
    return Math.min(byW, byH);
  }

  // 枚举候选布局：cols 从 2 到 34，rows 向上取整保证能放下所有牌
  // 额外约束：
  //   - cols*rows 恰好等于 TOTAL_TILES（不浪费格子），或允许最多多出半行
  //   - 排除明显不合理的极端细长布局（cols < 4 或 rows < 4）
  let bestW  = -1;
  let bestCols = 17;
  let bestRows = 8;

  for (let cols = 4; cols <= 34; cols++) {
    const rows = Math.ceil(TOTAL_TILES / cols);
    if (rows < 4) continue;               // 行数太少不合理
    if (cols * rows > TOTAL_TILES + cols) continue; // 浪费超过一整行

    const w = maxTileW(cols, rows);
    if (w < MIN_TILE_W) continue;         // 牌太小，跳过

    const clampedW = Math.min(w, MAX_TILE_W);
    if (clampedW > bestW) {
      bestW    = clampedW;
      bestCols = cols;
      bestRows = rows;
    }
  }

  // 更新全局行列数
  BOARD_COLS = bestCols;
  BOARD_ROWS = bestRows;

  // 计算最终牌尺寸（对齐到偶数避免亚像素模糊）
  let w = Math.max(MIN_TILE_W, Math.min(MAX_TILE_W, bestW));
  w = Math.floor(w / 2) * 2;

  TILE_WIDTH    = w;
  TILE_HEIGHT   = Math.round(w * RATIO);
  TILE_GAP      = Math.max(2, Math.round(w * BASE_GAP     / 60));
  BOARD_PADDING = Math.max(6, Math.round(w * BASE_PADDING / 60));

  // 同步 CSS 变量
  const root = document.documentElement;
  root.style.setProperty('--tile-w', TILE_WIDTH  + 'px');
  root.style.setProperty('--tile-h', TILE_HEIGHT + 'px');
}

// 动画时长（毫秒）
const ANIM = {
  SLIDE_DURATION: 180,
  ELIMINATE_DURATION: 300,
  REVERT_DURATION: 200,
  HINT_PULSE_DURATION: 600,
  CHAIN_DELAY: 100,
};

// 拖拽阈值（像素）
const DRAG_THRESHOLD = 10;

// 方向枚举
const DIR = {
  NONE: 'none',
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
};

// 游戏状态枚举
const GAME_STATE = {
  IDLE: 'IDLE',
  DRAGGING: 'DRAGGING',
  ANIMATING: 'ANIMATING',
  VICTORY: 'VICTORY',
};

// 牌类型枚举
const TILE_TYPE = {
  WAN: 'wan',    // 万子
  TIAO: 'tiao',  // 条子
  TONG: 'tong',  // 筒子
  ZI: 'zi',      // 字牌
};

// 最大撤销步数
const MAX_UNDO_STEPS = 20;

// 开局可解最大重试次数
const MAX_SHUFFLE_RETRIES = 100;
