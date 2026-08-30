# 麻将消消乐 — 代码审查与优化建议

审查范围：`js/`（14 个模块）、`css/`、`index.html`、`tests/`
审查时间：2026-08-30 ｜ 基线：`npm test` 121 项全部通过

---

## 修复状态（2026-08-30 更新）

第一节的 5 项缺陷已全部修复；第二节架构债 6 项也已全部修复（2026-08-30）。
第三、四、五节已于 2026-08-30 全部修复。此外，按 `UPGRADE_PLAN.md` 路线图，
**P0 快赢（统计/设置/动效/主题）、P1 游戏性（模式/计分/每日挑战/道具）、P2 长线（关卡/成就/PWA/分享）、P3 打磨（键盘可玩/无障碍播报/UI 过渡/安全区）四个阶段均已实施完成**，
测试扩展至 **304 项全绿（20 套件）**，详见各节状态标注。

| 级别 | 缺陷 | 状态 | 核心改动 |
|------|------|------|----------|
| P0 | 提示与拖拽行为不一致 | ✅ 已修 | 新增 `movementLogic.collectDragGroup()` 作为唯一选组真相来源；`hintSystem` 改为 (起点, 方向, 拖动侧) 三元组枚举并额外返回 `start`；`dragController` 删除内联重复实现 |
| P1 | 快捷键穿透遮罩 | ✅ 已修 | `main.js` keydown 加覆盖层守卫；`gameController.closeAllOverlays()` 统一兜底关闭所有弹窗 |
| P1 | 死局判定漏判 `hasAnyPair` | ✅ 已修 | 新增 `gameLogic.isDeadlock()`，`handleDragEnd` / `handleTileClick` / `reshuffleRemainingTiles` 统一使用 |
| P2 | `hintSystem` 双实例 | ✅ 已修 | 统一 import 路径（随版本串清理一并解决） |
| P2 | 缓存版本串失效 | ✅ 已修 | `index.html` 7 处 + `js/` 9 处 `?v=20260607-10` 全部移除 |

**验证结果**：随机采样 120 个中局局面，得到 120 个提示（正 delta 103 / 负 delta 17），
**负 delta 提示的可复现失败率从 100% 降到 0%**。性能无退化：`findHint` p50 0.12 ms、p95 0.95 ms。

**新增的可用性改进**（P0 修复的必要组成）：提示现在会用橙色描边 + 方向箭头标出
"应该按住哪张牌、往哪个方向拖"，因为整段牌组里只有从正确起点按下才能得到该牌组。

**仍未处理**（遗留）：`gameLogic ↔ hintSystem` 循环依赖（需把配对判定抽成叶子模块，牵扯面较大）；`share.js` 与 `gameController` 依赖浏览器 API 故覆盖率有限（jsdom 无 navigator.share/clipboard/canvas 2d，属预期）。牌面质感（CSS 3D 翻面 / SVG 重绘）作为可选的进一步视觉打磨项未实施。
第三、四、五节已于 2026-08-30 全部修复，详见各节状态标注。

---

## 结论速览

项目整体质量高于大多数同类原生 JS 小游戏：模块划分清晰、纯逻辑与 DOM 层分离、有 117 个单元测试、音频用 Web Audio 程序化合成（零音频资源）。**主要问题不在性能，而在一处会导致玩家卡死的逻辑缺陷，以及若干架构债。**

实测性能数据（Node，中局局面）：

| 操作 | 耗时 | 评价 |
|------|------|------|
| `findHint()` 单次 | ≈ 0.4 ms | 优秀，无需优化 |
| `findAllPairs()` × 1000 | 15 ms（单次 0.015 ms） | 优秀 |
| `reshuffleRemainingTiles()` 最坏 | 57 ms | 一次性操作，可接受 |

**性能不是瓶颈，不要在这一块浪费时间。** 真正需要动的是下面这些。

---

## 一、必须修的缺陷（按严重度）

### P0 — 提示算法与拖拽行为不一致，可导致玩家硬卡死

**现象**：提示高亮的牌组，玩家用鼠标/手指根本拖不出来，照做必定失败。

**根因**：两套"选组"规则并存，且没有共享代码。

