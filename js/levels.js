// levels.js — 关卡系统（数据 + 纯逻辑）
//
// 关卡 = 纯数据对象，不写死在代码里。每个关卡通过 rows×cols 定义棋盘尺寸、
// tileTypeIds+copies 定义用到的牌型与副数、seed 固定发牌、moveBudget/hintLimit/
// undoLimit 收紧规则、targetScore+stars 定义目标。
//
// 约束：tileTypeIds.length × copies 必须恰好等于 rows×cols（满棋盘），且
// copies 为偶数（保证每型成对、可配对）。所有子集必须是"成对"的牌型数量。
//
// 核心消除逻辑不变：关卡只是把棋盘尺寸、牌型子集、规则限额以参数形式注入
// initNewGame，消除算子完全复用。

const LEVELS_KEY = 'mahjong-progress-v1';

// 牌型 id 全集（对应 tileDefinitions.TILE_TYPES 顺序：万0-8 / 条9-17 / 筒18-26 / 字27-33）
// 关卡通过"偏移+数量"取子集，保证牌型多样且分布可控。
const TYPE_RANGES = {
  wan:  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  tiao: [9, 10, 11, 12, 13, 14, 15, 16, 17],
  tong: [18, 19, 20, 21, 22, 23, 24, 25, 26],
  zi:   [27, 28, 29, 30, 31, 32, 33],
};

// 辅助：取前 n 个万子 + 前 m 个条子 + 前 k 个筒子 + 前 z 个字牌
// 返回 { ids, count }，count = ids.length。
function pickTypes({ wan = 9, tiao = 9, tong = 9, zi = 7 } = {}) {
  const ids = [
    ...TYPE_RANGES.wan.slice(0, wan),
    ...TYPE_RANGES.tiao.slice(0, tiao),
    ...TYPE_RANGES.tong.slice(0, tong),
    ...TYPE_RANGES.zi.slice(0, zi),
  ];
  return { ids, count: ids.length };
}

// 构造一个满棋盘关卡。
// rows×cols 必须等于 (wan+tiao+tong+zi) × copies。
function makeLevel({ id, name, rows, cols, wan, tiao, tong, zi, copies,
  moveBudget = null, hintLimit = null, undoLimit = null,
  targetScore = 0, stars = null, seed }) {
  const { ids } = pickTypes({ wan, tiao, tong, zi });
  return {
    id, name, rows, cols,
    tileTypeIds: ids,
    copies,
    seed: seed || `level-${id}`,
    moveBudget, hintLimit, undoLimit,
    targetScore, stars,
  };
}

