// ============================================================================
// 文件: src/config/constants.ts
// 基准版本: constants.ts @ 650ddca (19行, 单一 POI_TYPE_STRING)
// 修改内容 / Changes:
//   [重构] POI 类型过滤策略：单一正面列表 → 三层体系
//     Layer 1: POI_TYPE_POSITIVE — 正面类型限定（默认浏览）
//     Layer 2: POI_TYPE_EXCLUDE — 负面排除（结果后过滤）
//     Layer 3: 用户主动搜索时绕过 L1 & L2，透传全分类
//   [新增] POI_TAG_TYPE_MAP — 兴趣标签 → 高德分类编码映射
//   [新增] POI_CACHE_TTL — IndexedDB 缓存 TTL
//   [调整] SEARCH_RADIUS — 增加 nearby 模式，city 从 5km 扩至 10km
//   [REFACTOR] POI type filter: single list → 3-layer system
//   [NEW] POI_TAG_TYPE_MAP for tag → AMap category code mapping
//   [NEW] POI_CACHE_TTL for IndexedDB cache
//   [ADJUST] SEARCH_RADIUS: add nearby, expand city to 10km
// ============================================================================

export const CONSTANTS = {
  MAP: {
    CHINA_CENTER: [105.0000, 35.0000] as [number, number],
    CHINA_ZOOM: 5,
    CITY_ZOOM: 12,
    DISTRICT_ZOOM: 14,
    STREET_ZOOM: 16,
    STYLE_PRO: 'amap://styles/darkblue',
    STYLE_NORMAL: 'amap://styles/whitesmoke',
  },

  // ============================================================
  // POI 三层过滤体系
  // Three-layer POI filtering system
  //
  // Layer 1: POI_TYPE_POSITIVE — 默认浏览模式使用的正面分类列表
  //          Default browsing uses this positive-list filter
  // Layer 2: POI_TYPE_EXCLUDE — 从 L1 结果中排除的低质量子类型
  //          Post-filter to remove low-quality sub-types
  // Layer 3: 用户手动搜索时绕过 L1 & L2，直接透传高德全分类
  //          User explicit search bypasses both layers
  // ============================================================

  // Layer 1: 正面类型限定（高德 POI 分类名称，用 | 分隔）
  // Positive-list of AMap POI type names for default browsing
  POI_TYPE_POSITIVE: [
    '风景名胜',       // 110000
    '餐饮服务',       // 050000
    '购物服务',       // 060000
    '住宿服务',       // 100000
    '体育休闲服务',   // 080000
    '公园广场',       // 110100
    '博物馆',         // 140100
    '咖啡厅',         // 050500
    '酒吧',           // 050600
    '休闲场所',       // 080300
    '生活服务',       // 070000
    '科教文化服务',   // 140000
    '医疗保健服务',   // 090000 — 旅行者常需就近药店/诊所
  ].join('|'),

  // Layer 2: 负面排除子串列表
  // 即使属于 L1 正面大类，包含以下子串的 POI 仍被从结果中移除
  // Sub-strings to exclude from results even if they match L1
  POI_TYPE_EXCLUDE: [
    '公厕', '垃圾', '变电站', '污水', '殡葬',
    '戒毒', '监狱', '看守所', '劳教',
    '加油站', '充电站', '停车场',
    '公共厕所', '环卫', '市政设施',
  ],

  // 兴趣标签 → 高德 POI 分类编码精准映射
  // 标签搜索时优先使用编码进行精准检索，回退到文本搜索
  // Tag → AMap category code mapping for precise tag-based search
  POI_TAG_TYPE_MAP: {
    '精品酒店': '100100',
    '特色民宿': '100102',
    '青年旅舍': '100104',
    '猫咖': '050500',
    '狗咖': '050500',
    '电竞网咖': '080300',
    '咖啡馆': '050500',
    '甜品烘焙': '050400',
    '特色小吃': '050300',
    '精酿啤酒': '050600',
    '茶馆': '050700',
    '奶茶': '050500',
    '公园': '110101',
    '博物馆': '140100',
    '独立书店': '140400',
    '画廊美术馆': '140300',
    '购物中心': '060100',
    '潮牌买手店': '060400',
    '美妆集合店': '060400',
    '复古中古店': '060400',
    '伴手礼': '060400',
    '网红拍照': '110200',
    '夜景机位': '110200',
    '古镇老街': '110200',
    '酒吧': '050600',
    'LiveHouse': '080300',
    'KTV': '080302',
    '密室逃脱': '080300',
    '剧本杀': '080300',
    '台球馆': '080100',
    '露营地': '110102',
    '骑行路线': '080100',
    '攀岩蹦床': '080100',
    '赏花打卡': '110200',
    '文艺影院': '140200',
    '文创园区': '140000',
    '漫展': '140000',
    '手办模型店': '060400',
    '游戏厅': '080300',
    '玩具店': '060400',
    '盲盒': '060400',
  } as Record<string, string>,

  // 动态搜索半径（米）—— 按地区层级区分
  // Dynamic search radius (meters) by region level
  SEARCH_RADIUS: {
    nearby: 3000,    // 附近定位模式 3km
    city: 10000,     // 城市级 10km（原 5km 过窄，扩展覆盖面）
    district: 5000,  // 区级 5km
    street: 1500,    // 街道级 1.5km
  } as Record<string, number>,

  // POI 缓存 TTL（毫秒）—— 24 小时
  // POI cache time-to-live: 24 hours
  POI_CACHE_TTL: 24 * 60 * 60 * 1000,

  DEFAULT_LOCATION: { lat: 31.2304, lng: 121.4737, name: '上海市' },
};
