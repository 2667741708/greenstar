// ============================================================================
// 文件: src/components/CityExplorer.tsx
// 基准版本: CityExplorer.tsx @ 650ddca (592行)
// 修改内容 / Changes:
//   [改造] fetchCitySpots 增加 options 参数，支持 isUserSearch 透传
//   [改造] doTagSearch 使用 POI_TAG_TYPE_MAP 精准编码 + 动态半径
//   [改造] handleSearch 标记 isUserSearch: true (绕过三层过滤)
//   [移除] batchFetchPOIImages 调用（图片已在 amap.ts 层兜底静态图）
//   [新增] clearCityCache 导入，用于手动刷新缓存
//   [MODIFY] fetchCitySpots with options for isUserSearch bypass
//   [MODIFY] doTagSearch with POI_TAG_TYPE_MAP + dynamic radius
//   [MODIFY] handleSearch marks isUserSearch: true
//   [REMOVE] batchFetchPOIImages calls (images now handled in amap.ts)
//   [NEW] clearCityCache import for manual cache refresh
// ============================================================================
import React, { useState, useEffect } from 'react';
import { Spot, CityInfo, RegionNode } from '../types';
import { searchPOI, getSubDistricts, SearchPOIOptions } from '../services/amap';
import { fetchRealWorldData } from '../services/crawler';
import { generateFallbackPOIs, refinePOIsWithAI } from '../services/deepseek';
import { batchFetchPOIImages } from '../services/imageCrawler';
import { useAmap } from '../hooks/useAmap';
import { CONSTANTS } from '../config/constants';
import { clearCityCache, prefetchHDImages } from '../services/poiCache';
import { SpotDetail } from './SpotDetail';
import { DiscoverCard } from './DiscoverCard';
import { PhotoGalleryOverlay } from './explore/PhotoGalleryOverlay';
import { AiJournalModal } from './explore/AiJournalModal';
import { useUserTier } from '../hooks/useUserTier';
import { TagManagerModal, TagGroup } from './TagManagerModal';
import { monetIcons } from '../config/monetIcons';


const DEFAULT_TAG_GROUPS: TagGroup[] = [
  { label: '住宿', icon: 'bi-house-heart', tags: ['精品酒店', '特色民宿', '青年旅舍', '度假村', '五星酒店', '艺术设计酒店', '四合院/老洋房住宿'] },
  { label: '玩乐', icon: 'bi-controller', tags: ['猫咖', '狗咖', '剧本杀', '密室逃脱', 'KTV', '脱口秀剧场', '实景沉浸式剧场', '洗浴中心', '按摩SPA'] },
  { label: '文艺', icon: 'bi-book', tags: ['独立书店', '画廊美术馆', '博物馆', 'LiveHouse', '文创园', '艺术展览', '老建筑', '音乐厅', '话剧场'] },
  { label: '逛街', icon: 'bi-bag', tags: ['买手店', '中古店', '伴手礼', '综合商场', '夜市', '步行街', '潮流集合店', '古玩市场', '老字号特产'] },
  { label: '小食', icon: 'bi-egg-fried', tags: ['特色小吃', '甜品烘焙', '面馆', '老字号小吃', '苍蝇馆子', '街边摊', '深夜食堂', '烤肉串串'] },
  { label: '饮品', icon: 'bi-cup-hot', tags: ['精品咖啡', '特调茶饮', '精酿啤酒', '静音酒吧', '清吧', '隐藏式酒吧(Speakeasy)', '老茶馆'] },
  { label: '大餐', icon: 'bi-gem', tags: ['黑珍珠餐厅', '米其林推荐', '地方特色正餐', '高级日料', '海鲜餐厅', '私房菜', '全景餐厅', '地道火锅'] },
  { label: '户外', icon: 'bi-tree', tags: ['绿道骑行', '城市徒步', '攀岩', '冲浪', '蹦床', '露营地', '赏花打卡', '市级公园', '郊野公园', '游乐园'] },
  { label: '打卡', icon: 'bi-camera', tags: ['拍照机位', '夜景', '古镇老街', '小众祈福寺庙', '观景台', '地标广场', '玻璃栈道', '历史文化名街'] },
];