- `hintSystem.js` 用 `selectGroup()` —— 从起点**双向**收集整段连续牌。
- `dragController.js` 自己在 `onPointerMove` 里内联实现 —— 只从按下点**向拖动侧单向**收集。

当 `findHint` 返回负 delta（向左/向上）时，它给出的是"整段 16 张牌一起左移"，而玩家从段首向左拖实际只能选中 1 张。

**确定性最小复现**（已固化为 `tests/hintReproducibility.test.js`）：

```
棋盘 2 行 × 5 列
  row0: [null, Y, X, null, null]
  row1: [null, X, null, null, null]

findHint 返回：{ group: [(0,1)Y, (0,2)X], direction: horizontal, delta: -1 }
  模拟结果：X 移到 col1，与 row1 的 X 同列相邻 → 配对成立 ✓

玩家真实操作：从 (0,1) 向左拖
  实际选中：[(0,1)Y]  ← 只有 1 张，因为 col0 是空
  实际结果：Y 移到 col0，X 留在 col2 → 无任何配对 → 回弹 ✗
```

随机对局采样 59 次：4 次返回负 delta，**4 次全部不可复现（100% 失败率）**。

**为什么是 P0 而不是小瑕疵**——它同时击穿了死局检测：

`handleDragEnd` / `handleTileClick` 结尾用 `findHint(state) === null` 判定死局。上面这个局面 `findHint` 非 null，游戏认为"还有得玩"，于是：玩家点提示 → 拿到无法执行的方案 → 失败 → 再点提示 → 还是同一个方案 → **无限循环，只能撤销或重开**。

**修法**：把 `dragController` 里内联的单向收集逻辑抽成共享函数，让两边调用同一份实现。

```js
// movementLogic.js —— 新增，唯一的选组真相来源
function collectDragGroup(state, startRow, startCol, direction, sign) { /* 单向收集 */ }

// hintSystem.js —— 按 (起点, 方向, 移动方向) 三元组枚举，而非 (起点, 方向)
for (const direction of [DIR.HORIZONTAL, DIR.VERTICAL]) {
  for (const sign of [1, -1]) {
    const group = collectDragGroup(state, r, c, direction, sign);
    const { maxPositive, maxNegative } = calcMaxSlide(state, group, direction);
    const max = sign > 0 ? maxPositive : maxNegative;
    for (let d = 1; d <= max; d++) {
      const proposed = applySlide(state, group, direction, sign * d);
      if (hasAnyPair(proposed)) return { group, direction, delta: sign * d };
    }
  }
}
```

同时 `dragController.js` 改为调用 `collectDragGroup`，删掉内联重复实现。

---

### P1 — 弹窗打开时键盘快捷键可穿透，导致界面被遮罩锁死

`main.js` 的 keydown 监听没有任何状态守卫：

```js
if (e.key === 'n' || e.key === 'N') document.getElementById('btn-new').click();
```

而 `#reshuffle-confirm` 是 `position: fixed; inset: 0; z-index: 2000` 的全屏遮罩，会盖住工具栏按钮。但 `btn.click()` 是**程序化调用，不受遮挡影响**，照常触发。

后果：重排确认弹窗打开时按 `N` → `initNewGame()` 执行，但 `handleNewGame()` **不会关闭 `reshuffle-confirm`**（只关了胜利界面和教学面板）→ 新一局开始，画面却被 2000 层遮罩盖着，完全无法操作。且 `showReshuffleConfirm()` 里 `pauseTimer()` 暂停的计时器没有对应的 `resumeTimer()`，新局计时也是坏的。

规则弹窗（`#tutorial-overlay`）同样可被 `H` / `N` / `U` 穿透。

**修法**（两处都要）：

```js
// 1) 快捷键加守卫
const OVERLAYS = ['tutorial-overlay', 'victory-screen', 'reshuffle-confirm'];
const isOverlayOpen = () => OVERLAYS.some(id => {
  const el = document.getElementById(id);
  return el && !el.classList.contains('hidden');
});

// 2) handleNewGame 统一兜底关闭所有弹窗
function handleNewGame() {
  hideReshuffleConfirm();   // 内部会 resumeTimer
  hideTutorial();
  hideVictoryScreen();
  ...
}
```

---

