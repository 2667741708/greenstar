import React, { useState } from 'react';
import { CityInfo } from '../types';
import { useAmap } from '../hooks/useAmap';
import { CONSTANTS } from '../config/constants';
import { searchGlobal, SearchResult } from '../mcp-services/searchService';
import { monetIcons } from '../config/monetIcons';

interface ChinaMapProps {
  cities: CityInfo[];
  isPro: boolean;
  onCitySelect: (city: CityInfo) => void;
  setLoading: (loading: boolean) => void;
  setLoadingStep: (step: string) => void;
  setErrorMsg: (msg: string | null) => void;
  onUserInteract?: () => void;
}

export const ChinaMap: React.FC<ChinaMapProps> = ({ cities, isPro, onCitySelect, setLoading, setLoadingStep, setErrorMsg, onUserInteract }) => {
  const [searchQuery, setSearchQuery] = useState('');

  useAmap(
    'china-map-container', 
    null, 
    CONSTANTS.MAP.CHINA_ZOOM, 
    isPro, 
    [], 
    cities, 
    null,
    () => { onUserInteract?.(); }, // map click interactions block auto location
    (city) => { onUserInteract?.(); onCitySelect(city); }
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    onUserInteract?.();
    if (!searchQuery) return;
    
    setLoading(true);
    setLoadingStep(`[Search] 多引擎聚合搜索 "${searchQuery}"（高德 + OpenStreetMap）...`);
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
        <div className="glass-panel p-3 pl-6 flex items-center gap-4 group focus-within:ring-2 focus-within:ring-[var(--color-accent-lilac)]/30 transition-all">
          <img src={monetIcons.globe} className="w-8 h-8 object-contain" alt="globe" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] text-slate-800">星系总览</p>
            <p className="text-sm font-black text-slate-700">全中国漫游</p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2 pr-1">
            <input 
              type="text" 
              value={searchQuery} 
              onChange={e => { onUserInteract?.(); setSearchQuery(e.target.value); }} 
              placeholder="搜索全球漫游点..." 
              className="w-44 rounded-2xl px-4 py-2.5 text-xs bg-white/40 border border-white/60 outline-none transition-all focus:bg-white/60 text-slate-800 placeholder:text-slate-400"
            />
            <button type="submit" className="w-12 h-10 monet-btn flex items-center justify-center"><i className="bi bi-search"></i></button>
          </form>
        </div>
      </div>
      
      <div className="flex-1 px-6 relative pb-28 z-10">
        <div className="h-full w-full rounded-[3rem] relative overflow-hidden group shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] ring-1 ring-white/20">
          <div className="absolute inset-0 bg-slate-900/40 z-0 flex items-center justify-center">
            <img src={monetIcons.globe} className="w-20 h-20 object-contain opacity-10 animate-pulse" alt="placeholder" />
          </div>
          <div id="china-map-container" className="w-full h-full relative z-10"></div>
          
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="glass-panel-light py-3 px-8 rounded-full flex items-center gap-3 backdrop-blur-3xl shadow-2xl">
              <img src={monetIcons.pin} className="w-5 h-5 object-contain" alt="pin" />
              <span className="text-xs font-black tracking-widest text-slate-700">点击图钉或搜索城市进入漫游</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
