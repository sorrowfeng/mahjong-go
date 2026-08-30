# 麻将消消乐 — 功能 / 游戏性 / UI 全面升级方案

> 制定时间：2026-08-30 ｜ 基线：146 项测试全绿，全局覆盖率 74.55%，牌图 236K
> **核心约束：主消除逻辑不变。** `gameLogic.js` 的核心算子
> （`collectDragGroup` / `findAllPairs` / `applySlide` / `resolveChainElimination` / `isDeadlock`）
> 保持冻结，所有升级叠加在表现层、规则层、元游戏层。
>
> **实施状态：** ✅ P0 快赢（统计/设置/动效/主题）已完成；✅ **P1 游戏性（计分/限时/步数/每日挑战/道具）已完成（2026-08-30）**；
> ⏳ P2 长线（关卡/成就/PWA/分享）待实施。

---

## 0. 总体思路：三层架构

```
┌─────────────────────────────────────────────┐
│  元游戏层（新增）                              │
│  模式 / 关卡 / 计分 / 道具 / 成就 / 统计 / 主题   │
├─────────────────────────────────────────────┤
│  规则层（现有，薄改）                           │
│  gameController 状态机 + 模式参数注入            │
├─────────────────────────────────────────────┤
│  核心层（冻结）                                │
│  gameLogic 消除算子 + movementLogic 选组        │
└─────────────────────────────────────────────┘
```

原则：

1. **核心层冻结**——现有 146 项测试是不变量守护网，核心算子改动即为回归。
2. **一切扩展数据驱动**——模式、关卡、道具、主题都是 JSON/配置对象，核心 js 不膨胀。
3. **新逻辑独立成新模块**——计分、道具、关卡各自独立文件，纳入 80% 覆盖率门槛。

---

## 一、游戏性升级（核心：模式系统）

### 1.1 模式系统 ★ 最高优先级

用"模式 = 参数包"的方式在现有核心逻辑上叠加规则层，消除玩法完全不变：

| 模式 | 规则叠加 | 实现要点 |
|------|----------|----------|
| **经典模式** | 现状 | 默认，无附加参数 |
| **限时挑战** | 60s / 120s 倒计时，结束按分数结算 | `timer.js` 已有倒计时基础，加 `onTimeout` 回调 |
| **步数挑战** | 限定步数清盘，剩余步数转化为分数与星级 | gameController 的 `moveCount` 已在统计，加 `moveBudget` |
| **关卡模式** | 预置关卡：固定随机种子、棋盘尺寸、牌型子集、撤销/提示次数限制、目标分数 | 见 1.2 |
| **每日挑战** | `YYYY-MM-DD` 作随机种子，全网同题，本地可复现 | `hintReproducibility` 已验证洗牌可种子化 |

**实现建议**：新增 `js/modes.js`，导出模式定义：

```js
const MODES = {
  classic:  { id: 'classic', undoLimit: Infinity, hintLimit: Infinity },
  timed60:  { id: 'timed60', timeBudget: 60, scoring: true },
  moves30:  { id: 'moves30', moveBudget: 30, starRating: true },
  daily:    { id: 'daily',   seed: dateSeed(), scoreBoard: 'daily' },
};
```

`initNewGame(options)` 增加可选模式参数（向后兼容，缺省即经典模式）。

### 1.2 关卡系统

关卡 = 纯数据 JSON，不写死在代码里：

```json
{
  "id": 12,
  "seed": 812736,
  "rows": 8, "cols": 14,
  "tileTypes": ["wan_1_9", "tong_1_6"],
  "moveBudget": 40,
  "hintLimit": 2,
  "undoLimit": 3,
  "targetScore": 1200,
  "stars": [900, 1100, 1300]
}
```

- 新增 `js/levels.js` 读取关卡清单（可放 `assets/levels.json`）
- 关卡选择界面（网格卡片 + 星级显示 + 锁定态）
- 进度存 `localStorage`（`mahjong-progress-v1`），与现有存档 v1 并列
- **难度曲线**：前 5 关教学性质（棋盘小、牌型少）→ 中期引入尺寸/死角变化 → 后期限制撤销提示

### 1.3 计分与评级

现有代码已有 combo 计数雏形（近期提交 `Count combo gains by eliminated pairs`），扩展为完整计分：

- 新增 `js/score.js` 纯逻辑模块：
  - 基础分：每对 100
  - **连锁倍率**：第 n 次连锁 ×(1 + 0.5n)
  - **连击窗**：3 秒内连续消除叠加 combo 徽章
  - 效率奖励：一次拖动消除多对额外加分
- 星级评定（1-3 星）用于关卡模式与步数挑战
- 分数榜按模式分开记录到 localStorage（扩展现有 `mahjong-best-v1` → `mahjong-scores-v1`）

### 1.4 道具系统（改策略，不改规则）

