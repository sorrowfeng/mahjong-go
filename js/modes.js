// modes.js — 游戏模式定义（参数包）+ 种子化随机
//
// 核心约束：模式只是"规则层参数"，不改动 gameLogic 的消除算子。
// 消除玩法完全相同，模式通过 timeBudget/moveBudget/undoLimit/hintLimit 等
// 参数叠加规则，通过 seed 控制发牌可复现性（每日挑战全网同题）。

// 模式定义表。字段含义：
//   id            模式唯一标识
//   name          展示名
//   timeBudget    限时秒数；null = 不限时
//   moveBudget    步数上限；null = 不限步
//   undoLimit     撤销次数上限；null/Infinity = 不限制
//   hintLimit     提示次数上限；null/Infinity = 不限制
//   seedType      'random'（经典/限时/步数，Math.random）
//                 'daily'  （每日，YYYY-MM-DD 派生种子，全网可复现）
//   scoring       true 时启用计分 + 星级结算
const MODES = Object.freeze({
  classic: {
    id: 'classic', name: '经典', timeBudget: null, moveBudget: null,
    undoLimit: null, hintLimit: null, seedType: 'random', scoring: false,
  },
  timed60: {
    id: 'timed60', name: '限时 60 秒', timeBudget: 60, moveBudget: null,
    undoLimit: null, hintLimit: null, seedType: 'random', scoring: true,
  },
  timed120: {
    id: 'timed120', name: '限时 120 秒', timeBudget: 120, moveBudget: null,
    undoLimit: null, hintLimit: null, seedType: 'random', scoring: true,
  },
  moves30: {
    id: 'moves30', name: '步数 30', timeBudget: null, moveBudget: 30,
    undoLimit: null, hintLimit: null, seedType: 'random', scoring: true,
  },
  moves50: {
    id: 'moves50', name: '步数 50', timeBudget: null, moveBudget: 50,
    undoLimit: null, hintLimit: null, seedType: 'random', scoring: true,
  },
  daily: {
    id: 'daily', name: '每日挑战', timeBudget: null, moveBudget: null,
    undoLimit: null, hintLimit: null, seedType: 'daily', scoring: true,
  },
});

const MODE_IDS = Object.keys(MODES);
const DEFAULT_MODE_ID = 'classic';

// 合法模式回退
function isValidMode(id) {
  return Object.prototype.hasOwnProperty.call(MODES, id);
}

function getMode(id) {
  return isValidMode(id) ? MODES[id] : MODES[DEFAULT_MODE_ID];
}

// 该模式是否不限步/不限时（便于 UI 判断是否显示对应计数器）
function hasTimeBudget(mode) {
  return mode != null && Number.isFinite(mode.timeBudget) && mode.timeBudget > 0;
}

function hasMoveBudget(mode) {
  return mode != null && Number.isFinite(mode.moveBudget) && mode.moveBudget > 0;
}

// ── 种子化随机 ────────────────────────────────────────────────────────
// mulberry32：小而快、确定性的 PRNG，用于每日挑战复现发牌。
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 把任意字符串哈希为 32 位种子（每日挑战用日期串）
function hashSeed(str) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 本机日期 YYYY-MM-DD（补零）
function dateSeed(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 由日期串得到每日挑战的确定性 rng
function dailyRngForDate(dateStr = dateSeed()) {
  return mulberry32(hashSeed('mahjong-daily:' + dateStr));
}

// 解析模式得到该局的 rng：random 模式用 Math.random，daily 用种子化 rng。
// 返回 { rng, dailyDate }，dailyDate 仅在 daily 模式下非 null。
function resolveRng(mode, date) {
  if (mode && mode.seedType === 'daily') {
    const ds = dateSeed(date);
    return { rng: dailyRngForDate(ds), dailyDate: ds };
  }
  return { rng: Math.random, dailyDate: null };
}

export {
  MODES, MODE_IDS, DEFAULT_MODE_ID,
  isValidMode, getMode, hasTimeBudget, hasMoveBudget,
  mulberry32, hashSeed, dateSeed, dailyRngForDate, resolveRng,
};
