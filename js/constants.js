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
  const RATIO       = 4 / 3;  // 牌宽高比 3:4（tileH = tileW * RATIO）
  const MIN_TILE_W  = 26;      // 最小触控宽度（px）
  const BASE_GAP    = 4;
  const BASE_PAD    = 12;

  // ── 1. 精确测量可用区域 ────────────────────────────────────────────────
  const headerEl  = document.querySelector('header');
  const toolbarEl = document.querySelector('.toolbar');
  const chromeH   = (headerEl  ? headerEl.offsetHeight  : 0)
                  + (toolbarEl ? toolbarEl.offsetHeight : 0)
                  + 20;  // 上下 padding + margin 缓冲

  const availW = window.innerWidth  - 24;   // 左右 padding
  const availH = window.innerHeight - chromeH;

  // ── 2. 给定行列数，计算能放下的最大牌宽 ──────────────────────────────
  // 推导：
  //   棋盘宽 = cols*(tileW+gap) - gap + pad*2  ≤ availW
  //   棋盘高 = rows*(tileH+gap) - gap + pad*2  ≤ availH，tileH = tileW * RATIO
  //   byW = (availW - pad*2 + gap) / cols - gap
  //   byH = (availH - pad*2 + gap) / rows / RATIO - gap   ← 除以 RATIO
  function calcTileW(cols, rows) {
    const byW = (availW - BASE_PAD * 2 + BASE_GAP) / cols - BASE_GAP;
    const byH = (availH - BASE_PAD * 2 + BASE_GAP) / rows / RATIO - BASE_GAP;
    return Math.min(byW, byH);
  }

  // ── 3. 候选布局 ───────────────────────────────────────────────────────
  const isPortrait  = availW < availH;
  const defaultCols = isPortrait ? 8  : 17;
  const defaultRows = isPortrait ? 17 : 8;

  const candidates = [];
  for (let cols = 4; cols <= 34; cols++) {
    const rows = Math.ceil(TOTAL_TILES / cols);
    if (rows < 4) continue;
    if (cols * rows - TOTAL_TILES >= cols) continue; // 末行空格不超过一整行
    candidates.push({ cols, rows });
  }

  // 默认布局排最前
  candidates.sort((a, b) => {
    const aD = (a.cols === defaultCols && a.rows === defaultRows) ? -1 : 0;
    const bD = (b.cols === defaultCols && b.rows === defaultRows) ? -1 : 0;
    return aD - bD;
  });

  // ── 4. 选最优布局 ─────────────────────────────────────────────────────
  // 默认布局牌宽 >= MIN_TILE_W 就直接用；否则枚举选牌最大的
  let chosen  = candidates[0];
  let chosenW = calcTileW(chosen.cols, chosen.rows);

  if (chosenW < MIN_TILE_W) {
    let bestW = chosenW;
    for (const c of candidates) {
      const w = calcTileW(c.cols, c.rows);
      if (w > bestW) { bestW = w; chosen = c; }
    }
    chosenW = bestW;
  }

  // ── 5. 写回全局变量 ────────────────────────────────────────────────────
  BOARD_COLS = chosen.cols;
  BOARD_ROWS = chosen.rows;

  let w = Math.max(MIN_TILE_W, chosenW);
  w = Math.floor(w / 2) * 2;   // 对齐到偶数，避免亚像素模糊

  TILE_WIDTH    = w;
  TILE_HEIGHT   = Math.round(w * RATIO);
  TILE_GAP      = Math.max(2, Math.round(w * BASE_GAP / 60));
  BOARD_PADDING = Math.max(6, Math.round(w * BASE_PAD  / 60));

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
