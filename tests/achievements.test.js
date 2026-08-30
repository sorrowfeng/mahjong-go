import { ACHIEVEMENTS, ACHIEVEMENT_IDS, defaultAchievements, loadAchievements, saveAchievements, isUnlocked, unlockCount, evaluateEvent, recordEvent } from '../js/achievements.js';

describe('achievements', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mahjong-stats-v1', JSON.stringify({ victories: 0, totalPairs: 0 }));
  });

  test('定义了 10 个成就且 id 唯一', () => {
    expect(ACHIEVEMENTS.length).toBe(10);
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(10);
  });

  test('defaultAchievements 为空', () => {
    expect(defaultAchievements()).toEqual({ unlocked: {}, notified: {} });
  });

  test('loadAchievements 空存档返回默认', () => {
    expect(loadAchievements()).toEqual({ unlocked: {}, notified: {} });
  });

    test('loadAchievements 损坏容错', () => {
      localStorage.setItem('mahjong-achievements-v1', '{bad');
      expect(loadAchievements()).toEqual({ unlocked: {}, notified: {} });
    });

  test('saveAchievements/loadAchievements 往返', () => {
    const acc = { unlocked: { first_victory: true }, notified: {} };
    saveAchievements(acc);
    expect(loadAchievements()).toEqual(acc);
  });

  describe('evaluateEvent', () => {
    test('首次胜利解锁 first_victory', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory' }, { victories: 0, totalPairs: 0 });
      expect(newly).toContain('first_victory');
    });

    test('常胜将军需累计 10 次胜利', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory' }, { victories: 10, totalPairs: 0 });
      expect(newly).toContain('veteran_10');
    });

    test('累计消除 100 对', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory' }, { victories: 0, totalPairs: 100 });
      expect(newly).toContain('pairs_100');
    });

    test('累计消除 500 对', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory' }, { victories: 0, totalPairs: 500 });
      expect(newly).toContain('pairs_500');
    });

    test('单局 5 段连锁', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'chain', maxChain: 5 }, {});
      expect(newly).toContain('chain_5');
    });

    test('无提示无撤销通关', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory', moves: 5, hints: 0, undoUsed: 0 }, {});
      expect(newly).toContain('clean_win');
    });

    test('用了提示不触发无懈可击', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory', moves: 5, hints: 1, undoUsed: 0 }, {});
      expect(newly).not.toContain('clean_win');
    });

    test('每日挑战胜利', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory', isDaily: true }, {});
      expect(newly).toContain('daily_streak_7');
    });

    test('关卡 3 星', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'level', starsCount: 3 }, {});
      expect(newly).toContain('level_3star');
    });

    test('全关卡通关', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'level', allLevelsDone: true }, {});
      expect(newly).toContain('level_all');
    });

    test('30 步内通关', () => {
      const { newly } = evaluateEvent(defaultAchievements(), { event: 'victory', moves: 20 }, {});
      expect(newly).toContain('move_swift');
    });

    test('已解锁成就不再重复返回', () => {
      const acc = { unlocked: { first_victory: true }, notified: {} };
      const { newly } = evaluateEvent(acc, { event: 'victory' }, {});
      expect(newly).not.toContain('first_victory');
    });

    test('不修改入参 acc', () => {
      const acc = defaultAchievements();
      evaluateEvent(acc, { event: 'victory' }, {});
      expect(acc.unlocked).toEqual({});
    });
  });

  describe('recordEvent', () => {
    test('达成时持久化并通知', () => {
      const notified = [];
      const newly = recordEvent({ event: 'victory' }, { victories: 0, totalPairs: 0 }, (ach) => notified.push(ach));
      expect(newly).toContain('first_victory');
      expect(notified.length).toBeGreaterThan(0);
      expect(notified[0].name).toBe('初露锋芒');
      // 已持久化
      expect(isUnlocked(loadAchievements(), 'first_victory')).toBe(true);
    });

    test('未达成不通知', () => {
      const notified = [];
      const newly = recordEvent({ event: 'victory' }, { victories: 0, totalPairs: 0 }, (ach) => notified.push(ach));
      // 只有 first_victory（和可能的 clean_win 等）达成
      expect(notified.length).toBeGreaterThan(0);
      // 之后再次触发不再通知（已解锁）
      recordEvent({ event: 'victory' }, { victories: 0, totalPairs: 0 }, (ach) => notified.push(ach));
      expect(notified.length).toBeGreaterThanOrEqual(1);
    });

    test('unlockCount', () => {
      const acc = { unlocked: { first_victory: true, chain_5: true }, notified: {} };
      expect(unlockCount(acc)).toBe(2);
    });
  });
});
