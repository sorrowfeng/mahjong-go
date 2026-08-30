import { LEVELS, LEVEL_COUNT, getLevel, hasLevel, defaultProgress, loadProgress, saveProgress, isUnlocked, recordLevelResult, levelStarThresholds, makeLevel, pickTypes } from '../js/levels.js';

describe('levels', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('关卡定义', () => {
    test('定义了 12 个关卡', () => {
      expect(LEVEL_COUNT).toBe(12);
      expect(LEVELS).toHaveLength(12);
    });

    test('每个关卡 id 唯一且从 1 递增', () => {
      const ids = LEVELS.map(l => l.id);
      expect(new Set(ids).size).toBe(12);
      expect(ids).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    });

    test('每个关卡牌数 = rows×cols（满棋盘）', () => {
      for (const lv of LEVELS) {
        const tileCount = lv.tileTypeIds.length * lv.copies;
        expect(tileCount).toBe(lv.rows * lv.cols);
      }
    });

    test('每个关卡 copies 为偶数（保证成对可配）', () => {
      for (const lv of LEVELS) {
        expect(lv.copies % 2).toBe(0);
      }
    });

    test('难度递进：moveBudget 单调不增', () => {
      const budgets = LEVELS.map(l => l.moveBudget).filter(b => b != null);
      for (let i = 1; i < budgets.length; i++) {
        expect(budgets[i] <= budgets[i-1]).toBe(true);
      }
    });

    test('后续关卡限制更严：hintLimit/undoLimit 单调不增', () => {
      for (let i = 1; i < LEVELS.length; i++) {
        const prev = LEVELS[i-1], cur = LEVELS[i];
        expect(cur.hintLimit == null ? Infinity : cur.hintLimit)
          .toBeLessThanOrEqual(prev.hintLimit == null ? Infinity : prev.hintLimit);
        expect(cur.undoLimit == null ? Infinity : cur.undoLimit)
          .toBeLessThanOrEqual(prev.undoLimit == null ? Infinity : prev.undoLimit);
      }
    });
  });

  describe('查询', () => {
    test('getLevel 返回对应关卡', () => {
      expect(getLevel(1).name).toBe('初来乍到');
      expect(getLevel(12).name).toBe('登峰造极');
    });
    test('getLevel 非法 id 返回 null', () => {
      expect(getLevel(0)).toBeNull();
      expect(getLevel(13)).toBeNull();
      expect(getLevel('a')).toBeNull();
    });
    test('hasLevel', () => {
      expect(hasLevel(1)).toBe(true);
      expect(hasLevel(99)).toBe(false);
    });
  });

  describe('进度', () => {
    test('defaultProgress 默认解锁第 1 关', () => {
      const p = defaultProgress();
      expect(p.unlocked).toBe(1);
      expect(p.stars).toEqual({});
    });

    test('loadProgress 空存档返回默认', () => {
      expect(loadProgress().unlocked).toBe(1);
    });

    test('saveProgress/loadProgress 往返', () => {
      const p = { unlocked: 5, stars: { 3: 2 } };
      saveProgress(p);
      expect(loadProgress()).toEqual(p);
    });

    test('loadProgress 损坏容错', () => {
      localStorage.setItem('mahjong-progress-v1', '{bad json');
      expect(loadProgress().unlocked).toBe(1);
    });

    test('isUnlocked', () => {
      const p = { unlocked: 3, stars: {} };
      expect(isUnlocked(p, 1)).toBe(true);
      expect(isUnlocked(p, 3)).toBe(true);
      expect(isUnlocked(p, 4)).toBe(false);
    });
  });

  describe('recordLevelResult', () => {
    test('记录星级并解锁下一关', () => {
      const p = defaultProgress();
      const next = recordLevelResult(p, 1, 3);
      expect(next.stars[1]).toBe(3);
      expect(next.unlocked).toBe(2);
      // 不修改入参
      expect(p.unlocked).toBe(1);
    });

    test('星级取最高', () => {
      let p = defaultProgress();
      p = recordLevelResult(p, 1, 2);
      p = recordLevelResult(p, 1, 3);
      expect(p.stars[1]).toBe(3);
    });

    test('最后一关解锁不越界', () => {
      const p = { unlocked: 12, stars: {} };
      const next = recordLevelResult(p, 12, 1);
      expect(next.unlocked).toBe(12);
    });

    test('0 星不记录', () => {
      const next = recordLevelResult(defaultProgress(), 1, 0);
      expect(next.stars[1]).toBeUndefined();
    });

    test('非法关卡返回原进度', () => {
      const p = defaultProgress();
      expect(recordLevelResult(p, 99, 3)).toBe(p);
    });
  });

  describe('levelStarThresholds', () => {
    test('使用关卡自带星级数组', () => {
      const lv = LEVELS[0];
      expect(levelStarThresholds(lv, 1000)).toEqual(lv.stars);
    });

    test('无星级数组时按比例回退', () => {
      const lv = makeLevel({ id: 99, name: 'x', rows: 4, cols: 4, wan: 4, tiao: 4, zi: 0, tong: 0, copies: 2, seed: 'x' });
      expect(lv.stars).toBeNull();
      const th = levelStarThresholds(lv, 1000);
      expect(th).toEqual([600, 850, 1000]);
    });
  });

  describe('makeLevel / pickTypes', () => {
    test('pickTypes 返回期望的牌型数量', () => {
      expect(pickTypes({ wan: 9, tiao: 9, tong: 9, zi: 7 }).count).toBe(34);
      expect(pickTypes({ wan: 5, tiao: 5, tong: 5, zi: 3 }).count).toBe(18);
    });

    test('makeLevel 生成满棋盘关卡', () => {
      const lv = makeLevel({ id: 99, name: 't', rows: 6, cols: 8, wan: 6, tiao: 6, tong: 6, zi: 6, copies: 2, seed: 's' });
      expect(lv.tileTypeIds.length * lv.copies).toBe(48);
      expect(lv.rows * lv.cols).toBe(48);
      expect(lv.seed).toBe('s');
    });
  });
});
