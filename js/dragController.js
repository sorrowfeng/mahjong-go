import { DIR, DRAG_THRESHOLD, GAME_STATE, TILE_WIDTH, TILE_HEIGHT, TILE_GAP } from './constants.js';
import { collectDragGroup, selectGroup, calcMaxSlide, pixelsToCells, snapOffsetToGrid, clampDelta } from './movementLogic.js';
import { getTileElement, setTileSelected, setGroupTransform } from './renderer.js';

// dragController.js — 拖拽输入处理（鼠标 + 触摸，轴锁定，像素钳制）
//
// 通过依赖注入访问游戏状态，不直接依赖 gameController：
//   getState()  -> 当前棋盘 state（boardState）
//   getPhase()  -> 当前游戏阶段（gameState，'IDLE' 时才允许交互）
//   onDragEnd / onTileClick -> 回调给 gameController 处理

function initDragController(boardEl, { getState, getPhase, onDragEnd, onTileClick }) {
  let dragState = null;

  // dragState = {
  //   startX, startY,          // 起始鼠标/触摸坐标
  //   startRow, startCol,       // 起始牌的行列
  //   direction,                // 锁定的方向（初始 DIR.NONE）
  //   group,                    // 选中的连续牌组
  //   maxPositive, maxNegative, // 可移动格数
  //   maxPxPositive, maxPxNegative, // 可移动像素数
  //   currentOffset,            // 当前吸附/钳制后的像素偏移
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
    const tileInfo = getTileFromEvent(e);
    if (!tileInfo) return;

    e.preventDefault();
    const { x, y } = getEventCoords(e);
    const phase = getPhase();

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
      currentOffset: 0,
      currentDelta: 0,
      // 动画期间按下：不进入拖拽，但保留按下点，松手时作为"排队点击"转发
      // 给 handleTileClick（其内部会缓存到动画结束后补执行，实现"跟手"）。
      lockedOut: phase !== GAME_STATE.IDLE,
    };
  }

  function onPointerMove(e) {
    if (!dragState) return;
    // 动画期间按下：不拖拽（棋盘不稳定），也不做选中，直接忽略移动
    if (dragState.lockedOut) return;
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
      const gameState = getState();
      if (!gameState) return;

      // 沿拖动方向收集连续相邻的牌。
      // 必须与 hintSystem 用同一个函数，否则提示给出的牌组玩家拖不出来。
      const sign = dragState.direction === DIR.HORIZONTAL
        ? (dx > 0 ? 1 : -1)
        : (dy > 0 ? 1 : -1);
      dragState.group = collectDragGroup(
        gameState,
        dragState.startRow,
        dragState.startCol,
        dragState.direction,
        sign
      );

      // 当朝拖动方向只收集到单张（按下点在该方向一侧没有连续牌，通常发生在
      // 玩家按住牌组边缘却朝"外侧"拖，或按住提示标亮的中间牌）时，会只拖动
      // 这一张，与玩家"想拖动整排亮起的棋子"的直觉不符。
      // 此时扩展为按下点所在的完整连续段，让整排跟随拖动。
      // 若该方向本身就能收集到多张，则保持原样（不改变与 hint 完全一致的行为）。
      if (dragState.group.length === 1) {
        const full = selectGroup(gameState, dragState.startRow, dragState.startCol, dragState.direction);
        if (full.length > 1) {
          dragState.group = full;
        }
      }

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
    const snappedOffset = snapOffsetToGrid(clampedOffset, dragState.direction);
    dragState.currentOffset = snappedOffset;
    dragState.currentDelta = pixelsToCells(snappedOffset, dragState.direction);

    const moveDx = dragState.direction === DIR.HORIZONTAL ? snappedOffset : 0;
    const moveDy = dragState.direction === DIR.VERTICAL ? snappedOffset : 0;
    setGroupTransform(dragState.group, moveDx, moveDy);
  }

  function onPointerUp(e) {
    if (!dragState) return;
    // 动画期间按下、未进入拖拽：转发为"排队点击"（handleTileClick 会缓存）
    if (!dragState.group || dragState.direction === DIR.NONE) {
      const { startRow, startCol } = dragState;
      dragState = null;
      // 用户只点击未拖动：触发点击消除（含动画期间的点按，用于排队）
      if (onTileClick) onTileClick({ row: startRow, col: startCol });
      return;
    }

    e.preventDefault();

    const { x, y } = getEventCoords(e);
    const rawOffset = dragState.direction === DIR.HORIZONTAL
      ? x - dragState.startX
      : y - dragState.startY;

    const clampedOffset = Math.max(-dragState.maxPxNegative, Math.min(dragState.maxPxPositive, rawOffset));
    const releaseOffset = snapOffsetToGrid(clampedOffset, dragState.direction);
    const delta = pixelsToCells(releaseOffset, dragState.direction);
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

export { initDragController };
