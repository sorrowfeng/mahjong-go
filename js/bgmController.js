// bgmController.js — 程序化背景音乐（Web Audio API）
// 三段轻量曲目自动轮播：清新、舒缓、明快，避免单曲一直循环。

const BgmController = (() => {
  let _ctx         = null;
  let _masterGain  = null;
  let _compressor  = null;
  let _volume      = 0.18;
  let _gen         = 0;
  let _trackIndex  = 0;
  let _timer       = null;

  const N = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00,
    B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
    A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
    G5: 783.99, A5: 880.00, B5: 987.77, C6: 1046.50, D6: 1174.66, E6: 1318.51,
  };

  const TRACKS = [
    {
      name: 'Jade Morning',
      bpm: 92,
      bars: 8,
      melodyWave: 'triangle',
      melodyGain: 0.14,
      melody: [
        [N.G4, 0.5], [N.C5, 0.5], [N.D5, 1], [N.E5, 1], [N.G5, 1],
        [N.E5, 0.5], [N.D5, 0.5], [N.C5, 1], [N.A4, 1], [N.C5, 1],
        [N.D5, 0.5], [N.E5, 0.5], [N.G5, 1], [N.A5, 1], [N.G5, 1],
        [N.E5, 1], [N.D5, 1], [N.C5, 2],
        [N.C5, 0.5], [N.D5, 0.5], [N.E5, 1], [N.G5, 1], [N.E5, 1],
        [N.D5, 0.5], [N.C5, 0.5], [N.A4, 1], [N.G4, 1], [N.C5, 1],
        [N.E5, 0.5], [N.G5, 0.5], [N.A5, 1], [N.G5, 1], [N.E5, 1],
        [N.D5, 1], [N.C5, 3],
      ],
      chords: [
        [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.A3, N.C4, N.E4], [N.A3, N.C4, N.E4],
        [N.F3, N.C4, N.F4], [N.G3, N.D4, N.G4], [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4],
      ],
      bass: [N.C3, N.G3, N.A3, N.E3, N.F3, N.G3, N.C3, N.G3],
    },
    {
      name: 'Tea Garden',
      bpm: 76,
      bars: 8,
      melodyWave: 'sine',
      melodyGain: 0.12,
      melody: [
        [N.E5, 1], [N.G5, 1], [N.A5, 2], [N.G5, 1], [N.E5, 1], [N.D5, 2],
        [N.C5, 1], [N.D5, 1], [N.E5, 2], [N.G4, 1], [N.A4, 1], [N.C5, 2],
        [N.D5, 1], [N.E5, 1], [N.G5, 2], [N.E5, 1], [N.D5, 1], [N.C5, 2],
        [N.A4, 1], [N.C5, 1], [N.D5, 2], [N.G4, 1], [N.C5, 1], [N.C5, 2],
      ],
      chords: [
        [N.C4, N.E4, N.G4], [N.G3, N.D4, N.G4], [N.A3, N.E4, N.A4], [N.E3, N.B3, N.E4],
        [N.F3, N.C4, N.A4], [N.C4, N.E4, N.G4], [N.G3, N.D4, N.G4], [N.C4, N.E4, N.G4],
      ],
      bass: [N.C3, N.G3, N.A3, N.E3, N.F3, N.C3, N.G3, N.C3],
    },
    {
      name: 'Bamboo Steps',
      bpm: 108,
      bars: 8,
      melodyWave: 'triangle',
      melodyGain: 0.13,
      melody: [
        [N.C5, 0.5], [N.E5, 0.5], [N.G5, 0.5], [N.E5, 0.5], [N.A5, 1], [N.G5, 1],
        [N.E5, 0.5], [N.G5, 0.5], [N.E5, 0.5], [N.C5, 0.5], [N.D5, 1], [N.C5, 1],
        [N.G4, 0.5], [N.A4, 0.5], [N.C5, 0.5], [N.D5, 0.5], [N.E5, 1], [N.G5, 1],
        [N.A5, 0.5], [N.G5, 0.5], [N.E5, 1], [N.D5, 1], [N.C5, 1],
        [N.E5, 0.5], [N.G5, 0.5], [N.A5, 0.5], [N.G5, 0.5], [N.E5, 1], [N.D5, 1],
        [N.C5, 0.5], [N.D5, 0.5], [N.E5, 0.5], [N.G5, 0.5], [N.A5, 1], [N.C6, 1],
        [N.A5, 0.5], [N.G5, 0.5], [N.E5, 1], [N.D5, 1], [N.C5, 1],
        [N.G4, 0.5], [N.A4, 0.5], [N.C5, 1], [N.D5, 1], [N.C5, 1],
      ],
      chords: [
        [N.C4, N.E4, N.G4], [N.C4, N.E4, N.G4], [N.G3, N.D4, N.G4], [N.G3, N.D4, N.G4],
        [N.A3, N.C4, N.E4], [N.F3, N.C4, N.F4], [N.G3, N.D4, N.G4], [N.C4, N.E4, N.G4],
      ],
      bass: [N.C3, N.C3, N.G3, N.G3, N.A3, N.F3, N.G3, N.C3],
    },
  ];

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function _createMasterGain() {
    const ctx = _getCtx();
    if (_masterGain) {
      try { _masterGain.disconnect(); } catch (_) {}
    }

    _compressor = ctx.createDynamicsCompressor();
    _compressor.threshold.value = -22;
    _compressor.knee.value = 20;
    _compressor.ratio.value = 3.5;
    _compressor.attack.value = 0.008;
    _compressor.release.value = 0.28;

    _masterGain = ctx.createGain();
    _masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    _masterGain.gain.linearRampToValueAtTime(_volume, ctx.currentTime + 0.8);
    _masterGain.connect(_compressor);
    _compressor.connect(ctx.destination);
    return _masterGain;
  }

  function _voice(mg, freq, startTime, duration, gainPeak, options = {}) {
    const ctx = _getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = options.type || 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);
    if (options.detune) osc.detune.setValueAtTime(options.detune, startTime);

    filter.type = options.filterType || 'lowpass';
    filter.frequency.setValueAtTime(options.filterStart || 3600, startTime);
    filter.frequency.exponentialRampToValueAtTime(options.filterEnd || 900, startTime + duration * 0.85);
    filter.Q.value = options.q ?? 0.8;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(gainPeak, 0.0001), startTime + (options.attack ?? 0.012));
    gain.gain.setValueAtTime(Math.max(gainPeak, 0.0001), startTime + duration * (options.holdRatio ?? 0.28));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(mg);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.04);
  }

  function _pluck(mg, freq, startTime, duration, gainPeak, wave = 'triangle') {
    _voice(mg, freq, startTime, duration, gainPeak, {
      type: wave,
      attack: 0.008,
      holdRatio: 0.18,
      filterStart: 4600,
      filterEnd: 720,
      q: 1.1,
    });
    _voice(mg, freq * 2.01, startTime, duration * 0.72, gainPeak * 0.16, {
      type: 'sine',
      attack: 0.004,
      filterType: 'highpass',
      filterStart: 1200,
      filterEnd: 1800,
      q: 0.5,
    });
  }

  function _pad(mg, freq, startTime, duration, gainPeak) {
    _voice(mg, freq, startTime, duration, gainPeak, {
      type: 'sine',
      attack: 0.08,
      holdRatio: 0.68,
      filterStart: 1800,
      filterEnd: 1000,
      q: 0.45,
    });
  }

  function _bass(mg, freq, startTime, duration, gainPeak) {
    _voice(mg, freq, startTime, duration, gainPeak, {
      type: 'triangle',
      attack: 0.016,
      holdRatio: 0.34,
      filterStart: 520,
      filterEnd: 260,
      q: 0.7,
    });
  }

  function _scheduleTrack(mg, startTime, gen, trackIndex) {
    if (_gen !== gen || !mg) return;

    const ctx = _getCtx();
    const track = TRACKS[trackIndex % TRACKS.length];
    const beat = 60 / track.bpm;
    const trackDuration = track.bars * 4 * beat;
    let t = startTime;

    for (const [freq, beats] of track.melody) {
      const dur = beats * beat;
      _pluck(mg, freq, t, Math.max(dur * 0.86, 0.08), track.melodyGain, track.melodyWave);
      t += dur;
      if (t >= startTime + trackDuration - 0.01) break;
    }

    track.chords.forEach((chord, barIndex) => {
      const barStart = startTime + barIndex * 4 * beat;
      chord.forEach((freq, noteIndex) => {
        _pad(mg, freq, barStart + noteIndex * 0.012, 3.5 * beat, 0.034);
      });
      chord.forEach((freq, noteIndex) => {
        _pad(mg, freq * 2, barStart + 2 * beat + noteIndex * 0.012, 1.6 * beat, 0.018);
      });
    });

    track.bass.forEach((freq, barIndex) => {
      const barStart = startTime + barIndex * 4 * beat;
      _bass(mg, freq, barStart, beat * 1.7, 0.08);
      _bass(mg, freq * 1.5, barStart + 2 * beat, beat * 1.2, 0.044);
    });

    const nextStart = startTime + trackDuration;
    const nextIndex = (trackIndex + 1) % TRACKS.length;
    const delay = Math.max((nextStart - ctx.currentTime - 0.2) * 1000, 0);
    _timer = setTimeout(() => _scheduleTrack(mg, nextStart, gen, nextIndex), delay);
  }

  function play() {
    if (_masterGain) return;
    _gen++;
    if (_timer) clearTimeout(_timer);
    const mg = _createMasterGain();
    const ctx = _getCtx();
    _scheduleTrack(mg, ctx.currentTime + 0.08, _gen, _trackIndex);
    _trackIndex = (_trackIndex + 1) % TRACKS.length;
  }

  function stop() {
    _gen++;
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    if (_masterGain) {
      const ctx = _getCtx();
      const mg = _masterGain;
      mg.gain.cancelScheduledValues(ctx.currentTime);
      mg.gain.setValueAtTime(Math.max(mg.gain.value, 0.0001), ctx.currentTime);
      mg.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      setTimeout(() => {
        try { mg.disconnect(); } catch (_) {}
      }, 700);
      _masterGain = null;
    }
  }

  function nextTrack() {
    if (!_masterGain) {
      _trackIndex = (_trackIndex + 1) % TRACKS.length;
      return;
    }
    stop();
    setTimeout(() => play(), 120);
  }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    if (_masterGain) _masterGain.gain.value = _volume;
  }

  function isPlaying() {
    return _masterGain !== null;
  }

  function getCurrentTrackName() {
    return TRACKS[(_trackIndex + TRACKS.length - 1) % TRACKS.length].name;
  }

  return { play, stop, nextTrack, setVolume, isPlaying, getCurrentTrackName };
})();

export { BgmController };
