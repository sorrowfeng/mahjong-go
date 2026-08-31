// sw-register.js — Service Worker 注册 + 新版本更新提示
//
// 仅在安全上下文（HTTPS / localhost / 127.0.0.1）下注册。
// `file://` 直接打开时跳过，不影响游戏正常功能。

// 新版本就绪时展示的提示文案（可被主界面替换）
function showUpdateToast(text = '新版本已就绪，点击刷新') {
  const el = document.getElementById('toast-msg');
  if (!el) return;
  el.textContent = text;
  // 复用 flashElement 的隐藏逻辑；无则 5 秒后自行隐藏
  const t = setTimeout(() => { el.classList.add('hidden'); }, 5000);
  el._swToastTimer = t;
}

// 注册 SW；返回 Promise<ServiceWorkerRegistration|null>
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  // 仅在安全上下文（HTTPS 或本机地址）注册
  const isSecure = typeof window !== 'undefined' &&
    (window.isSecureContext === true || /^(localhost|127\.0\.0\.1|\[::1\])/.test(window.location.hostname));
  if (!isSecure) return Promise.resolve(null);

  return navigator.serviceWorker.register('./sw.js').then((reg) => {
    // 首次注册：无活跃 controller，属正常
    let firstTime = !navigator.serviceWorker.controller;

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 已有活跃 SW，说明这是更新版本
          showUpdateToast('发现新版本，请刷新页面');
        } else if (newWorker.state === 'installed' && firstTime) {
          firstTime = false;
        }
      });
    });

    // 页面受控后若检测到控制器变化，提示刷新
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // 新版 SW 接管时刷新一次以加载最新资源
      // （仅在确实有更新时才刷新，避免初次注册误刷）
    });

    return reg;
  }).catch(() => null);
}

export { registerServiceWorker, showUpdateToast };
