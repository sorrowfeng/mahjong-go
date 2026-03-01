// soundController.js — 程序化音效（Web Audio API）
// 所有音效均通过 Web Audio API 合成，无需外部音频文件

const SoundController = (() => {
  let _ctx = null;
  let _enabled = true;

  // 延迟创建 AudioContext，需用户交互后才可初始化
  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // 部分浏览器首次需要 resume
    if (_ctx.state === 'suspended') {
      _ctx.resume();
    }
    return _ctx;
  }

  // 基础音符播放：正弦波 + 指数衰减
  function _playTone(freq, duration, gainPeak, startTime, waveType = 'sine') {
    const ctx = _getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(gainPeak, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  // 滑音：起始频率 → 结束频率，指数滑变
  function _playSlide(freqStart, freqEnd, duration, gainPeak, startTime, waveType = 'sine') {
    const ctx = _getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = waveType;
    osc.frequency.setValueAtTime(freqStart, startTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);

    gain.gain.setValueAtTime(gainPeak, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  // ── 公开音效 ──────────────────────────────────────────────────────

  // 点击一张有效牌（找到配对）
  // 短促的陶瓷碰击感：高频正弦 + 快速衰减
  function playTileClick() {
    if (!_enabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    _playTone(1200, 0.08, 0.35, now, 'sine');
    _playTone(900,  0.06, 0.15, now + 0.01, 'sine');
  }

  // 一对消除成功
  // 明快的双音上扬：像拾起两块玉石
  function playEliminate() {
    if (!_enabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    _playTone(660, 0.12, 0.4, now,        'sine');
    _playTone(880, 0.14, 0.4, now + 0.07, 'sine');
  }

  // 连锁消除中的每一波（波数越高音越高亮）
  // 参数 waveIndex：0 表示第一波，依次递增
  function playChainWave(waveIndex) {
    if (!_enabled) return;
    const ctx  = _getCtx();
    const now  = ctx.currentTime;
    const base = 660;
    const step = 110; // 每波升高约一个大二度
    const freq = base + Math.min(waveIndex, 5) * step;
    _playTone(freq,        0.10, 0.45, now,        'sine');
    _playTone(freq * 1.25, 0.12, 0.30, now + 0.05, 'sine');
  }

  // 拖动移动成功（有新配对产生，即将消除）
  // 轻柔的滑入音：频率向上轻扫
  function playSlideSuccess() {
    if (!_enabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    _playSlide(400, 600, 0.15, 0.25, now, 'sine');
  }

  // 拖动无效/复原
  // 低沉的短促挫败音
  function playInvalidMove() {
    if (!_enabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    _playSlide(280, 200, 0.12, 0.2, now, 'triangle');
  }

  // 胜利
  // 上行琶音：C5 E5 G5 C6
  function playVictory() {
    if (!_enabled) return;
    const ctx   = _getCtx();
    const now   = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      _playTone(freq, 0.35, 0.5, now + i * 0.12, 'sine');
    });
    // 最后加一声余韵泛音
    _playTone(1046.5, 0.6, 0.3, now + notes.length * 0.12, 'sine');
  }

  // 新游戏发牌
  // 轻盈的上扬音：表示洗牌开始
  function playNewGame() {
    if (!_enabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    _playSlide(300, 600, 0.2, 0.2, now,        'sine');
    _playSlide(400, 800, 0.2, 0.15, now + 0.08, 'sine');
  }

  // 重排提示
  // 轻拂感：白噪声短暂一扫
  function playReshuffle() {
    if (!_enabled) return;
    const ctx    = _getCtx();
    const now    = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data   = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type            = 'highpass';
    filter.frequency.value = 2000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.26);
  }

  // 通用按钮点击音：短促清脆的 UI 反馈音
  function playButtonClick() {
    if (!_enabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    _playTone(880, 0.06, 0.25, now, 'sine');
    _playTone(1100, 0.05, 0.12, now + 0.03, 'sine');
  }

  // 翻牌音效：模拟一排麻将牌翻面的啪嗒声
  // rowIndex 从底部行（0）到顶部行递增，音高微微上升
  function playTileFlip(rowIndex) {
    if (!_enabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;

    // 短促噪声冲击：模拟牌面碰击声
    const bufLen = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      // 前段尖锐，后段快速衰减
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // 带通滤波：保留中频 "啪" 感，过滤极低/极高噪声
    const filter = ctx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = 800 + rowIndex * 18; // 越靠上的行音调微升
    filter.Q.value         = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.05);

    // 叠加一个短促正弦泛音，增加"瓷感"
    _playTone(1100 + rowIndex * 15, 0.035, 0.12, now, 'sine');
  }

  // 音效开关
  function setEnabled(val) {
    _enabled = val;
  }

  function isEnabled() {
    return _enabled;
  }

  return {
    playTileClick,
    playEliminate,
    playChainWave,
    playSlideSuccess,
    playInvalidMove,
    playVictory,
    playNewGame,
    playReshuffle,
    playTileFlip,
    playButtonClick,
    setEnabled,
    isEnabled,
  };
})();
