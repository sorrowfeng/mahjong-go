// keyboardNav.js — 键盘完全可玩（可访问性）
//
// 让纯键盘玩家能完成全部操作：方向键移动光标 → Enter 选中起点
// → 方向键选择拖拽方向 → Enter 执行（复用现有消除/连锁逻辑）。
//
// 分两层：
//  1. 纯逻辑（可测，无 DOM）：光标移动、单步拖拽构造
//  2. DOM 控制器：光标渲染 + 键盘事件绑定 + aria-live 播报
//
// 关键约束：不触碰核心消除算子。点击消除走 handleTileClick，
// 拖拽走 handleDragEnd({group, direction, delta}) —— 与鼠标产生的
// 输入完全同构，因此连锁/计分/成就/存档等上游逻辑零改动。

import { DIR } from './constants.js';
import { getTile } from './boardState.js';
import { collectDragGroup, calcMaxSlide, applySlide } from './movementLogic.js';
import { resolveNewPairChain, findAllPairs } from './gameLogic.js';

// ─────────────────────────────────────────────────────────────────────
// 1. 纯逻辑
// ─────────────────────────────────────────────────────────────────────

/**
 * 从 (row, col) 沿 (dr, dc) 方向步进一格，跳过空格（null），
 * 找到下一个有牌的格子。找不到则返回 null。
 * 允许环绕（到达边界后回绕），方便快速定位。返回 {row, col} 或 null。
 */
function stepCursor(state, row, col, dr, dc) {
  const rows = state.height;
  const cols = state.width;
  for (let n = 1; n <= Math.max(rows, cols); n++) {
    let r = row + dr * n;
    let c = col + dc * n;
    // 方向内回绕（仅对移动的方向轴回绕，另一轴钳制在边界内）
    r = ((r % rows) + rows) % rows;
    c = ((c % cols) + cols) % cols;
    // 若是斜向移动（dr 与 dc 均非零），先沿主轴走，到边界后回绕会扫过整行/列
    if (dr !== 0 && dc !== 0) {
      // 斜向（对角线）仅在主轴可达时生效，避免跳到无关区域
      const r2 = row + dr * n;
      const c2 = col + dc * n;
      if (r2 < 0 || r2 >= rows) continue;
      if (c2 < 0 || c2 >= cols) continue;
      const t = getTile(state, r2, c2);
      if (t) return { row: r2, col: c2 };
      continue;
    }
    if (getTile(state, r, c)) return { row: r, col: c };
  }
  return null;
}

/**
 * 移动到棋盘上最近的指定键格（用于 Enter 后自动跳到起点）。
 */
function nearestTile(state, row, col) {
  if (getTile(state, row, col)) return { row, col };
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dr, dc] of dirs) {
    const n = stepCursor(state, row, col, dr, dc);
    if (n) return n;
  }
  return null;
}

/**
 * 判断某格是否有直接可消除配对（供 UI 高亮提示"此处可点击"）。
 * 遍历整盘找包含 (row,col) 的配对。
 */
function tileHasDirectPair(state, row, col) {
  return findAllPairs(state).some(({ a, b }) =>
    (a.row === row && a.col === col) || (b.row === row && b.col === col)
  );
}

/**
 * 构造一次键盘拖拽：从 (row, col) 按下，朝 dir 的 sign 方向拖 delta 格。
 * 返回 { group, direction, delta }（与鼠标 dragController 同构），
 * 供调用方传给 handleDragEnd。若起点无牌则返回 null。
 *
 * delta 会按 calcMaxSlide 钳制到合法范围；delta 钳为 0 表示无法移动。
 */
function buildKeyboardDrag(state, row, col, direction, sign, delta) {
  const group = collectDragGroup(state, row, col, direction, sign);
  if (group.length === 0) return null;
  const { maxPositive, maxNegative } = calcMaxSlide(state, group, direction);
  const mag = Math.max(1, Math.abs(delta));
  const d = sign >= 0
    ? Math.min(mag, maxPositive)
    : -Math.min(mag, maxNegative);
  return { group, direction, delta: d };
}

/**
 * 单步拖拽（delta=1），并判断是否会产生消除。
 * 返回 { group, direction, delta, wouldMatch }。
 * 若该方向无法移动（delta 为 0），wouldMatch 恒 false。
 */
function previewStepDrag(state, row, col, direction, sign) {
  const built = buildKeyboardDrag(state, row, col, direction, sign, 1);
  if (!built || built.delta === 0) {
    return { group: built ? built.group : [], direction, delta: 0, wouldMatch: false };
  }
  const proposed = applySlide(state, built.group, built.direction, built.delta);
  const waves = resolveNewPairChain(state, proposed);
  return { ...built, wouldMatch: waves.length > 0 };
}

export {
  stepCursor,
  nearestTile,
  tileHasDirectPair,
  buildKeyboardDrag,
  previewStepDrag,
};

