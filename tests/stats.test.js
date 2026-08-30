// stats.test.js — 统计聚合纯逻辑 + 面板渲染

const {
  STATS_KEY, emptyStats, loadStats, saveStats,
  mergeGameStart, mergeGameResult, buildStatRows,
  renderStatsPanel, showStatsPanel, hideStatsPanel,
} = require('../js/stats.js');

describe('stats.mergeGameStart', () => {
  test('开局 +1', () => {
    const s = mergeGameStart(emptyStats());
    expect(s.gamesStarted).toBe(1);
  });
});

describe('stats.mergeGameResult', () => {
  const base = emptyStats();

  test('胜利局：累计通关/消除/提示/时长，更新最佳', () => {
    const s = mergeGameResult(base, { won: true, elapsed: 120, moves: 40, pairs: 60, maxCombo: 5, hints: 2 });
    expect(s).toMatchObject({
      victories: 1, bestTime: 120, bestMoves: 40,
      totalPairs: 60, maxCombo: 5, totalHints: 2, totalTime: 120,
    });
  });

  test('失败局不计入胜利/最佳/时长，但累计消除', () => {
    const s = mergeGameResult(base, { won: false, elapsed: 90, moves: 10, pairs: 20, maxCombo: 0, hints: 1 });
    expect(s).toMatchObject({
      victories: 0, bestTime: null, bestMoves: null,
      totalPairs: 20, maxCombo: 0, totalHints: 1, totalTime: 0,
    });
  });

  test('最佳时间/步数取最小值', () => {
    let s = mergeGameResult(base, { won: true, elapsed: 200, moves: 80, pairs: 0, maxCombo: 0, hints: 0 });
    s = mergeGameResult(s, { won: true, elapsed: 100, moves: 90, pairs: 0, maxCombo: 0, hints: 0 });
    expect(s.bestTime).toBe(100);
    expect(s.bestMoves).toBe(80);
  });

  test('非法数值安全兜底为 0', () => {
    const s = mergeGameResult(base, { won: true, elapsed: 'abc', moves: NaN, pairs: -5, maxCombo: null, hints: undefined });
    expect(s).toMatchObject({
      victories: 1, bestTime: 0, bestMoves: 0,
      totalPairs: 0, maxCombo: 0, totalHints: 0,
    });
  });
});

describe('stats.load/save', () => {
  beforeEach(() => localStorage.clear());

  test('无存档返回空统计', () => {
    expect(loadStats()).toEqual(emptyStats());
  });

  test('损坏存档返回空统计', () => {
    localStorage.setItem(STATS_KEY, 'not-json');
    expect(loadStats()).toEqual(emptyStats());
  });

  test('字段校验：只接受有限数值', () => {
    saveStats({ gamesStarted: 3, victories: 'x', maxCombo: Infinity });
    const s = loadStats();
    expect(s.gamesStarted).toBe(3);
    expect(s.victories).toBe(0);
    expect(s.maxCombo).toBe(0);
  });
});

describe('stats.buildStatRows', () => {
  test('胜率/最快/最长连击格式化', () => {
    const s = { ...emptyStats(), gamesStarted: 4, victories: 2, bestTime: 61, bestMoves: 30, maxCombo: 6 };
    const rows = buildStatRows(s);
    const byLabel = Object.fromEntries(rows);
    expect(byLabel['胜率']).toBe('50%');
    expect(byLabel['最快通关']).toBe('00:01:01');
    expect(byLabel['最少步数通关']).toBe('30 步');
    expect(byLabel['最长连击']).toBe('x6');
  });

  test('无数据时显示占位符', () => {
    const rows = buildStatRows(emptyStats());
    const byLabel = Object.fromEntries(rows);
    expect(byLabel['胜率']).toBe('—');
    expect(byLabel['最快通关']).toBe('—');
    expect(byLabel['最少步数通关']).toBe('—');
    expect(byLabel['最长连击']).toBe('—');
  });
});

describe('stats.panel DOM', () => {
  test('renderStatsPanel 填充 grid；show/hide 切换 hidden', () => {
    const grid = document.createElement('div');
    grid.id = 'stats-grid';
    const panel = document.createElement('div');
    panel.id = 'stats-panel';
    panel.classList.add('hidden');
    document.body.append(grid, panel);

    renderStatsPanel();
    expect(grid.querySelectorAll('.stats-grid__item').length).toBeGreaterThan(0);

    showStatsPanel();
    expect(panel.classList.contains('hidden')).toBe(false);
    hideStatsPanel();
    expect(panel.classList.contains('hidden')).toBe(true);

    grid.remove();
    panel.remove();
  });

  test('无 DOM 时静默返回', () => {
    expect(() => renderStatsPanel()).not.toThrow();
    expect(() => showStatsPanel()).not.toThrow();
  });
});