interface CityExplorerProps {
  city: CityInfo;
  isPro: boolean;
  onBack: () => void;
  setLoading: (loading: boolean) => void;
  setLoadingStep: (step: string) => void;
  setErrorMsg: (msg: string | null) => void;
  updateCityUnlockedStatus: (cityId: string) => void;
  onSpotsUpdate?: (spots: Spot[]) => void;  // 向上上报 spots 供 PlanPanel 使用
  onKeywordsUpdate?: (keywords: string[]) => void; // 向上上报 keywords 供 PlanPanel 使用
}

export const CityExplorer: React.FC<CityExplorerProps> = ({ 
  city, isPro, onBack, setLoading, setLoadingStep, setErrorMsg, updateCityUnlockedStatus, onSpotsUpdate, onKeywordsUpdate 
}) => {
  const { tier } = useUserTier();
  const maxTagsDisplay = tier === 'plus' ? 20 : tier === 'pro' ? 30 : Infinity;
  const maxSpotsDisplay = tier === 'plus' ? 50 : tier === 'pro' ? 100 : 150;

  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [keyword, setKeyword] = useState('');
  
  // 栈式下钻探索状态
  const [explorationStack, setExplorationStack] = useState<RegionNode[]>([]);
  const [subRegions, setSubRegions] = useState<any[]>([]);

  // 主题关键词（3D 标签状态）
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [customKwInput, setCustomKwInput] = useState('');
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [showAiJournal, setShowAiJournal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // 动态标签组管理
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>(() => {
    try {
      const saved = localStorage.getItem('greenstar_tag_groups_v2');
      return saved ? JSON.parse(saved) : DEFAULT_TAG_GROUPS;
    } catch {
      return DEFAULT_TAG_GROUPS;
    }
  });

  const handleSaveTags = (newGroups: TagGroup[]) => {
    setTagGroups(newGroups);
    localStorage.setItem('greenstar_tag_groups_v2', JSON.stringify(newGroups));
    setIsEditingTags(false);
  };
  
  const handleResetTags = () => {
    setTagGroups(DEFAULT_TAG_GROUPS);
    localStorage.removeItem('greenstar_tag_groups_v2');
    setIsEditingTags(false);
  };

  // 根据当前版本限制，计算可见的标签组与标签
  const visibleTagGroups = React.useMemo(() => {
    let count = 0;
    return tagGroups.map(g => {
      if (count >= maxTagsDisplay) return { ...g, tags: [] };
      const available = maxTagsDisplay - count;
      const visibleTags = g.tags.slice(0, available);
      count += visibleTags.length;
      return { ...g, tags: visibleTags };
    }).filter(g => g.tags.length > 0);
  }, [tagGroups, maxTagsDisplay]);

  // 所有标签平铺列表（用于兼容旧逻辑）
  const PREDEFINED_KEYWORDS = tagGroups.flatMap(g => g.tags);

  // 根据当前全局获取的 spots 动态计算各预设关键词被匹配到的词频
  const tagCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    PREDEFINED_KEYWORDS.forEach(kw => { counts[kw] = 0; }); // 初始化

    spots.forEach(spot => {
      const searchStr = `${spot.name} ${spot.description} ${spot.category} ${(spot.tags||[]).join(' ')}`.toLowerCase();
      PREDEFINED_KEYWORDS.forEach(kw => {
        if (searchStr.includes(kw.toLowerCase())) {
          counts[kw]++;
        }
      });
    });
    return counts;
  }, [spots, PREDEFINED_KEYWORDS]);

  // 同步 spots 与 keywords 到父组件供 PlanPanel 使用
  useEffect(() => {
    onSpotsUpdate?.(spots);
  }, [spots]);

  useEffect(() => {
    onKeywordsUpdate?.(selectedKeywords);
  }, [selectedKeywords]);

  const toggleKeyword = (kw: string) => {
    setSelectedKeywords(prev => 
      prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]
    );
  };

  const handleAddCustomKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    const val = customKwInput.trim();
    if (!val) return;
    
    // 如果还没存过，加到候选池
    if (!customKeywords.includes(val) && !PREDEFINED_KEYWORDS.includes(val)) {
      setCustomKeywords(prev => [...prev, val]);
    }
    // 并自动选中
    if (!selectedKeywords.includes(val)) {
      setSelectedKeywords(prev => [...prev, val]);
    }
    setCustomKwInput('');
  };

  // 栈顶 = 当前层级
  const currentRegion: RegionNode = explorationStack.length > 0
    ? explorationStack[explorationStack.length - 1]
    : { name: city.name, adcode: '', level: 'city', center: city.coordinates };

  // 根据层级动态计算 zoom
  const zoomForLevel = (level: string): number => {
    switch (level) {
      case 'district': return CONSTANTS.MAP.DISTRICT_ZOOM;
      case 'street': return CONSTANTS.MAP.STREET_ZOOM;
      default: return CONSTANTS.MAP.CITY_ZOOM;
    }
  };

  useAmap(
    'city-map-container',
    currentRegion.center,
    zoomForLevel(currentRegion.level),
    isPro,
    spots,
    [],
    selectedSpot,
    setSelectedSpot
  );

  const fetchCitySpots = async (
    searchKw: string = '',
    center: {lat: number, lng: number},
    name: string,
    searchOptions: SearchPOIOptions = {}
  ) => {
    setLoading(true);
    setLoadingStep(`正在检索 ${name} 的地理星图...`);
    try {
      // 动态半径：根据当前区域层级自动计算
      // Dynamic radius based on current region level
      const radius = CONSTANTS.SEARCH_RADIUS[currentRegion.level] || CONSTANTS.SEARCH_RADIUS.city;

      // 第一引擎：高德并发实体拉取（执行了聚合、洗牌与排序）
      let result = await searchPOI(name, searchKw, center, { radius, ...searchOptions });
      
      // 第二引擎：智能大模型中间件提取与描述增强 (或者 Zero-shot降级)
      if (!searchKw && !searchOptions.type) {
        // [探索模式] 
        if (result.length > 5) {
          setLoadingStep(`已捕获聚合地理环境，AI超级向导正在为您重审精选与提纯短评...`);
          result = await refinePOIsWithAI(result, name);
        } else {
          setLoadingStep(`海外或无数据区检测命中！启动大模型世界常识池，为您无中生有构造权威名胜...`);
          result = await generateFallbackPOIs(name, center);
        }
      } else {
        // [用户分类或搜索模式]
        if (result.length === 0) {
           // 当特定标签未查询出结果时，可考虑兜底处理
           result = [];
        }
      }
      
      // 图片分级策略：Pro 用户升级为 standard 图（600px），普通用户保持 thumb（200px）
      // Tiered image: Pro gets standard (600px), normal user keeps thumb (200px)
      if (isPro) {
        result = result.map(s => {
          let upgradedUrl = s.imageUrlHD || s.imageUrl || '';
          // 仅当 URL 是阿里云 OSS 或高德原生图床时，才注入 OSS 处理参数
          if (upgradedUrl.includes('autonavi.com') && !upgradedUrl.includes('webrd') && !upgradedUrl.includes('staticmap')) {
            upgradedUrl = upgradedUrl.split('?')[0] + '?x-oss-process=image/resize,w_600/quality,q_85';
          }
          return { ...s, imageUrl: upgradedUrl };
        });
      }

      setSpots(result);

      // 实验需求：暂时屏蔽维基等外网爬虫，严格检验高德原图覆盖率
      /*
      if (result.length > 0) {
        batchFetchPOIImages(result, name)
          .then(images => {
            setSpots(prev => prev.map((s, i) => {
              const newImg = images[i];
              return newImg ? { ...s, imageUrl: newImg, imageUrlHD: newImg, imageUrlThumb: newImg } : s;
            }));
          })
          .catch(err => console.error('[HD Fetch Error]', err));
      }
      */

      // Pro 用户：后台静默预取 HD 原图到 IndexedDB
      // Pro user: silently prefetch HD images to IndexedDB in background
      if (isPro && result.length > 0) {
        prefetchHDImages(result).catch(e => console.warn('[HD Prefetch] Error:', e));
      }
    } catch (err: any) {
      // 高德崩溃时尝试 RAG 兜底
      setLoadingStep(`检索异常，正在启动备用智能引擎...`);
      try {
        const realWorldText = await fetchRealWorldData(name, searchKw);
        const fallback = await generateFallbackPOIs(name, realWorldText, center);
        if (fallback.length > 0) {
          setSpots(fallback);
          // 实验需求：暂时屏蔽爬虫
          /*
          batchFetchPOIImages(fallback, name).then(images => {
            setSpots(prev => prev.map((s, i) => {
              const newImg = images[i];
              return newImg ? { ...s, imageUrl: newImg, imageUrlHD: newImg, imageUrlThumb: newImg } : s;
            }));
          }).catch(console.error);
          */
        } else {
          setErrorMsg(`检索失败: ${err.message}`);
        }
      } catch (ragErr: any) {
        setErrorMsg(`双引擎均失败: ${err.message} / ${ragErr.message}`);
      }
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const loadSubRegions = async (name: string, level: string) => {
    try {
      const regions = await getSubDistricts(name, level);
      setSubRegions(regions.filter((r: any) => r.center)); // 过滤掉没有坐标的
    } catch (e) {
      console.error(e);
      setSubRegions([]);
    }
  };

  useEffect(() => {
    setExplorationStack([]);
    fetchCitySpots('', city.coordinates, city.name);
    loadSubRegions(city.name, 'city');
    updateCityUnlockedStatus(city.id);
  }, [city.id]);

  // 当选中标签变化时，用标签精准分类编码搜索 POI
  // When selected tags change, search POI using precise AMap category codes
  useEffect(() => {
    if (selectedKeywords.length === 0) {
      // 没有选中标签时，恢复默认全品类搜索
      fetchCitySpots('', currentRegion.center, currentRegion.name);
      return;
    }
    const doTagSearch = async () => {
      setLoading(true);
      setLoadingStep(`正在按兴趣标签搜索...`);
      try {
        const keywords = selectedKeywords.map(kw => kw.replace(/^[^\u4e00-\u9fa5A-Za-z]+/, '').trim());
        const radius = CONSTANTS.SEARCH_RADIUS[currentRegion.level] || CONSTANTS.SEARCH_RADIUS.city;

        // 标签 → 高德分类编码映射，提升搜索精准度
        // Tag → AMap category code mapping for precision
        //
        // 修改基准: CityExplorer.tsx @ 当前版本 (705行)
        // 修改内容: 新增第二轮纯关键词搜索(不限 type), 解决高德分类注册错误导致的漏检
        //   例: 法云寺"梵猫苑猫咖"注册为"餐饮相关场所"而非"咖啡厅(050500)", 第一轮 type+keyword 联合搜索漏掉
        // Changes: Added 2nd round keyword-only search (no type filter) to catch POIs with wrong category registration
        //   e.g.: "梵猫苑猫咖" registered as "餐饮相关" instead of "咖啡厅(050500)", missed by type+keyword joint search

        // 第一轮: 精准分类搜索 (type + keyword)
        const precisePromises = keywords.map(kw => {
          const typeCode = CONSTANTS.POI_TAG_TYPE_MAP[kw] || '';
          return searchPOI(currentRegion.name, kw, currentRegion.center, {
            type: typeCode,
            radius,
          }).catch(() => [] as Spot[]);
        });

        // 第二轮: 纯关键词搜索 (不限 type, 捕获分类注册不准确但名称匹配的 POI)
        const fallbackPromises = keywords.map(kw =>
          searchPOI(currentRegion.name, kw, currentRegion.center, {
            type: '',
            radius,
            isUserSearch: true, // 绕过三层过滤, 由后续合并去重时统一处理
          }).catch(() => [] as Spot[])
        );

        const [preciseResults, fallbackResults] = await Promise.all([
          Promise.all(precisePromises),
          Promise.all(fallbackPromises),
        ]);

        // 合并去重（按 id, 精准搜索结果优先）
        const merged = new Map<string, Spot>();
        preciseResults.flat().forEach(s => { if (!merged.has(s.id)) merged.set(s.id, s); });
        fallbackResults.flat().forEach(s => { if (!merged.has(s.id)) merged.set(s.id, s); });
        const finalSpots = Array.from(merged.values());
        
        // 应用版本对应的地点数量限制
        const limitedSpots = finalSpots.slice(0, maxSpotsDisplay);
        setSpots(limitedSpots);
        
        // 实验需求：暂时屏蔽爬虫
        /*
        if (limitedSpots.length > 0) {
          batchFetchPOIImages(limitedSpots, currentRegion.name)
            .then(images => {
              setSpots(prev => prev.map((s, i) => {
                const newImg = images[i];
                return newImg ? { ...s, imageUrl: newImg, imageUrlHD: newImg, imageUrlThumb: newImg } : s;
              }));
            })
            .catch(console.error);
        }
        */
      } catch (err) {
        console.error('[TagSearch] failed:', err);
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    };
    doTagSearch();
  }, [selectedKeywords, currentRegion.name]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 用户主动搜索：绕过三层过滤，透传高德全分类
    // User explicit search: bypass 3-layer filter, pass-through all categories
    fetchCitySpots(keyword, currentRegion.center, currentRegion.name, { isUserSearch: true });
  };

  const handleRegionClick = (region: any) => {
    const newNode: RegionNode = {
      name: region.name,
      adcode: region.adcode,
      level: region.level,
      center: { lat: region.center.lat, lng: region.center.lng }
    };
    setExplorationStack(prev => [...prev, newNode]);
    setKeyword('');
    fetchCitySpots('', newNode.center, newNode.name);
    loadSubRegions(newNode.name, newNode.level);
  };

  const handleBreadcrumbClick = (index: number) => {
    setKeyword('');
    if (index < 0) {
      setExplorationStack([]);
      fetchCitySpots('', city.coordinates, city.name);
      loadSubRegions(city.name, 'city');
    } else {
      const target = explorationStack[index];
      setExplorationStack(prev => prev.slice(0, index + 1));
      fetchCitySpots('', target.center, target.name);
      loadSubRegions(target.name, target.level);
    }
  };

  const handleCheckIn = (spot: Spot, photoUrls?: string[]) => {
    setLoading(true);
    setLoadingStep('正在连接空间记录网络...');
    
    // Simulate checkin delay for local save
    setTimeout(() => {
      const now = new Date();
      const timestamp = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + 
                        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                        
      setSpots(prev => prev.map(s => {
        if (s.id === spot.id) {
          const newPhotos = [...(s.photos || [])];
          if (photoUrls) newPhotos.push(...photoUrls);
          return { ...s, checkedIn: true, photos: newPhotos, checkInTimestamp: timestamp };
        }
        return s;
      }));
      
      setSelectedSpot(prev => {
        if (prev?.id === spot.id) {
          const newPhotos = [...(prev.photos || [])];
          if (photoUrls) newPhotos.push(...photoUrls);
          return { ...prev, checkedIn: true, photos: newPhotos, checkInTimestamp: timestamp };
        }
        return prev;
      });
      
      setLoading(false);
      setLoadingStep('');
    }, 1500);
  };

  const glassClass = isPro ? 'glass-panel text-white' : 'glass-panel-light text-slate-800';

  return (
    <div className="flex flex-col h-full stagger-in relative">
      {/* 氛围包裹点睛层 (Ambient Blurs) */}
      <div className="ambient-glow top-[-10%] right-[-10%]"></div>
      {isPro && <div className="ambient-glow bottom-[-10%] left-[-10%]" style={{ background: 'radial-gradient(circle, var(--color-accent-pink) 0%, transparent 70%)'}}></div>}
      {selectedSpot && (
        <SpotDetail 
          spot={selectedSpot} 
          onClose={() => setSelectedSpot(null)} 
          onCheckIn={handleCheckIn} 
          isPro={isPro} 
        />
      )}

      <div className="px-6 mt-6 relative z-30">
        <div className="glass-panel p-3 pl-6 flex items-center gap-4 group transition-all">
          <button onClick={() => {
            if (explorationStack.length > 0) {
              handleBreadcrumbClick(explorationStack.length - 2);
            } else {
              onBack();
            }
          }} className="w-10 h-10 rounded-2xl bg-white/40 flex items-center justify-center hover:bg-white/80 transition-all shadow-sm shrink-0 active:scale-90 border border-white/40">
            <i className="bi bi-arrow-left text-slate-600"></i>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] text-slate-800">当前跃迁点</p>
            <p className="text-xl font-black text-slate-700 truncate">
              {currentRegion.name} 
              {currentRegion.name !== city.name && <span className="text-xs opacity-40 ml-2 font-black italic">({city.name})</span>}
            </p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2 pr-1 shrink-0">
            <input 
              type="text" 
              value={keyword} 
              onChange={e => setKeyword(e.target.value)} 
              placeholder="搜任意..." 
              className="w-32 rounded-2xl px-4 py-2.5 text-xs bg-white/40 border border-white/60 outline-none transition-all focus:bg-white/60 text-slate-800 placeholder:text-slate-400"
            />
            <button type="submit" className="w-12 h-10 monet-btn flex items-center justify-center"><i className="bi bi-search"></i></button>
          </form>
        </div>
      </div>

      {/* 分组可展开兴趣标签 */}
      <div className="px-6 mt-4 relative z-30">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm font-black opacity-60"><i className="bi bi-stars text-[var(--color-accent-pink)]"></i> 兴趣探索:</span>
          <button 
            onClick={() => setIsEditingTags(true)} 
            className="w-5 h-5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-emerald-500 flex items-center justify-center transition-colors"
            title="自定义标签库"
          >
            <i className="bi bi-gear-fill text-xs"></i>
          </button>
          {selectedKeywords.length > 0 && (
            <button onClick={() => setSelectedKeywords([])} className="text-[10px] text-red-400 hover:text-red-500 font-bold ml-auto">清空全部</button>
          )}
        </div>
        {/* 分组头部横向滚动 */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {visibleTagGroups.map(group => {
            const isExpanded = expandedGroups.includes(group.label);
            const selectedCount = group.tags.filter(t => selectedKeywords.includes(t)).length;
            return (
              <button
                key={group.label}
                onClick={() => setExpandedGroups(prev => prev.includes(group.label) ? prev.filter(g => g !== group.label) : [...prev, group.label])}
                className={`shrink-0 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-300 flex items-center gap-2 whitespace-nowrap
                  ${isExpanded
                    ? 'bg-[var(--color-accent-lilac)] text-white shadow-[0_4px_15px_rgba(168,85,247,0.3)] scale-105'
                    : selectedCount > 0 
                      ? 'bg-purple-50 text-[var(--color-accent-lilac)] ring-1 ring-[var(--color-accent-lilac)]/30'
                      : 'bg-white/60 text-slate-500 hover:bg-white border border-white hover:border-purple-200'
                  }`}
              >
                <i className={`bi ${group.icon} ${isExpanded ? '' : 'text-[var(--color-accent-lilac)]'}`}></i>
                {group.label}
                {selectedCount > 0 && !isExpanded && (
                  <span className="w-5 h-5 rounded-full bg-[var(--color-accent-lilac)] text-white text-[10px] flex items-center justify-center shadow-inner">{selectedCount}</span>
                )}
                <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} text-[10px] opacity-60 ml-1`}></i>
              </button>
            );
          })}
          {/* 自定义增加关键词表单 */}
          <form onSubmit={handleAddCustomKeyword} className={`shrink-0 flex items-center rounded-2xl pl-4 pr-1 py-1 shadow-sm border transition-all h-[38px] ${isPro ? 'bg-white/5 border-white/10 focus-within:ring-white/20' : 'bg-white/50 border-white/50 focus-within:ring-black/10'}`}>
            <input 
              value={customKwInput} 
              onChange={e => setCustomKwInput(e.target.value)} 
              placeholder="自定义..." 
              className={`bg-transparent border-none outline-none text-xs w-20 font-bold ${isPro ? 'text-white placeholder:text-white/40' : 'text-slate-800 placeholder:text-slate-400'}`}
            />
            <button 
              type="submit" 
              disabled={!customKwInput.trim()}
              className="w-7 h-7 rounded-xl bg-[var(--color-accent-lilac)] text-white shadow-[0_0_10px_var(--color-accent-lilac)] flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 disabled:shadow-none"
            >
              <i className="bi bi-plus text-sm"></i>
            </button>
          </form>
        </div>
        {/* 展开的分组标签 */}
        {visibleTagGroups.filter(g => expandedGroups.includes(g.label)).map(group => {
          // 仅过滤出当前存在实体地点的数据 (或者已经被选中过的强制保留显示以免无法取消)
          const availableTags = group.tags.filter(tag => tagCounts[tag] > 0 || selectedKeywords.includes(tag));
          if (availableTags.length === 0) return null;

          return (
            <div key={group.label} className="mt-2 pb-2 border-b border-gray-100 last:border-0">
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => {
                  const isSelected = selectedKeywords.includes(tag);
                  const count = tagCounts[tag] || 0;
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleKeyword(tag)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5
                        ${isSelected
                          ? 'bg-[var(--color-accent-pink)] text-slate-900 shadow-[0_4px_15px_rgba(245,158,11,0.3)] scale-105'
                          : 'bg-white/60 text-slate-600 hover:bg-amber-50 hover:text-[var(--color-accent-pink)] border border-white'
                        } active:scale-95`}
                    >
                      {tag} 
                      {count > 0 && (
                        <span className={`text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center ${isSelected ? 'bg-black/20 text-[var(--color-accent-pink)]' : 'bg-black/5 text-gray-400'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* 自定义标签池 */}
        {customKeywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {customKeywords.map(tag => {
              const isSelected = selectedKeywords.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleKeyword(tag)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200
                    ${isSelected
                      ? 'bg-[var(--color-accent-pink)] text-slate-900 shadow-[0_4px_15px_rgba(245,158,11,0.3)] scale-105'
                      : 'bg-white/40 text-slate-600 hover:bg-amber-50 hover:text-[var(--color-accent-pink)] border border-dashed border-slate-300'
                    } active:scale-95`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isEditingTags && (
        <TagManagerModal 
          groups={tagGroups}
          onSave={handleSaveTags}
          onClose={() => setIsEditingTags(false)}
          onReset={handleResetTags}
        />
      )}

      {/* 面包屑导航 */}
      <div className="px-5 mt-2 flex items-center gap-1 overflow-x-auto scrollbar-none text-xs">
        <button
          onClick={() => handleBreadcrumbClick(-1)}
          className="text-emerald-600 font-bold hover:underline whitespace-nowrap"
        >
          {city.name}
        </button>
        {explorationStack.map((node, i) => (
          <React.Fragment key={node.adcode || i}>
            <i className="bi bi-chevron-right text-gray-300 text-[10px]"></i>
            <button
              onClick={() => handleBreadcrumbClick(i)}
              className={`whitespace-nowrap font-bold transition-colors ${
                i === explorationStack.length - 1
                  ? 'text-gray-800 pointer-events-none'
                  : 'text-emerald-500 hover:underline'
              }`}
            >
              {node.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="px-6 mt-10 flex justify-between items-center z-30">
        <h2 className="text-3xl font-black tracking-tighter text-slate-800 flex items-center gap-3">
          <img src={monetIcons.camera} className="w-10 h-10 object-contain" alt="camera" />
          <span>发现 <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-accent-pink)] to-[var(--color-accent-lilac)]">周边</span></span>
        </h2>
        <div className="p-1.5 rounded-2xl flex gap-1 shadow-inner shrink-0 ml-4 bg-white/20 glass-panel-light">
          <button onClick={() => setViewMode('list')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-lg scale-105' : 'opacity-40 hover:opacity-100 text-slate-600'}`}><i className="bi bi-list-ul mr-1"></i>List</button>
          <button onClick={() => setViewMode('map')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${viewMode === 'map' ? 'bg-white text-slate-800 shadow-lg scale-105' : 'opacity-40 hover:opacity-100 text-slate-600'}`}><i className="bi bi-map mr-1"></i>Map</button>
        </div>
      </div>

      {subRegions.length > 0 && (
        <div className="px-5 mt-3 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {subRegions.map(region => (
            <button 
              key={region.adcode} 
              onClick={() => handleRegionClick(region)}
              className="px-3 py-1.5 bg-white border border-emerald-100 rounded-full text-xs font-bold text-emerald-700 whitespace-nowrap shadow-sm hover:bg-emerald-50 active:scale-95 transition-all"
            >
              探索 {region.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden mt-2 pb-24">
        {viewMode === 'list' ? (
          <div className="h-full overflow-y-auto px-5 space-y-4 pb-12">
            {spots.length > 0 ? (
              spots.map(spot => <DiscoverCard key={spot.id} spot={spot} onClick={setSelectedSpot} />)
            ) : (
              <div className="py-20 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 text-3xl mb-4"><i className="bi bi-geo"></i></div>
                <p className="font-bold text-gray-400">该区域暂无推荐，尝试更换关键词</p>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full px-6 relative pb-6">
             <div className="h-full w-full rounded-[2.5rem] shadow-2xl relative overflow-hidden ring-1 ring-white/20">
                <div id="city-map-container" className="w-full h-full"></div>
                {selectedSpot && (
                  <div className="absolute bottom-6 left-6 right-6 z-10 animate-slide-up">
                    <div className={`${glassClass} p-5 rounded-[2rem] flex gap-4 items-center`}>
                      <div className="w-16 h-16 bg-black/10 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center">
                        {selectedSpot.imageUrl ? (<img src={selectedSpot.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />) : (<div className="w-full h-full flex items-center justify-center opacity-50"><i className={`bi bi-geo-alt-fill text-2xl`}></i></div>)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black truncate text-base">{selectedSpot.name}</h4>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleCheckIn(selectedSpot)} disabled={selectedSpot.checkedIn} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${selectedSpot.checkedIn ? 'bg-white/20 opacity-50' : 'bg-[var(--color-accent-lilac)] text-white shadow-[0_4px_15px_rgba(168,85,247,0.4)] hover:brightness-110'}`}>打卡</button>
                        </div>
                      </div>
                      <button onClick={() => setSelectedSpot(null)} className="absolute top-3 right-3 opacity-30 hover:opacity-100 transition-opacity"><i className="bi bi-x-circle-fill text-lg"></i></button>
                    </div>
                  </div>
                )}

                {/* 侧边漂浮照片回忆墙 */}
                <PhotoGalleryOverlay 
                  memories={spots.filter(s => s.photos && s.photos.length > 0)} 
                  onGenerateJournal={() => setShowAiJournal(true)} 
                />
             </div>
          </div>
        )}
      </div>

      {/* AI 旅行日记模态框 */}
      {showAiJournal && (
        <AiJournalModal 
          memories={spots.filter(s => s.photos && s.photos.length > 0)} 
          citySlug={currentRegion.name} 
          onClose={() => setShowAiJournal(false)} 
        />
      )}
    </div>
  );
};
