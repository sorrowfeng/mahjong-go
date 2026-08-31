# 性能优化说明（Performance Notes）

> **重要更新（2026-08-31）**：根据玩家反馈，消除时的**棋盘整体缩放脉冲**（`board--combo`/`board--combo-high`/`board--chain`）与**棋盘位移震动**（`board--shake`）已**完全移除**；`slide-ok` / `invalid` 时的棋盘脉冲也已移除。消除反馈现在集中在牌本身缩放淡出、连线、粒子迸发与 combo 徽章上，避免整盘跳动干扰操作手感。文档中 §1.3、§2.6、§4.5.1 关于棋盘 pulse/shake 的历史记录保留为参考，但**当前代码已不再触发这些类**。详见 `js/animationController.js` 最新实现。

排查与优化目标：消除"玩起来卡顿不跟手"的体感问题。本文件记录**多轮优化**的完整过程。

---

## 0. 关键诊断：逻辑层 vs 渲染层

**Node 基准**（12×12 = 136 张牌棋盘，best-of-5）：

| 函数 | 耗时 |
|---|---|
| `findAllPairs` | 0.02 ms |
| `hasAnyPair` | 0.00 ms |
| `findHint`（最重的搜索） | 0.46 ms |
| `isDeadlock` | 0.00 ms |
| `cloneState` | 0.00 ms |
| `applySlide + resolveNewPairChain` | 0.05 ms |

**结论**：所有核心逻辑函数都是亚毫秒级，**逻辑层完全不是瓶颈**。卡顿来源**全部在渲染层**。

---

## 1. 第一轮优化：`filter` 与 3D 上下文

### 1.1 `filter` 动画（最大元凶）
`filter` 属性无法 GPU 合成——动画期间每帧强制软件光栅化整张牌（含大图）。

| 动画 keyframe | 元素 | 频率 |
|---|---|---|
| `tile-eliminate*` | 每张被消除的牌 | 连锁消除时每张牌 360ms |
| `board-*-pulse` | 整个 `#board`（136 张牌） | 每次消除 360-660ms |
| `tile-invalid` / `tile-hint-pulse` | 单张 | 拖错 / 持续 infinite |
| `match-line-flash`（含 `blur`） | 临时连线 | 消除时 |

**修复**：所有 keyframe 改为只用 `transform/opacity`（可合成）。亮度/饱和度的"增强感"由 `scale` 逼近。

### 1.2 3D 渲染上下文常开
- 移除 `.tile` 的 `transform-style: preserve-3d`
- `#board` 的 `perspective` 仅在发牌期间（`.board--dealing`）临时开启

### 1.3 棋盘 pulse box-shadow 动画
`board-*-pulse` 最初改为轻微 `transform: scale()` 脉冲（0.988–1.0，overflow: hidden 防止溢出）。**2026-08-31 已完全移除**：`js/animationController.js` 不再对 `#board` 添加任何 `board--combo`/`board--combo-high`/`board--chain`/`board--slide-ok`/`board--invalid` 动画类，消除时棋盘不再整体跳动。

### 1.4 全屏 canvas 粒子
- 降采样 60%（像素填充量 ×0.36）
- 粒子上限 600 → 400
- 统一 `setTransform` 缩放，坐标仍用视口像素

### 1.5 layout thrashing
`drawMatchLine` / `tileCenterInBoard` 改用 `parseStylePos(el)` 直接读 `el.style.left/top` + 已知 `TILE_WIDTH/HEIGHT`——零 `getBoundingClientRect`。

### 1.6 `drop-shadow` filter
`.tile__img` 的 `filter: drop-shadow(...)` → `box-shadow`（不重采样 alpha）。

### 1.7 提示/教学 pulse
`tile-hint-pulse` 等的 box-shadow 动画 → `transform` 呼吸。静态光晕由 base class 提供。

---

## 2. 第二轮优化：合成层与时长

第一轮后用户仍反馈"卡顿不跟手"。深入分析发现**仍有合成层与动画时长的关键问题**。