### P1 — 死局判定漏判 `hasAnyPair`，会误报"无可消除步骤"

现有判定只看"还能不能移动"，漏了"能不能直接点掉"：

```js
if (findHint(boardState) === null) showDeadlock();   // 不严谨
```

`findHint` 只搜索"移动后产生配对"。当某行被填满、该行内存在相邻同类牌（可直接点击消除）但整行无法移动时，`findHint` 返回 null → 误报死局，弹一个"无可消除步骤"的提示吓唬玩家，而实际上点一下就消掉了。

**修法**：改成一个语义明确的函数，三处调用点统一。

```js
const isDeadlock = (s) => !hasAnyPair(s) && findHint(s) === null;
```

用于 `handleDragEnd`、`handleTileClick`、`handleHint` 三处。

---

### P2 — `hintSystem.js` 被浏览器加载了两份（模块实例分裂）

同一个文件被两个不同 URL 引用：

- `gameController.js:4` → `'./hintSystem.js'`
- `gameLogic.js:3` → `'./hintSystem.js?v=20260607-10'`

对浏览器来说这是两个不同的模块 URL → 下载两次、执行两次、产生两个模块实例。目前没出事只是因为 `hintSystem.js` 恰好没有模块级可变状态——**这是个定时炸弹**，谁往里加个缓存就会立刻出现两份不同步的状态。

顺带还形成了循环依赖：`gameLogic.js?v` → `hintSystem.js?v` → `gameLogic.js?v`（靠函数声明提升勉强能跑）。

**修法**：见下一节的版本串清理。

---

### P2 — 手写缓存破坏串 `?v=20260607-10` 已经失效

这个串硬编码在 `index.html`（6 处 CSS + 1 处 JS）和 7 个 JS 模块的 import 里。而 `gameController.js` 等文件的修改时间是 **6/7 12:54**，晚于这个版本号所代表的时间点——也就是说版本串已经不能反映真实变更，老用户可能拿到过期缓存，且不同模块的版本串还可能互相错开（正是上面 P2 的成因）。

**修法**（任选）：

1. **推荐**：全部删掉 `?v=`，改用 HTTP 层 `Cache-Control: no-cache`（配 ETag）。开发时 DevTools 勾 "Disable cache"。
2. 保留版本号但**统一成构建时注入**，`build.js` 里一次性替换 HTML 与所有 import。
3. 至少：写一个校验脚本，保证 HTML 与所有 JS import 的版本串一致，接进 `npm test`。

---

## 二、架构债

> **修复状态（2026-08-30）：本节 6 项已全部修复。** 新增 `js/timer.js`（独立计时器模块）；
> `initDragController` 改为依赖注入 `{ getState, getPhase, onDragEnd, onTileClick }`；
> `window._gameState/_gamePhase/_isTeachingMode` 全部移除，改由 gameController 导出
> `getState()/getPhase()/isTeachingModeActive()` 只读访问器；`showVictory` 的阶段同步随
> 访问器方案自然解决（`getPhase()` 直接读模块内 `gameState`，不再有第二份状态）。

| 问题 | 状态 | 核心改动 |
|------|------|----------|
| `window` 全局通信 | ✅ 已修 | dragController/main.js 依赖注入 + 只读访问器，删除全部 `window._*` |
| `gameController ↔ tutorial` 循环依赖 | ✅ 已修 | `pauseTimer/resumeTimer` 等计时器整体抽到 `timer.js`，两边只引 timer |
| 渲染尺寸取自全局 | ✅ 已修 | `renderBoard` 改用 `state.width/height`，不再读 `BOARD_COLS/ROWS` |
| 元素缓存僵尸引用 | ✅ 已修 | `animateEliminate` 统一走 `removeTileElement()` 清缓存 |
| `setTimeout` 句柄未保存 | ✅ 已修 | 新增 `flashElement()`，按元素存句柄、重复触发先 `clearTimeout` |
| 胜利后未同步阶段 | ✅ 已修 | 随 phase 访问器方案自然解决（单一状态源） |

### 原始清单

