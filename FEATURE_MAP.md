# Greenstar 功能清单 & 代码定位表

> 生成时间: 2026-04-12  
> 项目根目录: `/home/whm/Project/greenstar`  
> 总代码量: ~6,957 行 TypeScript/TSX (不含 tests)

---

## 一、高德地图服务层 (`src/services/amap.ts` — 613行)

| 功能 | 函数/接口 | 行号 | API | 说明 |
|------|-----------|:---:|-----|------|
| JS API 加载器 | loadAMap | amapLoader.ts:7 | JS API 2.0 | 异步加载高德 JS SDK |
| POI 搜索 (主入口) | searchPOI | amap.ts:359 | around + text | 三层架构: 缓存→JS→REST 降级 |
| POI 多页搜索 | searchPOIPaginated | amap.ts:447 | — | 自动翻页, 最多 maxPages 页 |
| 泛搜索多维并发 | searchPOI 内部分支 | amap.ts:382 | around×7 维度 | 7 个分类编码并发探针, Top-80 截断 |
| 逆地理编码 | reverseGeocode | amap.ts:480 | regeo (JS+REST) | JS 优先, REST 降级, 坐标→地址 |
| 地理编码 | geocode | amap.ts:537 | geo (JS+REST) | JS 优先, REST 降级, 地址→坐标 |
| 行政区查询 | getSubDistricts | amap.ts:590 | DistrictSearch | 下钻区县列表 |
| POI 缓存 | buildCacheKey / getCachedPOI | poiCache.ts:73 | IndexedDB | 按 city+keyword+type+radius 缓存 |
| 搜索选项接口 | SearchPOIOptions | amap.ts:104 | — | type/radius/isUserSearch/pageSize |

---

## 二、推荐引擎 (`src/services/recommendEngine.ts` — 213行)

| 功能 | 函数 | 行号 | 说明 |
|------|------|:---:|------|
| 场景推断 | inferScene | 22 | 45 条 SCENE_RULES 关键词匹配 |
| 综合评分 | computeScore | 44 | rating×10 + photo×5 + cost×3 + openTime×2 - distance×0.001 |
| 距离分组 | segmentByDistance | 79 | 4 档: <1km / 1-5km / 5-15km / >15km |
| 排序+分组主函数 | rankAndSegment | 109 | 评分→排序→Top-K=40→分组 |
| 格式化输出 | formatRecommendation | 186 | Markdown 格式化推荐结果 |

---

## 三、路线规划 (`src/services/routePlanner.ts` — 176行, `routeOptimizer.ts` — 226行)

| 功能 | 函数 | 文件:行号 | 说明 |
|------|------|-----------|------|
| 地名→坐标 | geocodePlace | routePlanner.ts:28 | AMap.Geocoder 插件 |
| 驾车路线规划 | planDrivingRoute | routePlanner.ts:52 | AMap.Driving, 多途经点 |
| 步行路线规划 | planWalkingRoute | routePlanner.ts:102 | AMap.Walking, 两点间 |
| 攻略文本→站点提取 | extractStopsFromPlan | routePlanner.ts:143 | 正则解析攻略中的地名 |
| TSP 路线优化 | optimizeRoute | routeOptimizer.ts:178 | 贪心最近邻 + 2-opt 局部优化 |
| 优化后距离计算 | getOptimizedRouteDistance | routeOptimizer.ts:219 | Haversine 公式 |

---

## 四、AI 服务层 (`src/services/deepseek.ts` — 274行)

| 功能 | 函数 | 行号 | 说明 |
|------|------|:---:|------|
| DeepSeek 单次调用 | callDeepSeek | 30 | JSON/文本模式, 120s 超时 |
| DeepSeek 流式调用 | streamDeepSeek | 62 | SSE 流式, onChunk/onDone 回调 |
| AI 生成备用 POI | generateFallbackPOIs | 173 | 高德为空时 AI 生成虚拟地点 |
| AI 精选 POI | refinePOIsWithAI | 222 | AI 从大候选池中筛选优质地点 |