### 2.1 移除 136 张牌常驻 `will-change`
- `tile.css` 不再对所有牌提示合成层
- 新增 `.tile--composited`，仅拖拽/动画时 JS 临时加
- 拖拽（`setGroupTransform`/`resetGroupTransform`/`commitGroupPosition`/`animateRevert`）配合切换
- **收益**：避免低端设备 136 个常驻合成层的 GPU 内存与合成压力

### 2.2 `#board` 提升为单一合成层
- `#board` 加 `will-change: transform`
- 复杂棋盘背景（多层 radial/linear 渐变 + 18px 网格）一次性光栅化缓存
- pulse 动画只触发合成，不再每帧重绘背景
- 单个合成层 GPU 开销 << 136 张牌各自为层

### 2.3 移除 tile `transition` 中的 `filter`
`tile.css` 的 `transition: box-shadow 140ms, border-color 140ms`（去掉 `filter 140ms`）。filter 过渡期间每帧强制软件重绘整张牌。

### 2.4 牌图异步解码 + 低优先级
`<img decoding="async" fetchpriority="low">`——136 张图加载不阻塞主线程。

### 2.5 消除动画粒子精简
- `sparksPerTile` 从 `effectLevel+1`（最多 5）降到 `effectLevel-1`（最多 3）
- source tiles 从 6 限到 4
- 连锁时 CSS 动画元素从最多 48 降到 12

### 2.6 动画时长整体缩短（表现层，不在主消除逻辑冻结约束内）
| 动画 | 旧 | 新 | 备注 |
|---|---|---|---|
| SLIDE | 180 | **130** | 拖完更快到位 |
| ELIMINATE | 360 | **230** | 单次消除 |
| REVERT | 200 | **150** | 拖错回弹 |
| CHAIN_DELAY | 100 | **45** | 连锁波次间 |
| board--match | 360 | 280 | ~~棋盘 pulse~~ **2026-08-31 已移除** |
| board--chain | 420 | 340 | ~~同上~~ |
| board--combo | 520 | 420 | ~~同上~~ |
| board--combo-high | 660 | 540 | ~~同上~~ |

**核心收益**：3 波连锁总等待从 **~1.4s 降到 ~1.0s**——直接缓解"操作后等待感"（"不跟手"的设计层原因）。设置面板的"动画速度"档位（0.5x/1x/2x）自动适配新基准。

### 2.7 pulseBoard 时长与 CSS 动画时长同步
`pulseBoard` 内部 setTimeout 移除 class 必须 ≥ CSS 动画时长，否则动画被截断。新版曾按 effectLevel 选择对应 CSS 时长 + 30ms。**2026-08-31 已移除 `pulseBoard` 函数及相关调用**，CSS 中相关 board pulse 类保留但无 JS 触发。

---

## 3. 改动清单

| 文件 | 关键改动 |
|---|---|
| `css/animations.css` | 第一轮：`tile-eliminate*`/`board-*-pulse`/`match-line-flash`/`tile-hint-pulse` 等去掉 filter 与大半径 box-shadow 动画 |
| `css/tile.css` | 移除 `transform-style: preserve-3d` 与常驻 `will-change`；`.tile__img` drop-shadow → box-shadow；`.tile:hover`/`transition` 去掉 filter；新增 `.tile--composited` |
| `css/board.css` | `#board` 移除静态 `perspective`，加 `will-change: transform`；board pulse 时长缩短；新增 `.board--dealing` 仅发牌期间 |
| `js/animationController.js` | `runDealAnimation` 临时加 `.board--dealing`；`drawMatchLine`/`tileCenterInBoard` 走 `parseStylePos` 零 layout；粒子精简；pulseBoard 时长与 CSS 同步；拖拽/动画动态加 `tile--composited` |
| `js/renderer.js` | 拖拽/提交时切换 `tile--composited`；img 加 `decoding/fetchpriority` |
| `js/particles.js` | canvas 降采样 0.6；粒子上限 400；统一 `setTransform` 缩放 |
| `js/constants.js` | ANIM 基准时长缩短；`setAnimSpeed` 同步新基准 |

