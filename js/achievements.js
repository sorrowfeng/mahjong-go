// achievements.js — 成就系统（数据驱动 + 纯逻辑 + toast 通知）
//
// 成就定义数据化，判定逻辑为纯函数（输入当前状态快照 → 返回新解锁的成就 id）。
// 达成时通过注入的 notify 回调弹出 toast（避免依赖 DOM，便于测试）。
//
// 判定输入 unified"事件快照"，聚合来自 gameController 的各类事件：
//   { event, ... }  event ∈ 'victory' | 'pairs' | 'chain' | 'level'
//   victory: { won, mode, stars, moves, hints, undoUsed, isDaily }
//   pairs:   { totalPairs }        累计消除对数（来自 stats）
//   chain:   { maxChain }          本局最长连锁
//   level:   { starsCount, levelId }

const ACH_KEY = 'mahjong-achievements-v1';

// 成就定义表。check(ctx, current, stats) 返回 true 表示达成。
// ctx 是上面的事件快照；current 是当前已解锁成就集合（Set 语义的 {id:true}）。
const ACHIEVEMENTS = Object.freeze([
  { id: 'first_victory',   name: '初露锋芒',   icon: '🏆', desc: '首次通关',       check: (ctx) => ctx.event === 'victory' },
  { id: 'veteran_10',      name: '常胜将军',   icon: '⚔️', desc: '累计通关 10 次',  check: (ctx, cur, stats) => stats.victories >= 10 },
  { id: 'pairs_100',       name: '百发百中',   icon: '🎯', desc: '累计消除 100 对', check: (ctx, cur, stats) => stats.totalPairs >= 100 },
  { id: 'pairs_500',       name: '千锤百炼',   icon: '🔨', desc: '累计消除 500 对', check: (ctx, cur, stats) => stats.totalPairs >= 500 },
  { id: 'chain_5',         name: '连锁大师',   icon: '⛓️', desc: '单局触发 5 段连锁', check: (ctx) => ctx.event === 'chain' && ctx.maxChain >= 5 },
  { id: 'clean_win',       name: '无懈可击',   icon: '🧹', desc: '无提示、无撤销通关', check: (ctx) => ctx.event === 'victory' && ctx.moves > 0 && ctx.hints === 0 && ctx.undoUsed === 0 },
  { id: 'daily_streak_7',  name: '风雨无阻',   icon: '📅', desc: '连续 7 天完成每日挑战', check: (ctx, cur, stats) => ctx.event === 'victory' && !!ctx.isDaily },
  { id: 'level_3star',     name: '完美主义者', icon: '⭐', desc: '任一关卡三星通关', check: (ctx) => ctx.event === 'level' && ctx.starsCount >= 3 },
  { id: 'level_all',       name: '登峰造极',   icon: '👑', desc: '全部关卡通关',   check: (ctx, cur, stats) => ctx.event === 'level' && !!ctx.allLevelsDone },
  { id: 'move_swift',      name: '行云流水',   icon: '💨', desc: '30 步以内通关',  check: (ctx) => ctx.event === 'victory' && ctx.moves > 0 && ctx.moves <= 30 },
]);

const ACHIEVEMENT_IDS = ACHIEVEMENTS.map(a => a.id);

function defaultAchievements() {
  return { unlocked: {}, notified: {} };
}

// 读取存档（损坏容错）
function loadAchievements() {
  try {
    const raw = localStorage.getItem(ACH_KEY);
    if (!raw) return defaultAchievements();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultAchievements();
    return {
      unlocked: (parsed.unlocked && typeof parsed.unlocked === 'object') ? parsed.unlocked : {},
      notified: (parsed.notified && typeof parsed.notified === 'object') ? parsed.notified : {},
    };
  } catch (e) {
    return defaultAchievements();
  }
}

function saveAchievements(acc) {
  try {
    localStorage.setItem(ACH_KEY, JSON.stringify(acc));
  } catch (e) { /* 隐私模式或存储不可用 */ }
  return acc;
}

function isUnlocked(acc, id) {
  return acc.unlocked[id] === true;
}

function unlockCount(acc) {
  return ACHIEVEMENTS.filter(a => isUnlocked(acc, a.id)).length;
}

// 纯函数：根据事件快照 + 统计，判定并返回新解锁的成就 id 列表。
// 不修改入参；同时返回更新后的 achievements 状态。
function evaluateEvent(acc, ctx, stats) {
  const next = {
    unlocked: { ...acc.unlocked },
    notified: { ...acc.notified },
  };
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (next.unlocked[a.id]) continue;
    let ok = false;
    try {
      ok = a.check(ctx, next.unlocked, stats) === true;
    } catch (e) {
      ok = false;
    }
    if (ok) {
      next.unlocked[a.id] = true;
      newly.push(a.id);
    }
  }
  return { acc: next, newly };
}

// 便捷：判定并持久化 + 通过 notify 通知。返回 newly。
// notify: (achievement) => void，用于 toast 展示；缺省不通知。
function recordEvent(ctx, stats, notify = null) {
  const acc = loadAchievements();
  const { acc: next, newly } = evaluateEvent(acc, ctx, stats);
  if (newly.length > 0) {
    saveAchievements(next);
    if (typeof notify === 'function') {
      for (const id of newly) {
        if (!next.notified[id]) {
          const def = ACHIEVEMENTS.find(a => a.id === id);
          if (def) notify(def);
        }
      }
    }
  }
  return newly;
}

export {
  ACH_KEY, ACHIEVEMENTS, ACHIEVEMENT_IDS,
  defaultAchievements, loadAchievements, saveAchievements,
  isUnlocked, unlockCount, evaluateEvent, recordEvent,
};
