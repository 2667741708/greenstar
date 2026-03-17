import React, { useState } from 'react';
import { CityInfo } from '../types';
import { useAmap } from '../hooks/useAmap';
import { CONSTANTS } from '../config/constants';
import { geocode } from '../services/amap';

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
    setLoadingStep('正在跨星系检索目标坐标...');
    try {
      const result = await geocode(searchQuery);
      // 检查搜索出来的城市是否在预设列表中，如果在则直接选中
      const matchedCity = cities.find(c => c.name.includes(result.city) || result.city.includes(c.name));
      if (matchedCity) {
        onCitySelect(matchedCity);
      } else {
        // 如果不在预设列表，创建一个临时的 CityInfo
        const tempCity: CityInfo = {
          id: `temp-${Date.now()}`,
          name: result.city || searchQuery,
          province: '',
          coordinates: { lat: result.lat, lng: result.lng },
          description: result.formattedAddress,
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

  return (
    <div className="h-full flex flex-col pt-4 relative animate-in fade-in duration-500">
      <div className="px-5 mb-4 relative z-30">
        <div className="bg-white/70 backdrop-blur-xl rounded-[2rem] p-2 pl-5 flex items-center gap-3 shadow-lg border border-white group focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
          <i className="bi bi-globe-americas text-emerald-600"></i>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase">星系总览</p>
            <p className="text-sm font-bold text-gray-800 truncate">全中国漫游</p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-1 pr-1">
            <input 
              type="text" 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              placeholder="搜索任何城市..." 
              className="w-24 bg-emerald-50/50 rounded-2xl px-3 py-2 text-[10px] border-none outline-none focus:bg-emerald-100 transition-colors" 
            />
            <button type="submit" className="w-8 h-8 bg-emerald-600 text-white rounded-2xl active:scale-90 transition-transform"><i className="bi bi-search text-sm"></i></button>
          </form>
        </div>
      </div>
      
      <div className="flex-1 px-4 relative pb-24">
        <div className="h-full bg-white rounded-[3rem] border-4 border-white shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-blue-50/50 z-0 flex items-center justify-center">
            <i className="bi bi-map text-6xl text-gray-200 animate-pulse"></i>
          </div>
          <div id="china-map-container" className="w-full h-full relative z-10"></div>
          
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-white/90 backdrop-blur py-2 px-6 rounded-full shadow-lg border border-white flex items-center gap-2">
              <i className="bi bi-info-circle-fill text-emerald-500"></i>
              <span className="text-xs font-bold text-gray-700">点击地图图钉或搜索城市进入漫游</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
