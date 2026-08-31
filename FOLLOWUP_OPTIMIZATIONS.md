# 麻将消消乐 — 后续优化项梳理

> 整理时间：2026-08-31 ｜ 基线：319/319 测试全绿（21 套件），核心消除算子冻结
> 范围：在 P0-P3 + 架构债清零之后，仍有价值的、可继续推进的优化方向

---

## 总览

| 优先级 | 优化项 | 类别 | 价值 | 工作量 | 风险 |
|--------|--------|------|------|--------|------|
| **P0** | 1. 牌面质感升级 | UI/视觉 | 高 | 中 | 极低 |
| **P1** | 2. 拖动手感打磨（拖动侧实时跟随 + 松手回弹） | UI/动效 | 中 | 中 | 极低 |
| **P1** | 3. 屏幕震动（combo 链锁反馈） | UI/动效 | 中 | 小 | 极低 |
| **P1** | 4. 计时器/状态机测试覆盖补强 | 测试 | 中 | 小 | 低 |
| **P2** | 5. 排行榜（HOT/LOCAL 双榜 + 分享） | 功能 | 中 | 中 | 低 |
| **P2** | 6. 模式难度曲线（4 套难度参数包） | 游戏性 | 中 | 中 | 中 |
| **P2** | 7. 成就系统扩展（隐藏成就 + 提示卡产出绑定） | 游戏性 | 中 | 中 | 低 |
| **P3** | 8. 主题扩展（暗夜/清新 + 牌背重绘） | UI | 中 | 中 | 低 |
| **P3** | 9. 关卡编辑器（关卡 JSON 化自编辑） | 工具 | 低 | 中 | 中 |
| **P4** | 10. 国际化（i18n 框架） | 工程 | 低 | 大 | 中 |

> 建议从 P0 开始按需推进。每项独立可交付，互不强依赖。

---

## P0 — 牌面质感升级

### 现状

- `css/tile.css` 已用渐变 + 内阴影 + 高光营造基本立体感
- 牌面图片（`assets/images/tiles/*.png`，已压缩到 236 KB）由 Seedream 4.5 生成
- 发牌动画已有 3D `rotateX` 翻面（`tile--deal-hidden` ↔ `tile--deal-animating`）
- 选中/拖动/消除/连锁 状态已有配色 + box-shadow 区分

### 优化方向（按 ROI 排序）

#### 方案 A：CSS 3D 真实翻面 + 微悬浮 ★★★（推荐）

**思路**：牌的 `transform-style: preserve-3d` 已就位。补一个静态的 `rotateY(±2deg)` 微角度让牌面有"侧看"感（已存在但 `transform: none` 时不显），同时让消除/连锁时牌有更明显的 3D 飞出轨迹（不是单纯淡出）。

```css
/* 静态：每张牌随机微角度（0/±1.2°），避免网格感 */
.tile { transform: perspective(360px) rotateX(0.4deg) rotateY(var(--tile-yaw, 0deg)); }

/* 消除时：3D 飞出 + 旋转 */
.tile--eliminating {
  animation: tile-eliminate-3d 380ms cubic-bezier(0.4, 0, 0.6, 1) forwards;
}
@keyframes tile-eliminate-3d {
  0%   { transform: perspective(360px) rotateY(0) translateZ(0); opacity: 1; }
  100% { transform: perspective(360px) rotateY(180deg) translateZ(80px) translateY(-20px); opacity: 0; }
}
```

- **数据**：`renderer.js` 在创建 tile DOM 时给 `--tile-yaw` 注入 `±1.2°` 随机值
- **red 系数**：微悬浮用 `prefers-reduced-motion` 关闭
- **测试**：纯 CSS 改动 + 一个 renderer 测试用例断言 `--tile-yaw` 被注入

#### 方案 B：牌面图片重绘（Sprite sheet）★★

- 现有 34 张独立 PNG → 合并为 1-2 张 Sprite，CSS `background-position` 切牌
- 收益：HTTP 请求从 34 降到 1-2（首屏更快）；缺点：需要重新 AI 出图
- 优先级低于方案 A，因为方案 A 零图片成本

#### 方案 C：内阴影/高光层强化 ★

- 在 `tile::before` 之上叠一层 `::after` 做顶部高光
- 工作量最小（≈10 行 CSS），但视觉收益相对有限

### 建议

**先做方案 A**（微悬浮 + 3D 飞出），独立 PR，30-60 行 CSS + 1 个测试用例。视觉收益最大，成本最低。

---

## P1 — 拖动手感打磨

### 现状

- 拖动使用 CSS `transform: translate()` 实时跟随，体感已经不错
- 松手后若不形成配对，回弹动画是 220ms ease（`tile--invalid` 弹回）
- 已通过 `dragController` 单一通道管理，行为稳定

### 优化方向

#### 1. 整组牌实时跟随（已实现，待打磨）

- 当前同方向相邻的牌是一起移动的（`collectDragGroup`）
- 优化：起拖动到落点的阈值用 `pointerdown` 位置而非 `pointermove` 第一个事件，避免误触发

#### 2. 松手 spring 惯性回弹

