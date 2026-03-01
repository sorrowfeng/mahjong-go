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
  const RATIO       = 4 / 3;  // 牌宽高比 3:4
  const MIN_TILE_W  = 26;      // 最小触控宽度（px）
  const BASE_GAP    = 4;
  const BASE_PAD    = 12;

  // ── 1. 精确测量可用区域 ────────────────────────────────────────────────
  // 实际测量 header + toolbar 占用的高度，比硬编码更准确
  const headerEl  = document.querySelector('header');
  const toolbarEl = document.querySelector('.toolbar');
  const chromeH   = (headerEl  ? headerEl.offsetHeight  : 0)
                  + (toolbarEl ? toolbarEl.offsetHeight : 0)
                  + 32;  // 上下 padding + 间距缓冲

  const availW = window.innerWidth  - 24;   // 左右 padding
  const availH = window.innerHeight - chromeH;

  // ── 2. 给定行列数，计算"填满可用区域"的牌宽 ──────────────────────────
  // 不设上限，让棋盘尽量充满屏幕
  function calcTileW(cols, rows) {
    const gap = BASE_GAP;
    const pad = BASE_PAD;
    const byW = (availW - pad * 2 + gap) / cols - gap;
    const byH = ((availH - pad * 2 + gap) / rows - gap) * RATIO;
    return Math.min(byW, byH);
  }

  // ── 3. 候选布局列表（按优先级排序） ─────────────────────────────────────
  // 规则：
  //   - 横屏（availW >= availH）优先 17×8
  //   - 竖屏（availW < availH） 优先 8×17
  //   - 降级候选：以 cols 步长 1 枚举，rows = ceil(136/cols)
  //     保证 cols*rows - 136 < cols（最后一行空格不超过一整行）
  const isPortrait = availW < availH;

  // 默认布局：横屏 17×8，竖屏 8×17
  const defaultCols = isPortrait ? 8  : 17;
  const defaultRows = isPortrait ? 17 : 8;

  // 构建候选列表：默认布局放第一位，其余按"与默认接近"排序
  const candidates = [];

  // 枚举合法布局
  for (let cols = 4; cols <= 34; cols++) {
    const rows = Math.ceil(TOTAL_TILES / cols);
    if (rows < 4) continue;
    if (cols * rows - TOTAL_TILES >= cols) continue; // 空格超过一行
    candidates.push({ cols, rows });
  }

  // 将默认布局提到最前面
  candidates.sort((a, b) => {
    const aIsDefault = (a.cols === defaultCols && a.rows === defaultRows) ? -1 : 0;
    const bIsDefault = (b.cols === defaultCols && b.rows === defaultRows) ? -1 : 0;
    return aIsDefault - bIsDefault;
  });

  // ── 4. 选出最优布局 ───────────────────────────────────────────────────
  // 优先选默认布局（只要牌宽 >= MIN_TILE_W 就用默认）
  // 否则在所有候选中选牌宽最大的
  let chosen     = candidates[0]; // 先置为默认
  let chosenW    = calcTileW(chosen.cols, chosen.rows);

  if (chosenW < MIN_TILE_W) {
    // 默认布局太小，枚举所有候选选最优
    let bestW = chosenW;
    for (const c of candidates) {
      const w = calcTileW(c.cols, c.rows);
      if (w > bestW) {
        bestW  = w;
        chosen = c;
      }
    }
    chosenW = bestW;
  }

  // ── 5. 写回全局变量 ────────────────────────────────────────────────────
  BOARD_COLS = chosen.cols;
  BOARD_ROWS = chosen.rows;

  // 牌宽对齐到偶数避免亚像素模糊，保证 >= MIN_TILE_W
  let w = Math.max(MIN_TILE_W, chosenW);
  w = Math.floor(w / 2) * 2;

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
