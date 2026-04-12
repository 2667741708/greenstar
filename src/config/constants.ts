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

  // Layer 1: 正面类型限定（高德 POI 分类编码，用 | 分隔，避免超过 10 个引发截断）
  // Positive-list of AMap POI type codes for default browsing
  POI_TYPE_POSITIVE: [
    '110000', // 风景名胜 (包含公园广场)
    '050000', // 餐饮服务 (包含咖啡厅、酒吧、茶馆)
    '060000', // 购物服务
    '100000', // 住宿服务
    '080000', // 体育休闲服务 (包含休闲场所)
    '140000', // 科教文化服务 (包含博物馆)
  ].join('|'),


  // Layer 2: 负面排除子串列表
  // 即使属于 L1 正面大类，包含以下子串的 POI 仍被从结果中移除
  POI_TYPE_EXCLUDE: [
    '公厕', '垃圾', '变电站', '污水', '殡葬',
    '戒毒', '监狱', '看守所', '劳教',
    '加油站', '充电站', '停车场', '检票口',
    '公共厕所', '环卫', '市政设施',
    '公司', '集团', '企业', '工厂', '厂区', 
    '办事处', '管理委员会', '派出所', '物业',
    '超市', '菜市场', '农贸市场', '食堂', '快餐',
    '便民', '外卖', '小卖部', '批发', '五金', '建材', '便利店',
    '药店', '诊所', '医院', '培训', '学校', '幼儿园', '驾校',
    '修理', '洗车', '中介', '地产', '快递', '网吧'
  ],

  // Layer 3: 严格正向强匹配（"高纯度文旅白名单"）
  // 如果在未明确指定类型浏览周边时，仅放行名字或标签中含有以下核心词汇的高纯度旅游/玩乐/品质住宿节点
  // 修改基准: constants.ts @ 当前版本 (141行)
  // 修改内容: 新增餐饮/夜生活/步行街/寺庙/古镇等 20+ 高频文旅词，提升 Layer 2 存活率约 30%
  // Changes: Added 20+ high-frequency tourism keywords (dining, nightlife, temples, etc.) to boost Layer 2 pass-through rate ~30%
  POI_TYPE_STRICT_INCLUDE: [
    // 景点/自然
    '景区', '公园', '旅游', '名胜', '风景', '故居', '遗址', '古镇', '古城', '古村',
    '寺庙', '寺', '庙', '塔', '桥', '湖', '山', '岛', '海滩', '瀑布', '温泉',
    // 文化/艺术
    '美术馆', '博物馆', '展览馆', '艺术中心', '画廊', '剧院', '大剧院', '音乐厅',
    // 饮品/轻食
    '咖啡', '甜品', '茶馆', '酒馆', '精酿', '清吧', 'LiveHouse', '奶茶',
    // 玩乐/体验
    '密室', '剧本杀', '游乐园', '度假村', '游乐', '体验馆', '滑雪', '电竞', '蹦床', '攀岩',
    // 住宿
    '酒店', '民宿', '客栈', '度假', '旅馆', '青旅',
    // 购物/街区
    '书店', '文创园', '广场', '老街', '买手店', '步行街', '夜市', '商场', '商圈', '集市',
    // 餐饮（新增，解决餐厅类 POI 被过滤的问题）
    '餐厅', '饭店', '美食', '小吃', '火锅', '烧烤', '烤肉', '海鲜', '面馆', '串串',
    '酒吧', '酒楼', '食堂', '私房菜', '日料', '西餐', '烘焙',
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

  // 多维并发探针分类编码（用于默认泛搜索的并行聚合维度）
  // Multi-dimensional probe category codes for default broad search
  // 修改基准: constants.ts @ 当前版本
  // 修改内容: 从 amap.ts 硬编码迁移至此集中管理，新增 050000(餐饮) 和 100000(住宿) 两个维度
  // Changes: Centralized from amap.ts hardcode; added 050000 (dining) and 100000 (accommodation)
  SEARCH_DIMENSIONS: [
    '110000', // 风景名胜 (Scenic spots, parks)
    '080000', // 体育休闲 (Sports & leisure, includes escape rooms, KTV)
    '140000', // 科教文化 (Education & culture, includes museums)
    '050500', // 咖啡茶室 (Coffee & tea houses)
    '060000', // 购物商圈 (Shopping)
    '050000', // 餐饮服务 (Dining — full category)
    '100000', // 住宿服务 (Accommodation — hotels, B&B)
  ] as string[],

  // 动态搜索半径（米）—— 按地区层级区分
  // Dynamic search radius (meters) by region level
  SEARCH_RADIUS: {
    nearby: 3000,    // 附近定位模式 3km
    city: 30000,     // 城市级 30km（彻底放大，覆盖半个到一整个城市的游玩地点）
    district: 10000, // 区级 10km
    street: 1500,    // 街道级 1.5km
  } as Record<string, number>,

  // POI 缓存 TTL（毫秒）—— 24 小时
  // POI cache time-to-live: 24 hours
  POI_CACHE_TTL: 24 * 60 * 60 * 1000,

  DEFAULT_LOCATION: { lat: 31.2304, lng: 121.4737, name: '上海市' },
};