| 问题 | 位置 | 说明 |
|------|------|------|
| 用 `window` 全局做跨模块通信 | `window._gameState` / `_gamePhase` / `_isTeachingMode` | `dragController` 靠 `window._gamePhase` 判断能否交互，`main.js` 直接读 `window._gameState`。隐藏耦合、无法在测试中构造、多处状态源。应改为 `initDragController(boardEl, { getState, getPhase, onDragEnd, onTileClick })` 依赖注入。 |
| 循环依赖 | `gameController ↔ tutorial` | 两边互相 import。目前靠函数声明提升能跑，但初始化顺序敏感。建议把 `pauseTimer/resumeTimer` 抽到独立的 `timer.js`。 |
| 渲染尺寸取自全局而非数据 | `renderer.js:62-65` | `renderBoard` 用全局 `BOARD_COLS/ROWS` 计算容器尺寸，而不是 `state.width/height`。现在能对齐纯属巧合（教学模式和 resize 都手动同步过），一旦漏同步就会错位。应直接用 `state.width/height`，让数据自己说了算。 |
| 元素缓存有僵尸引用 | `renderer.js` | `animateEliminate` 里直接 `el.remove()`，绕过了 `removeTileElement()`，导致 `_tileElementCache` 里残留已脱离 DOM 的节点，阻止 GC，并让后续 `getTileElement` 每次都走 `isConnected` 检查 + `querySelector` 回退。一局下来最多 136 个僵尸条目。统一走 `removeTileElement` 即可。 |
| `setTimeout` 句柄未保存 | `showDeadlock` / `showRotateHint` / `showReshuffle` | 都是 `setTimeout(..., 3000)` 后隐藏，句柄没存。重复触发会叠加定时器，导致提示提前消失。存句柄并在下次调用时 `clearTimeout`。 |
| 胜利后未同步阶段 | `showVictory` | 设了 `gameState = VICTORY` 但没调 `syncPhase('VICTORY')`，`window._gamePhase` 仍是 `IDLE`。目前靠 CSS 遮罩（z-index 2000）兜住，属于隐患。 |

---

## 三、体验与功能优化

> **修复状态（2026-08-30）：第 1-5 项已全部修复；第 6 项按报告"二选一"建议通过修订 README 解决。**
> 新增模块：`js/imagePreload.js`（预加载）、`js/timer.js` 扩展 `startTimerFromElapsed()`（存档恢复计时）。

| 项 | 状态 | 核心改动 |
|----|------|----------|
| 撤销全量重渲染 | ✅ 已修 | `renderer.js` 新增 `diffRenderBoard(prev, next, boardEl)`，按 `instanceId` 对比只增删/移动变化的节点；`handleUndo` 改用增量渲染（测试断言未变化节点被复用，无闪烁） |
| 无存档 | ✅ 已修 | `gameController.js` 新增存档系统（`mahjong-save-v1` 版本化快照 + 结构校验 + 损坏容错），消除/重排/撤销后自动落盘；`index.html` 新增「继续上局？」弹窗；胜利界面显示最佳成绩（`mahjong-best-v1` 记录最短用时/最少步数/局数）；`timer.js` 新增 `startTimerFromElapsed()` 恢复用时 |
| 图片资源偏重 | ✅ 已修 | 34 张牌图 Pillow 半尺寸 LANCZOS + 256 色 FASTOCTREE 量化：**1.47 MB → 0.15 MB（-90%）**，逐张 `verify()` 校验，原图有 git 跟踪可回滚 |
| 发牌动画与图片赛跑 | ✅ 已修 | 新增 `js/imagePreload.js`，`initNewGame` 在发牌动画前 `await preloadTileImages(state)` 并行预加载本局用图，3 秒超时兜底不阻塞 |
| onerror 降级不完整 | ✅ 已修 | `img.onerror` 改为 `img.remove()` + 按需追加 `tile__top`/`tile__bottom` 双占位（bottomChar 为空不产生空节点） |
| 死局自动重排 | ✅ 已解决 | 按报告"二选一"建议修订 README 对齐实际行为（弹确认框，手动确认） |

### 原始清单

1. **撤销是全量重渲染 —— 最值得做的体验优化**
   `handleUndo` 直接调 `renderBoard`，清空 `innerHTML` 后重建全部 136 个 `<div>` + `<img>`。会有可见闪烁、丢失所有动画状态。改成增量 diff：对比撤销前后的 grid，只增删/移动变化的格子。撤销栈里已经存了前后两个 state，diff 成本很低。

