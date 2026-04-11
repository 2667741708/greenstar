import React, { useState } from 'react';
import { CityInfo } from '../types';
import { useAmap } from '../hooks/useAmap';
import { CONSTANTS } from '../config/constants';
import { searchGlobal, SearchResult } from '../mcp-services/searchService';

interface ChinaMapProps {
  cities: CityInfo[];
  isPro: boolean;
  onCitySelect: (city: CityInfo) => void;
  setLoading: (loading: boolean) => void;
  setLoadingStep: (step: string) => void;
  setErrorMsg: (msg: string | null) => void;
}

export const ChinaMap: React.FC<ChinaMapProps> = ({ cities, isPro, onCitySelect, setLoading, setLoadingStep, setErrorMsg }) => {
  const [searchQuery, setSearchQuery] = useState('');

  useAmap(
    'china-map-container', 
    null, 
    CONSTANTS.MAP.CHINA_ZOOM, 
    isPro, 
    [], 
    cities, 
    null,
    () => {}, 
    onCitySelect
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    setLoading(true);
    setLoadingStep(`🔍 多引擎聚合搜索 "${searchQuery}"（高德 + OpenStreetMap）...`);
    try {
      const results = await searchGlobal(searchQuery);
      if (results.length === 0) {
        setErrorMsg(`未找到 "${searchQuery}" 的任何坐标，请尝试更换关键词或使用英文名`);
        return;
      }

      const best = results[0]; // 置信度最高的结果
      console.log(`[Search] Best result: ${best.name} (${best.source}, confidence=${best.confidence.toFixed(2)})`);

      // 检查搜索出来的城市是否在预设列表中
      const matchedCity = best.name
        ? cities.find(c => c.name.includes(best.name) || best.name.includes(c.name))
        : null;

      if (matchedCity) {
        onCitySelect(matchedCity);
      } else {
        // 创建临时星系坐标（支持海外城市）
        const tempCity: CityInfo = {
          id: `temp-${Date.now()}`,
          name: best.name || searchQuery,
          province: best.country || '',
          coordinates: { lat: best.lat, lng: best.lng },
          description: `${best.formattedAddress} [来源: ${best.source === 'amap' ? '高德地图' : 'OpenStreetMap'}]`,
          isUnlocked: true
        };
        onCitySelect(tempCity);
      }
    } catch (err: any) {
      setErrorMsg(`搜索失败: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const glassClass = isPro ? 'glass-panel text-white' : 'glass-panel-light text-slate-800';

  return (
    <div className="h-full flex flex-col pt-4 relative stagger-in">
      <div className="ambient-glow top-0 left-0 hidden md:block"></div>
      <div className="px-5 mb-4 relative z-30">
        <div className={`${glassClass} p-3 pl-6 flex items-center gap-4 group focus-within:ring-2 focus-within:ring-[var(--color-accent-lilac)]/30 transition-all`}>
          <i className="bi bi-globe-americas text-[var(--color-accent-lilac)] text-lg"></i>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">星系总览</p>
            <p className="text-sm font-black truncate">全中国漫游</p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2 pr-1">
            <input 
              type="text" 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              placeholder="搜索全球任意城市/国家..." 
              className={`w-40 rounded-2xl px-4 py-2 text-xs border border-white/10 outline-none transition-colors ${isPro ? 'bg-white/10 text-white placeholder:text-white/40 focus:bg-white/20' : 'bg-black/5 text-slate-800 placeholder:text-slate-400 focus:bg-black/10'}`} 
            />
            <button type="submit" className="w-10 h-10 bg-[var(--color-accent-lilac)] text-white rounded-2xl shadow-[0_0_15px_var(--color-accent-lilac)] active:scale-95 transition-transform"><i className="bi bi-search"></i></button>
          </form>
        </div>
      </div>
      
      <div className="flex-1 px-6 relative pb-24 z-10">
        <div className="h-full w-full rounded-[2.5rem] relative overflow-hidden group shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
          <div className="absolute inset-0 bg-[#0f172a]/50 z-0 flex items-center justify-center">
            <i className="bi bi-map text-6xl text-white/5 animate-pulse"></i>
          </div>
          <div id="china-map-container" className="w-full h-full relative z-10"></div>
          
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className={`${glassClass} py-2.5 px-6 rounded-full flex items-center gap-3 backdrop-blur-2xl`}>
              <i className="bi bi-info-circle-fill text-[var(--color-accent-pink)] shadow-[0_0_10px_var(--color-accent-pink)] rounded-full"></i>
              <span className="text-xs font-bold tracking-wide">点击地图图钉或搜索城市进入漫游</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
