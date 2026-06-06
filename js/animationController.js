import { ANIM, DIR, TILE_WIDTH, TILE_HEIGHT, TILE_GAP } from './constants.js';
import { getTileElement, commitGroupPosition, clearAllHints } from './renderer.js';
import { SoundController } from './soundController.js';

// animationController.js — 动画序列（滑动/消除/提示）

// 工具：等待指定毫秒
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MAX_MATCH_LINES = 6;
const MAX_TILE_SPARKS = 34;
const MAX_SPARK_SOURCE_TILES = 6;

function getComboEffectLevel(combo, waveIndex) {
  const comboCount = combo?.count || 1;
  return Math.max(1, Math.min(5, comboCount + waveIndex));
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
      pulseBoard(elements[0]?.parentElement, 'board--slide-ok', 260);
      resolve();
    }, ANIM.SLIDE_DURATION);
  });
}

// 回弹动画：牌组从当前 transform 滑回原位
function animateRevert(group) {
  return new Promise(resolve => {
    const elements = group.map(g => getTileElement(g.tile.instanceId)).filter(Boolean);
    pulseBoard(elements[0]?.parentElement, 'board--invalid', ANIM.REVERT_DURATION + 80);

    for (const el of elements) {
      el.classList.add('tile--invalid');
      el.style.transition = `transform ${ANIM.REVERT_DURATION}ms ease-out`;
      el.style.transform = 'translate(0, 0)';
      el.style.zIndex = '';
    }

    setTimeout(() => {
      for (const el of elements) {
        el.classList.remove('tile--dragging', 'tile--invalid');
        el.style.transition = '';
        el.style.transform = '';
      }
      resolve();
    }, ANIM.REVERT_DURATION);
  });
}

function pulseBoard(boardEl, className, duration) {
  if (!boardEl) return;
  boardEl.classList.remove(className);
  requestAnimationFrame(() => boardEl.classList.add(className));
  setTimeout(() => boardEl.classList.remove(className), duration);
}

function drawMatchLine(boardEl, pair, effectLevel = 1) {
  if (!boardEl) return null;
  const elA = getTileElement(pair.a.tile.instanceId);
  const elB = getTileElement(pair.b.tile.instanceId);
  if (!elA || !elB) return null;

  const boardRect = boardEl.getBoundingClientRect();
  const rectA = elA.getBoundingClientRect();
  const rectB = elB.getBoundingClientRect();
  const x1 = rectA.left - boardRect.left + rectA.width / 2;
  const y1 = rectA.top - boardRect.top + rectA.height / 2;
  const x2 = rectB.left - boardRect.left + rectB.width / 2;
  const y2 = rectB.top - boardRect.top + rectB.height / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const line = document.createElement('div');

  line.className = 'match-line';
  line.style.left = `${x1}px`;
  line.style.top = `${y1}px`;
  line.style.width = `${Math.hypot(dx, dy)}px`;
  line.style.height = `${4 + Math.max(0, effectLevel - 1)}px`;
  line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  line.style.setProperty('--combo-level', effectLevel);
  line.dataset.comboLevel = String(effectLevel);
  boardEl.appendChild(line);
  return line;
}

function tileCenterInBoard(boardEl, el) {
  const boardRect = boardEl.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left - boardRect.left + rect.width / 2,
    y: rect.top - boardRect.top + rect.height / 2,
  };
}

