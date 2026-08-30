// particles.js — Canvas 粒子特效层（独立叠加层，不碰棋盘 DOM）
//
// 三个入口：
//   burstAt(x, y, opts)   消除粒子迸发（视口坐标）
//   burstAtElement(el)    以元素中心为源点迸发
//   confetti()            通关彩带
//
// 兼容性守卫：
//  - jsdom / 老浏览器 getContext 返回 null → 整个模块 no-op
//  - prefers-reduced-motion: reduce → no-op
//  - canvas 未挂载时惰性创建，首次使用才插入 DOM

const CANVAS_ID = 'fx-canvas';
const CONFETTI_COLORS = ['#e05a5a', '#e0a53a', '#4cba8f', '#4a90d9', '#b06ad9', '#e07aa8'];
// 粒子 canvas 内部降采样系数（<1）：碎片/彩带为无锐边的视觉特效，
// 降采样后由 CSS 拉伸全屏，肉眼几乎无差，但像素填充量大幅下降，
// 连锁消除 + 彩带时全屏 clearRect 每帧的开销显著降低（性能优化）。
const RENDER_SCALE = 0.6;

const state = {
  canvas: null,
  ctx: null,
  particles: [],
  running: false,
  rafId: 0,
};

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureCanvas() {
  if (state.ctx) return state.ctx;
  if (prefersReducedMotion()) return null;

  let canvas = state.canvas || document.getElementById(CANVAS_ID);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '2500'; // 高于胜利界面（2000），confetti 盖在弹窗上
  }

  const ctx = (() => {
    try {
      return canvas.getContext ? canvas.getContext('2d') : null;
    } catch (_) {
      return null; // jsdom / 不支持 canvas：静默禁用
    }
  })();
  if (!ctx) return null;

  if (!canvas.isConnected) {
    document.body.appendChild(canvas);
  }
  _resize(canvas);
  state.canvas = canvas;
  state.ctx = ctx;
  return ctx;
}

function _resize(canvas) {
  // 降采样：内部分辨率 = 视口 × RENDER_SCALE（CSS 拉伸到全屏）
  const w = Math.max(1, Math.round((window.innerWidth || 320) * RENDER_SCALE));
  const h = Math.max(1, Math.round((window.innerHeight || 240) * RENDER_SCALE));
  // 只在尺寸变化时重设，避免清空进行中的帧
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function _spawn(particle) {
  state.particles.push(particle);
  // 粒子上限：连锁消除 / 彩带叠加时避免 canvas 每帧重绘海量粒子
  if (state.particles.length > 400) {
    state.particles.splice(0, state.particles.length - 400);
  }
  _startLoop();
}

// 消除迸发：count 个彩色碎片从 (x, y) 向四周飞散
function burstAt(x, y, opts = {}) {
  const ctx = ensureCanvas();
  if (!ctx) return 0;

  const count = Math.max(1, Math.min(48, Math.floor(opts.count) || 12));
  const power = Number(opts.power) > 0 ? Number(opts.power) : 1;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const speed = (1.6 + Math.random() * 2.6) * power;
    _spawn({
      type: 'burst',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: 2.5 + Math.random() * 3.5,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      life: 1,
      decay: 0.02 + Math.random() * 0.025,
      gravity: 0.06,
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
    });
  }
  return count;
}

function burstAtElement(el, opts = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return 0;
  const rect = el.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return 0;
  return burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, opts);
}

// 通关彩带：从视口顶部撒下彩色纸屑
function confetti(count = 140) {
  const ctx = ensureCanvas();
  if (!ctx) return 0;

  const w = state.canvas.width / RENDER_SCALE; // 视口宽度（canvas 内部已降采样）
  const n = Math.max(1, Math.min(400, Math.floor(count) || 140));

  for (let i = 0; i < n; i++) {
    _spawn({
      type: 'confetti',
      x: Math.random() * w,
      y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 1.8 + Math.random() * 2.4,
      size: 5 + Math.random() * 6,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      life: 1,
      decay: 0.0038 + Math.random() * 0.003,
      gravity: 0.012,
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.24,
      sway: 0.8 + Math.random() * 1.6,
      swayPhase: Math.random() * Math.PI * 2,
    });
  }
  return n;
}

function _step(p) {
  if (p.type === 'confetti') {
    p.swayPhase += 0.04;
    p.x += p.vx + Math.sin(p.swayPhase) * p.sway * 0.4;
    p.y += p.vy;
  } else {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.985;
  }
  p.rotation += p.vr;
  p.life -= p.decay;
  // 粒子坐标是视口像素，用视口高度判界（canvas 内部已降采样）
  const viewportH = state.canvas ? state.canvas.height / RENDER_SCALE : 4000;
  return p.life > 0 && p.y < viewportH + 40;
}

function _draw(ctx, p) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  if (p.type === 'confetti') {
    // 长条纸屑：随翻转模拟正反面
    const w = p.size;
    const h = p.size * 0.45 * Math.abs(Math.sin(p.rotation * 1.7)) + 1;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function _startLoop() {
  if (state.running) return;
  state.running = true;
  const tick = () => {
    const ctx = state.ctx;
    if (!ctx) { state.running = false; return; }
    _resize(state.canvas);

    state.particles = state.particles.filter(_step);
    ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    // 统一缩放变换：粒子坐标保持视口像素，绘制时自动映射到降采样画布。
    // 避免每帧逐粒子 setTransform 的开销。
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    for (const p of state.particles) {
      _draw(ctx, p);
    }
    // 恢复单位矩阵，供 clearRect 使用完整画布尺寸
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (state.particles.length === 0) {
      state.running = false;
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);
}

// 清空（测试与页面卸载用）
function clearParticles() {
  state.particles = [];
  if (state.ctx) {
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  }
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }
  state.running = false;
}

export { burstAt, burstAtElement, confetti, clearParticles, CANVAS_ID, CONFETTI_COLORS };