// 关卡清单。难度曲线：
//   前 3 关教学/入门（宽棋盘、不限或宽裕限额）→ 中期收紧步数/提示 →
//   后期窄棋盘 + 极紧限额。
const LEVELS = Object.freeze([
  makeLevel({ id: 1,  name: '初来乍到', rows: 5, cols: 10, wan: 9, tiao: 9, tong: 7, zi: 0, copies: 2, moveBudget: null, hintLimit: 5, undoLimit: null, targetScore: 600,  stars: [400, 600, 800],  seed: 'mahjong-lv-01' }),
  makeLevel({ id: 2,  name: '渐入佳境', rows: 5, cols: 10, wan: 9, tiao: 9, tong: 7, zi: 0, copies: 2, moveBudget: 40,  hintLimit: 3, undoLimit: null, targetScore: 800,  stars: [500, 800, 1000], seed: 'mahjong-lv-02' }),
  makeLevel({ id: 3,  name: '小试牛刀', rows: 6, cols: 10, wan: 8, tiao: 8, tong: 8, zi: 6, copies: 2, moveBudget: 38,  hintLimit: 3, undoLimit: 4,   targetScore: 1000, stars: [650, 1000, 1250], seed: 'mahjong-lv-03' }),
  makeLevel({ id: 4,  name: '更上层楼', rows: 6, cols: 9,  wan: 8, tiao: 8, tong: 8, zi: 3, copies: 2, moveBudget: 35,  hintLimit: 2, undoLimit: 3,   targetScore: 1100, stars: [700, 1100, 1400], seed: 'mahjong-lv-04' }),
  makeLevel({ id: 5,  name: '举步维艰', rows: 7, cols: 8,  wan: 7, tiao: 7, tong: 7, zi: 7, copies: 2, moveBudget: 32,  hintLimit: 2, undoLimit: 3,   targetScore: 1200, stars: [800, 1200, 1500], seed: 'mahjong-lv-05' }),
  makeLevel({ id: 6,  name: '铁锁横江', rows: 7, cols: 8,  wan: 7, tiao: 7, tong: 7, zi: 7, copies: 2, moveBudget: 30,  hintLimit: 2, undoLimit: 2,   targetScore: 1300, stars: [850, 1300, 1650], seed: 'mahjong-lv-06' }),
  makeLevel({ id: 7,  name: '步步惊心', rows: 8, cols: 8,  wan: 9, tiao: 9, tong: 7, zi: 7, copies: 2, moveBudget: 28,  hintLimit: 1, undoLimit: 2,   targetScore: 1400, stars: [900, 1400, 1750], seed: 'mahjong-lv-07' }),
  makeLevel({ id: 8,  name: '决胜千里', rows: 8, cols: 7,  wan: 7, tiao: 7, tong: 7, zi: 7, copies: 2, moveBudget: 26,  hintLimit: 1, undoLimit: 1,   targetScore: 1500, stars: [1000, 1500, 1900], seed: 'mahjong-lv-08' }),
  makeLevel({ id: 9,  name: '柳暗花明', rows: 9, cols: 8,  wan: 5, tiao: 5, tong: 5, zi: 3, copies: 4, moveBudget: 24,  hintLimit: 1, undoLimit: 1,   targetScore: 1600, stars: [1050, 1600, 2000], seed: 'mahjong-lv-09' }),
  makeLevel({ id: 10, name: '扭转乾坤', rows: 10, cols: 8, wan: 5, tiao: 5, tong: 5, zi: 5, copies: 4, moveBudget: 22,  hintLimit: 1, undoLimit: 1,   targetScore: 1700, stars: [1150, 1700, 2100], seed: 'mahjong-lv-10' }),
  makeLevel({ id: 11, name: '峰回路转', rows: 8,  cols: 11, wan: 6, tiao: 6, tong: 6, zi: 4, copies: 4, moveBudget: 20,  hintLimit: 0, undoLimit: 0,   targetScore: 1800, stars: [1250, 1800, 2200], seed: 'mahjong-lv-11' }),
  makeLevel({ id: 12, name: '登峰造极', rows: 8,  cols: 12, wan: 6, tiao: 6, tong: 6, zi: 6, copies: 4, moveBudget: 18,  hintLimit: 0, undoLimit: 0,   targetScore: 2000, stars: [1400, 2000, 2400], seed: 'mahjong-lv-12' }),
]);

const LEVEL_COUNT = LEVELS.length;

// 关卡查询
function getLevel(id) {
  if (!Number.isInteger(id)) return null;
  return LEVELS.find(l => l.id === id) || null;
}

function hasLevel(id) {
  return getLevel(id) != null;
}

// 进度存取（mahjong-progress-v1）
// { unlocked: number(已解锁的最大关号), stars: { [id]: 1|2|3 } }
function defaultProgress() {
  return { unlocked: 1, stars: {} };
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(LEVELS_KEY);
    if (!raw) return defaultProgress();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return defaultProgress();
    return {
      unlocked: Number.isInteger(p.unlocked) ? Math.max(1, Math.min(LEVEL_COUNT, p.unlocked)) : 1,
      stars: (p.stars && typeof p.stars === 'object') ? p.stars : {},
    };
  } catch (e) {
    return defaultProgress();
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(progress));
  } catch (e) { /* 隐私模式或存储不可用 */ }
  return progress;
}

// 关卡是否已解锁（id <= unlocked）
function isUnlocked(progress, id) {
  return id <= progress.unlocked;
}

// 记录通关星级：写入该关星级（取最高），并解锁下一关。
// 返回更新后的进度。
function recordLevelResult(progress, levelId, stars) {
  const level = getLevel(levelId);
  if (!level) return progress;
  const next = {
    unlocked: progress.unlocked,
    stars: { ...progress.stars },
  };
  const s = Math.max(0, Math.min(3, Math.floor(stars || 0)));
  if (s > 0) next.stars[levelId] = Math.max(next.stars[levelId] || 0, s);
  if (levelId >= progress.unlocked && levelId < LEVEL_COUNT) {
    next.unlocked = levelId + 1;
  }
  return next;
}

// 关卡的目标分数达标线（默认用本关 stars 数组，缺省回退全局理想分比例）
function levelStarThresholds(level, idealScore) {
  if (level.stars && level.stars.length === 3) return level.stars;
  return [Math.round(idealScore * 0.6), Math.round(idealScore * 0.85), idealScore];
}

export {
  LEVELS, LEVEL_COUNT, LEVELS_KEY, TYPE_RANGES, pickTypes, makeLevel,
  getLevel, hasLevel, defaultProgress, loadProgress, saveProgress,
  isUnlocked, recordLevelResult, levelStarThresholds,
};
