// hintSystem.js — 提示算法

/**
 * 找到一个有效的可操作提示。
 * 遍历所有牌 → 对每个连续牌组 → 尝试四方向所有合法距离 →
 * 模拟 applySlide → 检查是否产生匹配。
 *
 * 返回 { group, direction, delta } 或 null（无可行步骤）。
 * group: [{row,col,tile}]
 * direction: DIR.HORIZONTAL | DIR.VERTICAL
 * delta: 非零整数
 */
function findHint(state) {
  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      if (!state.grid[r][c]) continue;

      for (const direction of [DIR.HORIZONTAL, DIR.VERTICAL]) {
        const group = selectGroup(state, r, c, direction);

        // 只处理以该格为首（最小row/col）的牌组，避免重复
        const isLeader = group[0].row === r && group[0].col === c;
        if (!isLeader) continue;

        const { maxPositive, maxNegative } = calcMaxSlide(state, group, direction);

        // 尝试正方向
        for (let delta = 1; delta <= maxPositive; delta++) {
          const proposed = applySlide(state, group, direction, delta);
          if (findAllPairs(proposed).length > 0) {
            return { group, direction, delta };
          }
        }

        // 尝试负方向
        for (let delta = 1; delta <= maxNegative; delta++) {
          const proposed = applySlide(state, group, direction, -delta);
          if (findAllPairs(proposed).length > 0) {
            return { group, direction, delta: -delta };
          }
        }
      }
    }
  }

  return null; // 死局
}
