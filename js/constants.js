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
  const RATIO      = 4 / 3;
  const MIN_TILE_W = 26;
  const BASE_GAP   = 4;
  const BASE_PAD   = 12;

  // ── 1. 精确测量可用区域 ────────────────────────────────────────────────
  // 检测是否处于手机横屏侧边栏模式（对应 CSS @media (max-height:500px) and (orientation:landscape)）
  const isMobileLandscape = window.innerHeight <= 500 && window.innerWidth > window.innerHeight;

  let availW, availH;
  if (isMobileLandscape) {
    // 标题已隐藏，toolbar 变为左侧竖列侧边栏，需减去其宽度
    const toolbarEl = document.querySelector('.toolbar');
    const sidebarW  = toolbarEl ? toolbarEl.offsetWidth : 80;
    availW = window.innerWidth  - sidebarW - 8;  // 8 = gap + body padding
    availH = window.innerHeight - 8;             // 8 = body 上下 padding
  } else {
    const headerEl  = document.querySelector('header');
    const toolbarEl = document.querySelector('.toolbar');
    const chromeH   = (headerEl  ? headerEl.offsetHeight  : 0)
                    + (toolbarEl ? toolbarEl.offsetHeight : 0)
                    + 20;
    availW = window.innerWidth  - 24;
    availH = window.innerHeight - chromeH;
  }

  // ── 2. 计算给定行列数能放的最大牌宽 ──────────────────────────────────
  function calcTileW(cols, rows) {
    const byW = (availW - BASE_PAD * 2 + BASE_GAP) / cols - BASE_GAP;
    const byH = (availH - BASE_PAD * 2 + BASE_GAP) / rows / RATIO - BASE_GAP;
    return Math.min(byW, byH);
  }

  // 给定牌宽，计算棋盘实际面积
  function boardArea(cols, rows, tw) {
    const th  = Math.round(tw * RATIO);
    const gap = Math.max(2, Math.round(tw * BASE_GAP / 60));
    const pad = Math.max(6, Math.round(tw * BASE_PAD  / 60));
    return (cols * (tw + gap) - gap + pad * 2) *
           (rows * (th  + gap) - gap + pad * 2);
  }

  // ── 3. 枚举所有合法布局，选棋盘面积最大的 ────────────────────────────
  let bestCols = 17, bestRows = 8, bestW = 0, bestArea = 0;

  for (let cols = 4; cols <= 34; cols++) {
    const rows = Math.ceil(TOTAL_TILES / cols);
    if (rows < 4) continue;
    if (cols * rows - TOTAL_TILES >= cols) continue;

    const w = calcTileW(cols, rows);
    if (w < MIN_TILE_W) continue;

    const tw   = Math.floor(w / 2) * 2;
    const area = boardArea(cols, rows, tw);
    if (area > bestArea) { bestArea = area; bestW = tw; bestCols = cols; bestRows = rows; }
  }

  // ── 4. 横屏时：若 17×8 面积不比最优差超过 15%，强制使用 17×8 ────────
  const isLandscape = availW >= availH;
  if (isLandscape) {
    const w17 = calcTileW(17, 8);
    if (w17 >= MIN_TILE_W) {
      const tw17 = Math.floor(w17 / 2) * 2;
      const a17  = boardArea(17, 8, tw17);
      if (a17 >= bestArea * 0.85) {
        bestCols = 17; bestRows = 8; bestW = tw17;
      }
    }
  }

  // ── 5. 写回全局变量 ────────────────────────────────────────────────────
  BOARD_COLS = bestCols;
  BOARD_ROWS = bestRows;
  applyTileSize(Math.max(MIN_TILE_W, bestW));

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