---

## 五、MCP 数据源服务 (`src/mcp-services/`)

### 5.1 天气服务 (`weatherService.ts` — 114行)

| 功能 | 函数 | 行号 | 说明 |
|------|------|:---:|------|
| 天气预报 | fetchWeatherForecast | 33 | 高德天气 API v3/weather/weatherInfo, adcode 自动解析 |

### 5.2 旅行内容聚合 (`travelContentService.ts` — 164行)

| 功能 | 函数 | 行号 | 说明 |
|------|------|:---:|------|
| 旅行笔记搜索 | fetchTravelNotes | 35 | DuckDuckGo + Wikipedia 聚合 |
| 综合旅行内容 | fetchTravelContent | 150 | 笔记+百科+知识图谱 |

### 5.3 全球搜索 (`searchService.ts` — 293行)

| 功能 | 函数 | 行号 | 说明 |
|------|------|:---:|------|
| 全球地名搜索 | searchGlobal | 240 | Photon→Nominatim→高德 三级降级 |

---

## 六、前端组件层 (`src/components/`)

### 6.1 核心页面

| 组件 | 文件 | 行数 | 功能 |
|------|------|:---:|------|
| 应用入口 | App.tsx | 182 | 路由调度, 定位, 城市选择 |
| 城市探索器 | CityExplorer.tsx | 745 | POI 三轮搜索, 标签筛选, 区县下钻 |
| 攻略面板 | PlanPanel.tsx | 590 | AI 攻略生成, 天气注入, 流式输出 |
| 路线可视化 | RouteVisualizer.tsx | 782 | 地图路线绘制, TSP 优化, 驾车/步行模式 |

### 6.2 功能组件

| 组件 | 文件 | 行数 | 功能 |
|------|------|:---:|------|
| 地点详情 | SpotDetail.tsx | 243 | 评分/照片/营业时间/打卡 |
| 中国地图 | ChinaMap.tsx | 119 | SVG 中国地图, 城市选择 |
| 打卡日记 | CheckinDiary.tsx | 185 | 打卡记录列表, 照片上传 |
| 标签管理 | TagManagerModal.tsx | 177 | 兴趣标签选择/管理 |
| 个人中心 | ProfilePanel.tsx | 177 | 用户信息, 解锁城市, 统计 |
| 照片画廊 | PhotoGalleryOverlay.tsx | — | 全屏照片浏览 |
| AI 旅行日志 | AiJournalModal.tsx | 82 | AI 生成游记 |
| 发现卡片 | DiscoverCard.tsx | — | 首页推荐卡片 |
| 加载动画 | LoadingOverlay.tsx | — | 全屏加载遮罩 |
| 底部导航 | BottomNav.tsx | — | 底部 Tab 栏 |
| 顶部头部 | Header.tsx | — | 顶栏 (定位/搜索) |

### 6.3 Hooks

| Hook | 文件 | 行号 | 功能 |
|------|------|:---:|------|
| 地理定位 | useGeolocation.ts | 15 | 浏览器 GPS → reverseGeocode → 城市名 |
| 地图初始化 | useAmap.ts | 5 | 地图实例创建, Marker 管理, InfoWindow |
| 用户层级 | useUserTier.ts | 5 | 基础版/高级版功能控制 |

---

## 七、CityExplorer 搜索管线详解

```
用户选择标签 → doTagSearch (CityExplorer.tsx L313)
  │
  ├── 轮1: 精准分类搜索 (type+keyword, around)     L330
  ├── 轮2: 纯关键词搜索 (keyword only, around)      L338
  └── 轮3: 全城文本搜索 (cityName+keyword, text)    L347
  │
  ├── 三轮合并去重 (精准>关键词>全城)                L364
  └── setSpots(limitedSpots)                        L375
```

