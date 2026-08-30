// tests/dom-setup.js — jsdom 环境缺失的浏览器 API 补齐（对所有测试生效，幂等）

if (typeof global.requestAnimationFrame !== 'function') {
  global.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  global.cancelAnimationFrame = id => clearTimeout(id);
}

// jsdom 不支持 canvas 2d：getContext('2d') 会走 notImplemented 打印 warning 并返回 null。
// 让粒子层静默返回 null（particles.js 本身已做 no-op 兼容），消除测试输出噪音。
try {
  const proto = global.HTMLCanvasElement && global.HTMLCanvasElement.prototype;
  if (proto && !proto.__getContextPatched) {
    proto.__getContextPatched = true;
    proto.getContext = function getContext(type) {
      if (type === '2d') return null;
      return null;
    };
  }
} catch (_) { /* 老环境无 canvas，忽略 */ }