- 把 `tile--invalid` 的 `animation: tile-invalid 260ms ease-out` 换成 cubic-bezier(0.5, 1.5, 0.4, 1) 的"过冲+回落"
- 推荐曲线：`cubic-bezier(0.34, 1.56, 0.64, 1)`（Material "back" 曲线）

#### 3. 拖动中的"卡位"高亮

- 拖动时牌组高亮当前能落的所有位置（仅当拖动过程中牌组没碰到阻挡时高亮）—— **不建议**，增加视觉噪音且不必要

#### 建议

只做 **#2 spring 回弹**。10 行 CSS 改动，0 风险，体感明显提升。

---

## P1 — 屏幕震动（combo 链锁反馈）

> **状态更新（2026-08-31）**：该方案已在上一轮实现，但因玩家反馈"整个棋盘弹一下太影响操作"，已**完全移除**。消除反馈现在集中在牌本身缩放淡出、连线、粒子迸发、combo 徽章上。**不建议再作为后续优化方向**。

### 原始方案（已归档）

```css
@keyframes board-shake {
  0%, 100% { transform: translate(0, 0); }
  20%      { transform: translate(-3px, 1px); }
  40%      { transform: translate(2px, -2px); }
  60%      { transform: translate(-2px, 2px); }
  80%      { transform: translate(3px, -1px); }
}

.board--shake {
  animation: board-shake 240ms ease-out;
}
```

- 触发：combo >= 2 时，gameController 在 `applySlide` 连锁段加 `board.classList.add('board--shake')`，`setTimeout` 220ms 后移除
- 减弱：combo = 1-2 时震幅 2px；combo >= 3 时 4px
- reduced-motion：直接关闭
- 测试：纯 CSS + 一个 gameController 测试用例断言震动类被添加

### 结论

棋盘整体位移/缩放动效会干扰操作手感，已移除。若未来需要"连击打击感"，应优先考虑**粒子密度/徽章放大/音效**等不移动棋盘的方式。

---

## P1 — 测试覆盖率补强

### 现状（基线 79.17% statements）

| 模块 | 当前覆盖率 | 评估 |
|------|-----------|------|
| `particles.js` | 34.1% | Canvas 渲染，jsdom 不可测。**预期低** |
| `share.js` | 31.89% | navigator.share/clipboard/canvas 2d，jsdom 不可测。**预期低** |
| `animationController.js` | 67.57% | 中等，DOM 动画时序复杂 |
| `gameController.js` | 66.83% | 核心状态机，**应继续补强** |
| `timer.js` | 64.31% | 计时器，**应继续补强** |
| `renderer.js` | 84.47% | 不错 |
| `dragController.js` | 97.81% | 优秀 |
| `gameLogic.js` | 99% | 优秀（核心冻结区） |

### 优化方向

#### 1. `timer.js` 提升至 80%

未覆盖代码主要是：旧式 `setInterval` 路径、`stopTimer`/`getElapsedSeconds` 边界条件。补 4-6 个测试用例即可。

#### 2. `gameController.js` 提升至 75%

未覆盖代码主要是：教学模式分支、各面板显示/隐藏的副作用。补 6-10 个测试用例即可。

#### 3. `animationController.js` 提升至 75%

未覆盖代码：发牌序列、消除时序、粒子层调用。补 4-6 个测试用例（mock rAF 即可）。

### 建议

按模块逐一加测试，每模块 30-60 分钟，预计新增 14-22 个测试，整体覆盖率提升到 81-83%。

---

## P2 — 排行榜（HOT/LOCAL 双榜 + 分享）

### 思路

- 现有 `mahjong-scores-v1` 只存每模式的最佳分数（一行）
- 扩展为：每模式保留 Top 10（按分数降序）
- 加"今日最佳 / 本周最佳 / 历史最佳"三个时间窗口
- UI：胜利/结算界面加"查看排行榜"按钮，新弹窗展示 Top 10
- 分享：榜首可一键分享自己的成绩

### 数据结构

```js
// mahjong-leaderboard-v1
{
  classic: [{ score, time, moves, date }, ...],  // 最新 10 条
  timed60: [...],
  daily:   [{ score, time, moves, date, seed }, ...],
  // ...
}
```

### 工作量

- `js/leaderboard.js`（新）：纯逻辑，≈80 行 + 8-10 个测试
- `js/main.js`：加面板入口 + 渲染
- `css/main.css`：表格样式
- **总计 200-300 行 + 10-15 个测试**

### 价值

- 重玩性提升（玩家想冲榜）
- 配合分享按钮形成自传播
- 难度曲线更平滑

---

## P2 — 模式难度曲线

### 现状

- 5 种模式（classic / timed60 / timed120 / moves30 / moves50 / daily）已落地
- 难度只有"限时/步数"两个维度

### 优化方向

新增 4 套**难度参数包**叠加在模式之上：

| 难度 | 棋盘 | 牌型 | 撤销 | 提示 |
|------|------|------|------|------|
| 简单 | 12×6 | 仅万 + 条 | ∞ | ∞ |
| 普通 | 17×8 | 万+条+筒 | 10 | 5 |
| 困难 | 17×8 | 全牌（含字） | 5 | 2 |
| 地狱 | 12×17 | 仅字牌 | 2 | 0 |

