import { wavePoints, createScore, addWave, settleScore, defaultStarThresholds, recordScore, getBestScore, loadScores } from '../js/score.js';

// 清理 localStorage，隔离每个用例
beforeEach(() => {
  localStorage.clear();
});

describe('score.js 计分', () => {
  test('wavePoints：基础分每对 100', () => {
    const r = wavePoints({ pairs: 1, chainIndex: 1, comboCount: 0 });
    expect(r.points).toBe(100);
    expect(r.breakdown.base).toBe(100);
    expect(r.breakdown.chain).toBe(0);
  });

  test('wavePoints：连锁倍率随波数递增', () => {
    // 首波 1 对 = 100
    const w1 = wavePoints({ pairs: 1, chainIndex: 1, comboCount: 0 });
    // 第 2 波 1 对 = 100 + 100*0.5 = 150
    const w2 = wavePoints({ pairs: 1, chainIndex: 2, comboCount: 0 });
    // 第 3 波 1 对 = 100 + 100*1 = 200
    const w3 = wavePoints({ pairs: 1, chainIndex: 3, comboCount: 0 });
    expect(w1.points).toBe(100);
    expect(w2.points).toBe(150);
    expect(w3.points).toBe(200);
  });

  test('wavePoints：一次多对效率奖励', () => {
    // 一次消除 3 对（首波）：base 300 + efficiency (3-1)*40 = 80 → 380
    const r = wavePoints({ pairs: 3, chainIndex: 1, comboCount: 0 });
    expect(r.points).toBe(380);
    expect(r.breakdown.efficiency).toBe(80);
  });

  test('wavePoints：连击奖励按档位', () => {
    // comboCount 10 → 2 档 * 80 = 160
    const r = wavePoints({ pairs: 1, chainIndex: 1, comboCount: 10 });
    expect(r.breakdown.combo).toBe(160);
    expect(r.points).toBe(100 + 160);
  });

  test('createScore/addWave：累加总分与统计', () => {
    let acc = createScore();
    acc = addWave(acc, { pairs: 2, chainIndex: 1, comboCount: 0 }); // 200+40=240
    acc = addWave(acc, { pairs: 1, chainIndex: 2, comboCount: 0 }); // 150
    expect(acc.total).toBe(390);
    expect(acc.pairs).toBe(3);
    expect(acc.maxChain).toBe(2);
    expect(acc.waves).toBe(2);
  });

  test('settleScore：叠加剩余步数/时间奖励与星级', () => {
    const acc = createScore();
    const after = addWave(acc, { pairs: 4, chainIndex: 1, comboCount: 0 }); // 400+120=520
    const r = settleScore({
      acc: after,
      moveRemaining: 5,
      secondRemaining: null,
      starThresholds: [300, 500, 700],
    });
    // 520 + 5*10 = 570 → 达到 s2(500)，未到 s3(700) → 2 星
    expect(r.total).toBe(570);
    expect(r.breakdown.steps).toBe(50);
    expect(r.stars).toBe(2);
  });

  test('settleScore：时间奖励与 3 星', () => {
    const acc = createScore();
    const after = addWave(acc, { pairs: 4, chainIndex: 1, comboCount: 0 }); // 520
    const r = settleScore({
      acc: after,
      moveRemaining: null,
      secondRemaining: 100,
      starThresholds: [300, 500, 700],
    });
    // 520 + 100*2 = 720 → 3 星
    expect(r.breakdown.time).toBe(200);
    expect(r.stars).toBe(3);
  });

  test('settleScore：无门槛时不评星', () => {
    const acc = createScore();
    const r = settleScore({ acc, starThresholds: null });
    expect(r.stars).toBe(0);
    expect(r.breakdown.steps).toBe(0);
    expect(r.breakdown.time).toBe(0);
  });

  test('defaultStarThresholds：返回升序三个门槛', () => {
    const t = defaultStarThresholds();
    expect(t).toHaveLength(3);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
  });
});

describe('score.js 分数榜', () => {
  test('recordScore：记录最佳分，新纪录返回 isNewBest', () => {
    const r1 = recordScore({ mode: 'timed60', total: 800, stars: 2, elapsed: 30, moves: 20 });
    expect(r1.isNewBest).toBe(true);
    expect(getBestScore('timed60').total).toBe(800);

    // 较低分不覆盖
    const r2 = recordScore({ mode: 'timed60', total: 500, stars: 1, elapsed: 40, moves: 25 });
    expect(r2.isNewBest).toBe(false);
    expect(getBestScore('timed60').total).toBe(800);

    // 更高分覆盖
    const r3 = recordScore({ mode: 'timed60', total: 1200, stars: 3, elapsed: 20, moves: 15 });
    expect(r3.isNewBest).toBe(true);
    expect(getBestScore('timed60').total).toBe(1200);
  });

  test('不同模式分数独立', () => {
    recordScore({ mode: 'classic', total: 100 });
    recordScore({ mode: 'moves30', total: 200 });
    expect(getBestScore('classic').total).toBe(100);
    expect(getBestScore('moves30').total).toBe(200);
  });

  test('loadScores：损坏数据返回空对象', () => {
    localStorage.setItem('mahjong-scores-v1', 'not-json');
    expect(loadScores()).toEqual({});
  });
});
