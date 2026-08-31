// announcer.js — 无障碍播报（aria-live）
//
// 单一入口：向页面里的 #sr-live 区域写入消息，读屏软件据此播报，
// 对可视用户完全不可见。游戏事件（胜利/死局/消除等）与键盘操作
// 共用此入口，避免各模块各自手写 DOM 操作。
//
// 无该元素（测试/精简环境）时静默 no-op。

const LIVE_ID = 'sr-live';

/**
 * 播报一条消息给读屏用户。自动清空再写入，保证重复文本也能重新播报。
 * @param {string} msg
 */
function announce(msg) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(LIVE_ID);
  if (!el) return;
  el.textContent = '';
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => { el.textContent = msg; });
  } else {
    el.textContent = msg;
  }
}

export { announce };
