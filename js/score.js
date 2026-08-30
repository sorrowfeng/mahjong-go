// score.js — 计分与星级评定（纯逻辑，可独立测试）
//
// 与 gameController 内的 combo 计数配合：每波消除后把该波的消除对数与连击
// 状态喂给 score.js，由它计算本波得分并累加。胜利/结算时输出总分与星级。
//
// 计分规则：
//   basePerPair  每消除一对基础分 100
//   连锁倍率     当前波是第 n 波连锁时 ×(1 + 0.5·(n-1))；n≥1，首波倍率 1
//   连击奖励     单局连击值(combo)≥k 时额外加分，奖励随连击阶梯增长
//   效率奖励     一次拖动同时消除多对（gain>1）时额外 +40·(gain-1)
//   步数奖励     结算时每剩余 1 步 +10 分（仅步数模式有 moveBudget）
//   时间奖励     结算时每剩余 1 秒 +2 分（仅限时模式有 timeBudget）

const BASE_PER_PAIR = 100;
const CHAIN_FACTOR = 0.5;          // 每多一波连锁 +0.5 倍
const EFFICIENCY_BONUS = 40;       // 一次消除多对的单对额外分
const COMBO_STEP = 5;              // 每攒满 5 连击触发一档连击奖励
const COMBO_BONUS = 80;            // 每档连击奖励分
const REMAIN_MOVE_BONUS = 10;      // 每剩余一步
const REMAIN_SECOND_BONUS = 2;     // 每剩余一秒

// 纯函数：计算"一波"消除的得分
// waveInfo: {
//   pairs,         本波消除对数（>0）
//   chainIndex,    本波是第几波连锁（从 1 开始；非连锁独立消除也传 1）
//   comboCount,    本局累计连击值（registerCombo 后的 combo.count）
// }
// 返回 { points, breakdown: { base, chain, efficiency, combo } }
function wavePoints(waveInfo) {
  const pairs = Math.max(1, Math.floor(waveInfo.pairs) || 1);
  const chainIndex = Math.max(1, Math.floor(waveInfo.chainIndex) || 1);
  const comboCount = Math.max(0, Math.floor(waveInfo.comboCount) || 0);

  const base = pairs * BASE_PER_PAIR;
  const chain = Math.round(base * (chainIndex - 1) * CHAIN_FACTOR);
  const efficiency = Math.max(0, pairs - 1) * EFFICIENCY_BONUS;
  const combo = Math.floor(comboCount / COMBO_STEP) * COMBO_BONUS;

  return {
    points: base + chain + efficiency + combo,
    breakdown: { base, chain, efficiency, combo },
  };
}

// 创建本局累计器（可持久化到 score 面板）
function createScore() {
  return {
    total: 0,
    pairs: 0,        // 累计消除对数
    maxChain: 0,     // 单局最长连锁波数
    maxCombo: 0,     // 单局最高连击值
    waves: 0,        // 总消除波数
    comboBonus: 0,   // 累计连击奖励分（供调试/展示）
  };
}

// 把一波消除的结果并入累计器
function addWave(acc, waveInfo) {
  const { points, breakdown } = wavePoints(waveInfo);
  const pairs = Math.max(1, Math.floor(waveInfo.pairs) || 1);
  const chainIndex = Math.max(1, Math.floor(waveInfo.chainIndex) || 1);
  const comboCount = Math.max(0, Math.floor(waveInfo.comboCount) || 0);
  return {
    ...acc,
    total: acc.total + points,
    pairs: acc.pairs + pairs,
    maxChain: Math.max(acc.maxChain, chainIndex),
    maxCombo: Math.max(acc.maxCombo, comboCount),
    waves: acc.waves + 1,
    comboBonus: acc.comboBonus + breakdown.combo,
  };
}

// 结算：叠加剩余步数/剩余时间奖励，输出最终分与星级门槛判定数据。
// settle: {
//   acc,            累计器（createScore 产物）
//   moveRemaining,  剩余步数（步数模式）；null = 不适用
//   secondRemaining,剩余秒数（限时模式）；null = 不适用
//   starThresholds, 星级门槛 [s1, s2, s3]（分数达到 s1=1星，s2=2星，s3=3星）
// }
// 返回 { total, breakdown:{steps,time}, stars }
function settleScore({ acc, moveRemaining = null, secondRemaining = null, starThresholds = null }) {
  const stepBonus = moveRemaining == null ? 0 : Math.max(0, Math.floor(moveRemaining)) * REMAIN_MOVE_BONUS;
  const timeBonus = secondRemaining == null ? 0 : Math.max(0, Math.floor(secondRemaining)) * REMAIN_SECOND_BONUS;
  const total = acc.total + stepBonus + timeBonus;

  let stars = 0;
  if (Array.isArray(starThresholds) && starThresholds.length >= 3) {
    if (total >= starThresholds[2]) stars = 3;
    else if (total >= starThresholds[1]) stars = 2;
    else if (total >= starThresholds[0]) stars = 1;
  }

  return { total, breakdown: { steps: stepBonus, time: timeBonus }, stars };
}

// 默认星级门槛：按"整局理想分"推算，保证 3 星可达但不轻易拿到。
//   idealPairs = 全牌 136 张 → 68 对
//   假设平均 2 波连锁 → 理想 base≈68*100*1.5=10200
//   s1 = 60%，s2 = 85%，s3 = 110%
function defaultStarThresholds() {
  const ideal = Math.round(68 * BASE_PER_PAIR * 1.5);
  return [
    Math.round(ideal * 0.6),
    Math.round(ideal * 0.85),
    Math.round(ideal * 1.1),
  ];
}

// 分数榜（按模式分别记录，localStorage）
const SCORES_KEY = 'mahjong-scores-v1';

function loadScores() {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (e) {
    return {};
  }
}

function saveScores(scores) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
  } catch (e) { /* 隐私模式或存储不可用 */ }
  return scores;
}

// 结算一局分数榜记录：只保留每模式最佳分。
// result: { mode, total, stars, elapsed, moves }
// 返回 { best, isNewBest }
function recordScore(result) {
  const scores = loadScores();
  const key = result.mode || 'classic';
  const prev = scores[key] || null;
  const entry = {
    total: result.total,
    stars: result.stars,
    elapsed: result.elapsed,
    moves: result.moves,
  };
  const isNewBest = !prev || result.total > prev.total;
  if (isNewBest) {
    scores[key] = entry;
    saveScores(scores);
  }
  return { best: isNewBest ? entry : prev, isNewBest };
}

function getBestScore(mode) {
  const scores = loadScores();
  return scores[mode] || null;
}

export {
  BASE_PER_PAIR, CHAIN_FACTOR, EFFICIENCY_BONUS, COMBO_STEP, COMBO_BONUS,
  REMAIN_MOVE_BONUS, REMAIN_SECOND_BONUS,
  wavePoints, createScore, addWave, settleScore, defaultStarThresholds,
  SCORES_KEY, loadScores, saveScores, recordScore, getBestScore,
};
