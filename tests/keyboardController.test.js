// keyboardController.test.js — 键盘控制器（DOM 层）jsdom 测试
import { createKeyboardController } from '../js/keyboardNav.js';
import { DIR } from '../js/constants.js';

afterEach(() => {
  document.body.innerHTML = '';
});

// 构造一个可控的 state 与 fake DOM 元素
function makeEnv() {
  // 2×3 棋盘，所有格有牌
  const grid = [];
  let n = 0;
  for (let r = 0; r < 2; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      row.push({
        instanceId: 100 + n,
        tileTypeId: 0,
        type: 'wan', value: 1, label: '1',
        topChar: '一', bottomChar: '万', image: null,
      });
      n++;
    }
    grid.push(row);
  }
  const state = { width: 3, height: 2, grid };

  // fake DOM 元素：提供 classList / getBoundingClientRect / style
  const els = new Map();
  for (const row of grid) for (const t of row) {
    if (!t) continue;
    const el = {
      instanceId: t.instanceId,
      classList: { _set: new Set(),
        add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
        toggle(c, on) { on ? this._set.add(c) : this._set.delete(c); },
        contains(c) { return this._set.has(c); } },
      style: {},
      isConnected: true,
      getBoundingClientRect() {
        // 模拟 60×80 牌，从 10,10 起排
        return { left: 10 + t.instanceId * 70, top: 10 + t.instanceId * 90, width: 60, height: 80 };
      },
    };
    els.set(t.instanceId, el);
  }

  const boardEl = document.createElement('div');
  boardEl.id = 'board';
  boardEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 });
  document.body.appendChild(boardEl);

  return { state, els, boardEl };
}

// 构造一个所有格 typeId 相同（可配对）的状态：便于 Enter 直接消除
function makeEnvDirectPair() {
  const env = makeEnv();
  // 让每个 tile 的 tileTypeId 都不同会破坏配对；这里全部用 0 → 任意两格可配对
  return env;
}