// ─────────────────────────────────────────────────────────────────────
// 2. DOM 控制器（依赖注入，不直接引 gameController）
// ─────────────────────────────────────────────────────────────────────

const CURSOR_ID = 'kb-cursor';
const ARROW_KEY = {
  ArrowUp: { dr: -1, dc: 0 },
  ArrowDown: { dr: 1, dc: 0 },
  ArrowLeft: { dr: 0, dc: -1 },
  ArrowRight: { dr: 0, dc: 1 },
};

/**
 * 创建键盘控制器。
 * deps:
 *   getState()        → 当前 boardState
 *   getPhase()        → 'IDLE' | 'ANIMATING' | ...
 *   getTileElement()  → (instanceId) => HTMLElement | null（光标定位用）
 *   handleTileClick() → async ({row, col})（点击消除/锤子）
 *   handleDragEnd()   → async ({group, direction, delta})（拖拽消除）
 *   announce(msg)     → (string) => void（aria-live 播报，可空）
 *
 * 返回控制器对象：{ enable(), disable(), setCursor(row,col), clear() }
 */
  function createKeyboardController(deps) {
    const {
      getState,
      getPhase,
      getTileElement,
      handleTileClick,
      handleDragEnd,
      announce = () => {},
      onFirstUse = () => {},
    } = deps;

  let enabled = false;
  let cursor = null;        // {row, col}
  let origin = null;        // 起点（选中后进入"拖拽方向"阶段）
  let pendingDir = null;    // {direction, sign} 预选的拖拽方向
  let originEl = null;      // 起点高亮元素
  // 光标可见性：默认隐藏，首次按下方向键/回车时才显示。
  // 鼠标玩家完全看不到闪烁的指示框；只有真正开始用键盘操作才出现。
  let cursorVisible = false;

  function boardEl() {
    return document.getElementById('board');
  }

  function ensureCursorEl() {
    let el = document.getElementById(CURSOR_ID);
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.id = CURSOR_ID;
    el.className = 'kb-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    boardEl()?.appendChild(el);
    return el;
  }

  function removeCursorEl() {
    document.getElementById(CURSOR_ID)?.remove();
  }

  // 用元素缓存里的真实 tile 元素做定位锚点（与 renderer 保持一致）
  function locateCursorCell(row, col) {
    const state = getState();
    if (!state) return null;
    const tile = state.grid[row]?.[col];
    if (!tile) return null;
    const el = getTileElement(tile.instanceId);
    if (!el) return null;
    return el;
  }

  function renderCursor() {
    removeCursorEl();
    // 光标默认隐藏，只有玩家实际用键盘导航（方向键/回车）后才显示。
    if (!enabled || !cursor || !cursorVisible) return;
    const state = getState();
    if (!state) return;
    const tile = state.grid[cursor.row]?.[cursor.col];
    if (!tile) return;
    const el = getTileElement(tile.instanceId);
    if (!el) return;
    const c = ensureCursorEl();
    const r = el.getBoundingClientRect();
    const b = boardEl()?.getBoundingClientRect();
    if (!b) return;
    c.style.left = (r.left - b.left) + 'px';
    c.style.top = (r.top - b.top) + 'px';
    c.style.width = r.width + 'px';
    c.style.height = r.height + 'px';
    c.classList.toggle('kb-cursor--match', tileHasDirectPair(state, cursor.row, cursor.col));
  }

  // 清除起点与拖拽方向预选
  function clearOrigin() {
    origin = null;
    pendingDir = null;
    if (originEl) {
      originEl.classList.remove('kb-origin');
      originEl = null;
    }
  }

  function renderOrigin() {
    if (originEl) originEl.classList.remove('kb-origin');
    originEl = null;
    if (!enabled || !origin) return;
    const state = getState();
    if (!state) return;
    const tile = state.grid[origin.row]?.[origin.col];
    if (!tile) return;
    const el = getTileElement(tile.instanceId);
    if (el) {
      el.classList.add('kb-origin');
      originEl = el;
    }
  }

  async function tryClick(row, col) {
    // 点击消除：交给现有 handleTileClick（含锤子与教学判定）
    await handleTileClick({ row, col });
  }

  async function tryDrag(direction, sign, delta) {
    const state = getState();
    if (!state || !origin) return;
    const built = buildKeyboardDrag(state, origin.row, origin.col, direction, sign, delta);
    if (!built) return;
    if (built.delta === 0) {
      announce('此方向无法移动');
      return;
    }
    clearOrigin();
    await handleDragEnd(built);
  }

  // 首次键盘操作时"点亮"光标：初始化到棋盘中央最近牌并显示。
  // 之后方向键正常移动。重复调用无害（已可见则跳过）。
  function revealCursorOnFirstUse() {
    const state = getState();
    if (!enabled || !state) return;
    if (cursorVisible && cursor) return;
    if (!cursor) {
      cursor = nearestTile(state, Math.floor(state.height / 2), Math.floor(state.width / 2));
    }
    cursorVisible = true;
    renderCursor();
    onFirstUse();
  }

  function handleKey(e) {
    if (!enabled) return;
    const state = getState();
    if (!state) return;
    // 非对局状态（动画/胜利）不接受键盘棋盘操作
    if (getPhase() !== 'IDLE') return;

    const key = e.key;

    // 方向键：移动光标 或 预选拖拽方向
    if (ARROW_KEY[key]) {
      e.preventDefault();
      // 首次按下方向键才点亮光标（鼠标玩家无感知）
      revealCursorOnFirstUse();
      if (!cursor) return;
      const { dr, dc } = ARROW_KEY[key];

      // 已选中起点：方向键进入拖拽方向预选（不立即执行）
      if (origin) {
        const direction = (dc !== 0) ? DIR.HORIZONTAL : DIR.VERTICAL;
        const sign = (dc > 0 || dr > 0) ? 1 : -1;
        // 预判该方向单步是否可消，播报给读屏
        const pre = previewStepDrag(state, origin.row, origin.col, direction, sign);
        pendingDir = { direction, sign, delta: 1 };
        announce(pre.wouldMatch
          ? `按回车拖向右方可消除`
          : `已选择方向，按回车拖拽`);
        return;
      }

      // 光标移动
      const next = stepCursor(state, cursor.row, cursor.col, dr, dc);
      if (next) {
        cursor = next;
        renderCursor();
      }
      return;
    }

    // Enter：选中起点 或 执行拖拽
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      // 首次回车也点亮光标，允许纯键盘用回车选择起点
      revealCursorOnFirstUse();
      if (!cursor) return;

      if (origin && pendingDir) {
        // 执行拖拽
        const { direction, sign, delta } = pendingDir;
        const prevOrigin = origin;
        tryDrag(direction, sign, delta).then(() => {
          // 拖拽后光标跟随到起点原位（若该格已被清空，跳到最近的牌）
          if (getState()) {
            const n = nearestTile(getState(), prevOrigin.row, prevOrigin.col);
            if (n) { cursor = n; }
            renderCursor();
          }
        });
        pendingDir = null;
        return;
      }

      // 尝试点击消除该格（含锤子）。若有直接配对会消除，否则进入起点选中态。
      const stateNow = getState();
      if (stateNow) {
        const hasPair = tileHasDirectPair(stateNow, cursor.row, cursor.col);
        if (hasPair) {
          // 直接配对 → 点击消除
          tryClick(cursor.row, cursor.col);
          return;
        }
      }
      // 无直接配对：作为拖拽起点选中
      if (!origin) {
        origin = { ...cursor };
        pendingDir = null;
        renderOrigin();
        announce('已选中起点，用方向键选择拖拽方向，回车执行');
      }
      return;
    }

    // Esc：取消起点 / 隐藏光标提示
    if (key === 'Escape') {
      if (origin) {
        clearOrigin();
        pendingDir = null;
        announce('已取消选择');
      }
      e.preventDefault();
    }
  }

  // 供 gameController 在消除/重排/胜利后刷新光标（消除后格子可能空了）
  function refreshCursorAfterBoardChange() {
    if (!enabled || !cursor || !cursorVisible) return;
    const state = getState();
    if (!state) return;
    // 当前光标格若已被清空，跳到最近牌
    if (!state.grid[cursor.row]?.[cursor.col]) {
      const n = nearestTile(state, cursor.row, cursor.col);
      cursor = n || cursor;
    }
    renderCursor();
    renderOrigin();
  }

  return {
    enable() {
      // syncKeyboardUI 每 800ms 调用一次，必须幂等：
      // 不能每次重置 cursorVisible，否则键盘玩家移动光标时会被周期性隐藏。
      const wasEnabled = enabled;
      enabled = true;
      const state = getState();
      if (state && !cursor) {
        cursor = nearestTile(state, Math.floor(state.height / 2), Math.floor(state.width / 2));
      }
      // 仅在"首次进入对局"或"从未点亮过"时保持隐藏；
      // 已点亮（玩家正在用键盘）则保留可见状态。
      if (!wasEnabled || !cursorVisible) {
        cursorVisible = false;
      }
      renderCursor();
    },
    disable() {
      enabled = false;
      cursorVisible = false;
      clearOrigin();
      cursor = null;
      removeCursorEl();
    },
    setCursor(row, col) {
      cursor = { row, col };
      if (cursorVisible) renderCursor();
    },
    refresh: refreshCursorAfterBoardChange,
    isEnabled() {
      return enabled;
    },
    handleKey,
  };
}

export { createKeyboardController };

