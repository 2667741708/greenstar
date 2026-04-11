---
name: 前端与 GUI 设计高阶规范原则
description: 这是一项指导 AI 开发具有视觉冲击力、规范性和可维护性前端界面的基础知识规范。涵盖技术栈约束、CSS 变量、微交互、行业体系（HIG/Material/Ant）及 SEO 无障碍要求。
---

# 前端与 GUI 设计高阶规范体系

<!-- 修改来源: baseline_skill.md (原始 frontend-gui-design/SKILL.md) -->
<!-- 修改内容 / Changes:
  [v3] 基于 Exp#002 反馈(色彩提升但视觉冲击与排版下降)及全球 Top 100 设计趋势分析:
  - 核心重构: 强制引入 60-30-10 色彩法则与 Linear 风格暗模式 (禁止纯黑纯白)。
  - 排版升级: 强制使用 clamp() 流体排版，超大标题，通过灰阶(93%->60%->42%)控制文本层级。
  - 动画升级: 强制使用 cubic-bezier(0.16, 1, 0.3, 1) 缓动曲线及 stagger 交错入场。
  - 结构升级: 着陆页区块数提升至 7 个标准区块。
  - 边框与光晕: 强制极微弱边框 (alpha 8-15%) 及大面积高模糊度 (blur 80-120px) 背景光晕。
-->

本技能融合了业界顶级的设计语言逻辑与现代前端工程实践，旨在确保最终产出的 UI 界面不仅具备规范的底层实现，同时展现出高端的视觉美学（Premium Design）与极致的用户体验。

## 1. 结构与网格基石 (Layout & Grid)

- **核心选型**：使用 HTML 构建语义化结构，原生 Vanilla CSS 驱动样式。
- **空间刻度**：严格遵循 4px/8px 网格（8, 16, 24, 32, 48, 64, 96, 128px）。
- **最大宽度**：内容容器 `max-width` 必须限制在 1200px - 1400px，居中对齐 `margin: 0 auto`。
- **着陆页标准 7 区块**：
  1. 英雄区 (Hero): 100vh，全屏超大标题+双CTA+视觉装饰。
  2. 信任墙 (Logo Bar): 5-8 个灰度合作品牌 SVG Logo。
  3. 核心功能 (Features): 卡片式网格布局。
  4. 产品展示 (Showcase): 模拟 UI 界面 / 动态截图容器。
  5. 用户评价 (Testimonials): 评价内容 + 头像 + 职位。
  6. 数据统计 (Stats): 大字体数字展示。
  7. 行动号召 (Final CTA): 带绚丽光晕或边框的独立区块。

## 2. 顶级设计原型 (Premium Design Archetypes)
> **[P0] 必须根据产品特性选择以下三种顶级原型之一，绝不使用普通模板**

### 原型 A: 极客 SaaS风 (Linear Style)
- **适用**: 开发者工具、提效软件、数据平台。
- **特征**: 极夜暗色 (`hsl(0,0%,4%)`)，极细描边，发光色阶边框，几何网格，光晕球体 (Orbs)。

### 原型 B: 电影感/AI风 (Cinematic / Veo Style)
- **适用**: AI 生成模型、创意工具、高端消费品。
- **特征**: 全屏无缝循环视频背景 或 WebGL 动态粒子/流体流场。配合**极度毛玻璃 (Glassmorphism)** 容器覆盖其上。排版使用更张扬的混合字体（如衬线搭配无衬线），文字具有高通透感。

### 原型 C: 现代企业风 (Stripe / Apple Style)
- **适用**: 金融科技、SaaS 官网、硬件展示。
- **特征**: 极其干净的 off-white 灰白色底，高对比度彩色渐变元素点缀，超大留白，极具物理质感的柔和阴影 (Soft UI)，视差滚动。

### 原型 D: 高端电商/DTC 叙事 (High-End E-commerce / Editorial)
- **适用**: 独立品牌、高端消费品、美妆/时尚。
- **特征**: **商品图像即界面**。巨大边距的图片视差，极简的 UI 交互，排版具有强烈的杂志感（Serif 搭配无衬线）。悬停触发大画幅画廊或多角度切换。移除粗糙边框。