2. **没有存档 —— 刷新即丢进度**
   `localStorage` 已经用在音效开关上了，扩展成本很低。建议加：棋盘快照 + 步数 + 用时 + 撤销栈，页面加载时询问"继续上一局"。顺带可以记最佳成绩（最短用时 / 最少步数）。

3. **图片资源偏重**
   `assets/images/tiles/` 共 34 张 PNG = **1.6 MB**，而实际显示尺寸只有约 60×80 px，平均单张 47 KB 明显过大。转 WebP 或降低分辨率，可压到 300 KB 以内，首屏加载会明显变快。

4. **发牌动画与图片加载赛跑**
   `renderer.js` 里每张牌都是 `img.loading = 'lazy'`，而发牌动画总时长约 1.5 s 且在图片加载完成前就开始翻牌 —— 弱网下玩家会看到"翻开的空牌"。建议：开局前 `Promise.all` 预加载 34 张图片（或按需只预加载本局用到的），加载完再开始发牌动画。

5. **图片加载失败的降级不完整**
   `img.onerror` 只塞了一个 `span.tile__top`（只显示 topChar），没显示 bottomChar，也没把失败的 `<img>` 从 DOM 里移除（只设了 `display:none`）。建议补上 bottomChar 并 `img.remove()`。

6. **死局应可选自动重排**
   README 写的是"若无任何步骤可用则**自动**重新随机排列"，实际实现是弹确认框。要么改 README，要么在设置里给一个"死局自动重排"开关。

---

## 四、测试与工程

> **修复状态（2026-08-30）：建议 1、2 已全部落实；建议 3 的不变量测试先前已就位。**
> `tests/setup.js` 的 `vm.runInContext` + const/let→var 正则注入方案**已完全退役**，6 个遗留测试
> 文件全部改为真实 ESM `import`（babel-jest + @babel/preset-env 转译），测试环境统一为
> jest-environment-jsdom（`tests/dom-setup.js` 补 rAF polyfill）。测试总数 **121 → 146 项全绿（9 套件）**。

| 建议 | 状态 | 核心改动 |
|------|------|----------|
| jsdom + babel-jest 真 ESM 导入 | ✅ 已落实 | 新增 `babel.config.js` 与 `tests/dom-setup.js`；`jest.config.js` 改 `testEnvironment: 'jsdom'`；`collectCoverageFrom` 扩至 10 个模块；覆盖率门槛分路径配置（全局 50/50/40，5 个纯逻辑文件保持 80） |
| gameController 状态机测试 | ✅ 已落实 | 新增 `tests/gameController.test.js`（11 用例）：点击消除流转、动画期拒绝输入、`gameGeneration` 失效旧任务、撤销栈 `MAX_UNDO_STEPS` 封顶、增量渲染节点复用、胜利判定 + 最佳成绩 + 清档、存档往返与损坏容错等；另新增 `tests/renderer.test.js`（7 用例）、`tests/dragController.test.js`（4 用例，DI 契约） |
| 提示可复现性长期不变量 | ✅ 已就位 | `tests/hintReproducibility.test.js` 持续守护 |

**覆盖率结果**：全局 statements 74.55% / lines 74.55% / functions 约 60%；纯逻辑五文件全部 ≥ 80%
（gameLogic 82.85%，hintSystem / movementLogic / boardState / tileDefinitions 均 100%）；
renderer 84%、dragController 98%、gameController 57.7%（未覆盖主要是教学模式分支）。

> **P0/P1 升级后（2026-08-30）**：测试扩至 **220 项全绿（15 套件）**，全局覆盖率 **78.41%**，
> gameController 提升至 **66.53%**；新增纯逻辑模块 modes.js / score.js / items.js 均 ≥ 80% 达标。
> P0 阶段新增 settings/themes/stats 测试（100%），particles.js 因 canvas 层 jsdom 不可测为预期低覆盖。

**踩坑记录**：gameLogic.js 同时被 vm 注入与 ESM 双通道加载时，v8 覆盖率报告只保留一份，
导致其覆盖率虚降至 52.5% 触发门槛失败——根治方式正是退役 vm 注入、统一 ESM 加载。