describe('createKeyboardController', () => {
  test('enable 后光标出现在棋盘中部', () => {
    const { state, els } = makeEnv();
    const calls = { click: [], drag: [] };
    const ctrl = createKeyboardController({
      getState: () => state,
      getPhase: () => 'IDLE',
      getTileElement: (id) => els.get(id) || null,
      handleTileClick: (p) => { calls.click.push(p); },
      handleDragEnd: (d) => { calls.drag.push(d); },
    });
    ctrl.enable();
    expect(ctrl.isEnabled()).toBe(true);
    // 光标 DOM 已挂载
    expect(document.getElementById('kb-cursor')).not.toBeNull();
    ctrl.disable();
    expect(document.getElementById('kb-cursor')).toBeNull();
  });

  test('方向键移动光标（箭头处理返回非 false）', () => {
    const { state, els } = makeEnv();
    const ctrl = createKeyboardController({
      getState: () => state,
      getPhase: () => 'IDLE',
      getTileElement: (id) => els.get(id) || null,
      handleTileClick: () => {},
      handleDragEnd: () => {},
    });
    ctrl.enable();
    ctrl.setCursor(0, 0);
    const e = { key: 'ArrowRight', preventDefault: () => {} };
    const result = ctrl.handleKey(e);
    // 方向键被处理（不会 undefined/没拦截）
    expect(result).not.toBe(false);
    ctrl.disable();
  });

  test('对可配对格按 Enter 触发 handleTileClick', () => {
    const { state, els } = makeEnvDirectPair();
    const calls = { click: [], drag: [] };
    const ctrl = createKeyboardController({
      getState: () => state,
      getPhase: () => 'IDLE',
      getTileElement: (id) => els.get(id) || null,
      handleTileClick: (p) => { calls.click.push(p); },
      handleDragEnd: (d) => { calls.drag.push(d); },
    });
    ctrl.enable();
    ctrl.setCursor(0, 0);
    ctrl.handleKey({ key: 'Enter', preventDefault: () => {} });
    // 有直接配对 → 走点击消除
    expect(calls.click.length).toBe(1);
    expect(calls.click[0]).toEqual({ row: 0, col: 0 });
    expect(calls.drag.length).toBe(0);
    ctrl.disable();
  });

  test('非对局阶段（ANIMATING）不响应键盘', () => {
    const { state, els } = makeEnv();
    const calls = { click: [], drag: [] };
    const ctrl = createKeyboardController({
      getState: () => state,
      getPhase: () => 'ANIMATING',
      getTileElement: (id) => els.get(id) || null,
      handleTileClick: (p) => { calls.click.push(p); },
      handleDragEnd: (d) => { calls.drag.push(d); },
    });
    ctrl.enable();
    ctrl.setCursor(0, 0);
    ctrl.handleKey({ key: 'Enter', preventDefault: () => {} });
    expect(calls.click.length).toBe(0);
    ctrl.disable();
  });

  test('disable 后键盘事件被忽略', () => {
    const { state, els } = makeEnvDirectPair();
    const calls = { click: [] };
    const ctrl = createKeyboardController({
      getState: () => state,
      getPhase: () => 'IDLE',
      getTileElement: (id) => els.get(id) || null,
      handleTileClick: (p) => { calls.click.push(p); },
      handleDragEnd: () => {},
    });
    ctrl.disable();
    ctrl.handleKey({ key: 'Enter', preventDefault: () => {} });
    expect(calls.click.length).toBe(0);
  });

  test('无直接配对时 Enter 选中起点，方向键+回车执行拖拽', () => {
    // 构造 1×4 棋盘，牌各不同（无直接配对），有空格制造移动空间：
    // [T0][T1][空][T2]  → 起点 T0 向左无牌可拖，向右 group=[T0,T1] 可右移1格
    const grid = [[]];
    const types = [0, 1, 2];
    for (let c = 0; c < 4; c++) {
      if (c === 2) { grid[0].push(null); continue; }
      const tid = types[c];
      grid[0].push({
        instanceId: 200 + c, tileTypeId: tid, type: 'wan', value: tid + 1,
        label: String(tid + 1), topChar: '一', bottomChar: '万', image: null,
      });
    }
    const state = { width: 4, height: 1, grid };
    const els = new Map();
    const boardEl = document.createElement('div');
    boardEl.id = 'board';
    boardEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100 });
    document.body.appendChild(boardEl);
    for (let c = 0; c < 4; c++) {
      const t = grid[0][c];
      if (!t) continue;
      const el = {
        classList: { _set: new Set(), add(x) { this._set.add(x); }, remove(x) { this._set.delete(x); }, toggle(x, on) { on ? this._set.add(x) : this._set.delete(x); }, contains(x) { return this._set.has(x); } },
        style: {}, isConnected: true,
        getBoundingClientRect: () => ({ left: 10 + c * 70, top: 10, width: 60, height: 80 }),
      };
      els.set(t.instanceId, el);
    }

    const calls = { click: [], drag: [] };
    const ctrl = createKeyboardController({
      getState: () => state,
      getPhase: () => 'IDLE',
      getTileElement: (id) => els.get(id) || null,
      handleTileClick: (p) => { calls.click.push(p); },
      handleDragEnd: (d) => { calls.drag.push(d); },
    });
    ctrl.enable();
    ctrl.setCursor(0, 0); // T0 无直接配对

    // 第一次 Enter：选中起点（不消除）
    ctrl.handleKey({ key: 'Enter', preventDefault: () => {} });
    expect(calls.click.length).toBe(0);
    expect(calls.drag.length).toBe(0);

    // 方向键向右：预选拖拽方向
    ctrl.handleKey({ key: 'ArrowRight', preventDefault: () => {} });

    // 回车：执行拖拽
    ctrl.handleKey({ key: 'Enter', preventDefault: () => {} });
    expect(calls.drag.length).toBe(1);
    const drag = calls.drag[0];
    expect(drag.direction).toBe(DIR.HORIZONTAL);
    expect(drag.delta).toBeGreaterThan(0);

    ctrl.disable();
  });

  test('Esc 取消起点选中', () => {
    const { state, els } = makeEnv(); // 全部同 typeId 可配对，但用无配对语义构造
    // 用 distinct types 棋盘避免 Enter 直接消除
    const grid = [[]];
    for (let c = 0; c < 4; c++) {
      if (c === 2) { grid[0].push(null); continue; }
      grid[0].push({ instanceId: 300 + c, tileTypeId: c, type: 'wan', value: c + 1, label: String(c + 1), topChar: '一', bottomChar: '万', image: null });
    }
    const s2 = { width: 4, height: 1, grid };
    const els2 = new Map();
    document.body.appendChild(Object.assign(document.createElement('div'), { id: 'board', getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 100 }) }));
    for (let c = 0; c < 4; c++) {
      const t = grid[0][c];
      if (!t) continue;
      els2.set(t.instanceId, { classList: { _set: new Set(), add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, isConnected: true, getBoundingClientRect: () => ({ left: 10 + c * 70, top: 10, width: 60, height: 80 }) });
    }
    const calls = { drag: [] };
    const ctrl = createKeyboardController({
      getState: () => s2,
      getPhase: () => 'IDLE',
      getTileElement: (id) => els2.get(id) || null,
      handleTileClick: () => {},
      handleDragEnd: (d) => { calls.drag.push(d); },
    });
    ctrl.enable();
    ctrl.setCursor(0, 0);
    ctrl.handleKey({ key: 'Enter', preventDefault: () => {} }); // 选中起点
    ctrl.handleKey({ key: 'Escape', preventDefault: () => {} }); // 取消
    ctrl.handleKey({ key: 'ArrowRight', preventDefault: () => {} }); // 取消后方向键应只移动光标/不执行
    ctrl.handleKey({ key: 'Enter', preventDefault: () => {} }); // 无起点时 Enter 只是重选起点
    expect(calls.drag.length).toBe(0);
    ctrl.disable();
  });
});
