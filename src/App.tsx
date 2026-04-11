// ============================================================================
// 文件: src/App.tsx
// 基准版本: App.tsx @ 650ddca (151行)
// 修改内容 / Changes:
//   [新增] 定位自动跳转：定位成功后自动构造 CityInfo 进入 CityExplorer
//   [新增] 定位信息条：在 Header 下方显示当前实时地址
//   [新增] POI 缓存过期清理逻辑（App mount 时执行一次）
//   [NEW] Auto-locate: construct CityInfo from GPS and jump to CityExplorer
//   [NEW] Location info bar below Header showing current address
//   [NEW] Purge expired POI cache on App mount
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react';
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

  // 全局数据
  const [cities, setCities] = useState<CityInfo[]>(CHINA_CITIES);
  const [currentCity, setCurrentCity] = useState<CityInfo | null>(null);
  const [globalSpots, setGlobalSpots] = useState<any[]>([]);
  const [globalKeywords, setGlobalKeywords] = useState<string[]>([]);

  // 定位自动跳转：定位成功后自动构造当前位置 CityInfo 并进入 CityExplorer
  // Auto-locate: construct CityInfo from GPS and jump to CityExplorer
  const { location, address: geoAddress, city: geoCity, refreshLocation } = useGeolocation(
    (lat, lng, addr, cityName) => {
      if (cityName && !autoLocated) {
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
  };

  const updateCityUnlockedStatus = (cityId: string) => {
    setCities(prev => prev.map(c => 
      c.id === cityId ? { ...c, isUnlocked: true } : c
    ));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden transition-colors duration-500 relative">
      <Header 
        onRefreshLocation={refreshLocation} 
        onUpgradeKey={handleUpgradeKey} 
      />

      {/* 定位信息条：实时显示当前地址 */}
      {/* Location info bar: show current address in real-time */}
      {location && (
        <div className="px-5 py-2 glass-panel-light !rounded-none !border-x-0 !border-t-0 flex items-center gap-3 z-40 relative shadow-sm">
          <i className="bi bi-geo-alt-fill text-accent-pink shadow-[0_0_8px_var(--color-accent-pink)]" />
          <span className="truncate flex-1 text-xs font-bold font-mono tracking-wider opacity-80">{geoAddress}</span>
          <button 
            onClick={refreshLocation} 
            className="ml-auto opacity-40 hover:opacity-100 hover:text-[var(--color-accent-indigo)] transition-all shrink-0 active:scale-90"
            title="重新定位"
          >
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto relative z-10">
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
            <i className="bi bi-compass text-6xl text-accent-lilac drop-shadow-md"></i>
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
            onSavePlan={(content, dest) => {
              try {
                const plans = JSON.parse(localStorage.getItem('gs_saved_plans') || '[]');
                plans.unshift({ id: Date.now().toString(), content, destination: dest, date: new Date().toLocaleDateString() });
                localStorage.setItem('gs_saved_plans', JSON.stringify(plans));
              } catch (e) { console.error('Failed to save plan', e); }
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