```
初始进入城市 → fetchCitySpots (CityExplorer.tsx L219)
  │
  ├── 泛搜索 (无 keyword) → 7 维度并发探针           amap.ts L382
  │   └── Top-80 截断 → 推荐引擎 rankAndSegment
  │
  └── 用户搜索 (有 keyword) → searchPOI              amap.ts L359
      └── 双引擎: JS API → REST 降级
```

---

## 八、PlanPanel 攻略生成管线详解

```
用户点击「生成攻略」→ handleGeneratePlan (PlanPanel.tsx L147)
  │
  ├── Step 1: fetchWeatherForecast (天气 MCP)          L158
  ├── Step 2: fetchRoutePOIPool (独立 POI 大池)        L168
  ├── Step 3: rankAndSegment (推荐引擎评分排序)         L200
  ├── Step 4: fetchTravelContent (旅行内容 MCP)        L230
  ├── Step 5: streamDeepSeek (AI 流式生成攻略)         L276
  └── Step 6: RouteVisualizer (路线可视化)             L570
```

---

## 九、评测系统 (`tests/`)

| 文件 | 行数 | 功能 |
|------|:---:|------|
| build_test_dataset.py | 430 | 5源×5城市测试集构建 (around+text 双阶段) |
| enhance_gt_with_ai.py | 300 | DeepSeek 生成专家级 GT + AI 清洗 |
| eval_travel_planner.py | 500 | 5 维度评估 (覆盖率/准确率/场景/多样性/距离) |
| eval_travel_planner_v2.py | 250 | V2 评估: POI 池扩展 + Baseline/Enhanced 对比 |
| test_recommend_engine.py | 330 | 推荐引擎单元测试 |
| test_cat_cafe_search.py | 300 | 猫咖 POI 搜索专项测试 |
| datasets/ | — | 5 个城市 JSON + 打包集 V4 (2354 POI, 345 GT) |

---

## 十、配置与类型定义

| 文件 | 行号 | 关键导出 | 说明 |
|------|:---:|----------|------|
| constants.ts | 18 | CONSTANTS | SCENE_RULES(45条), SORT_WEIGHTS, SEARCH_RADIUS, POI_TAG_TYPE_MAP, RECOMMEND_TOP_K(40), SEARCH_DIMENSIONS |
| cities.ts | 3 | CHINA_CITIES | 城市元数据 (坐标/标签/描述) |
| types/index.ts | — | Spot, CityInfo | 全局类型定义 |
| monetIcons.ts | 25 | monetIcons | 莫奈风格图标路径映射 |
| monetAssets.ts | 6 | monetAssets | 莫奈风格背景/纹理资源 |

---

## 十一、API 密钥位置

| 密钥 | 位置 | 用途 |
|------|------|------|
| 高德 Web 服务 Key | amap.ts:15 + weatherService.ts:11 | POI/天气/地理编码 |
| 高德 JS API Key | amapLoader.ts | 地图渲染/JS 插件 |
| DeepSeek API Key | deepseek.ts:12 | AI 攻略生成 |

---

## 十二、数据流总览

```
[用户定位]
  │ useGeolocation → reverseGeocode
  ▼
[城市识别] → CityExplorer
  │
  ├── 泛搜索 ──→ 7维度并发池 ──→ Top-80
  ├── 标签搜索 ─→ 3轮搜索合并 ─→ Top-K=40
  └── 用户搜索 ─→ searchPOI ───→ 全量返回
  │
  ▼
[推荐引擎] inferScene → computeScore → rankAndSegment
  │
  ▼
[前端展示] SpotDetail / DiscoverCard
  │
  ├──「生成攻略」
  │   ├── 天气 MCP (高德天气)
  │   ├── 旅行内容 MCP (DuckDuckGo+Wiki)
  │   ├── POI 独立大池 (searchPOIPaginated)
  │   └── streamDeepSeek → 流式攻略输出
  │
  └──「查看路线」
      ├── extractStopsFromPlan (文本→站点)
      ├── geocodePlace (站点→坐标)
      ├── optimizeRoute (TSP 优化)
      └── planDrivingRoute / planWalkingRoute (高德导航)
```
