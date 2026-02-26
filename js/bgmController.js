// bgmController.js — 程序化背景音乐（Web Audio API）
// 风格：C 大调五声音阶，轻松弹拨感，参考欢乐斗地主风格
// 结构：主旋律 + 和弦伴奏 + 低音，循环播放

const BgmController = (() => {
  let _ctx        = null;
  let _masterGain = null;
  let _volume     = 0.22;
  let _gen        = 0;   // 每次 play/stop 自增，旧循环回调通过比对自动失效

  const N = {
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00,
    C6: 1046.5,
    C3: 130.81, G3: 196.00, A3: 220.00, E3: 164.81, D3: 146.83,
  };

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  // 每次 play 创建新的 masterGain，stop 时直接 disconnect 旧的
  function _createMasterGain() {
    const ctx = _getCtx();
    if (_masterGain) {
      try { _masterGain.disconnect(); } catch (_) {}
    }
    _masterGain = ctx.createGain();
    _masterGain.gain.value = _volume;
    _masterGain.connect(ctx.destination);
    return _masterGain;
  }

  // ── 乐器合成 ────────────────────────────────────────────────────

  function _pluck(mg, freq, startTime, duration, gainPeak) {
    const ctx  = _getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    const lpf  = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, startTime);

    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(3000, startTime);
    lpf.frequency.exponentialRampToValueAtTime(600, startTime + duration * 0.8);
    lpf.Q.value = 1.5;

    gain.gain.setValueAtTime(gainPeak, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(lpf);
    lpf.connect(gain);
    gain.connect(mg);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  function _pad(mg, freq, startTime, duration, gainPeak) {
    const ctx  = _getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.04);
    gain.gain.setValueAtTime(gainPeak, startTime + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(mg);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  function _bass(mg, freq, startTime, duration, gainPeak) {
    const ctx  = _getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    const lpf  = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    lpf.type            = 'lowpass';
    lpf.frequency.value = 400;

    gain.gain.setValueAtTime(gainPeak, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(lpf);
    lpf.connect(gain);
    gain.connect(mg);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  // ── 乐谱 ────────────────────────────────────────────────────────

  const BPM  = 112;
  const BEAT = 60 / BPM;
  const BAR  = BEAT * 4;

  const MELODY = [
    [N.C5, 0.5], [N.E5, 0.5], [N.G5, 1],   [N.A5, 1],   [N.G5, 1],
    [N.E5, 0.5], [N.G5, 0.5], [N.E5, 1],   [N.C5, 1],   [N.D5, 1],
    [N.E5, 1],   [N.D5, 0.5], [N.C5, 0.5], [N.D5, 1],   [N.E5, 1],
    [N.G4, 1],   [N.A4, 1],   [N.C5, 1],   [N.A4, 0.5], [N.G4, 0.5],
    [N.C5, 0.5], [N.D5, 0.5], [N.E5, 0.5], [N.G5, 0.5], [N.A5, 1],   [N.G5, 1],
    [N.E5, 1],   [N.D5, 1],   [N.C5, 0.5], [N.E5, 0.5], [N.D5, 1],
    [N.G5, 0.5], [N.E5, 0.5], [N.D5, 1],   [N.C5, 1],   [N.E5, 1],
    [N.G4, 0.5], [N.A4, 0.5], [N.C5, 1],   [N.G4, 1],   [N.C5, 1],
  ];

  const CHORDS = [
    [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4],
    [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4],
    [N.A3, N.C4, N.E4], [N.A3, N.C4, N.E4], [N.A3, N.C4, N.E4], [N.A3, N.C4, N.E4],
    [N.A3, N.C4, N.E4], [N.A3, N.C4, N.E4], [N.A3, N.C4, N.E4], [N.A3, N.C4, N.E4],
    [N.G3, N.D4, N.G4], [N.G3, N.D4, N.G4], [N.G3, N.D4, N.G4], [N.G3, N.D4, N.G4],
    [N.G3, N.D4, N.G4], [N.G3, N.D4, N.G4], [N.G3, N.D4, N.G4], [N.G3, N.D4, N.G4],
    [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4],
    [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4],
  ];

  const BASSLINE = [
    N.C3, N.C3, N.G3, N.G3,
    N.C3, N.C3, N.G3, N.C3,
    N.A3, N.A3, N.E3, N.E3,
    N.A3, N.C3, N.G3, N.C3,
    N.G3, N.G3, N.D3, N.D3,
    N.G3, N.G3, N.G3, N.C3,
    N.C3, N.E3, N.G3, N.C3,
    N.C3, N.G3, N.C3, N.G3,
  ];

  // ── 排程一次循环（绑定到特定 gen 和 masterGain）────────────────

  function _scheduleLoop(mg, loopStart, gen) {
    if (_gen !== gen) return; // 旧循环，直接丢弃

    const ctx = _getCtx();

    // 主旋律
    let t = loopStart;
    for (const [freq, beats] of MELODY) {
      const dur = beats * BEAT;
      _pluck(mg, freq, t, dur * 0.85, 0.55);
      t += dur;
    }

    // 和弦伴奏
    for (let i = 0; i < CHORDS.length; i++) {
      const ct = loopStart + i * BEAT * 0.5;
      for (const freq of CHORDS[i]) {
        _pad(mg, freq, ct, BEAT * 0.45, 0.07);
      }
    }

    // 低音线
    for (let i = 0; i < BASSLINE.length; i++) {
      _bass(mg, BASSLINE[i], loopStart + i * BEAT, BEAT * 0.7, 0.35);
    }

    const loopDuration = BAR * 8;
    const nextStart    = loopStart + loopDuration;
    const delay        = (nextStart - ctx.currentTime - 0.1) * 1000;

    setTimeout(() => _scheduleLoop(mg, nextStart, gen), Math.max(delay, 0));
  }

  // ── 公开 API ─────────────────────────────────────────────────────

  function play() {
    _gen++;                        // 使所有旧循环回调失效
    const mg  = _createMasterGain();
    const ctx = _getCtx();
    _scheduleLoop(mg, ctx.currentTime + 0.05, _gen);
  }

  function stop() {
    _gen++;                        // 使所有正在调度的循环回调失效
    if (_masterGain) {
      const ctx = _getCtx();
      const mg  = _masterGain;
      // 淡出后断开，彻底阻止后续音符到达扬声器
      mg.gain.cancelScheduledValues(ctx.currentTime);
      mg.gain.setValueAtTime(mg.gain.value, ctx.currentTime);
      mg.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      setTimeout(() => {
        try { mg.disconnect(); } catch (_) {}
      }, 500);
      _masterGain = null;
    }
  }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    if (_masterGain) _masterGain.gain.value = _volume;
  }

  function isPlaying() {
    // 有活跃的 masterGain 且未被 stop 断开
    return _masterGain !== null;
  }

  return { play, stop, setVolume, isPlaying };
})();
