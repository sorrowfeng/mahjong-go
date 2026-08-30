import { buildShareText, _fmtClock } from '../js/share.js';

describe('share', () => {
  describe('buildShareText', () => {
    test('经典模式通关文本', () => {
      const text = buildShareText({
        modeName: '经典模式', elapsed: '01:23', moves: 42, hints: 0,
      });
      expect(text).toContain('经典模式');
      expect(text).toContain('01:23');
      expect(text).toContain('42 步');
      expect(text).toContain('#麻将消消乐');
    });

    test('关卡模式含关卡号', () => {
      const text = buildShareText({ levelId: 5, modeName: '关卡', elapsed: '00:45', moves: 20 });
      expect(text).toContain('关卡 5');
    });

    test('含得分与星级', () => {
      const text = buildShareText({
        modeName: '限时 60 秒', score: 1500, stars: 3, elapsed: '00:10', moves: 30,
      });
      expect(text).toContain('1500');
      expect(text).toContain('★★★');
    });

    test('含提示次数', () => {
      const text = buildShareText({ modeName: '经典模式', elapsed: '01:00', moves: 10, hints: 3 });
      expect(text).toContain('提示 3 次');
    });
  });

  describe('_fmtClock', () => {
    test('不足 1 小时', () => {
      expect(_fmtClock(83)).toBe('01:23');
    });
    test('超 1 小时', () => {
      expect(_fmtClock(3661)).toBe('01:01:01');
    });
    test('负值/零', () => {
      expect(_fmtClock(0)).toBe('00:00');
      expect(_fmtClock(-5)).toBe('00:00');
    });
  });
});
