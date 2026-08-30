// stats.js — 游戏统计（localStorage 聚合）
//
// 与 gameController 内的"最佳成绩"（mahjong-best-v1，胜利弹窗显示用）并存：
// 这里维护跨局聚合视角（总局数/胜率/累计消除/最长连锁等），供统计面板展示。

const STATS_KEY = 'mahjong-stats-v1';

function emptyStats() {
  return {
    gamesStarted: 0,   // 开过的正式局数（不含教学）
    victories: 0,      // 通关次数
    bestTime: null,    // 最快通关（秒）
    bestMoves: null,   // 最少步数通关
    totalPairs: 0,     // 累计消除对数
    maxCombo: 0,       // 单局最长连击
    totalHints: 0,     // 累计提示次数
    totalTime: 0,      // 累计游戏时长（秒，只累计通关局）
  };
}

function _readRaw() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) {
    return null; // 存档损坏时从零开始，不清空原始数据（下次写入会覆盖）
  }
}

function loadStats() {
  const raw = _readRaw();
  if (!raw) return emptyStats();
  // 逐字段校验合并，兼容未来新增字段
  const base = emptyStats();
  const merged = { ...base };
  for (const key of Object.keys(base)) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) merged[key] = v;
  }
  return merged;
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) { /* 隐私模式或存储不可用 */ }
  return stats;
}

// 纯函数：开局 +1
function mergeGameStart(stats) {
  return { ...stats, gamesStarted: stats.gamesStarted + 1 };
}

// 纯函数：合并一局结算数据
// result: { won, elapsed, moves, pairs, maxCombo, hints }
function mergeGameResult(stats, result) {
  const won = result.won === true;
  const elapsed = Math.max(0, Math.floor(result.elapsed) || 0);
  const moves = Math.max(0, Math.floor(result.moves) || 0);
  const pairs = Math.max(0, Math.floor(result.pairs) || 0);
  const maxCombo = Math.max(0, Math.floor(result.maxCombo) || 0);
  const hints = Math.max(0, Math.floor(result.hints) || 0);

  return {
    ...stats,
    victories: stats.victories + (won ? 1 : 0),
    bestTime: won
      ? (stats.bestTime == null ? elapsed : Math.min(stats.bestTime, elapsed))
      : stats.bestTime,
    bestMoves: won
      ? (stats.bestMoves == null ? moves : Math.min(stats.bestMoves, moves))
      : stats.bestMoves,
    totalPairs: stats.totalPairs + pairs,
    maxCombo: Math.max(stats.maxCombo, maxCombo),
    totalHints: stats.totalHints + hints,
    totalTime: stats.totalTime + (won ? elapsed : 0),
  };
}

function recordGameStart() {
  return saveStats(mergeGameStart(loadStats()));
}

function recordGameResult(result) {
  return saveStats(mergeGameResult(loadStats(), result));
}

// ── 统计面板渲染 ─────────────────────────────────────────────────────

function _fmtTime(secs) {
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600).toString().padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function buildStatRows(stats) {
  const winRate = stats.gamesStarted > 0
    ? Math.round((stats.victories / stats.gamesStarted) * 100) + '%'
    : '—';
  return [
    ['开局局数', String(stats.gamesStarted)],
    ['通关次数', String(stats.victories)],
    ['胜率', winRate],
    ['最快通关', _fmtTime(stats.bestTime)],
    ['最少步数通关', stats.bestMoves == null ? '—' : `${stats.bestMoves} 步`],
    ['累计消除', `${stats.totalPairs} 对`],
    ['最长连击', stats.maxCombo > 0 ? `x${stats.maxCombo}` : '—'],
    ['累计提示', `${stats.totalHints} 次`],
  ];
}

function renderStatsPanel() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;
  const stats = loadStats();
  grid.textContent = '';
  for (const [label, value] of buildStatRows(stats)) {
    const item = document.createElement('div');
    item.className = 'stats-grid__item';
    const labelEl = document.createElement('span');
    labelEl.className = 'stats-grid__label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'stats-grid__value';
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    grid.appendChild(item);
  }
}

function showStatsPanel() {
  renderStatsPanel();
  const panel = document.getElementById('stats-panel');
  if (panel) panel.classList.remove('hidden');
}

function hideStatsPanel() {
  const panel = document.getElementById('stats-panel');
  if (panel) panel.classList.add('hidden');
}

export {
  STATS_KEY,
  emptyStats, loadStats, saveStats,
  mergeGameStart, mergeGameResult,
  recordGameStart, recordGameResult,
  buildStatRows, renderStatsPanel, showStatsPanel, hideStatsPanel,
};
