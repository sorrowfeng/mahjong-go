/**
 * dragController 测试 —— 依赖注入 + 指针事件流转（jsdom 真 DOM）
 *
 * 验证架构债修复后的关键契约：
 *   - initDragController(boardEl, { getState, getPhase, onDragEnd, onTileClick })
 *   - phase 非 IDLE 时指针按下被忽略
 *   - 拖动沿运动方向单向收集牌组（与 hintSystem 共用 collectDragGroup）
 */

import { initDragController } from '../js/dragController.js';

function makeTile(instanceId) {
  return {
    instanceId,
    tileTypeId: 0,
    type: 'wan',
    value: 1,
    label: '一万',
    topChar: '一',
    bottomChar: '万',
    image: 'assets/images/tiles/wan_1.png',
  };
}

// 2×3 棋盘，整行铺满 3 张牌
function makeState() {
  const t0 = makeTile(1);
  const t1 = makeTile(2);
  const t2 = makeTile(3);
  return {
    width: 3,
    height: 2,
    grid: [[t0, t1, t2], [null, null, null]],
  };
}

function mountBoard() {
  document.body.innerHTML = '<div id="board"></div>';
  const boardEl = document.getElementById('board');
  const state = makeState();
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      if (!state.grid[r][c]) continue;
      const el = document.createElement('div');
      el.className = 'tile';
      el.dataset.instanceId = String(state.grid[r][c].instanceId);
      el.dataset.row = String(r);
      el.dataset.col = String(c);
      boardEl.appendChild(el);
    }
  }
  return boardEl;
}

function mouse(type, x, y, target) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  (target || document.getElementById('board')).dispatchEvent(e);
}

test('横向拖动：向拖动侧单向收集牌组并回调 onDragEnd', () => {
  const boardEl = mountBoard();
  const onDragEnd = jest.fn();
  const onTileClick = jest.fn();

  initDragController(boardEl, {
    getState: makeState,
    getPhase: () => 'IDLE',
    onDragEnd,
    onTileClick,
  });

  const startTile = boardEl.querySelector('[data-col="0"]'); // 从段首向右拖

  mouse('mousedown', 100, 100, startTile);
  mouse('mousemove', 130, 100); // 超过阈值 10px，锁定横向、向右收集
  mouse('mouseup', 130, 100);

  expect(onDragEnd).toHaveBeenCalledTimes(1);
  const arg = onDragEnd.mock.calls[0][0];
  expect(arg.direction).toBe('horizontal');
  // 从段首(col0)向右拖：整行 3 张一起动（与 hintSystem 同源 collectDragGroup）
  expect(arg.group.length).toBe(3);
  expect(onTileClick).not.toHaveBeenCalled();
});

test('只点击不拖动：触发 onTileClick', () => {
  const boardEl = mountBoard();
  const onDragEnd = jest.fn();
  const onTileClick = jest.fn();

  initDragController(boardEl, {
    getState: makeState,
    getPhase: () => 'IDLE',
    onDragEnd,
    onTileClick,
  });

  mouse('mousedown', 100, 100, boardEl.querySelector('[data-col="1"]'));
  mouse('mouseup', 100, 100); // 未超过阈值

  expect(onTileClick).toHaveBeenCalledTimes(1);
  expect(onTileClick).toHaveBeenCalledWith({ row: 0, col: 1 });
  expect(onDragEnd).not.toHaveBeenCalled();
});

test('phase 非 IDLE（动画中）：不进入拖拽，但点击会转发（供排队跟手）', () => {
  const boardEl = mountBoard();
  const onDragEnd = jest.fn();
  const onTileClick = jest.fn();

  initDragController(boardEl, {
    getState: makeState,
    getPhase: () => 'ANIMATING',
    onDragEnd,
    onTileClick,
  });

  // 动画期间按下后拖动：lockedOut 使拖拽被忽略，不触发 onDragEnd
  mouse('mousedown', 100, 100, boardEl.querySelector('[data-col="0"]'));
  mouse('mousemove', 130, 100);
  mouse('mouseup', 130, 100);

  expect(onDragEnd).not.toHaveBeenCalled();
  // 动画期间的点按被转发为排队点击（handleTileClick 会缓存到动画结束后执行）
  expect(onTileClick).toHaveBeenCalledTimes(1);
  expect(onTileClick).toHaveBeenCalledWith({ row: 0, col: 0 });
});

test('phase 非 IDLE（动画中）：纯点击同样转发为排队点击', () => {
  const boardEl = mountBoard();
  const onDragEnd = jest.fn();
  const onTileClick = jest.fn();

  initDragController(boardEl, {
    getState: makeState,
    getPhase: () => 'ANIMATING',
    onDragEnd,
    onTileClick,
  });

  mouse('mousedown', 100, 100, boardEl.querySelector('[data-col="1"]'));
  mouse('mouseup', 100, 100);

  expect(onDragEnd).not.toHaveBeenCalled();
  expect(onTileClick).toHaveBeenCalledTimes(1);
  expect(onTileClick).toHaveBeenCalledWith({ row: 0, col: 1 });
});

test('负方向拖动：只收集起点左侧的牌（单向）', () => {
  const boardEl = mountBoard();
  const onDragEnd = jest.fn();
  const onTileClick = jest.fn();

  initDragController(boardEl, {
    getState: makeState,
    getPhase: () => 'IDLE',
    onDragEnd,
    onTileClick,
  });

  const startTile = boardEl.querySelector('[data-col="2"]'); // 从段尾向左拖

  mouse('mousedown', 200, 100, startTile);
  mouse('mousemove', 170, 100); // 向左
  mouse('mouseup', 170, 100);

  const arg = onDragEnd.mock.calls[0][0];
  expect(arg.direction).toBe('horizontal');
  expect(arg.group.length).toBe(3); // col0/1/2 整段（起点是段尾，左侧全相邻）
});