| 道具 | 效果 | 与核心逻辑的关系 |
|------|------|------------------|
| 洗牌卡 | 等价现有重排，消耗道具免确认 | 复用 `reshuffleRemainingTiles()` |
| 撤销卡 | 解锁更多撤销次数 | 现有 undoStack，只改限额 |
| 提示卡 | 解锁提示次数 | 现有 findHint |
| **锤子** | 点击消除任意一对（无视拖动规则） | 直接删除两块牌后调 `resolveChainElimination()` 做连锁——绕过选组但复用连锁算子，核心不动 |

- 道具库存存 localStorage；关卡模式按关卡发放，经典模式靠成就/每日挑战获取
- 新增 `js/items.js` 管理库存与使用，UI 上工具栏加道具栏

### 1.5 成就系统（本地）

首次胜利 / 累计 100 对 / 单局 5 连锁 / 无提示无撤销通关 / 每日挑战 7 天连续……
新增 `js/achievements.js`，成就定义数据化，达成时 toast 通知。

---

## 二、功能性升级

### 2.1 统计页 ★

新增 `#stats-panel` 弹窗（复用现有 confirm-box 样式）：
总局数、胜率、最快通关、最少步数、累计消除对数、最长连锁、最佳单局分数。
数据源：扩展现有最佳成绩存储，新增 `mahjong-stats-v1`。

### 2.2 设置面板

- 音效 / BGM 音量滑杆（`soundController` / `bgmController` 已具备，补 UI）
- 动画速度（0.5× / 1× / 2×，CSS 变量 `--anim-speed` 全局缩放）
- 色弱模式（牌面加符号区分辅助标记）
- 左手模式（工具栏换边）
- 设置存 `mahjong-settings-v1`

### 2.3 PWA 支持 ★ 低成本高收益

原生 JS 无构建项目天然适合：

- `manifest.webmanifest`（名称、图标用现有 `assets/*.ico` 转 PNG）
- 简单 Service Worker：预缓存全部静态资源 → **可离线玩、可安装到桌面/主屏**
- 注意版本更新策略：SW 检测新版本提示刷新

### 2.4 分享功能

通关后生成成绩卡片：Canvas 绘制（用时/步数/分数/星级 + 日期）导出 PNG，
或纯文本「我在麻将消消乐关卡 12 拿了 3 星，用时 1:23」。Web Share API 优先，剪贴板兜底。

### 2.5 键盘完全可玩（可访问性）

- 方向键移动光标选中牌 → Enter 确认起点 → 再方向键选拖动方向 → Enter 执行
- aria-live 播报消除结果给读屏用户
- `prefers-reduced-motion` 尊重系统动效减弱设置

---

## 三、UI / 美观性升级

### 3.1 主题系统 ★

现有 CSS 变量基础（`--tile-w/--tile-h` 等）扩展为完整主题包：

| 主题 | 风格 | 牌背 |
|------|------|------|
| 默认·木韵 | 暖木底色、米色牌面 | 现有 |
| 暗夜 | 深蓝灰底、描金线条 | 新增 1 张 |
| 清新 | 浅绿白、圆角更大 | 新增 1 张 |

- 主题 = 一组 CSS 变量 + 牌背图，`js/themes.js` 数据化定义，切换即时生效存偏好
- 牌面图片已压缩（236K），主题只换背景与色调，图片资源零成本复用

### 3.2 牌面质感升级（可选，视觉收益最大）

- 方案 A（推荐）：**CSS 3D 牌**——`perspective + rotateY` 真实翻面，配合现有发牌动画
- 方案 B：统一重绘一套 SVG 牌面（与图片混排的文字牌风格统一），Sprite sheet 加载
- 方案 C：维持图片，给牌面加 CSS 内阴影/高光层营造立体感（零资源成本）

### 3.3 动效升级清单

| 场景 | 现状 | 升级 |
|------|------|------|
| 发牌 | 顺序翻牌 | 错落延迟 + cubic-bezier 回弹缓动 |
| 消除 | 淡出 | **粒子迸发**（Canvas 粒子层）+ 分数飘字 |
| 拖动 | 直接位移 | 拖动实时跟随 + 松手 spring 惯性回弹 |
| 连锁 | combo 提示 | 屏幕轻微震动（CSS shake）+ combo 徽章逐级放大变色 |
| 胜利 | 静态弹窗 | **Canvas 彩带 confetti** + 统计数字滚动 |
| 死局重排 | 直接刷新 | 牌全部飞出再飞入的重排动画 |

- `animationController.js` 已有统一动画入口，粒子层新增 `js/particles.js`（独立 canvas 叠加层，不影响棋盘 DOM）
- 全部动效受 2.2 的动画速度开关与 reduced-motion 约束

### 3.4 布局与响应式

- 竖屏手机：工具栏移到底部（拇指区），棋盘满宽
- 平板/横屏：保持现状
- 刘海屏安全区：`env(safe-area-inset-*)`
- 首屏加载：预加载模块（`imagePreload.js`）扩展为百分比进度条

