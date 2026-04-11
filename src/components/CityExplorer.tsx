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
import { generateFallbackPOIs } from '../services/deepseek';
import { useAmap } from '../hooks/useAmap';
import { CONSTANTS } from '../config/constants';
import { clearCityCache, prefetchHDImages } from '../services/poiCache';
import { SpotDetail } from './SpotDetail';
import { DiscoverCard } from './DiscoverCard';
import { PhotoGalleryOverlay } from './explore/PhotoGalleryOverlay';
import { AiJournalModal } from './explore/AiJournalModal';
import { useUserTier } from '../hooks/useUserTier';
import { TagManagerModal, TagGroup } from './TagManagerModal';

const DEFAULT_TAG_GROUPS: TagGroup[] = [
  { label: '住宿', icon: 'bi-house-heart', tags: ['精品酒店', '特色民宿', '青年旅舍'] },
  { label: '玩乐', icon: 'bi-controller', tags: ['猫咖', '狗咖', '电竞网咖', '剧本杀', 'KTV', '密室逃脱', '台球馆'] },
  { label: '二次元', icon: 'bi-stars', tags: ['漫展', '手办模型店', '游戏厅', '玩具店', '盲盒'] },
  { label: '文艺', icon: 'bi-book', tags: ['独立书店', '画廊美术馆', '博物馆', 'LiveHouse', '文艺影院', '文创园区'] },
  { label: '逛街', icon: 'bi-bag', tags: ['潮牌买手店', '美妆集合店', '复古中古店', '伴手礼'] },
  { label: '美食', icon: 'bi-egg-fried', tags: ['特色小吃', '甜品烘焙', '精酿啤酒', '咖啡馆', '茶馆', '奶茶'] },
  { label: '户外', icon: 'bi-tree', tags: ['骑行路线', '攀岩蹦床', '露营地', '赏花打卡'] },
  { label: '打卡', icon: 'bi-camera', tags: ['网红拍照', '夜景机位', '古镇老街', '酒吧'] },
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
  const maxTagsDisplay = tier === 'plus' ? 10 : tier === 'pro' ? 20 : Infinity;
  const maxSpotsDisplay = tier === 'plus' ? 10 : tier === 'pro' ? 20 : 150;

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
      const saved = localStorage.getItem('greenstar_tag_groups');
      return saved ? JSON.parse(saved) : DEFAULT_TAG_GROUPS;
    } catch {
      return DEFAULT_TAG_GROUPS;
    }
  });

  const handleSaveTags = (newGroups: TagGroup[]) => {
    setTagGroups(newGroups);
    localStorage.setItem('greenstar_tag_groups', JSON.stringify(newGroups));
    setIsEditingTags(false);
  };
  
  const handleResetTags = () => {
    setTagGroups(DEFAULT_TAG_GROUPS);
    localStorage.removeItem('greenstar_tag_groups');
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

      // 第一引擎：高德实体检索（含缓存层、三层过滤）
      // Primary engine: AMap PlaceSearch (with cache + 3-layer filter)
      let result = await searchPOI(name, searchKw, center, { radius, ...searchOptions });
      
      // 第二引擎：当高德返回空时，启动 RAG 兜底
      if (result.length === 0) {
        setLoadingStep(`高德数据未返回，正在启动网络爬虫检索 ${name} 实况...`);
        const realWorldText = await fetchRealWorldData(name, searchKw);
        
        setLoadingStep(`抓取完成，正在唤醒 DeepSeek 提取真实地理信息...`);
        result = await generateFallbackPOIs(name, realWorldText, center);
      }
      
      // 图片分级策略：Pro 用户使用 standard 图（600px），普通用户保持 thumb（200px）
      // Tiered image: Pro gets standard (600px), normal user keeps thumb (200px)
      if (isPro) {
        result = result.map(s => ({
          ...s,
          imageUrl: s.imageUrlHD ? (s.imageUrlHD.split('?')[0] + '?x-oss-process=image/resize,w_600/quality,q_85') : s.imageUrl
        }));
      }

      setSpots(result);

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
        const promises = keywords.map(kw => {
          const typeCode = CONSTANTS.POI_TAG_TYPE_MAP[kw] || '';
          return searchPOI(currentRegion.name, kw, currentRegion.center, {
            type: typeCode,
            radius,
          }).catch(() => [] as Spot[]);
        });
        const results = await Promise.all(promises);
        // 合并去重（按 id）
        const merged = new Map<string, Spot>();
        results.flat().forEach(s => { if (!merged.has(s.id)) merged.set(s.id, s); });
        const finalSpots = Array.from(merged.values());
        
        // 应用版本对应的地点数量限制
        const limitedSpots = finalSpots.slice(0, maxSpotsDisplay);
        setSpots(limitedSpots);
        // 图片已在 amap.ts 层兜底，无需额外爬虫调用
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
        <div className={`${glassClass} p-3 pl-6 flex items-center gap-4 group transition-all`}>
          <button onClick={() => {
            if (explorationStack.length > 0) {
              handleBreadcrumbClick(explorationStack.length - 2);
            } else {
              onBack();
            }
          }} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0">
            <i className="bi bi-arrow-left text-gray-600"></i>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">当前跃迁点</p>
            <p className="text-lg font-black truncate">
              {currentRegion.name} 
              {currentRegion.name !== city.name && <span className="text-xs opacity-50 ml-2">({city.name})</span>}
            </p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2 pr-1 shrink-0">
            <input 
              type="text" 
              value={keyword} 
              onChange={e => setKeyword(e.target.value)} 
              placeholder="搜任意..." 
              className={`w-32 rounded-2xl px-4 py-2 text-xs border border-white/10 outline-none transition-colors ${isPro ? 'bg-white/10 text-white placeholder:text-white/40 focus:bg-white/20' : 'bg-black/5 text-slate-800 placeholder:text-slate-400 focus:bg-black/10'}`} 
            />
            <button type="submit" className="w-10 h-10 bg-[var(--color-accent-sage)] text-white shadow-[0_0_15px_var(--color-accent-sage)] rounded-2xl active:scale-95 transition-transform"><i className="bi bi-search"></i></button>
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
        {visibleTagGroups.filter(g => expandedGroups.includes(g.label)).map(group => (
          <div key={group.label} className="mt-2 pb-2 border-b border-gray-100 last:border-0">
            <div className="flex flex-wrap gap-2">
              {group.tags.map(tag => {
                const isSelected = selectedKeywords.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleKeyword(tag)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200
                      ${isSelected
                        ? 'bg-[var(--color-accent-pink)] text-slate-900 shadow-[0_4px_15px_rgba(245,158,11,0.3)] scale-105'
                        : 'bg-white/60 text-slate-600 hover:bg-amber-50 hover:text-[var(--color-accent-pink)] border border-white'
                      } active:scale-95`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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

      <div className="px-6 mt-8 flex justify-between items-center z-30">
        <h2 className="text-[length:var(--text-title)] font-black tracking-tighter"><span className="text-gradient-premium">发现</span> 周边</h2>
        <div className={`p-1.5 rounded-2xl flex gap-1 shadow-inner shrink-0 ml-4 ${isPro ? 'bg-white/10' : 'bg-black/5'}`}>
          <button onClick={() => setViewMode('list')} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'list' ? (isPro ? 'bg-white text-black' : 'bg-white text-black shadow-md') : 'opacity-50 hover:opacity-100'}`}><i className="bi bi-list-ul mr-1"></i>List</button>
          <button onClick={() => setViewMode('map')} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'map' ? (isPro ? 'bg-white text-black' : 'bg-white text-black shadow-md') : 'opacity-50 hover:opacity-100'}`}><i className="bi bi-map mr-1"></i>Map</button>
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
