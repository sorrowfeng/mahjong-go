import { MODES, MODE_IDS, DEFAULT_MODE_ID, isValidMode, getMode, hasTimeBudget, hasMoveBudget, mulberry32, hashSeed, dateSeed, dailyRngForDate, resolveRng } from '../js/modes.js';
import { generateDeck, shuffleDeck } from '../js/tileDefinitions.js';

describe('modes.js 模式定义', () => {
  test('定义合法模式集合', () => {
    expect(MODE_IDS).toContain('classic');
    expect(MODE_IDS).toContain('timed60');
    expect(MODE_IDS).toContain('timed120');
    expect(MODE_IDS).toContain('moves30');
    expect(MODE_IDS).toContain('moves50');
    expect(MODE_IDS).toContain('daily');
  });

  test('isValidMode / getMode 回退', () => {
    expect(isValidMode('classic')).toBe(true);
    expect(isValidMode('unknown')).toBe(false);
    expect(getMode('unknown').id).toBe(DEFAULT_MODE_ID);
    expect(getMode('timed60').id).toBe('timed60');
  });

  test('hasTimeBudget / hasMoveBudget', () => {
    expect(hasTimeBudget(MODES.timed60)).toBe(true);
    expect(hasTimeBudget(MODES.classic)).toBe(false);
    expect(hasMoveBudget(MODES.moves30)).toBe(true);
    expect(hasMoveBudget(MODES.classic)).toBe(false);
  });

  test('经典模式默认无限制', () => {
    const c = MODES.classic;
    expect(c.timeBudget).toBeNull();
    expect(c.moveBudget).toBeNull();
    expect(c.scoring).toBe(false);
  });
});

describe('modes.js 种子化随机', () => {
  test('mulberry32 确定性', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    expect(seqA.every(x => x >= 0 && x < 1)).toBe(true);
  });

  test('不同种子产生不同序列', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).not.toEqual(seqB);
  });

  test('hashSeed 稳定且区分不同输入', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  test('dateSeed 格式化补零', () => {
    expect(dateSeed(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateSeed(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  test('dailyRngForDate 同日期可复现洗牌', () => {
    const deck = generateDeck();
    const rngA = dailyRngForDate('2026-08-30');
    const rngB = dailyRngForDate('2026-08-30');
    const shuffleA = shuffleDeck(deck, rngA);
    const shuffleB = shuffleDeck(deck, rngB);
    expect(shuffleA.map(t => t.instanceId)).toEqual(shuffleB.map(t => t.instanceId));

    // 不同日期不同结果
    const rngC = dailyRngForDate('2026-08-31');
    const shuffleC = shuffleDeck(deck, rngC);
    expect(shuffleA.map(t => t.instanceId)).not.toEqual(shuffleC.map(t => t.instanceId));
  });

  test('resolveRng：daily 模式返回种子化 rng 与日期，random 返回 Math.random', () => {
    const daily = resolveRng(MODES.daily, new Date(2026, 7, 30));
    expect(daily.dailyDate).toBe('2026-08-30');
    expect(daily.rng).not.toBe(Math.random);

    const random = resolveRng(MODES.classic);
    expect(random.dailyDate).toBeNull();
    expect(random.rng).toBe(Math.random);
  });
});
