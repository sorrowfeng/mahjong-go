// animationController.js — 动画序列（滑动/消除/提示）

// 工具：等待指定毫秒
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 滑动动画：让牌组从当前位置（拖拽释放处）平滑滑到最终格位
// 返回 Promise，动画结束后 resolve
function animateSlide(group, direction, delta) {
  return new Promise(resolve => {
    const dx = direction === DIR.HORIZONTAL ? delta * (TILE_WIDTH + TILE_GAP) : 0;
    const dy = direction === DIR.VERTICAL ? delta * (TILE_HEIGHT + TILE_GAP) : 0;

    const elements = group.map(g => getTileElement(g.tile.instanceId)).filter(Boolean);

    // 先强制触发重排，确保当前 transform 已被浏览器读取
    // 然后设置 transition + 目标 transform，实现从拖拽位置到格点的平滑过渡
    for (const el of elements) {
      // 读取当前 transform（触发重排）
      void el.offsetWidth;
      el.style.transition = `transform ${ANIM.SLIDE_DURATION}ms ease-out`;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.zIndex = '100';
    }

    setTimeout(() => {
      // 提交最终格位坐标，清除 transform 和 transition
      commitGroupPosition(group, direction, delta);
      for (const el of elements) {
        el.style.transition = '';
        el.style.zIndex = '';
      }
      resolve();
    }, ANIM.SLIDE_DURATION);
  });
}

// 回弹动画：牌组从当前 transform 滑回原位
function animateRevert(group) {
  return new Promise(resolve => {
    const elements = group.map(g => getTileElement(g.tile.instanceId)).filter(Boolean);

    for (const el of elements) {
      el.style.transition = `transform ${ANIM.REVERT_DURATION}ms ease-out`;
      el.style.transform = 'translate(0, 0)';
      el.style.zIndex = '';
    }

    setTimeout(() => {
      for (const el of elements) {
        el.style.transition = '';
        el.style.transform = '';
      }
      resolve();
    }, ANIM.REVERT_DURATION);
  });
}

// 消除动画：给定一批 {row,col,tile} 的牌，播放缩放淡出，然后移除 DOM
function animateEliminate(pairs) {
  return new Promise(resolve => {
    const allTiles = [];
    for (const { a, b } of pairs) {
      allTiles.push(a.tile, b.tile);
    }

    const elements = allTiles.map(t => getTileElement(t.instanceId)).filter(Boolean);

    for (const el of elements) {
      el.classList.add('tile--eliminating');
    }

    setTimeout(() => {
      for (const el of elements) {
        el.remove();
      }
      resolve();
    }, ANIM.ELIMINATE_DURATION);
  });
}

/**
 * 连锁消除序列动画：逐波播放
 * waves: [{ eliminated: [{a,b}], stateAfter }]
 * onWaveComplete(stateAfter): 每波动画结束后的回调（更新游戏状态）
 */
async function runEliminationSequence(waves, onWaveComplete) {
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    SoundController.playChainWave(i);
    await animateEliminate(wave.eliminated);
    await wait(ANIM.CHAIN_DELAY);
    onWaveComplete(wave.stateAfter);
  }
}

// 提示动画：对牌组元素添加脉冲 class
function animateHint(group) {
  for (const g of group) {
    const el = getTileElement(g.tile.instanceId);
    if (el) el.classList.add('tile--hint');
  }
}

// 清除提示动画
function clearHintAnimation(boardEl) {
  clearAllHints(boardEl);
}

/**
 * 发牌动画：所有牌初始背面朝上，从最底行到最顶行逐行翻起正面。
 * boardEl : 棋盘 DOM 元素
 * height  : 棋盘行数
 * 返回 Promise，全部行翻完后 resolve。
 */
async function runDealAnimation(boardEl, height) {
  const ROW_INTERVAL  = 120; // 每行间隔 ms
  const FLIP_DURATION = 500; // 与 CSS transition 时长一致

  const allTiles = boardEl.querySelectorAll('.tile');

  // 1. 所有牌立即置为背面（不触发 transition）
  for (const el of allTiles) {
    el.classList.add('tile--deal-hidden', 'tile--deal-animating');
  }

  // 2. 强制一次 reflow，让浏览器记录 rotateY(180deg) 为起始状态
  void boardEl.offsetWidth;

  // 3. 从最底行（height-1）逐行翻到顶行（0）
  for (let row = height - 1; row >= 0; row--) {
    const rowEls = boardEl.querySelectorAll(`.tile[data-row="${row}"]`);
    for (const el of rowEls) {
      el.classList.remove('tile--deal-hidden'); // 触发 rotateY(180→0) 过渡
    }
    SoundController.playTileFlip(height - 1 - row); // 底行=0，顶行=height-1
    await wait(ROW_INTERVAL);
  }

  // 4. 等最后一行（顶行）翻完
  await wait(FLIP_DURATION);

  // 5. 清理动画辅助 class
  for (const el of allTiles) {
    el.classList.remove('tile--deal-animating');
  }
}