- 模式 × 难度 = 24 种组合
- UI：在模式选择面板加"难度"二级选择
- 数据：扩展 `MODES` 数据结构或新建 `js/difficulties.js`

### 价值

- 极大扩展可重玩性
- 关卡模式（已有 12 关）和难度曲线互补，前者是剧本式，后者是自由式

---

## P2 — 成就系统扩展

### 现状

- 10 个成就已落地（`js/achievements.js`）
- 全部是显式条件，无隐藏成就

### 优化方向

#### 1. 隐藏成就

- 加 5 个隐藏成就（如"一局内只用过锤子通关"、"首局 60s 限时拿满分"）
- UI 上显示为"???"，达成后才揭晓
- 提升探索感

#### 2. 成就奖励

- 部分成就解锁**提示卡 / 撤销卡 / 锤子**作为一次性奖励
- 数据绑定：每个成就定义加 `reward: { item: 'hammer', amount: 1 }`
- 玩家从"看成就"变成"打成就"

#### 3. 成就进度

- 部分成就设多档（已消除 50/100/500 对）显示进度条
- 数据结构：每成就加 `progress(current, target)` 函数

---

## P3 — 主题扩展

### 现状

- **4 套主题已落地**：默认木韵 / 暗夜 / 清新 / 暮色（`js/themes.js` + `html[data-theme]` CSS 变量覆盖）
- 主题切换只换 CSS 变量，牌面图片复用
- 其中"暮色"主题为最新加入的日落橙粉渐变风格

### 优化方向

- **牌背重绘**：4 套主题对应 4 张牌背（默认绿竹/暗夜金/清新蓝/暮色玫瑰金）
- **音效主题**：经典/现代两种音效包（合成器配置不同）
- **BGM 主题**：已扩展为 9 首程序化曲目，未来可按主题播放不同风格子集

工作量约 100-150 行 + 资源 4 张 PNG（牌背）。

> 当前状态："暮色"主题与 9 首 BGM 已于 2026-08-31 落地；牌背重绘 / 音效主题 / BGM 主题子集为可选后续。

---

## P3 — 关卡编辑器

### 思路

- `js/levels.js` 当前是数据驱动的 12 关静态表
- 加 `levelEditor.html`：点空白棋盘放牌，可选牌型，可设置限额/目标分数
- 导出 JSON，导入到 `LEVELS` 数组
- 不破坏现有 P2 关卡，纯可选工具

### 价值

- 社区/玩家自制关卡分享
- 配合排行榜形成 UGC 闭环

### 风险

- 棋盘尺寸固定 17×8，需加自定义尺寸
- 牌型子集校验：奇数张牌会有死局
- 数据规模：localStorage 容量（≈5MB）够用，但导入/导出版本兼容

### 工作量

- 1-2 天（含测试），约 300-500 行

---

## P4 — 国际化（i18n）

### 现状

- 全中文硬编码，UI 文案散落在 HTML + JS 各处
- 多语言支持需要逐个文件改

### 优化方向

- 引入极简 i18n：`js/i18n.js` 暴露 `t('key')` 函数
- 文案集中到 `assets/i18n/zh-CN.json` / `en-US.json`
- 改造：HTML `data-i18n="key"`，main.js 启动时根据 `navigator.language` 加载
- 工具栏加语言切换按钮

### 价值

- 海外传播（虽然优先级不高）
- 维护成本增加：每次新增文案要同步两语

### 建议

**不建议近期做**。当前用户量是中文为主，且 UPGRADE_PLAN 明确"不做联网后端/账号系统"，国际化属于锦上添花。

---

## 关键依赖与约束

无论做哪些项，以下约束贯穿始终：

1. **核心消除算子冻结** — `collectDragGroup` / `findAllPairs` / `applySlide` / `resolveChainElimination` / `isDeadlock` 永不动
2. **核心数据流冻结** — `boardState` / `tileDefinitions` / `movementLogic` / `hintSystem` 不动
3. **测试不变量** — `tests/hintReproducibility.test.js` 7 用例必须永绿
4. **覆盖率门槛** — 纯逻辑新模块 ≥ 80%；UI/DOM 模块 ≥ 60%
5. **零构建约束** — 不引入 bundler/框架；纯 ESM 直开可玩
6. **PWA 兼容** — 所有改动不破坏 SW 缓存

---

## 建议推进顺序

```
P0 牌面质感（A 方案）     ──→ 1-2 天，零风险
P1 屏幕震动 + spring 回弹  ──→ 半天，纯 CSS
P1 测试覆盖率补强         ──→ 1-2 天，约 20 个新测试
P2 排行榜               ──→ 2-3 天，独立模块
P2 模式难度曲线          ──→ 1-2 天
P2 成就扩展              ──→ 1-2 天
P3 主题/关卡编辑器        ──→ 弹性，按需
P4 i18n                 ──→ 暂缓
```

如果只选**一项**做，建议 **P0 牌面质感（方案 A）**。它用最小改动带来最大视觉收益，是典型的"低成本高回报"项。
