import { TILE_WIDTH, TILE_HEIGHT, TILE_GAP, BOARD_PADDING, DIR } from './constants.js';

// renderer.js — DOM 渲染（绝对定位 + 局部更新）

// instanceId → DOM 元素缓存，避免反复 querySelector
const _tileElementCache = new Map();

// 计算牌的像素位置（含棋盘内边距偏移）
function tilePixelPos(row, col) {
  return {
    left: BOARD_PADDING + col * (TILE_WIDTH + TILE_GAP),
    top: BOARD_PADDING + row * (TILE_HEIGHT + TILE_GAP),
  };
}

// 创建单个牌的 DOM 元素
function createTileElement(tileInstance, row, col) {
  const el = document.createElement('div');
  el.className = 'tile tile--' + tileInstance.type;
  el.dataset.instanceId = tileInstance.instanceId;
  el.dataset.row = row;
  el.dataset.col = col;

  const { left, top } = tilePixelPos(row, col);
  el.style.left = left + 'px';
  el.style.top = top + 'px';

  if (tileInstance.image) {
    // 图片牌：加载完成前显示占位符
    const img = document.createElement('img');
    img.src = tileInstance.image;
    img.alt = tileInstance.label;
    img.className = 'tile__img';
    img.loading = 'lazy';
    img.decoding = 'async';      // 异步解码，避免大图解码阻塞主线程（低端设备卡顿来源）
    img.fetchpriority = 'low';   // 136 张牌图低优先级加载，先保证交互响应
    // 加载失败时降级为文字占位（topChar + bottomChar 都要显示）
    img.onerror = () => {
      img.remove();
      if (tileInstance.topChar) {
        const top = document.createElement('span');
        top.className = 'tile__top';
        top.textContent = tileInstance.topChar;
        el.appendChild(top);
      }
      if (tileInstance.bottomChar) {
        const bottom = document.createElement('span');
        bottom.className = 'tile__bottom';
        bottom.textContent = tileInstance.bottomChar;
        el.appendChild(bottom);
      }
    };
    el.appendChild(img);
  } else {
    // 白板：无图片，保留原有空白样式
    el.classList.add('tile--bai');
    el.innerHTML = '<span class="tile__blank"></span>';
  }

  // 写入缓存
  _tileElementCache.set(tileInstance.instanceId, el);

  return el;
}

// 初始渲染：清空容器，全量渲染所有牌
function renderBoard(state, boardEl) {
  boardEl.innerHTML = '';
  _tileElementCache.clear();

  // 设置棋盘尺寸（内容区 + 两侧内边距）。
  // 尺寸直接取自 state.width/height —— 数据自己说了算，
  // 不再依赖全局 BOARD_COLS/ROWS（教学模式 / resize 漏同步也不会错位）。
  const contentW = state.width * (TILE_WIDTH + TILE_GAP) - TILE_GAP;
  const contentH = state.height * (TILE_HEIGHT + TILE_GAP) - TILE_GAP;
  boardEl.style.width = (contentW + 2 * BOARD_PADDING) + 'px';
  boardEl.style.height = (contentH + 2 * BOARD_PADDING) + 'px';

  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const tile = state.grid[r][c];
      if (tile) {
        const el = createTileElement(tile, r, c);
        boardEl.appendChild(el);
      }
    }
  }
}

// 通过 instanceId 获取 DOM 元素（带缓存）
function getTileElement(instanceId) {
  let el = _tileElementCache.get(instanceId);
  if (el && el.isConnected) return el;
  // 缓存未命中或元素已脱离 DOM，重新查找
  el = document.querySelector(`[data-instance-id="${instanceId}"]`);
  if (el) _tileElementCache.set(instanceId, el);
  else _tileElementCache.delete(instanceId);
  return el;
}

// 更新牌的 dataset 位置信息
function updateTilePosition(el, row, col) {
  const { left, top } = tilePixelPos(row, col);
  el.dataset.row = row;
  el.dataset.col = col;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.transform = '';
}

