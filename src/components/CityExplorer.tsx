import React, { useState, useEffect } from 'react';
import { Spot, CityInfo } from '../types';
import { searchPOI } from '../services/amap';
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
}

export const CityExplorer: React.FC<CityExplorerProps> = ({ 
  city, isPro, onBack, setLoading, setLoadingStep, setErrorMsg, updateCityUnlockedStatus 
}) => {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [keyword, setKeyword] = useState('');

  useAmap(
    'city-map-container',
    city.coordinates,
    CONSTANTS.MAP.CITY_ZOOM,
    isPro,
    spots,
    [],
    selectedSpot,
    setSelectedSpot
  );

  const fetchCitySpots = async (searchKw: string = '') => {
    setLoading(true);
    setLoadingStep(`正在检索 ${city.name} 的地理星图...`);
    try {
      const result = await searchPOI(city.name, searchKw, city.coordinates);
      setSpots(result);
    } catch (err: any) {
      setErrorMsg(`检索失败: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  useEffect(() => {
    fetchCitySpots();
    // 进入城市探索页代表解锁了该城市
    updateCityUnlockedStatus(city.id);
  }, [city.id]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCitySpots(keyword);
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
          <button onClick={onBack} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <i className="bi bi-arrow-left text-gray-600"></i>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase">当前跃迁点</p>
            <p className="text-sm font-bold text-gray-800 truncate">{city.name} {city.province !== city.name && <span className="text-xs text-gray-400">{city.province}</span>}</p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-1 pr-1">
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

      <div className="px-5 mt-4 flex justify-between items-center z-30">
        <h2 className="text-2xl font-black tracking-tight"><span className="text-emerald-500">发现</span>周边</h2>
        <div className="bg-gray-100 p-1 rounded-2xl flex gap-1 shadow-inner">
          <button onClick={() => setViewMode('list')} className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow pointer-events-none' : 'text-gray-500 hover:text-gray-700'}`}><i className="bi bi-list-ul mr-1"></i>列表</button>
          <button onClick={() => setViewMode('map')} className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${viewMode === 'map' ? 'bg-white shadow pointer-events-none' : 'text-gray-500 hover:text-gray-700'}`}><i className="bi bi-map mr-1"></i>地图</button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden mt-4 pb-24">
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