---

## 4. 性能影响预期

| 场景 | 优化前 | 第一轮后 | 第二轮后 |
|---|---|---|---|
| 消除动画（filter 重绘 136 张牌） | 整盘软件光栅化/帧 | 合成层 transform/帧 | 同左（已 OK） |
| 棋盘 pulse | box-shadow + filter 重算整盘 | transform 缩放（合成） | 合成层缩放（背景缓存） |
| 静态帧常驻合成层 | 136 张牌 × 3D 层 | 平面（无独立层） | 1 个 board 层 + 0 个牌层 |
| 连锁消除 canvas | 全屏 130 万像素 clearRect/帧 | ~78 万像素 | 同左 |
| 消除时 layout thrashing | 4-12 次 getBoundingClientRect | 0 | 0 |
| 3 波连锁总等待 | ~1.4s | ~1.4s | **~1.0s** |

低端机/集显提升最显著；高端机主要改善掉帧稳定性。

---

## 4.5 第三轮：细节优化（视觉/手感打磨）

两轮性能优化之后，继续在表现层做细节打磨。**不触碰核心消除逻辑、不引入合成层回退**。

### 4.5.1 棋盘连锁震动（combo shake）

> **2026-08-31 已完全移除。** 原实现：高连击（effectLevel≥3）时给棋盘叠加轻微位移，使用 `@keyframes board-shake` + `#board.board--shake` + CSS 变量 `--shake-amp`。因玩家反馈"整个棋盘弹一下影响操作"，`js/animationController.js` 已不再触发 `board--shake`，CSS keyframe 保留但无 JS 使用。

### 4.5.2 消除动画上抛轨迹

`tile-eliminate` / `tile-eliminate-combo` 加入 `translateY` 上抛轨迹：

- 关键帧增加 `translateY(calc(-1 * var(--eliminate-lift, 0px)))`
- JS 按 effectLevel 注入上抛高度（4 + effectLevel*1.5 px，Lv5 时最高 11.5px）
- 纯 transform，可合成，**无性能回退**
- 默认值 0px 保留，保证无 JS 注入时（reduced-motion）不产生位移

### 4.5.3 消除连线节奏同步

`drawMatchLine` 接受 `lineDuration` 参数，注入 CSS 变量 `--line-duration`：

- `board.css` 的 `.match-line` 改为 `animation: match-line-flash var(--line-duration, 340ms)`
- JS 在 `animateEliminate` 中传入 `Math.round(duration * 0.8)`
- 避免"连线已淡出、牌还在消"的节奏脱节（之前固定 340ms，消除动画最长 472ms）

### 4.5.4 改动清单（本轮）

| 文件 | 关键改动 |
|---|---|
| `css/animations.css` | 已停止触发 `board-shake`；`tile-eliminate*` 加入上抛轨迹 |
| `css/board.css` | 已停止触发 `#board.board--shake`；`.match-line` 用 `--line-duration` |
| `js/animationController.js` | `animateEliminate` 注入 `--eliminate-lift`、已停止触发 `board--shake`；`drawMatchLine` 接受并注入 `lineDuration` |

### 4.5.5 性能影响

所有改动**纯 transform/opacity + CSS 变量**：

- 无合成层回退（不增加 will-change/filter/perspective）
- 不增加 DOM 规模（shake 复用 #board，line 仍只创建 6 条以内）
- reduced-motion 已全局覆盖，a11y 兼容
- 测试 319/319 全绿无回归

---

## 5. 设计层问题（"不跟手"）的后续修复

**消除动画期间游戏状态锁定为 ANIMATING**，拖拽和点击原本被 `getPhase() !== 'IDLE'` 拦截，玩家快速操作时第二次输入会被丢弃。

**2026-08-31 已实施以下缓解**：

