import React, { useState, useEffect } from 'react';
import { Spot, CityInfo, RegionNode } from '../types';
import { searchPOI, getSubDistricts } from '../services/amap';
import { fetchRealWorldData } from '../services/crawler';
import { generateFallbackPOIs } from '../services/deepseek';
import { useAmap } from '../hooks/useAmap';
import { CONSTANTS } from '../config/constants';
import { SpotDetail } from './SpotDetail';
import { DiscoverCard } from './DiscoverCard';

interface CityExplorerProps {
  city: CityInfo;
  isPro: boolean;
  onBack: () => void;
  setLoading: (loading: boolean) => void;
  setLoadingStep: (step: string) => void;
  setErrorMsg: (msg: string | null) => void;
  updateCityUnlockedStatus: (cityId: string) => void;
  onSpotsUpdate?: (spots: Spot[]) => void;  // 向上上报 spots 供 PlanPanel 使用
}

export const CityExplorer: React.FC<CityExplorerProps> = ({ 
  city, isPro, onBack, setLoading, setLoadingStep, setErrorMsg, updateCityUnlockedStatus, onSpotsUpdate 
}) => {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [keyword, setKeyword] = useState('');
  
  // 栈式下钻探索状态
  const [explorationStack, setExplorationStack] = useState<RegionNode[]>([]);
  const [subRegions, setSubRegions] = useState<any[]>([]);

  // 同步 spots 到父组件供 PlanPanel 使用
  useEffect(() => {
    onSpotsUpdate?.(spots);
  }, [spots]);

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

  const fetchCitySpots = async (searchKw: string = '', center: {lat: number, lng: number}, name: string) => {
    setLoading(true);
    setLoadingStep(`正在检索 ${name} 的地理星图...`);
    try {
      // 第一引擎：高德实体检索
      let result = await searchPOI(name, searchKw, center);
      
      // 第二引擎：当高德返回空时，启动 RAG 兜底
      if (result.length === 0) {
        setLoadingStep(`高德数据未返回，正在启动网络爬虫检索 ${name} 实况...`);
        const realWorldText = await fetchRealWorldData(name, searchKw);
        
        setLoadingStep(`抓取完成，正在唤醒 DeepSeek 提取真实地理信息...`);
        result = await generateFallbackPOIs(name, realWorldText, center);
      }
      
      setSpots(result);
    } catch (err: any) {
      // 高德崩溃时也尝试 RAG 兜底
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCitySpots(keyword, currentRegion.center, currentRegion.name);
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

  const handleCheckIn = (spot: Spot) => {
    setLoading(true);
    setLoadingStep(''); // Trigger checkin overlay internally in App logic but here we simulate simple delay
    
    // Simulate checkin
    setTimeout(() => {
      setSpots(prev => prev.map(s => s.id === spot.id ? { ...s, checkedIn: true } : s));
      setSelectedSpot(prev => prev?.id === spot.id ? { ...prev, checkedIn: true } : prev);
      setLoading(false);
      alert(`🎉 打卡成功！你已点亮了 ${spot.name}`);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-500">
      {selectedSpot && (
        <SpotDetail 
          spot={selectedSpot} 
          onClose={() => setSelectedSpot(null)} 
          onCheckIn={handleCheckIn} 
          isPro={isPro} 
        />
      )}

      <div className="px-5 mt-4 relative z-30">
        <div className="bg-white/70 backdrop-blur-xl rounded-[2rem] p-2 pl-5 flex items-center gap-3 shadow-lg border border-white group transition-all">
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
            <p className="text-[10px] font-bold text-gray-400 uppercase">当前跃迁点</p>
            <p className="text-sm font-bold text-gray-800 truncate">
              {currentRegion.name} 
              {currentRegion.name !== city.name && <span className="text-xs text-gray-400 ml-1">({city.name})</span>}
            </p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-1 pr-1 shrink-0">
            <input 
              type="text" 
              value={keyword} 
              onChange={e => setKeyword(e.target.value)} 
              placeholder="找景点/美食..." 
              className="w-24 bg-emerald-50/50 rounded-2xl px-3 py-2 text-[10px] border-none outline-none focus:bg-emerald-100 transition-colors" 
            />
            <button type="submit" className="w-8 h-8 bg-emerald-600 text-white rounded-2xl active:scale-90 transition-transform"><i className="bi bi-search text-sm"></i></button>
          </form>
        </div>
      </div>

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

      <div className="px-5 mt-4 flex justify-between items-center z-30">
        <h2 className="text-2xl font-black tracking-tight"><span className="text-emerald-500">发现</span>周边</h2>
        <div className="bg-gray-100 p-1 rounded-2xl flex gap-1 shadow-inner shrink-0 ml-4">
          <button onClick={() => setViewMode('list')} className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow pointer-events-none' : 'text-gray-500 hover:text-gray-700'}`}><i className="bi bi-list-ul mr-1"></i>列表</button>
          <button onClick={() => setViewMode('map')} className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${viewMode === 'map' ? 'bg-white shadow pointer-events-none' : 'text-gray-500 hover:text-gray-700'}`}><i className="bi bi-map mr-1"></i>地图</button>
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
          <div className="h-full px-4 relative">
             <div className="h-full bg-white rounded-[3rem] border-4 border-white shadow-2xl relative overflow-hidden">
                <div id="city-map-container" className="w-full h-full"></div>
                {selectedSpot && (
                  <div className="absolute bottom-6 left-6 right-6 z-10 animate-slide-up">
                    <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[2.5rem] shadow-2xl border border-white flex gap-4 items-center">
                      <div className="w-16 h-16 bg-emerald-100 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center">
                        {selectedSpot.imageUrl ? (<img src={selectedSpot.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />) : (<div className="w-full h-full flex items-center justify-center text-emerald-600"><i className={`bi bi-geo-alt-fill text-2xl`}></i></div>)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-gray-900 truncate text-sm">{selectedSpot.name}</h4>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleCheckIn(selectedSpot)} disabled={selectedSpot.checkedIn} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black transition-all ${selectedSpot.checkedIn ? 'bg-gray-100 text-gray-400' : 'bg-emerald-600 text-white shadow-sm shadow-emerald-100'}`}>打卡</button>
                        </div>
                      </div>
                      <button onClick={() => setSelectedSpot(null)} className="absolute top-3 right-3 text-gray-300 hover:text-gray-400 transition-colors"><i className="bi bi-x-circle-fill text-lg"></i></button>
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
