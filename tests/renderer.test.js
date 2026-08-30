/**
 * renderer 测试 —— jsdom 真 DOM：diff 增量渲染、加载失败降级、僵尸缓存防护
 */

import {
  renderBoard, diffRenderBoard, createTileElement,
  getTileElement, removeTileElement,
} from '../js/renderer.js';

function makeTile(instanceId, value = 1) {
  return {
    instanceId,
    tileTypeId: 0,
    type: 'wan',
    value,
    label: `${value}万`,
    topChar: String(value),
    bottomChar: '万',
    image: `assets/images/tiles/wan_${value}.png`,
  };
}

function gridOf(entries, width = 5, height = 1) {
  const grid = Array.from({ length: height }, () => Array(width).fill(null));
  for (const [r, c, tile] of entries) grid[r][c] = tile;
  return { grid, width, height };
}

let boardEl;

beforeEach(() => {
  document.body.innerHTML = '<div id="board"></div>';
  boardEl = document.getElementById('board');
});

describe('diffRenderBoard 增量渲染', () => {
  test('消除+移动：只删/移变化的节点，未变化节点被复用', () => {
    const A = makeTile(1);
    const B = makeTile(2);
    const C = makeTile(3);
    const before = gridOf([[0, 0, A], [0, 1, B], [0, 3, C]]);
    renderBoard(before, boardEl);

    const elA = getTileElement(1);
    const elC = getTileElement(3);

    // 撤销后：B 回到 col2，其余不动
    const after = gridOf([[0, 0, A], [0, 2, B], [0, 3, C]]);
    diffRenderBoard(before, after, boardEl);

    expect(boardEl.querySelectorAll('.tile').length).toBe(3);
    // 未移动的节点被复用（同一 DOM 引用）
    expect(getTileElement(1)).toBe(elA);
    expect(getTileElement(3)).toBe(elC);
    // 移动的节点位置已更新
    const elB = getTileElement(2);
    expect(elB.dataset.col).toBe('2');
  });

  test('消失的牌从 DOM 与缓存中同时移除（无僵尸条目）', () => {
    const A = makeTile(1);
    const B = makeTile(2);
    const before = gridOf([[0, 0, A], [0, 1, B]]);
    renderBoard(before, boardEl);

    const after = gridOf([[0, 0, A]]); // B 被消除
    diffRenderBoard(before, after, boardEl);

    expect(boardEl.querySelectorAll('.tile').length).toBe(1);
    expect(getTileElement(2)).toBeNull(); // 缓存同步清理
  });

  test('新增的牌被创建并进入缓存', () => {
    const A = makeTile(1);
    renderBoard(gridOf([[0, 0, A]]), boardEl);

    const B = makeTile(2);
    const after = gridOf([[0, 0, A], [0, 4, B]]);
    diffRenderBoard(gridOf([[0, 0, A]]), after, boardEl);

    expect(boardEl.querySelectorAll('.tile').length).toBe(2);
    expect(getTileElement(2)).not.toBeNull();
  });
});

describe('图片加载失败降级', () => {
  test('onerror 后移除 img，补齐 topChar 与 bottomChar 文字占位', () => {
    const tile = makeTile(9);
    const el = createTileElement(tile, 0, 0);
    expect(el.querySelector('img')).not.toBeNull();

    el.querySelector('img').dispatchEvent(new Event('error'));

    expect(el.querySelector('img')).toBeNull(); // img 被移除而非 display:none
    const top = el.querySelector('.tile__top');
    const bottom = el.querySelector('.tile__bottom');
    expect(top).not.toBeNull();
    expect(top.textContent).toBe('1');
    expect(bottom).not.toBeNull();
    expect(bottom.textContent).toBe('万');
  });

  test('bottomChar 为空的字牌只显示 topChar，不产生空 span', () => {
    const tile = { ...makeTile(9), type: 'zi', topChar: '东', bottomChar: '' };
    const el = createTileElement(tile, 0, 0);
    el.querySelector('img').dispatchEvent(new Event('error'));

    expect(el.querySelector('.tile__top')).not.toBeNull();
    expect(el.querySelector('.tile__bottom')).toBeNull();
  });
});

describe('removeTileElement', () => {
  test('移除后 getTileElement 返回 null', () => {
    const A = makeTile(1);
    renderBoard(gridOf([[0, 0, A]]), boardEl);
    expect(getTileElement(1)).not.toBeNull();

    removeTileElement(1);
    expect(getTileElement(1)).toBeNull();
    expect(boardEl.querySelectorAll('.tile').length).toBe(0);
  });
});
