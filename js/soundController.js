// soundController.js — 程序化音效（Web Audio API）

const SoundController = (() => {
  let _ctx         = null;
  let _masterGain  = null;
  let _compressor  = null;
  let _volume      = 0.42;
  let _enabled     = true;

  const NOTE = {
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98,
  };

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function _ensureMaster() {
    const ctx = _getCtx();
    if (!_masterGain) {
      _compressor = ctx.createDynamicsCompressor();
      _compressor.threshold.value = -18;
      _compressor.knee.value = 18;
      _compressor.ratio.value = 5;
      _compressor.attack.value = 0.004;
      _compressor.release.value = 0.18;

      _masterGain = ctx.createGain();
      _masterGain.gain.value = _volume;
      _masterGain.connect(_compressor);
      _compressor.connect(ctx.destination);
    }
    return _masterGain;
  }

  function _envGain(when, attack, hold, release, peak) {
    const ctx = _getCtx();
    const gain = ctx.createGain();
    const start = Math.max(when, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), start + attack);
    gain.gain.setValueAtTime(Math.max(peak, 0.0001), start + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + release);
    return gain;
  }

  function _tone(freq, options = {}) {
    if (!_enabled) return null;
    const ctx = _getCtx();
    const when = options.when ?? ctx.currentTime;
    const attack = options.attack ?? 0.006;
    const hold = options.hold ?? 0.018;
    const release = options.release ?? 0.12;
    const gainPeak = options.gain ?? 0.16;
    const duration = attack + hold + release;
    const osc = ctx.createOscillator();
    const gain = _envGain(when, attack, hold, release, gainPeak);

    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(freq, when);
    if (options.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(options.slideTo, when + duration * 0.75);
    }

    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filter.type || 'lowpass';
      filter.frequency.setValueAtTime(options.filter.frequency || 2400, when);
      filter.Q.value = options.filter.q ?? 0.8;
      if (options.filter.endFrequency) {
        filter.frequency.exponentialRampToValueAtTime(options.filter.endFrequency, when + duration);
      }
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(_ensureMaster());
    osc.start(when);
    osc.stop(when + duration + 0.04);
    return osc;
  }

  function _bell(freq, when, gain = 0.13, release = 0.18) {
    _tone(freq, {
      when,
      type: 'triangle',
      gain,
      attack: 0.004,
      hold: 0.012,
      release,
      filter: { type: 'lowpass', frequency: 4200, endFrequency: 1200, q: 0.9 },
    });
    _tone(freq * 2.01, {
      when,
      type: 'sine',
      gain: gain * 0.24,
      attack: 0.002,
      hold: 0.01,
      release: release * 0.75,
      filter: { type: 'highpass', frequency: 900, q: 0.5 },
    });
  }

  function _softNoise(when, duration, gainPeak, filterFreq) {
    if (!_enabled) return;
    const ctx = _getCtx();
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const fade = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * fade;
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = _envGain(when, 0.004, duration * 0.12, duration * 0.72, gainPeak);
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, when);
    filter.Q.value = 1.2;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(_ensureMaster());
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function playTileClick() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _bell(NOTE.G5, now, 0.12, 0.16);
    _bell(NOTE.C6, now + 0.045, 0.10, 0.2);
  }

  function playSlideSuccess() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, index) => {
      _bell(freq, now + index * 0.045, 0.105, 0.18);
    });
  }

  function playInvalidMove() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _tone(NOTE.D4, {
      when: now,
      type: 'triangle',
      gain: 0.12,
      attack: 0.006,
      hold: 0.03,
      release: 0.16,
      slideTo: NOTE.C4,
      filter: { type: 'lowpass', frequency: 900, endFrequency: 420, q: 0.7 },
    });
    _softNoise(now + 0.02, 0.09, 0.025, 260);
  }

  function playChainWave(waveIndex) {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    const offset = Math.min(waveIndex, 5) * 18;
    const notes = [NOTE.E5 + offset, NOTE.G5 + offset, NOTE.A5 + offset];
    notes.forEach((freq, index) => {
      _bell(freq, now + index * 0.04, 0.11 - index * 0.015, 0.18);
    });
    if (waveIndex > 0) {
      _bell(NOTE.C6 + offset, now + 0.15, 0.08, 0.22);
    }
  }

  function playVictory() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    const melody = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.D6, NOTE.C6];
    melody.forEach((freq, index) => {
      _bell(freq, now + index * 0.105, index < 4 ? 0.13 : 0.1, 0.28);
    });
    [NOTE.C4, NOTE.G4, NOTE.C5].forEach(freq => {
      _tone(freq, {
        when: now + 0.66,
        type: 'sine',
        gain: 0.055,
        attack: 0.04,
        hold: 0.18,
        release: 0.55,
      });
    });
  }

  function playNewGame() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5].forEach((freq, index) => {
      _bell(freq, now + index * 0.05, 0.095, 0.2);
    });
  }

  function playReshuffle() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _softNoise(now, 0.34, 0.05, 1200);
    [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6].forEach((freq, index) => {
      _bell(freq, now + index * 0.035, 0.065, 0.18);
    });
  }

  function playTileFlip(rowIndex) {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    const base = NOTE.C5 + Math.min(rowIndex, 10) * 10;
    _tone(base, {
      when: now,
      type: 'triangle',
      gain: 0.04,
      attack: 0.002,
      hold: 0.008,
      release: 0.07,
      filter: { type: 'lowpass', frequency: 2400, endFrequency: 900, q: 0.6 },
    });
  }

  function playButtonClick() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _bell(NOTE.E5, now, 0.055, 0.09);
  }

  function setEnabled(on) {
    _enabled = on;
  }

  function isEnabled() {
    return _enabled;
  }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    if (_masterGain) _masterGain.gain.value = _volume;
  }

  return {
    playTileClick,
    playSlideSuccess,
    playInvalidMove,
    playChainWave,
    playVictory,
    playNewGame,
    playReshuffle,
    playTileFlip,
    playButtonClick,
    setEnabled,
    isEnabled,
    setVolume,
  };
})();

export { SoundController };