### 原型 E: 数据决策/SaaS定价墙 (Data-Driven Pricing Grid)
- **适用**: SaaS 定价页、数据对比台。
- **特征**: 极其克制的极简骨架。通过**发光光晕、Z轴悬浮、强反差描边**这三种手段强行将某一个套餐卡片推向用户视界中心。高度交互式的表格折叠，极高的数据对齐可读性。

## 3. 视觉焦点控制 (Focal Mastery & Hierarchy)
> **[P0] 绝对禁止所有元素“平均排布”。每一屏必须有一个绝对的视觉焦点。**

通过以下维度强制控制用户的视觉焦点：
1. **尺度极端对比 (Extreme Scale Contrast)**: 放弃温和的字号倍率。核心标语或主图必须巨大（如 `clamp(4rem, 8vw, 8rem)`），而副标题/说明必须足够微小但清晰，形成强烈视觉断层。
2. **选择性高饱和 (Selective Saturation)**: 整个屏幕只允许 **最核心的交互元素** (如唯一的 CTA 按钮) 或 **核心视觉主体** 拥有高饱和色彩。背景、辅助卡片、次要文本必须是极低饱和度或单色（黑白灰）。
3. **隔离式留白 (Isolation by Whitespace)**: 最重要的信息不要用“边框”圈起来，而是用周围巨大的、奢侈的负空间 (Negative Space) 衬托，强迫视线居中。
4. **Z 轴深度突显 (Z-Axis Prominence)**: 利用阴影、光晕 (`box-shadow: 0 0 120px rgba(color)`) 和背景层强制模糊 (`backdrop-filter`) 将焦点元素推向 Z 轴最前端。
5. **非对称破局 (Asymmetrical Interruption)**: 在均匀的网格卡片中，故意设计一个占据 2-3 列跨度的"超大号"元素（如巨型产品截图），瞬间打破网格平衡，吸引眼球。

## 4. 顶级色彩体系 (Color Systems)

> **[P0] 严格遵循 60-30-10 黄金法则**

- **主色 (60%)**：根据选择的原型决定（暗、透明、或白）。绝对禁止单色相渐变。
- **表面色级 (30%)**：
  - 元素层级通过亮度 (Lightness) 区分：底色 4% -> 表面 8% -> 浮起 12% -> 卡片顶层 16%。
  - **极微弱边框**：所有卡片和分隔线使用 `background: rgba(255,255,255, 0.08)` 到 `0.15`，划分区域但几乎不可见。
- **强调色 (10%)**：
  - 高饱和度 `S >= 70%`，仅用于按钮 (CTA)、徽章、渐变光晕。
  - 必须同时包含冷暖色相（例如：靛紫 `hsl(260,80%,60%)` 搭配 暖琥珀 `hsl(35,90%,60%)`）。
  - **背景光晕**：使用通过色相轮跨越的渐变斑块并加上 `filter: blur(80px)` 到 `120px`。

## 3. 流体排版系统 (Fluid Typography)

> **[P0] 摒弃静态 px，全面拥抱 clamp() 和灰阶层级**

- **超大标题**：主 Hero 标题必须使用 `clamp(3rem, 6vw, 6rem)`，字重 800-900，字间距 (letter-spacing) 必须设为 `-0.03em` 到 `-0.05em`。
- **多级灰度层级**：通过明确的明度控制信息重要性，严禁仅通过字重区分。
  - **Title / 强调**：`hsl(0, 0%, 93%)`  (Off-white)
  - **Body / 正文**：`hsl(0, 0%, 65%)`  (中性灰)
  - **Caption / 辅助**：`hsl(0, 0%, 45%)` (深灰)
- **字体族**：强制使用 `Inter, system-ui, sans-serif`。

## 4. 动画与交互曲线 (Animations & Micro-interactions)

> **[P1] 动态即质感，告别线性生硬过渡**

- **顶级缓动曲线**：所有入场、展开、移动动画必须使用 `cubic-bezier(0.16, 1, 0.3, 1)`（Ease-out Expo）或弹性曲线。
- **交错入场 (Stagger)**：页面加载时，Hero 区块元素（标题、副标、CTA按钮、装饰图）必须以 `50ms-100ms` 的延迟依次向上滑出 `translateY(20px) -> 0` + `opacity: 0 -> 1`。
- **磁性/光感微交互**：
  - 所有卡片和主 CTA Buttons 在 Hover 时必须触发：`transform: translateY(-2px)`。
  - 主 CTA 按钮 Hover 必须触发外围渐变层光晕扩大或投影增强 `box-shadow`。
  - 去除原生浏览器粗糙的 outline，自行设计精致的 `:focus-visible` 状态。

