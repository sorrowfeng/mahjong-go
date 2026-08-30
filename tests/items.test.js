import { ITEMS_KEY, DEFAULT_STOCK, ITEM_META, ITEM_IDS, emptyStock, loadItems, saveItems, isValidItem, getCount, grantItems, spendItem } from '../js/items.js';

describe('items.js 道具库存', () => {
  beforeEach(() => localStorage.clear());

  test('emptyStock 返回默认库存', () => {
    const s = emptyStock();
    expect(s.reshuffle).toBe(3);
    expect(s.undo).toBe(3);
    expect(s.hint).toBe(5);
    expect(s.hammer).toBe(2);
  });

  test('isValidItem / ITEM_IDS', () => {
    expect(isValidItem('hammer')).toBe(true);
    expect(isValidItem('nope')).toBe(false);
    expect(ITEM_IDS).toEqual(['reshuffle', 'undo', 'hint', 'hammer']);
    expect(ITEM_META.hammer.name).toBe('锤子');
  });

  test('loadItems：无存档返回默认', () => {
    expect(loadItems()).toEqual(DEFAULT_STOCK);
  });

  test('loadItems：损坏数据返回默认', () => {
    localStorage.setItem(ITEMS_KEY, 'not-json');
    expect(loadItems()).toEqual(DEFAULT_STOCK);
  });

  test('grantItems：增发/扣减且不低于 0', () => {
    let s = emptyStock();
    s = grantItems(s, { hammer: 2 });
    expect(s.hammer).toBe(4);
    s = grantItems(s, { hammer: -10 });
    expect(s.hammer).toBe(0);
  });

  test('grantItems 不可变', () => {
    const s = emptyStock();
    const next = grantItems(s, { hint: 1 });
    expect(s.hint).toBe(5);
    expect(next.hint).toBe(6);
  });

  test('spendItem：库存足够则扣减成功', () => {
    const s = emptyStock();
    const r = spendItem(s, 'hammer');
    expect(r.ok).toBe(true);
    expect(r.stock.hammer).toBe(1);
  });

  test('spendItem：库存不足失败且不改动', () => {
    const s = { ...emptyStock(), hammer: 0 };
    const r = spendItem(s, 'hammer');
    expect(r.ok).toBe(false);
    expect(r.stock.hammer).toBe(0);
  });

  test('spendItem：非法道具失败', () => {
    const r = spendItem(emptyStock(), 'invalid');
    expect(r.ok).toBe(false);
  });

  test('saveItems/loadItems 往返', () => {
    const s = grantItems(emptyStock(), { reshuffle: -1 });
    saveItems(s);
    expect(loadItems().reshuffle).toBe(2);
  });
});
