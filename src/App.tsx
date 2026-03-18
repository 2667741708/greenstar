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

  // 全局数据
  const [cities, setCities] = useState<CityInfo[]>(CHINA_CITIES);
  const [currentCity, setCurrentCity] = useState<CityInfo | null>(null);
  const [globalSpots, setGlobalSpots] = useState<any[]>([]); // 全局 spots 供 PlanPanel 使用

  const { refreshLocation } = useGeolocation();

  useEffect(() => {
    checkKeyStatus();
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
    <div className="flex flex-col h-full bg-[#f8faf9] text-gray-900 overflow-hidden">
      <Header 
        isPro={isPro} 
        onRefreshLocation={refreshLocation} 
        onUpgradeKey={handleUpgradeKey} 
      />

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
          />
        )}

        {/* 当直接点击了底部的'探索' Tab，但还没有选择城市时，回退到中国地图 */}
        {activeTab === 'city-explorer' && !currentCity && (
          <div className="h-full flex items-center justify-center flex-col opacity-50 p-6 space-y-4 text-center">
            <i className="bi bi-compass text-6xl text-emerald-300"></i>
            <h2 className="text-xl font-bold text-gray-400">尚未锁定探索星球</h2>
            <button 
              onClick={() => setActiveTab('china-map')} 
              className="bg-emerald-100 text-emerald-600 px-6 py-3 rounded-full font-bold shadow-sm"
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
