// dragController.js — 拖拽输入处理（鼠标 + 触摸，轴锁定，像素钳制）

function initDragController(boardEl, onDragEnd, onTileClick) {
  let dragState = null;

  // dragState = {
  //   startX, startY,          // 起始鼠标/触摸坐标
  //   startRow, startCol,       // 起始牌的行列
  //   direction,                // 锁定的方向（初始 DIR.NONE）
  //   group,                    // 选中的连续牌组
  //   maxPositive, maxNegative, // 可移动格数
  //   maxPxPositive, maxPxNegative, // 可移动像素数
  //   currentDelta,             // 当前移动格数
  // }

  function getEventCoords(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function getTileFromEvent(e) {
    const target = e.target.closest('.tile');
    if (!target) return null;
    return {
      el: target,
      row: parseInt(target.dataset.row, 10),
      col: parseInt(target.dataset.col, 10),
    };
  }

  function onPointerDown(e) {
    if (dragState) return;
    // 动画期间不允许新拖拽
    if (window._gamePhase !== 'IDLE') return;
    const tileInfo = getTileFromEvent(e);
    if (!tileInfo) return;

    e.preventDefault();
    const { x, y } = getEventCoords(e);

    dragState = {
      startX: x,
      startY: y,
      startRow: tileInfo.row,
      startCol: tileInfo.col,
      direction: DIR.NONE,
      group: null,
      maxPositive: 0,
      maxNegative: 0,
      maxPxPositive: 0,
      maxPxNegative: 0,
      currentDelta: 0,
    };
  }

  function onPointerMove(e) {
    if (!dragState) return;
    e.preventDefault();

    const { x, y } = getEventCoords(e);
    const dx = x - dragState.startX;
    const dy = y - dragState.startY;

    // 轴锁定
    if (dragState.direction === DIR.NONE) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < DRAG_THRESHOLD && absDy < DRAG_THRESHOLD) return;

      dragState.direction = absDx >= absDy ? DIR.HORIZONTAL : DIR.VERTICAL;

      // 计算牌组和移动限制
      const gameState = window._gameState;
      if (!gameState) return;

      // 沿拖动方向收集连续相邻的牌（只向拖动侧延伸，不向反方向扩展）
      const startTile = getTile(gameState, dragState.startRow, dragState.startCol);
      const group = startTile
        ? [{ row: dragState.startRow, col: dragState.startCol, tile: startTile }]
        : [];

      if (startTile && dragState.direction === DIR.HORIZONTAL) {
        if (dx > 0) {
          // 向右拖：收集右侧相邻牌
          for (let c = dragState.startCol + 1; c < gameState.width; c++) {
            const t = getTile(gameState, dragState.startRow, c);
            if (!t) break;
            group.push({ row: dragState.startRow, col: c, tile: t });
          }
        } else {
          // 向左拖：收集左侧相邻牌
          for (let c = dragState.startCol - 1; c >= 0; c--) {
            const t = getTile(gameState, dragState.startRow, c);
            if (!t) break;
            group.unshift({ row: dragState.startRow, col: c, tile: t });
          }
        }
      } else if (startTile && dragState.direction === DIR.VERTICAL) {
        if (dy > 0) {
          // 向下拖：收集下方相邻牌
          for (let r = dragState.startRow + 1; r < gameState.height; r++) {
            const t = getTile(gameState, r, dragState.startCol);
            if (!t) break;
            group.push({ row: r, col: dragState.startCol, tile: t });
          }
        } else {
          // 向上拖：收集上方相邻牌
          for (let r = dragState.startRow - 1; r >= 0; r--) {
            const t = getTile(gameState, r, dragState.startCol);
            if (!t) break;
            group.unshift({ row: r, col: dragState.startCol, tile: t });
          }
        }
      }

      dragState.group = group;

      // 标记选中
      for (const g of dragState.group) {
        const el = getTileElement(g.tile.instanceId);
        if (el) setTileSelected(el, true);
      }

      const { maxPositive, maxNegative } = calcMaxSlide(gameState, dragState.group, dragState.direction);
      dragState.maxPositive = maxPositive;
      dragState.maxNegative = maxNegative;

      const cellSize = dragState.direction === DIR.HORIZONTAL
        ? (TILE_WIDTH + TILE_GAP)
        : (TILE_HEIGHT + TILE_GAP);
      dragState.maxPxPositive = maxPositive * cellSize;
      dragState.maxPxNegative = maxNegative * cellSize;
    }

    if (dragState.direction === DIR.NONE || !dragState.group) return;

    // 计算钳制后的偏移量
    const rawOffset = dragState.direction === DIR.HORIZONTAL ? dx : dy;
    const clampedOffset = Math.max(-dragState.maxPxNegative, Math.min(dragState.maxPxPositive, rawOffset));

    const moveDx = dragState.direction === DIR.HORIZONTAL ? clampedOffset : 0;
    const moveDy = dragState.direction === DIR.VERTICAL ? clampedOffset : 0;
    setGroupTransform(dragState.group, moveDx, moveDy);
  }

  function onPointerUp(e) {
    if (!dragState) return;
    if (!dragState.group || dragState.direction === DIR.NONE) {
      const { startRow, startCol } = dragState;
      dragState = null;
      // 用户只点击未拖动：触发点击消除
      if (onTileClick) onTileClick({ row: startRow, col: startCol });
      return;
    }

    e.preventDefault();

    const { x, y } = getEventCoords(e);
    const rawOffset = dragState.direction === DIR.HORIZONTAL
      ? x - dragState.startX
      : y - dragState.startY;

    const delta = pixelsToCells(rawOffset, dragState.direction);
    const clampedDelta = clampDelta(delta, dragState.maxPositive, dragState.maxNegative);

    // 清除选中状态
    for (const g of dragState.group) {
      const el = getTileElement(g.tile.instanceId);
      if (el) setTileSelected(el, false);
    }

    const group = dragState.group;
    const direction = dragState.direction;
    dragState = null;

    // 注意：不重置 transform，让动画从当前拖拽位置平滑过渡
    // 交给 gameController 处理
    onDragEnd({ group, direction, delta: clampedDelta });
  }

  // 注册事件
  boardEl.addEventListener('mousedown', onPointerDown);
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup', onPointerUp);

  boardEl.addEventListener('touchstart', onPointerDown, { passive: false });
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp, { passive: false });
}