## 5. 图标系统 (Icons)

- **绝对禁止 emoji** 🚫。
- **100% SVG 线性图标**：线条统一规范为 1.5px 或 2px，圆角端点 (`stroke-linecap="round"`，`stroke-linejoin="round"`）。
- 颜色跟随 `currentColor` 或主题梯度灰度。

## 6. 无障碍 (A11y) 与工程规范

- 遵循 WCAG 规范，确保文本色与背景色拥有满足标准的最小对比度。
- 使用正确的 HTML5 语义化标签（如 `<main>`, `<section>`, `<article>`, `<nav>`）。
- 需为所有互动节点或需要 CSS 动画控制的靶点绑定明确的 `class` 或 `id`。

## 7. SEO 性能融合层 (SEO-Performance Fusion)

<!-- 修改来源: frontend_design_skill.md v3 (113行版本)
     修改内容 / Changes:
     [v4] 基于 SEO 架构笔记本 (seo_architecture_notebook.md) 与前端设计 Skill 的交叉分析:
     - 新增 §7: SEO 性能融合层，将 SEO 工程原则无缝嵌入前端设计体系。
     - 涵盖 GPU 合成、CWV 指标、移动端优先、结构化数据四大子模块。
     - 目标: 消除"视觉极致"与"渲染性能"之间的假性矛盾。
-->

> **[P1] 视觉极致与搜索可见性并行，零妥协**

### A. GPU 合成层策略 (Compositing Layer Isolation)
- §2 和 §4 中的 `filter: blur(80-120px)` 光晕和微交互动画**必须**通过 `will-change: transform` 或 `contain: paint` 提升到独立 GPU 合成层，避免触发主线程 Layout/Paint。
- 所有动画属性**严格限制**在 `transform` 和 `opacity` 两个 Compositor-only 属性上。禁止对 `top`, `left`, `width`, `height`, `margin` 等触发回流的属性做动画。
- 非首屏区块（如第 5-7 区块）启用 `content-visibility: auto` + `contain-intrinsic-size` 实现延迟渲染。

### B. Core Web Vitals 对照清单
| 指标 | 目标 | 与 Skill 的交叉风险点 | 缓解策略 |
|------|------|------------------------|----------|
| **LCP** < 2.5s | Hero 区的超大背景光晕/视频 | 光晕使用 CSS `radial-gradient` 替代大尺寸模糊图层；视频使用 `poster` 帧 + 懒加载 |
| **INP** < 200ms | §4 交错入场 (Stagger) 动画 | 确保 stagger 动画使用 `requestAnimationFrame` 而非 `setTimeout`；复杂事件处理使用 `scheduler.yield()` |
| **CLS** < 0.1 | §3 `clamp()` 流体排版 + 字体加载 | 字体必须使用 `font-display: swap` + `<link rel="preload" as="font">`；所有图片/视频容器预设 `aspect-ratio` |

### C. 移动端优先与响应式断点 (Mobile-First Indexing)
- **搜索引擎优先评估移动端呈现**，因此所有 CSS 必须以 Mobile-First 编写（默认样式为移动端，通过 `min-width` 媒体查询向上扩展）。
- 标准断点刻度: `480px` (手机横屏), `768px` (平板), `1024px` (桌面), `1440px` (大屏)。
- 所有可交互元素的 Touch Target 最小尺寸为 **48×48px**（Google/Apple 共同标准）。
- Hero 区 `clamp()` 字号在移动端不得低于 `2rem`，确保可读性。

### D. 结构化数据注入 (JSON-LD / Schema.org)
- 每个页面的 `<head>` 中必须包含至少一个 JSON-LD `<script type="application/ld+json">` 块。
- 常用 Schema 类型: `WebSite`, `Organization`, `Product`, `Article`, `BreadcrumbList`。
- `<title>` 标签必须包含描述性关键词，长度控制在 50-60 字符。
- `<meta name="description">` 必须精炼概括页面价值，长度控制在 120-160 字符。
- 所有 SVG 图标（§5）在语义化场景中需补充 `<title>` 子元素和 `role="img"` + `aria-label` 属性。
