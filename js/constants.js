// constants.js — 全局常量定义

const BOARD_COLS = 17;
const BOARD_ROWS = 8;
const TOTAL_TILES = 136;

// 牌尺寸：初始默认值，运行时由 recalcTileSize() 覆盖
let TILE_WIDTH   = 60;
let TILE_HEIGHT  = 80;
let TILE_GAP     = 4;
let BOARD_PADDING = 12;

/**
 * 根据当前可用视口计算最优牌尺寸，并同步到 CSS 变量。
 * 需在 renderBoard 之前调用。
 */
function recalcTileSize() {
  // 工具栏 + 标题 + 页面上下 padding 占用的垂直空间（估算）
  const CHROME_H = 160;
  // 页面左右 padding
  const CHROME_W = 40;
  // 计算中使用固定基准间距，避免循环依赖
  const BASE_GAP     = 4;
  const BASE_PADDING = 12;

  const availW = window.innerWidth  - CHROME_W;
  const availH = window.innerHeight - CHROME_H;

  // 保持宽高比 3:4（原始 60×80）
  const RATIO = 4 / 3;

  // 由宽度反推单格宽度
  const scaleByW = Math.floor(
    (availW - BASE_PADDING * 2 + BASE_GAP) / BOARD_COLS
  ) - BASE_GAP;

  // 由高度反推单格宽度
  const scaleByH = Math.floor(
    ((availH - BASE_PADDING * 2 + BASE_GAP) / BOARD_ROWS - BASE_GAP) * RATIO
  );

  // 取两者最小值，保证不超出任何一边
  let w = Math.min(scaleByW, scaleByH);

  // 桌面端上限 60px，下限 28px（手机最小可操作尺寸）
  w = Math.max(28, Math.min(60, w));
  // 宽度对齐到偶数，避免亚像素模糊
  w = Math.floor(w / 2) * 2;

  TILE_WIDTH    = w;
  TILE_HEIGHT   = Math.round(w * RATIO);
  TILE_GAP      = Math.max(2, Math.round(w * BASE_GAP     / 60));
  BOARD_PADDING = Math.max(6, Math.round(w * BASE_PADDING / 60));

  // 同步到 CSS 变量，供 tile.css 使用
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