// 移除 DOM 中的牌元素
function removeTileElement(instanceId) {
  const el = getTileElement(instanceId);
  if (el) {
    el.remove();
    _tileElementCache.delete(instanceId);
  }
}

// 应用选中状态
function setTileSelected(el, selected) {
  el.classList.toggle('tile--selected', selected);
}

// 应用提示状态
function setTileHinted(el, hinted) {
  el.classList.toggle('tile--hint', hinted);
}

// 清除所有提示高亮（含拖动起点标记与方向箭头）
function clearAllHints(boardEl) {
  boardEl.querySelectorAll('.tile--hint, .tile--hint-origin').forEach(el => {
    el.classList.remove('tile--hint', 'tile--hint-origin');
  });
  boardEl.querySelectorAll('.tile__hint-arrow').forEach(el => el.remove());
}

// 清除所有选中状态
function clearAllSelected(boardEl) {
  boardEl.querySelectorAll('.tile--selected').forEach(el => {
    el.classList.remove('tile--selected');
  });
}

// 在拖拽过程中，用 transform 移动牌（不改变 left/top）
function setGroupTransform(group, dx, dy) {
  for (const { tile } of group) {
    const el = getTileElement(tile.instanceId);
    if (el) {
      el.classList.add('tile--dragging', 'tile--composited');
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.zIndex = '100';
    }
  }
}

// 重置牌组 transform
function resetGroupTransform(group) {
  for (const { tile } of group) {
    const el = getTileElement(tile.instanceId);
    if (el) {
      el.classList.remove('tile--dragging', 'tile--composited');
      el.style.transform = '';
      el.style.zIndex = '';
    }
  }
}

// 提交滑动后更新 DOM 位置（不做动画，立即）
function commitGroupPosition(group, direction, delta) {
  for (const g of group) {
    const el = getTileElement(g.tile.instanceId);
    if (!el) continue;
    const newRow = direction === DIR.VERTICAL ? g.row + delta : g.row;
    const newCol = direction === DIR.HORIZONTAL ? g.col + delta : g.col;
    el.classList.remove('tile--dragging', 'tile--composited');
    updateTilePosition(el, newRow, newCol);
    el.style.zIndex = '';
  }
}

// 增量渲染：对比前后两个 state，按 instanceId 只增删/移动变化的牌。
// 用于撤销等"结构相似"的场景，避免全量重建 136 个节点造成的闪烁，
// 也保住元素缓存与动画状态。
function diffRenderBoard(prevState, nextState, boardEl) {
  const prevPos = new Map(); // instanceId -> {row, col}
  for (let r = 0; r < prevState.height; r++) {
    for (let c = 0; c < prevState.width; c++) {
      const tile = prevState.grid[r][c];
      if (tile) prevPos.set(tile.instanceId, { row: r, col: c });
    }
  }

  const nextTiles = new Map(); // instanceId -> {tile, row, col}
  for (let r = 0; r < nextState.height; r++) {
    for (let c = 0; c < nextState.width; c++) {
      const tile = nextState.grid[r][c];
      if (tile) nextTiles.set(tile.instanceId, { tile, row: r, col: c });
    }
  }

  // 消失的牌：移除 DOM 并清缓存
  for (const id of prevPos.keys()) {
    if (!nextTiles.has(id)) removeTileElement(id);
  }

  // 新增的牌：创建并追加；已存在的牌：位置变了就平移
  for (const [id, { tile, row, col }] of nextTiles) {
    if (!prevPos.has(id)) {
      boardEl.appendChild(createTileElement(tile, row, col));
    } else {
      const prev = prevPos.get(id);
      if (prev.row !== row || prev.col !== col) {
        const el = getTileElement(id);
        if (el) updateTilePosition(el, row, col);
      }
    }
  }
}

export { tilePixelPos, createTileElement, renderBoard, diffRenderBoard, getTileElement, updateTilePosition, removeTileElement, setTileSelected, setTileHinted, clearAllHints, clearAllSelected, setGroupTransform, resetGroupTransform, commitGroupPosition };
