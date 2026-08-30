// imagePreload.js — 牌图预加载（独立小模块，便于测试时 mock）
//
// 弱网下发牌动画会跑在图片加载完成之前，玩家会看到"翻开的空牌"。
// 开局先并行预加载本局用到的所有牌图，全部就绪（或超时兜底）再开始发牌。

const DEFAULT_TIMEOUT_MS = 3000;

function preloadTileImages(state, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const srcs = new Set();
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const tile = state.grid[r][c];
      if (tile && tile.image) srcs.add(tile.image);
    }
  }

  if (srcs.size === 0) return Promise.resolve();

  const loads = [...srcs].map(src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve(src); // 加载失败也放行，onerror 占位符会兜底
    img.src = src;
  }));

  // 超时保护：极端弱网下不让玩家干等，后续 lazy 加载 + onerror 降级兜底
  const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
  return Promise.race([Promise.all(loads), timeout]).then(() => undefined);
}

export { preloadTileImages };
