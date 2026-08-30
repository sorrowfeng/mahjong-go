import { ANIM, DIR, TILE_WIDTH, TILE_HEIGHT, TILE_GAP } from './constants.js';
import { getTileElement, removeTileElement, commitGroupPosition, clearAllHints } from './renderer.js';
import { SoundController } from './soundController.js';
import { burstAtElement } from './particles.js';

// animationController.js — 动画序列（滑动/消除/提示）

// 工具：等待指定毫秒
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MAX_MATCH_LINES = 6;
const MAX_TILE_SPARKS = 48;
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
      resolve();
    }, ANIM.SLIDE_DURATION);
  });
}

// 回弹动画：牌组从当前 transform 滑回原位
function animateRevert(group) {
  return new Promise(resolve => {
    const elements = group.map(g => getTileElement(g.tile.instanceId)).filter(Boolean);

    for (const el of elements) {
      el.classList.remove('tile--invalid');
      void el.offsetWidth;
      el.classList.add('tile--invalid');
      // 回弹用 spring 曲线（overshoot 1.06）—— 拖错时回弹更有"短促有力"的手感，
      // 仍是单段 cubic-bezier，无额外运行时开销。
      el.style.transition = `transform ${ANIM.REVERT_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
      el.style.transform = 'translate(0, 0)';
      el.style.zIndex = '';
    }

    setTimeout(() => {
      for (const el of elements) {
        el.classList.remove('tile--dragging', 'tile--invalid', 'tile--composited');
        el.style.transition = '';
        el.style.transform = '';
      }
      resolve();
    }, ANIM.REVERT_DURATION);
  });
}

function drawMatchLine(boardEl, pair, effectLevel = 1, lineDuration = 340) {
  if (!boardEl) return null;
  const elA = getTileElement(pair.a.tile.instanceId);
  const elB = getTileElement(pair.b.tile.instanceId);
  if (!elA || !elB) return null;

  // 直接用牌元素的绝对定位 left/top（相对 board），避免 getBoundingClientRect
  // 造成的强制同步布局（layout thrashing）—— 这是消除动画卡顿的来源之一。
  const a = parseStylePos(elA);
  const b = parseStylePos(elB);
  if (!a || !b) return null;
  const x1 = a.left + a.width / 2;
  const y1 = a.top + a.height / 2;
  const x2 = b.left + b.width / 2;
  const y2 = b.top + b.height / 2;
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
  // 连线闪光时长与消除动画同步，避免"连线已淡出、牌还在消"的节奏脱节。
  line.style.setProperty('--line-duration', `${lineDuration}ms`);
  line.dataset.comboLevel = String(effectLevel);
  boardEl.appendChild(line);
  return line;
}

// 从牌的绝对定位 style 读取 {left, top, width, height}（px）。
// 牌用绝对定位且 transform 归零时，style 值即最终位置，无需读布局。
function parseStylePos(el) {
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top, width: TILE_WIDTH, height: TILE_HEIGHT };
}

function tileCenterInBoard(boardEl, el) {
  const pos = parseStylePos(el);
  if (!pos) {
    const boardRect = boardEl.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left - boardRect.left + rect.width / 2,
      y: rect.top - boardRect.top + rect.height / 2,
    };
  }
  return {
    x: pos.left + pos.width / 2,
    y: pos.top + pos.height / 2,
  };
}

function drawTileSpark(boardEl, el, index, effectLevel = 1, burstIndex = 0) {
  const center = tileCenterInBoard(boardEl, el);
  const spark = document.createElement('div');
  spark.className = 'tile-spark';
  spark.style.left = `${center.x}px`;
  spark.style.top = `${center.y}px`;
  const angle = ((index * 137.5 + burstIndex * 43) % 360) * Math.PI / 180;
  const distance = 14 + effectLevel * 7 + burstIndex * 4;
  spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
  spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance - 10}px`);
  spark.style.setProperty('--spark-size', `${8 + Math.min(7, effectLevel + burstIndex)}px`);
  spark.style.setProperty('--spark-delay', `${(index % 10) * 12}ms`);
  spark.style.setProperty('--spark-duration', `${410 + effectLevel * 58}ms`);
  spark.dataset.comboLevel = String(effectLevel);
  boardEl.appendChild(spark);
  return spark;
}

function drawComboRipples(boardEl, pairs, effectLevel) {
  if (!boardEl || effectLevel < 2 || pairs.length === 0) return [];
  const firstPair = pairs[0];
  const elA = getTileElement(firstPair.a.tile.instanceId);
  const elB = getTileElement(firstPair.b.tile.instanceId);
  if (!elA || !elB) return [];

  const centerA = tileCenterInBoard(boardEl, elA);
  const centerB = tileCenterInBoard(boardEl, elB);
  const x = (centerA.x + centerB.x) / 2;
  const y = (centerA.y + centerB.y) / 2;
  const rippleCount = effectLevel >= 5 ? 3 : effectLevel >= 3 ? 2 : 1;
  const ripples = [];

  for (let i = 0; i < rippleCount; i++) {
    const ripple = document.createElement('div');
    ripple.className = i === 0 ? 'combo-ripple' : 'combo-ripple combo-ripple--echo';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.setProperty('--combo-scale', `${1.22 + effectLevel * 0.24 + i * 0.34}`);
    ripple.style.setProperty('--combo-duration', `${520 + effectLevel * 76 + i * 110}ms`);
    ripple.style.setProperty('--combo-delay', `${i * 82}ms`);
    ripple.style.setProperty('--ripple-size', `${TILE_WIDTH * (1.2 + effectLevel * 0.13 + i * 0.18)}px`);
    ripple.dataset.comboLevel = String(effectLevel);
    boardEl.appendChild(ripple);
    ripples.push(ripple);
  }

  return ripples;
}

function showWaveBadge(boardEl, pairCount, waveIndex, combo, effectLevel) {
  if (!boardEl) return null;
  const badge = document.createElement('div');
  badge.className = 'match-badge';
  if ((combo?.count || 1) > 1 || waveIndex > 0) {
    badge.classList.add('match-badge--combo');
  }
  badge.classList.add(`match-badge--level-${effectLevel}`);
  badge.dataset.comboLevel = String(effectLevel);
  badge.style.setProperty('--combo-level', effectLevel);
  badge.style.setProperty('--badge-halo-scale', `${1.16 + effectLevel * 0.05}`);
  const badgeDuration = (combo?.count || 1) > 1 || waveIndex > 0
    ? 780 + effectLevel * 92
    : 560;
  badge.style.setProperty('--badge-duration', `${badgeDuration}ms`);

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
      if ((combo?.gain || 1) > 1) {
        sub.textContent = `本次 +${combo.gain}`;
      } else if (effectLevel >= 5) {
        sub.textContent = '满格爆发';
      } else if (effectLevel >= 4) {
        sub.textContent = '强连击';
      } else if (effectLevel >= 3) {
        sub.textContent = '节奏升级';
      } else {
        sub.textContent = '10秒内继续';
      }
    } else {
      sub.textContent = '效果增强';
    }
    badge.appendChild(sub);
  }

  boardEl.appendChild(badge);
  return { element: badge, duration: badgeDuration };
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
    const lines = pairs.slice(0, MAX_MATCH_LINES).map(pair => drawMatchLine(boardEl, pair, effectLevel, Math.round(duration * 0.8))).filter(Boolean);
    const sparks = [];
    if (boardEl) {
      // 精简粒子数：低 combo 少而精致，高 combo 适度增加，避免连锁时
      // 一次性创建数十个 CSS 动画元素造成合成器压力（低端设备卡顿来源）。
      const sparksPerTile = Math.min(3, Math.max(1, effectLevel - 1));
      const sourceTiles = elements.slice(0, Math.min(4, MAX_SPARK_SOURCE_TILES));
      for (let tileIndex = 0; tileIndex < sourceTiles.length; tileIndex++) {
        for (let burstIndex = 0; burstIndex < sparksPerTile; burstIndex++) {
          if (sparks.length >= MAX_TILE_SPARKS) break;
          sparks.push(drawTileSpark(boardEl, sourceTiles[tileIndex], sparks.length, effectLevel, burstIndex));
        }
      }
    }
    const ripples = drawComboRipples(boardEl, pairs, effectLevel);
    const badge = showWaveBadge(boardEl, pairs.length, waveIndex, combo, effectLevel);

    // 棋盘整体脉冲/震动已完全移除：每次消除让整个棋盘缩放或位移会干扰
    // 操作手感。消除反馈集中在牌本身的缩放淡出、连线与粒子即可。

    for (const el of elements) {
      el.classList.add('tile--matched', 'tile--eliminating', 'tile--composited', `tile--combo-${effectLevel}`);
      el.style.setProperty('--combo-level', effectLevel);
      // 上抛高度按连击等级增强（combo 越高消除越"有力度"）。
      // 纯 transform translateY，可合成；reduced-motion 下由全局 CSS 缩短到 1ms。
      el.style.setProperty('--eliminate-lift', `${4 + effectLevel * 1.5}px`);
      el.style.animationDuration = `${duration}ms`;
      // Canvas 粒子迸发（独立叠加层；reduced-motion / 无 canvas 时内部自动 no-op）
      burstAtElement(el, { count: 5 + effectLevel, power: 0.6 + effectLevel * 0.12 });
    }

    setTimeout(() => {
      // 必须走 removeTileElement：直接 el.remove() 会绕过 _tileElementCache
      // 的清理，留下已脱离 DOM 的僵尸条目阻止 GC，并拖慢后续 getTileElement。
      for (const el of elements) {
        el.classList.remove('tile--composited');
      }
      for (const t of allTiles) {
        removeTileElement(t.instanceId);
      }
      for (const line of lines) {
        line.remove();
      }
      for (const spark of sparks) {
        spark.remove();
      }
      for (const ripple of ripples) {
        ripple.remove();
      }
      resolve();
    }, duration);

    if (badge) {
      setTimeout(() => badge.element.remove(), Math.max(duration, badge.duration));
    }
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

const HINT_ARROW_CLASS = 'tile__hint-arrow';

function hintArrowDirection(direction, delta) {
  if (direction === DIR.HORIZONTAL) return delta > 0 ? 'right' : 'left';
  return delta > 0 ? 'down' : 'up';
}

// 在"应该按住的那张牌"上画一个指向拖动方向的箭头。
// 整段牌组会被一起拖动，但只有从正确的起点按下才能得到这个牌组，
// 不标出来的话玩家按错牌就会得到完全不同（且无效）的结果。
function markHintOrigin(origin, direction, delta) {
  if (!origin || !origin.tile || !delta) return;
  const el = getTileElement(origin.tile.instanceId);
  if (!el) return;

  el.classList.add('tile--hint-origin');
  const old = el.querySelector(`:scope > .${HINT_ARROW_CLASS}`);
  if (old) old.remove();

  const arrow = document.createElement('div');
  arrow.className = HINT_ARROW_CLASS;
  arrow.dataset.dir = hintArrowDirection(direction, delta);
  el.appendChild(arrow);
}

/**
 * 提示动画：对牌组元素添加脉冲 class
 * hint: 可选，{ start, direction, delta }（findHint 的返回值），
 *       传入后会额外标记拖动起点与方向箭头。
 */
function animateHint(group, hint = null) {
  for (const g of group) {
    const el = getTileElement(g.tile.instanceId);
    if (el) el.classList.add('tile--hint');
  }
  if (hint) markHintOrigin(hint.start, hint.direction, hint.delta);
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
  setTimeout(() => el.classList.remove('tile--invalid'), 260);
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

  // 发牌期间才开启透视（3D 翻牌需要），结束后移除：
  // 常开 perspective 会让全部牌进入 3D 渲染上下文 → 每张牌独立合成层 → 卡顿。
  boardEl.classList.add('board--dealing');

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
  // 6. 发牌结束，移除透视，让牌回到平面渲染（避免长期 3D 合成开销）
  boardEl.classList.remove('board--dealing');
}

export { wait, animateSlide, animateRevert, runEliminationSequence, animateHint, animateInvalidTile, clearHintAnimation, runDealAnimation };
