// soundController.js — 程序化音效（Web Audio API）

const SoundController = (() => {
  let _ctx        = null;
  let _masterGain = null;
  let _volume     = 0.5;
  let _enabled    = true;

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function _ensureMaster() {
    if (!_masterGain) {
      const ctx = _getCtx();
      _masterGain = ctx.createGain();
      _masterGain.gain.value = _volume;
      _masterGain.connect(ctx.destination);
    }
    return _masterGain;
  }

  function _playTone(freq, duration, gain, when, type = 'sine') {
    if (!_enabled) return;
    const ctx   = _getCtx();
    const osc   = ctx.createOscillator();
    const gNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gNode.gain.setValueAtTime(gain, when);
    gNode.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gNode);
    gNode.connect(_ensureMaster());
    osc.start(when);
    osc.stop(when + duration + 0.01);
  }

  // ── 公开音效 ─────────────────────────────────────────────────────

  function playTileClick() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _playTone(800, 0.08, 0.3, now, 'sine');
  }

  function playSlideSuccess() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _playTone(523, 0.1, 0.35, now, 'sine');
    _playTone(659, 0.1, 0.35, now + 0.06, 'sine');
    _playTone(784, 0.15, 0.4, now + 0.12, 'sine');
  }

  function playInvalidMove() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _playTone(200, 0.15, 0.25, now, 'square');
    _playTone(180, 0.2, 0.2, now + 0.1, 'square');
  }

  function playChainWave(waveIndex) {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    const baseFreq = 600 + waveIndex * 100;
    _playTone(baseFreq, 0.12, 0.35, now, 'sine');
    _playTone(baseFreq * 1.25, 0.15, 0.3, now + 0.08, 'sine');
  }

  function playVictory() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => _playTone(f, 0.25, 0.4, now + i * 0.15, 'sine'));
  }

  function playNewGame() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _playTone(440, 0.1, 0.3, now, 'triangle');
    _playTone(554, 0.1, 0.3, now + 0.08, 'triangle');
    _playTone(659, 0.15, 0.35, now + 0.16, 'triangle');
  }

  function playReshuffle() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    for (let i = 0; i < 5; i++) {
      _playTone(300 + i * 80, 0.08, 0.2, now + i * 0.06, 'triangle');
    }
  }

  function playTileFlip(rowIndex) {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    const freq = 400 + rowIndex * 30;
    _playTone(freq, 0.06, 0.2, now, 'sine');
  }

  function playButtonClick() {
    if (!_enabled) return;
    const now = _getCtx().currentTime;
    _playTone(600, 0.04, 0.15, now, 'sine');
  }

  function setEnabled(on) {
    _enabled = on;
  }

  function isEnabled() {
    return _enabled;
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
  };
})();

export { SoundController };
