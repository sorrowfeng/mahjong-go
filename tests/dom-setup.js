// tests/dom-setup.js — jsdom 环境缺失的浏览器 API 补齐（对所有测试生效，幂等）

if (typeof global.requestAnimationFrame !== 'function') {
  global.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  global.cancelAnimationFrame = id => clearTimeout(id);
}
