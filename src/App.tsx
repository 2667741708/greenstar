import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, RotateCw, Compass } from 'lucide-react';
import { ViewState, CityInfo } from './types';
import { CHINA_CITIES } from './config/cities';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ChinaMap } from './components/ChinaMap';
import { CityExplorer } from './components/CityExplorer';
import { PlanPanel } from './components/PlanPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { LoadingOverlay } from './components/LoadingOverlay';
import { useGeolocation } from './hooks/useGeolocation';
import { purgeExpiredCache } from './services/poiCache';
import { savePlan } from './services/localVault';
import { monetIcons } from './config/monetIcons';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ViewState>('china-map');
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoLocated, setAutoLocated] = useState(false); // 防止重复自动跳转

  const [cities, setCities] = useState<CityInfo[]>(CHINA_CITIES);
  const [currentCity, setCurrentCity] = useState<CityInfo | null>(null);
  const [globalSpots, setGlobalSpots] = useState<any[]>([]);
  const [globalKeywords, setGlobalKeywords] = useState<string[]>([]);
  
  // 使用 ref 来避免异步回调中的闭包陷阱（Stale Closure）
  const autoLocatedRef = React.useRef(false);

  // 定位自动跳转：定位成功后自动构造当前位置 CityInfo 并进入 CityExplorer
  // Auto-locate: construct CityInfo from GPS and jump to CityExplorer
  const { location, address: geoAddress, city: geoCity, refreshLocation } = useGeolocation(
    (lat, lng, addr, cityName) => {
      // 通过 ref 获取最新状态，若用户已手动交互则放弃强制跳转
      if (cityName && !autoLocatedRef.current) {
        const autoCity: CityInfo = {
          id: `geo-${Date.now()}`,
          name: cityName,
          province: '',
          coordinates: { lat, lng },
          description: addr,
          isUnlocked: true,
        };
        setCurrentCity(autoCity);
        setActiveTab('city-explorer');
        autoLocatedRef.current = true;
        setAutoLocated(true);
      }
    }
  );

  useEffect(() => {
    checkKeyStatus();
    // App mount 时清理过期 POI 缓存
    // Purge expired POI cache on app mount
    purgeExpiredCache().catch(console.warn);
  }, []);

  const checkKeyStatus = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsPro(hasKey);
    }
  };

  const handleUpgradeKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setIsPro(true);
    }
  };

  const handleCitySelect = (city: CityInfo) => {
    setCurrentCity(city);
    setActiveTab('city-explorer');
    // 手动点击城市后，立即阻断后续可能还在 pending 的定位强制跳转
    // Block pending geo-location jumps once user manually interacts
    autoLocatedRef.current = true;
    setAutoLocated(true);
  };

  const updateCityUnlockedStatus = (cityId: string) => {
    setCities(prev => prev.map(c => 
      c.id === cityId ? { ...c, isUnlocked: true } : c
    ));
  };

  return (
    <div className="flex flex-col h-screen h-dvh overflow-hidden transition-colors duration-500 relative">
      <Header 
        onRefreshLocation={refreshLocation} 
        onUpgradeKey={handleUpgradeKey} 
      />
      
      {/* Decorative Monet Brushstroke */}
      <div className="monet-divider -mt-4 relative z-50"></div>

      {/* 定位信息条：实时显示当前地址 */}
      {/* Location info bar: show current address in real-time */}
      {location && (
        <div className="px-5 py-2 glass-panel-light !rounded-none !border-x-0 !border-t-0 flex items-center gap-3 z-40 relative shadow-inner">
          <img src={monetIcons.pin} className="w-5 h-5 object-contain" alt="pin" />
          <span className="truncate flex-1 text-[10px] font-black font-mono tracking-tighter opacity-60 italic">{geoAddress}</span>
          <button 
            onClick={refreshLocation} 
            className="ml-auto opacity-40 hover:opacity-100 hover:text-[var(--color-accent-blue)] transition-all shrink-0 active:scale-90"
            title="重新定位"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto relative z-10">
        <LoadingOverlay loadingStep={loadingStep} isPro={isPro} />

        {/* 视图路由 */}
        {activeTab === 'china-map' && (
          <ChinaMap 
            cities={cities} 
            isPro={isPro} 
            onCitySelect={handleCitySelect} 
            setLoading={setLoading}
            setLoadingStep={setLoadingStep}
            setErrorMsg={setErrorMsg}
            onUserInteract={() => { autoLocatedRef.current = true; setAutoLocated(true); }}
          />
        )}

        {activeTab === 'city-explorer' && currentCity && (
          <CityExplorer 
            city={currentCity}
            isPro={isPro}
            onBack={() => setActiveTab('china-map')}
            setLoading={setLoading}
            setLoadingStep={setLoadingStep}
            setErrorMsg={setErrorMsg}
            updateCityUnlockedStatus={updateCityUnlockedStatus}
            onSpotsUpdate={setGlobalSpots}
            onKeywordsUpdate={setGlobalKeywords}
          />
        )}

        {/* 当直接点击了底部的'探索' Tab，但还没有选择城市时，回退到中国地图 */}
        {activeTab === 'city-explorer' && !currentCity && (
          <div className="h-full flex items-center justify-center flex-col opacity-50 p-6 space-y-4 text-center stagger-in">
            <img src={monetIcons.compass} className="w-20 h-20 object-contain grayscale opacity-40 shadow-xl" alt="compass" />
            <h2 className="text-xl font-bold tracking-widest uppercase text-[#2D3748]">尚未锁定探索星球</h2>
            <button 
              onClick={() => setActiveTab('china-map')} 
              className="bg-gradient-to-r from-accent-pink to-accent-lilac text-white hover:brightness-110 px-8 py-3 rounded-full font-bold shadow-[0_10px_30px_rgba(241,181,203,0.4)] transition-all active:scale-95 hover-magnetic"
            >
              返回星系图选点
            </button>
          </div>
        )}

        {activeTab === 'plan' && (
          <PlanPanel 
            setLoading={setLoading}
            setLoadingStep={setLoadingStep}
            setErrorMsg={setErrorMsg}
            errorMsg={errorMsg}
            currentSpots={globalSpots}
            currentCityName={currentCity?.name}
            currentKeywords={globalKeywords}
            onSavePlan={async (content, dest) => {
              try {
                await savePlan({
                  id: Date.now().toString(),
                  content,
                  destination: dest,
                  date: new Date().toLocaleDateString(),
                });
              } catch (e) {
                console.error('Failed to save plan to IndexedDB', e);
                setErrorMsg('保存路线失败：本地存储异常');
              }
            }}
          />
        )}

        {activeTab === 'profile' && (
          <ProfilePanel 
            isPro={isPro}
            spots={[]} 
            cities={cities}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} isPro={isPro} />
    </div>
  );
};

export default App;
