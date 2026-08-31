// items.js — 道具库存与使用（数据 + 纯逻辑，可独立测试）
//
// 道具通过"能力回调"注入使用时的副作用（洗牌/撤销/提示/锤子实际动作由
// gameController 提供），items.js 只负责库存账本 + 使用合法性校验，
// 避免 items.js ↔ gameController 循环依赖。
//
// 道具类型：
//   reshuffle  洗牌卡：等价死局重排，消耗道具直接重排剩余牌（免确认）
//   undo       撤销卡：解锁一次撤销（即使撤销栈为空也能回退一局开始）
//   hint       提示卡：解锁一次提示
//   hammer     锤子：直接消除任意一对，并触发连锁（复用连锁算子，绕过拖动选组）

const ITEMS_KEY = 'mahjong-items-v1';
const DEFAULT_STOCK = {
  reshuffle: 3,
  undo: 3,
  hint: 5,
  hammer: 2,
};

const ITEM_META = Object.freeze({
  reshuffle: { id: 'reshuffle', name: '洗牌', icon: '⟳' },
  undo: { id: 'undo', name: '撤销', icon: '↩' },
  hint: { id: 'hint', name: '提示', icon: '💡' },
  hammer: { id: 'hammer', name: '锤子', icon: '🔨' },
});

const ITEM_IDS = Object.keys(ITEM_META);

function emptyStock() {
  return { ...DEFAULT_STOCK };
}

function loadItems() {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (!raw) return emptyStock();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyStock();
    const stock = emptyStock();
    for (const id of ITEM_IDS) {
      if (Number.isFinite(parsed[id])) stock[id] = Math.max(0, Math.floor(parsed[id]));
    }
    return stock;
  } catch (e) {
    return emptyStock();
  }
}

function saveItems(stock) {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(stock));
  } catch (e) { /* 隐私模式或存储不可用 */ }
  return stock;
}

function isValidItem(id) {
  return Object.prototype.hasOwnProperty.call(ITEM_META, id);
}

function getCount(stock, id) {
  if (!isValidItem(id)) return 0;
  return stock[id] || 0;
}

// 发放道具（可负增量扣减）。数量不会低于 0。
// 返回新库存（不可变，不直接改入参）。
function grantItems(stock, delta) {
  const next = { ...stock };
  for (const id of Object.keys(delta)) {
    if (!isValidItem(id)) continue;
    const n = Math.max(0, (stock[id] || 0) + Math.floor(delta[id]));
    next[id] = n;
  }
  return next;
}

// 扣减一个道具。返回 { ok, stock }；不足则 ok=false 且 stock 不变。
function spendItem(stock, id) {
  if (!isValidItem(id)) return { ok: false, stock };
  if ((stock[id] || 0) <= 0) return { ok: false, stock };
  return { ok: true, stock: grantItems(stock, { [id]: -1 }) };
}

export {
  ITEMS_KEY, DEFAULT_STOCK, ITEM_META, ITEM_IDS,
  emptyStock, loadItems, saveItems,
  isValidItem, getCount, grantItems, spendItem,
};