### 3.5 细节打磨

- 按钮统一 hover/active/disabled 态与焦点环
- 弹窗入场/退场过渡动画统一（现有遮罩直接显隐）
- 提示箭头样式与主题联动
- 空状态/首次引导微文案（教学面板已具备，补"继续上局"场景引导）

---

## 四、工程支撑

| 项 | 内容 |
|----|------|
| 新模块 | `modes.js` / `levels.js` / `score.js` / `items.js` / `achievements.js` / `themes.js` / `particles.js` / `sw-register.js` |
| 存档版本化 | 现有 `save-v1` → 升级为 `v2`（加 mode/level/score 字段），`loadSaveSnapshot` 做 v1→v2 迁移保持向后兼容 |
| 配置文件 | `assets/levels.json`、主题与道具定义内联数据对象即可（规模小不必拆文件） |
| 测试策略 | 新增纯逻辑模块（score/modes/levels/items）全部纳入 80% 覆盖率门槛；UI 层用现有 jsdom 模式补关键用例 |
| 回归底线 | 每阶段结束跑 `npm test`，核心层冻结 = 现有 146 项测试永绿 |

---

## 五、路线图（建议实施顺序）

| 阶段 | 内容 | 新增模块 | 预估工作量 | 收益 |
|------|------|----------|-----------|------|
| **P0 快赢**（1-2 天） | 统计页 + 设置面板 + confetti/粒子动效 + 主题系统 | stats 面板、themes.js、particles.js | 小 | 可感知体验大幅提升 |
| **P1 游戏性**（3-5 天） | 计分系统 + 限时/步数模式 + 每日挑战 + 道具栏 | score.js、modes.js、items.js | 中 | 可重玩性质变 |
| **P2 长线**（1-2 周） | 关卡系统 + 关卡选择界面 + 成就 + PWA + 分享 | levels.js、achievements.js、SW | 大 | 完整产品形态 |
| **P3 打磨**（持续） | 牌面质感、键盘可玩、色弱/左手、响应式细节 | — | 弹性 | 覆盖更多用户 |

**依赖关系**：计分（P1）依赖 combo 现有逻辑扩展；关卡（P2）依赖计分与星级；PWA 独立可随时插入。

---

## P1 实施记录（2026-08-30）

P1 游戏性阶段已全部落地，核心消除算子保持冻结，仅扩展 `shuffleDeck` 增加可选 `rng` 参数（向后兼容）：

| 方案项 | 落地情况 |
|--------|----------|
| 1.1 模式系统 | ✅ 新增 `js/modes.js`：`MODES` 数据表（classic / timed60 / timed120 / moves30 / moves50 / daily），`isValidMode` 非法回退 classic，`resolveRng(mode, date)` 种子化洗牌 |
| 1.1 每日挑战 | ✅ `hashSeed`（FNV-1a）+ `dateSeed`（YYYY-MM-DD 补零）派生可复现种子，`mulberry32` PRNG，同题全网可复现 |
| 1.3 计分与评级 | ✅ 新增 `js/score.js`：基础分/连锁倍率/连击奖励/效率奖励/剩余奖励/星级门槛/分模式分数榜（`mahjong-scores-v1`） |
| 1.3 星级 | ✅ 结算界面与胜利界面统一显示 ★/★★/★★★ |
| 1.4 道具系统 | ✅ 新增 `js/items.js`：洗牌/撤销/提示/锤子库存账本（`mahjong-items-v1`），能力回调注入副作用，锤子复用 `resolveChainElimination` 跑连锁 |
| 存档升级 | ✅ `mahjong-save-v1` → `mahjong-save-v2`（加 modeId/scoreAcc 等），`loadSaveSnapshot` 兼容 v1 |
| 限时/步数结算 | ✅ `timer.js` 新增 `startCountdown/getRemainingSeconds/stopCountdown`；`finishTimedOut`/`finishMoveLimit` 统一走 `showResultScreen` |
| UI | ✅ `index.html` 新增模式面板 + 道具栏 + 分数显示；`main.js` 渲染模式列表/道具栏；`css/main.css` 追加 P1 样式 |
| 测试 | ✅ 新增 score/modes/items 三个测试套件 + gameController P1 用例 + tileDefinitions rng 用例；**220/220 测试全绿（15 套件）**，全局覆盖率 78.41%，modes/items/score 各 ≥80% |

**验证**：`npm test` 220 通过，无覆盖率门槛告警。建议浏览器实测：模式切换、限时倒计时、步数结算、锤子道具、每日挑战可复现性、存档恢复限时模式。

---

## 六、明确不做的事（保持游戏纯粹性）

- ❌ 不引入框架/构建工具（保持原生 ESM 直开可玩）
- ❌ 不改消除判定与拖动规则（本方案唯一约束）
- ❌ 不加联网后端/账号系统（localStorage 已够用，PWA 可离线）
- ❌ 不加广告/内购类皮肤解锁（道具靠游玩获取）