- **动画期间点击排队**：`gameController.js` 新增 `pendingClick` 机制——`handleTileClick` 在 `gameState !== IDLE` 时把最后一次点击缓存下来，动画进入 IDLE 后自动补执行，避免点击被吞。
- **拖拽期间点击转发**：`dragController.js` 在动画期间仍记录 pointer 状态，`pointerup` 时把未形成有效拖拽的点击转发给 `handleTileClick`，使其能进入 pendingClick 队列。
- **动画时长进一步收紧**：`SLIDE_DURATION` 150→130、`ELIMINATE_DURATION` 280→230、`REVERT_DURATION` 170→150、`CHAIN_DELAY` 60→45、`DRAG_THRESHOLD` 10→8px。

当前单步等待已降到约 0.275s（消除 230 + 链延迟 45），3 波连锁约 ~0.9s，快速连续点击在动画间隙会被排队执行，"不跟手"体感已显著改善。

**仍未做的**：完全的状态机"操作打断"（动画中途新操作直接取消当前动画链），影响较大且可能破坏视觉节奏，暂未实施。

---

## 6. 验证

- **319/319 测试全绿**（21 套件，jest）—— 纯逻辑层无回归
- **Node 基准**量化核心逻辑函数耗时（见 §0），确认逻辑层不是瓶颈
- **Edge headless 截图**确认所有 CSS/JS 改动后牌面、弹窗、棋盘背景渲染正常，无视觉破坏

---

## 7. 第四轮：建立浏览器交互式视觉验证 + 修复真实视觉问题

前三轮优化（filter/合成层/动画时长）改动的实际效果**仅靠 jest 单元测试和静态首屏截图无法验证**——消除动画 230ms 完成，静态截图只能拍到结果。本轮补齐了"在真实浏览器里看到动画过程"的能力，并在此过程中发现并修复了**两个真实存在的问题**。

### 7.1 CDP 交互式验证（基础设施）

**新增**：

- `js/main.js` 末尾：**`?demo=1` URL 参数激活 `window.__demo` 调试钩子**（仅 URL 含 `demo=1` 时挂载，普通用户零污染）
  - `inspect()`: 返回 `{ phase, tiles, directPairs, isDeadlock }`
  - `solveOnce()`: 触发一次合法消除并 await 所有动画结束（优先直接配对点击 → 否则走 `handleDragEnd`）
  - `waitIdle()`: 等待 phase=IDLE
  - `newGame()` / `reseed(seed)`: 重新开始

- 用户级 skill：**`cdp-visual-verify`**（`~/.workbuddy/skills/cdp-visual-verify/`）
  - `scripts/cdp.mjs`: 基于 Node 22 原生 WebSocket + Edge headless + CDP 的交互式截图脚本
  - 能在动画**中间帧**（80-220ms）连续截屏，捕捉完整过程
  - 自动收集 console 错误 + 网络请求做诊断
  - 自带 README/SKILL 完整文档（含已知坑与扩展方法）

**用法**：

```bash
# 启动 HTTP 服务器 + 删 profile
rm -rf /tmp/edge-profile

# 跑脚本
"C:/Users/<USER>/.workbuddy/binaries/node/versions/22.22.2-2/node.exe" \
  ~/.workbuddy/skills/cdp-visual-verify/scripts/cdp.mjs

# 查看 shots/ 目录下的截图
```

**关键发现**——用 CDP 验证后捕捉到的真实问题（均与 demo 钩子无关）：

### 7.2 真实 Bug：kbController TDZ 中断 DOMContentLoaded

`js/main.js` 第 388 行同步调用 `syncKeyboardUI()`，但 `kbController` 是 `const` 声明在第 433 行才创建。第一次调用触发 `ReferenceError: Cannot access 'kbController' before initialization`——**整个 IIFE 后续代码（按钮绑定、demo 钩子）都不执行**。

