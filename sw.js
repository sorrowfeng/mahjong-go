// sw.js — Service Worker：离线可玩 + 版本更新提示
//
// 缓存策略：
//  - 预缓存（install）：HTML / CSS / JS / 图标 / 首页截图
//  - 运行时缓存（fetch）：麻将牌图片（首次访问后缓存，离线可玩）
//  - 更新（activate）：清理旧版本缓存；新 SW 就绪时 postMessage 通知页面提示刷新
//
// 注意：SW 仅在 HTTP(S) 或 localhost 环境下生效，`file://` 直接打开时
// 浏览器不会注册 SW，游戏仍可正常运行（只是无离线能力）。

const CACHE = 'mahjong-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/reset.css',
  './css/main.css',
  './css/board.css',
  './css/tile.css',
  './css/animations.css',
  './css/tutorial.css',
  './js/constants.js',
  './js/tileDefinitions.js',
  './js/boardState.js',
  './js/gameLogic.js',
  './js/movementLogic.js',
  './js/hintSystem.js',
  './js/renderer.js',
  './js/animationController.js',
  './js/soundController.js',
  './js/bgmController.js',
  './js/imagePreload.js',
  './js/timer.js',
  './js/modes.js',
  './js/score.js',
  './js/items.js',
  './js/levels.js',
  './js/achievements.js',
  './js/particles.js',
  './js/themes.js',
  './js/stats.js',
  './js/settings.js',
  './js/dragController.js',
  './js/tutorial.js',
  './js/gameController.js',
  './js/main.js',
  './js/sw-register.js',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

// 安装：预缓存应用外壳
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存，接管控制
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 主资源：网络优先（HTML/CSS/JS 保证拿到最新），失败回退缓存（离线）
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

// 静态资源（图片）：缓存优先，离线可玩
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isShell = APP_SHELL.includes(url.pathname.replace(/^\//, './') === '.' ? './' : url.pathname) ||
    url.pathname === '/' ||
    url.pathname.endsWith('index.html');
  const isAsset = /\.(png|jpg|jpeg|webp|gif|ico|svg)$/i.test(url.pathname);

  if (isAsset) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// 新版本就绪时通知页面刷新
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
