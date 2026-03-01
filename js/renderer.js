// renderer.js — DOM 渲染（绝对定位 + 局部更新）

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
    // 图片牌
    const img = document.createElement('img');
    img.src = tileInstance.image;
    img.alt = tileInstance.label;
    img.className = 'tile__img';
    el.appendChild(img);
  } else {
    // 白板：无图片，保留原有空白样式
    el.classList.add('tile--bai');
    el.innerHTML = '<span class="tile__blank"></span>';
  }

  return el;
}

// 初始渲染：清空容器，全量渲染所有牌
function renderBoard(state, boardEl) {
  boardEl.innerHTML = '';

  // 设置棋盘尺寸（内容区 + 两侧内边距）
  const contentW = BOARD_COLS * (TILE_WIDTH + TILE_GAP) - TILE_GAP;
  const contentH = BOARD_ROWS * (TILE_HEIGHT + TILE_GAP) - TILE_GAP;
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

// 通过 instanceId 获取 DOM 元素
function getTileElement(instanceId) {
  return document.querySelector(`[data-instance-id="${instanceId}"]`);
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
  if (el) el.remove();
}

// 应用选中状态
function setTileSelected(el, selected) {
  el.classList.toggle('tile--selected', selected);
}

// 应用提示状态
function setTileHinted(el, hinted) {
  el.classList.toggle('tile--hint', hinted);
}

// 清除所有提示高亮
function clearAllHints(boardEl) {
  boardEl.querySelectorAll('.tile--hint').forEach(el => {
    el.classList.remove('tile--hint');
  });
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
    updateTilePosition(el, newRow, newCol);
  }
}
