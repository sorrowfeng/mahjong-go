// constants.js — 全局常量定义

const TOTAL_TILES = 136;

// 行列数：运行时由 recalcLayout() 根据屏幕动态设置
let BOARD_COLS = 17;
let BOARD_ROWS = 8;

// 牌尺寸：运行时由 recalcLayout() 覆盖
let TILE_WIDTH   = 60;
let TILE_HEIGHT  = 80;
let TILE_GAP     = 4;
let BOARD_PADDING = 12;

/**
 * 根据当前可用视口计算最优行列数和牌尺寸，并同步到 CSS 变量。
 * 必须在 createEmptyBoard / renderBoard 之前调用。
 *
 * 策略：
 *  1. 精确测量页面 chrome（标题+工具栏）实际占用高度
 *  2. 优先使用"默认布局"（横屏 17×8，竖屏 8×17）
 *  3. 若默认布局下牌宽 < 最小可操作尺寸，则枚举候选布局找最优
 *  4. 最终牌尺寸以"棋盘充满可用区域"为目标，无固定上限
 */
function recalcLayout() {
  const RATIO      = 4 / 3;   // 牌宽高比（tileH = tileW * RATIO）
  const MIN_TILE_W = 26;       // 最小触控宽度（px）
  const BASE_GAP   = 4;
  const BASE_PAD   = 12;

  // ── 1. 精确测量可用区域 ────────────────────────────────────────────────
  const headerEl  = document.querySelector('header');
  const toolbarEl = document.querySelector('.toolbar');
  const chromeH   = (headerEl  ? headerEl.offsetHeight  : 0)
                  + (toolbarEl ? toolbarEl.offsetHeight : 0)
                  + 20;  // padding + margin 缓冲

  const availW = window.innerWidth  - 24;
  const availH = window.innerHeight - chromeH;

  // ── 2. 给定行列数，计算最大牌宽（同时满足宽/高约束） ──────────────────
  function calcTileW(cols, rows) {
    const byW = (availW - BASE_PAD * 2 + BASE_GAP) / cols - BASE_GAP;
    const byH = (availH - BASE_PAD * 2 + BASE_GAP) / rows / RATIO - BASE_GAP;
    return Math.min(byW, byH);
  }

  // ── 3. 确定默认布局 ───────────────────────────────────────────────────
  // 横屏优先 17×8，竖屏优先 8×17
  const isPortrait  = availW < availH;
  const defaultCols = isPortrait ? 8  : 17;
  const defaultRows = isPortrait ? 17 : 8;

  // ── 4. 优先使用默认布局 ───────────────────────────────────────────────
  // 只要默认布局下牌宽 >= MIN_TILE_W，直接使用，不再枚举
  const defaultW = calcTileW(defaultCols, defaultRows);
  if (defaultW >= MIN_TILE_W) {
    BOARD_COLS = defaultCols;
    BOARD_ROWS = defaultRows;
    applyTileSize(Math.floor(defaultW / 2) * 2);
    return;
  }

  // ── 5. 默认布局放不下，枚举所有合法布局选覆盖率最高的 ─────────────────
  let bestCols = defaultCols;
  let bestRows = defaultRows;
  let bestW    = defaultW;

  for (let cols = 4; cols <= 34; cols++) {
    const rows = Math.ceil(TOTAL_TILES / cols);
    if (rows < 4) continue;
    if (cols * rows - TOTAL_TILES >= cols) continue;

    const w = calcTileW(cols, rows);
    if (w < MIN_TILE_W) continue;
    if (w > bestW) {
      bestW    = w;
      bestCols = cols;
      bestRows = rows;
    }
  }

  BOARD_COLS = bestCols;
  BOARD_ROWS = bestRows;
  applyTileSize(Math.max(MIN_TILE_W, Math.floor(bestW / 2) * 2));

  // ── 内部辅助：写回尺寸变量并同步 CSS ────────────────────────────────
  function applyTileSize(w) {
    TILE_WIDTH    = w;
    TILE_HEIGHT   = Math.round(w * RATIO);
    TILE_GAP      = Math.max(2, Math.round(w * BASE_GAP / 60));
    BOARD_PADDING = Math.max(6, Math.round(w * BASE_PAD  / 60));
    const root = document.documentElement;
    root.style.setProperty('--tile-w', TILE_WIDTH  + 'px');
    root.style.setProperty('--tile-h', TILE_HEIGHT + 'px');
  }
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
