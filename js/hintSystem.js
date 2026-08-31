import { DIR } from './constants.js';
import { collectDragGroup, calcMaxSlide, applySlide } from './movementLogic.js';
import { hasAnyPair } from './pairDetection.js';

// hintSystem.js — 提示算法

/**
 * 找到一个有效的可操作提示。
 *
 * 枚举三元组 (按下点, 方向, 拖动侧)：
 *   对每个有牌的格子 → 水平/垂直 → 向右(下)拖 / 向左(上)拖
 *   → 用 collectDragGroup 得到玩家真实会选中的牌组
 *   → 尝试所有合法距离 → 模拟 applySlide → 检查是否产生配对
 *
 * 关键：选组必须用 collectDragGroup（与 dragController 同一个函数）。
 * 早期版本这里用 selectGroup（双向收集整段），当返回负 delta 时
 * 提示的牌组比玩家能拖出来的更大，玩家照做必然失败，且游戏不会
 * 判定为死局（findHint 非 null），造成硬卡死。详见
 * tests/hintReproducibility.test.js。
 *
 * 返回 { group, direction, delta, start } 或 null（无可行步骤）。
 * group:     [{row,col,tile}] 会被一起拖动的牌
 * direction: DIR.HORIZONTAL | DIR.VERTICAL
 * delta:     非零整数，正数=右/下，负数=左/上
 * start:     {row, col, tile} 玩家应该按住的那张牌（提示动画会标记它）
 */
function findHint(state) {
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      if (!state.grid[r][c]) continue;

      for (const direction of [DIR.HORIZONTAL, DIR.VERTICAL]) {
        for (const sign of [1, -1]) {
          const group = collectDragGroup(state, r, c, direction, sign);
          const { maxPositive, maxNegative } = calcMaxSlide(state, group, direction);
          const max = sign > 0 ? maxPositive : maxNegative;

          for (let d = 1; d <= max; d++) {
            const delta = sign * d;
            const proposed = applySlide(state, group, direction, delta);
            if (hasAnyPair(proposed)) {
              return {
                group,
                direction,
                delta,
                start: { row: r, col: c, tile: state.grid[r][c] },
              };
            }
          }
        }
      }
    }
  }

  return null; // 无可行移动步骤
}

export { findHint };