### 原始分析

**99% 的覆盖率是假象。** `jest.config.js` 的 `collectCoverageFrom` 只收录了 5 个纯逻辑文件：

```
boardState.js  gameLogic.js  hintSystem.js  movementLogic.js  tileDefinitions.js
```

完全没覆盖的是：`gameController.js`（27 KB，整个状态机）、`renderer.js`、`dragController.js`、`animationController.js`、`tutorial.js` —— 也就是所有涉及 DOM 和交互的代码。

更关键的是**测试方式的局限**：`tests/setup.js` 用 `vm.runInContext` 把源码注入全局变量（还把 `const/let` 正则替换成 `var`），测试根本不走 ESM 模块系统。这直接导致 **P0 那个 bug 永远测不出来** —— 它需要同时观察 `hintSystem` 和 `dragController` 两份代码的行为差异，而现有测试环境里 `dragController` 压根没被加载。

建议：

1. 配 `jsdom` + `babel-jest`，让测试能真正 `import` ESM 模块，并覆盖状态机与交互层。
2. 优先为 `gameController` 的状态流转写测试：动画期间拒绝输入、新局使旧异步任务失效（`gameGeneration`）、撤销栈边界、胜利判定。
3. 把"提示可复现性"作为一个长期不变量守住（已加 `tests/hintReproducibility.test.js`）。

**本次新增**：`tests/hintReproducibility.test.js`（**已更新为 7 个用例**）。原先 2 个 `test.failing` 标记的 P0 缺陷用例，在修复后已转正为普通 `test` 并通过；随机统计用例也从"只查正 delta"扩展为"正负 delta 全覆盖"；另新增 3 个 `isDeadlock()` 用例守住死局判定的两个方向（不误报、不漏报）。

注意：该文件里的 `dragGroup()` 是**刻意复制**的一份玩家侧行为实现，没有直接调用 `collectDragGroup` —— 否则两边一起改错时测试就发现不了。

---

## 五、README 与实现不符

> **修复状态（2026-08-30）：3 处不符已全部按实际行为修订 README 对齐。**

| 不符点 | 状态 | 处理 |
|--------|------|------|
| 连锁消除描述 | ✅ 已对齐 | 改为「拖动消除后……自动连锁消除，且只连锁移动新增的配对」（点击消除不连锁） |
| 提示按钮行为 | ✅ 已对齐 | 改为「点击提示按钮，弹窗确认后重新随机排列剩余牌」（与第三节第 6 项一并解决） |
| 行列数固定 17×8 | ✅ 已对齐 | 改为行列数由 `recalcLayout()` 按视口自适应的描述 |

另补充：README 新增「存档与最佳成绩」章节、文件结构补齐 `timer.js` / `imagePreload.js` /
`soundController.js` / `bgmController.js`、胜利条件补最佳成绩、测试说明更新为 jsdom + Babel 真 ESM 导入。

### 原始对照

| README 写的 | 实际实现 |
|-------------|----------|
| "每次消除后自动扫描全盘，若出现新的可消除对则持续连锁" | 点击消除**不连锁**；只有拖动后产生的新配对才连锁，且只连锁"新增"配对 |
| "提示：若无任何步骤可用则**自动**重新随机排列剩余牌" | 弹确认对话框，手动确认 |
| "开局随机排列于 8行 × 17列" | 行列数由 `recalcLayout()` 按视口自适应，仅横屏时才是 17×8 |

建议按实际行为更新 README，或调整实现对齐文档。

---

## 六、建议的修复顺序

1. **P0 提示可复现性** —— 抽 `collectDragGroup` 共享函数，`hintSystem` 改三元组枚举（顺带解决死局误判）
2. **P1 死局判定** —— 引入 `isDeadlock()`
3. **P1 快捷键守卫** + `handleNewGame` 关闭所有弹窗
4. **P2 清理版本串** —— 顺带消除 `hintSystem` 双实例与循环依赖
5. **撤销增量渲染** —— 体验提升最明显
6. 其余按业务优先级：存档 → 图片优化 → 预加载 → 测试基建

前 4 项都是小改动，可以一起做完，风险低收益高。