function drawTileSpark(boardEl, el, index, effectLevel = 1, burstIndex = 0) {
  const center = tileCenterInBoard(boardEl, el);
  const spark = document.createElement('div');
  spark.className = 'tile-spark';
  spark.style.left = `${center.x}px`;
  spark.style.top = `${center.y}px`;
  const angle = ((index * 137.5 + burstIndex * 43) % 360) * Math.PI / 180;
  const distance = 12 + effectLevel * 5 + burstIndex * 3;
  spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
  spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance - 10}px`);
  spark.style.setProperty('--spark-size', `${8 + Math.min(5, effectLevel)}px`);
  spark.style.setProperty('--spark-delay', `${(index % 8) * 14}ms`);
  spark.style.setProperty('--spark-duration', `${360 + effectLevel * 48}ms`);
  spark.dataset.comboLevel = String(effectLevel);
  boardEl.appendChild(spark);
  return spark;
}

function drawComboRipple(boardEl, pairs, effectLevel) {
  if (!boardEl || effectLevel < 2 || pairs.length === 0) return null;
  const firstPair = pairs[0];
  const elA = getTileElement(firstPair.a.tile.instanceId);
  const elB = getTileElement(firstPair.b.tile.instanceId);
  if (!elA || !elB) return null;

  const centerA = tileCenterInBoard(boardEl, elA);
  const centerB = tileCenterInBoard(boardEl, elB);
  const ripple = document.createElement('div');
  ripple.className = 'combo-ripple';
  ripple.style.left = `${(centerA.x + centerB.x) / 2}px`;
  ripple.style.top = `${(centerA.y + centerB.y) / 2}px`;
  ripple.style.setProperty('--combo-scale', `${1.15 + effectLevel * 0.2}`);
  ripple.style.setProperty('--combo-duration', `${440 + effectLevel * 58}ms`);
  ripple.dataset.comboLevel = String(effectLevel);
  boardEl.appendChild(ripple);
  return ripple;
}

function showWaveBadge(boardEl, pairCount, waveIndex, combo, effectLevel) {
  if (!boardEl) return null;
  const badge = document.createElement('div');
  badge.className = 'match-badge';
  if ((combo?.count || 1) > 1 || waveIndex > 0) {
    badge.classList.add('match-badge--combo');
  }
  badge.dataset.comboLevel = String(effectLevel);

  const main = document.createElement('span');
  main.className = 'match-badge__main';
  if ((combo?.count || 1) > 1) {
    main.textContent = `连击 x${combo.count}`;
  } else if (waveIndex > 0) {
    main.textContent = `连锁 x${waveIndex + 1}`;
  } else {
    main.textContent = `消除 ${pairCount * 2}`;
  }
  badge.appendChild(main);

  if ((combo?.count || 1) > 1 || waveIndex > 0) {
    const sub = document.createElement('span');
    sub.className = 'match-badge__sub';
    if ((combo?.count || 1) > 1 && waveIndex > 0) {
      sub.textContent = `连锁 x${waveIndex + 1}`;
    } else if ((combo?.count || 1) > 1) {
      sub.textContent = '10秒内继续';
    } else {
      sub.textContent = '效果增强';
    }
    badge.appendChild(sub);
  }

  boardEl.appendChild(badge);
  return badge;
}

// 消除动画：给定一批 {row,col,tile} 的牌，播放缩放淡出，然后移除 DOM
function animateEliminate(pairs, waveIndex = 0, combo = null) {
  return new Promise(resolve => {
    const effectLevel = getComboEffectLevel(combo, waveIndex);
    const duration = ANIM.ELIMINATE_DURATION + (effectLevel - 1) * 48;
    const allTiles = [];
    for (const { a, b } of pairs) {
      allTiles.push(a.tile, b.tile);
    }

    const elements = allTiles.map(t => getTileElement(t.instanceId)).filter(Boolean);
    const boardEl = elements[0]?.parentElement || null;
    const lines = pairs.slice(0, MAX_MATCH_LINES).map(pair => drawMatchLine(boardEl, pair, effectLevel)).filter(Boolean);
    const sparks = [];
    if (boardEl) {
      const sparksPerTile = Math.min(4, Math.max(1, effectLevel));
      const sourceTiles = elements.slice(0, MAX_SPARK_SOURCE_TILES);
      for (let tileIndex = 0; tileIndex < sourceTiles.length; tileIndex++) {
        for (let burstIndex = 0; burstIndex < sparksPerTile; burstIndex++) {
          if (sparks.length >= MAX_TILE_SPARKS) break;
          sparks.push(drawTileSpark(boardEl, sourceTiles[tileIndex], sparks.length, effectLevel, burstIndex));
        }
      }
    }
    const ripple = drawComboRipple(boardEl, pairs, effectLevel);
    const badge = showWaveBadge(boardEl, pairs.length, waveIndex, combo, effectLevel);

    const boardPulse = effectLevel >= 4
      ? 'board--combo-high'
      : effectLevel >= 2
        ? 'board--combo'
        : waveIndex > 0 ? 'board--chain' : 'board--match';
    pulseBoard(boardEl, boardPulse, duration + 130);

    for (const el of elements) {
      el.classList.add('tile--matched', 'tile--eliminating', `tile--combo-${effectLevel}`);
      el.style.setProperty('--combo-level', effectLevel);
      el.style.animationDuration = `${duration}ms`;
    }

    setTimeout(() => {
      for (const el of elements) {
        el.remove();
      }
      for (const line of lines) {
        line.remove();
      }
      for (const spark of sparks) {
        spark.remove();
      }
      if (ripple) ripple.remove();
      if (badge) badge.remove();
      resolve();
    }, duration);
  });
}

/**
 * 连锁消除序列动画：逐波播放
 * waves: [{ eliminated: [{a,b}], stateAfter }]
 * onWaveComplete(stateAfter): 每波动画结束后的回调（更新游戏状态）
 */
async function runEliminationSequence(waves, onWaveComplete, combo = null) {
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    SoundController.playChainWave(i);
    await animateEliminate(wave.eliminated, i, combo);
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

function animateInvalidTile(tile) {
  const el = tile ? getTileElement(tile.instanceId) : null;
  if (!el) return;
  el.classList.remove('tile--invalid');
  void el.offsetWidth;
  el.classList.add('tile--invalid');
  pulseBoard(el.parentElement, 'board--invalid', 220);
  setTimeout(() => el.classList.remove('tile--invalid'), 240);
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
  const rows = Array.from({ length: height }, () => []);

  // 1. 所有牌立即置为背面（不触发 transition）
  for (const el of allTiles) {
    el.classList.add('tile--deal-hidden', 'tile--deal-animating');
    const row = Number(el.dataset.row);
    if (rows[row]) rows[row].push(el);
  }

  // 2. 强制一次 reflow，让浏览器记录 rotateY(180deg) 为起始状态
  void boardEl.offsetWidth;

  // 3. 从最底行（height-1）逐行翻到顶行（0）
  for (let row = height - 1; row >= 0; row--) {
    const rowEls = rows[row];
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

export { wait, animateSlide, animateRevert, runEliminationSequence, animateHint, animateInvalidTile, clearHintAnimation, runDealAnimation };
