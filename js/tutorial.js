// tutorial.js — 规则教学动画

const MTILE_W    = 44;
const MTILE_H    = 62;
const MTILE_GAP  = 8;
const MTILE_STEP = MTILE_W + MTILE_GAP; // 52px per column

// 每次 showTutorial 自增，使上次的所有 setTimeout 回调自然失效
let _tutorialGen = 0;

function _mtPos(col) {
  return col * MTILE_STEP;
}

function _createMTile(topChar, bottomChar, colorClass) {
  const el = document.createElement('div');
  el.className = `mtile ${colorClass}`;
  const top = document.createElement('span');
  top.className = 'mtile__top';
  top.textContent = topChar;
  const bot = document.createElement('span');
  bot.className = 'mtile__bottom';
  bot.textContent = bottomChar;
  el.appendChild(top);
  el.appendChild(bot);
  return el;
}

function _placeAt(el, col) {
  el.style.left = _mtPos(col) + 'px';
  el.style.top  = '0px';
}

// ── Demo 1：同行/列无遮挡相同牌 → 点击消除 ──────────────────────────
//
// 布局（4列）：[一万] [空] [空] [一万]
// 动画：两张牌金色高亮 → 缩小消失 → 重置循环
function _runDemo1(stageEl, gen) {
  if (_tutorialGen !== gen) return;

  stageEl.innerHTML = '';
  stageEl.style.width  = (4 * MTILE_STEP - MTILE_GAP) + 'px';
  stageEl.style.height = MTILE_H + 'px';

  const tA = _createMTile('一', '万', 'mtile--wan');
  const tB = _createMTile('一', '万', 'mtile--wan');
  _placeAt(tA, 0);
  _placeAt(tB, 3);
  stageEl.appendChild(tA);
  stageEl.appendChild(tB);

  // 500ms: 两张牌一起高亮
  setTimeout(() => {
    if (_tutorialGen !== gen) return;
    tA.classList.add('mtile--hint');
    tB.classList.add('mtile--hint');
  }, 500);

  // 1300ms: 消除动画
  setTimeout(() => {
    if (_tutorialGen !== gen) return;
    tA.classList.remove('mtile--hint');
    tB.classList.remove('mtile--hint');
    tA.classList.add('mtile--elim');
    tB.classList.add('mtile--elim');
  }, 1300);

  // 2300ms: 循环
  setTimeout(() => _runDemo1(stageEl, gen), 2300);
}

// ── Demo 2：横向拖动后触发纵向消除 ─────────────────────────────────
//
// 布局（4列 × 2行）：
//   Row 0:  [空]  [空]  [空]  [七万]   ← 静止目标
//   Row 1: [六万][七万] [空]  [空]     ← 拖动组
//
// 动画：
//   1. [六万][七万] 组高亮，箭头指向右
//   2. 整体右移 2 格 → [六万]@(1,2), [七万]@(1,3)
//   3. [七万]@(0,3) 与 [七万]@(1,3) 同列相邻 → 纵向配对高亮
//   4. 该对消除，[六万] 留下
//   5. 循环
function _runDemo2(stageEl, gen) {
  if (_tutorialGen !== gen) return;

  stageEl.innerHTML = '';

  const ROW_STEP = MTILE_H + MTILE_GAP; // 70px per row
  stageEl.style.width  = (4 * MTILE_STEP - MTILE_GAP) + 'px';
  stageEl.style.height = (2 * ROW_STEP - MTILE_GAP) + 'px';

  function placeRC(el, row, col) {
    el.style.left = _mtPos(col) + 'px';
    el.style.top  = (row * ROW_STEP) + 'px';
  }

  // Row 0, Col 3: [七万] — 静止目标
  const tTop = _createMTile('七', '万', 'mtile--wan');
  placeRC(tTop, 0, 3);

  // Row 1, Col 0: [六万] — 拖动起点（带动右侧牌）
  // Row 1, Col 1: [七万] — 跟随移动
  const tL1 = _createMTile('六', '万', 'mtile--wan');
  const tL2 = _createMTile('七', '万', 'mtile--wan');
  placeRC(tL1, 1, 0);
  placeRC(tL2, 1, 1);

  stageEl.appendChild(tTop);
  stageEl.appendChild(tL1);
  stageEl.appendChild(tL2);

  // 500ms: 选中拖动组
  setTimeout(() => {
    if (_tutorialGen !== gen) return;
    tL1.classList.add('mtile--hint');
    tL2.classList.add('mtile--hint');
  }, 500);

  // 1100ms: 横向右移 2 格
  setTimeout(() => {
    if (_tutorialGen !== gen) return;
    tL1.style.transition = 'left 0.52s ease-out';
    tL2.style.transition = 'left 0.52s ease-out';
    tL1.style.left = _mtPos(2) + 'px';
    tL2.style.left = _mtPos(3) + 'px';
  }, 1100);

  // 1780ms: 松手，取消拖动高亮，改为纵向配对高亮
  setTimeout(() => {
    if (_tutorialGen !== gen) return;
    tL1.style.transition = '';
    tL2.style.transition = '';
    tL1.classList.remove('mtile--hint');
    tL2.classList.remove('mtile--hint');
    // [七万]@(0,3) 与 [七万]@(1,3) 同列高亮
    tTop.classList.add('mtile--hint');
    tL2.classList.add('mtile--hint');
  }, 1780);

  // 2500ms: 纵向消除
  setTimeout(() => {
    if (_tutorialGen !== gen) return;
    tTop.classList.remove('mtile--hint');
    tL2.classList.remove('mtile--hint');
    tTop.classList.add('mtile--elim');
    tL2.classList.add('mtile--elim');
  }, 2500);

  // 3500ms: 循环
  setTimeout(() => _runDemo2(stageEl, gen), 3500);
}

// ── 公开 API ─────────────────────────────────────────────────────────

function showTutorial(isFirstTime) {
  _tutorialGen++; // 使所有旧 setTimeout 回调自然失效
  const gen = _tutorialGen;

  const overlay = document.getElementById('tutorial-overlay');
  const btn     = document.getElementById('btn-tutorial-start');
  if (overlay) overlay.classList.remove('hidden');
  if (btn) {
    btn.textContent   = isFirstTime ? '开始新游戏' : '关闭';
    btn.dataset.first = isFirstTime ? '1' : '0';
  }

  const s1 = document.getElementById('tutorial-stage-1');
  const s2 = document.getElementById('tutorial-stage-2');
  if (s1) _runDemo1(s1, gen);
  if (s2) _runDemo2(s2, gen);
}

function hideTutorial() {
  _tutorialGen++; // 停止所有动画定时器
  const overlay = document.getElementById('tutorial-overlay');
  if (overlay) overlay.classList.add('hidden');
}