**测试为什么没发现**：jest 单元测试 mock DOM 不执行 DOMContentLoaded 回调，所以测试一直 319/319 全绿。**这是真实存在的 bug**：用浏览器加载游戏时主线程抛错，但被浏览器 console.error 静默处理，UI 还能用（因为 `registerServiceWorker` 等被依赖的副作用已先完成），但很多增强功能（键盘控制、demo 钩子）失效。

**修复**：

```diff
- // 初始化键盘控制器：对局中启用（方向键+回车可玩），非对局禁用
- syncKeyboardUI();
- // 轮询同步键盘态（...）
- setInterval(syncKeyboardUI, 800);
+ // 初始化键盘控制器：对局中启用（方向键+回车可玩），非对局禁用
+ // kbController 在下方（line 433+）才创建，此处先注册轮询，
+ // 800ms 后第一次执行时 kbController 已就绪，避开 TDZ。
+ setInterval(syncKeyboardUI, 800);
```

### 7.3 真实视觉问题：deadlock-msg 遮挡 h1 标题

原 CSS：

```css
#deadlock-msg { top: 18px; background: rgba(218, 89, 86, 0.94); }
#reshuffle-msg { top: 18px; background: rgba(37, 143, 111, 0.94); }
```

CDP 截图发现：**死局提示与 h1 标题在同一位置**（top 18-50px），显示时完全遮挡标题。简单挪到 `top: 72px` 之后又压在工具栏按钮上。

**最终修复**：

```css
#deadlock-msg { top: 108px; }   /* header(50px) + toolbar(50px) + 8px 间隔 */
#reshuffle-msg { top: 108px; }
```

验证截图 `shots/05_deadlock_msg_position.png` 显示：标题完整、工具栏按钮可见、死局提示在工具栏下方。

### 7.4 已验证：消除动画瞬间的真实节奏

`shots/01_eliminate_early.png`（80ms 早期）显示一对牌开始淡出，徽章"消除 2"在牌组位置弹出。

`shots/02_eliminate_mid.png`（220ms 收缩期）显示牌缩到约 0.6 scale + 0.7 opacity。

`shots/04_chain_00_mid.png`（连击 x2）显示 sparks 粒子迸发 + "10秒内继续" 副标题徽章。

**结论**：前几轮改动的 CSS 动画在真实浏览器里**确实按预期工作**——shimmer/上抛/连线/pulse 都看到了。

### 7.5 关键经验

1. **静态截图 + 单元测试 ≠ 真实行为**：仅靠这两者，前几轮改动都"看起来对但无法证实"。CDP 让"看到"成为可能。
2. **TDZ 错误是隐形杀手**：浏览器 console.error 不会中断后续代码，**单元测试看不到、用户感知不到**——但所有 IIFE 后续逻辑被吞。**必须用真实浏览器跑**才能发现。
3. **CSS 改动前的视觉假设要验证**："top: 18px 应该避开标题"——但实际 header 高度 50px，标题中心在 25px，deadlock-msg 高度 32px 正好压在标题上。这类问题只能靠截图确认。

### 7.6 进一步发现：deadlock-msg 残影到新一局

**问题**：`#deadlock-msg` 用 `flashElement(el, 3000)` 显示 3 秒后自动隐藏。但如果在 3 秒内点"新游戏"，deadlock-msg 仍然显示——**会误导玩家以为新一局是死局**。

**复现路径**（CDP 验证）：
1. `solveOnce()` 多次直到触发死局 → `showDeadlock()` → `flashElement(3000)` 开始
2. 1-2 秒内调用 `__demo.newGame()`（demo 钩子）或点击"新游戏"按钮
3. 截图显示红色 deadlock-msg 仍可见，叠加在新一局的"剩余 136 张"上

**修复**（`js/main.js`）：在 btn-new 和 btn-new-victory 的 click 监听中先调 `dismissFlashMessages()`，隐藏所有可能残留的提示消息（deadlock-msg / reshuffle-msg / rotate-hint）。demo 钩子的 `__demo.newGame()` 同步此逻辑。

**验证**（截图 `06_fresh_board.png`）：修复后新一局截图干净，无任何提示残影。
