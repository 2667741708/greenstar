import React from 'react';
import { ViewState } from '../types';

interface BottomNavProps {
  activeTab: ViewState;
  setActiveTab: (tab: ViewState) => void;
  isPro: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab, isPro }) => {
  const tabs = [
    { id: 'china-map', icon: 'globe-asia-australia', label: '全国' },
    { id: 'city-explorer', icon: 'compass', label: '探索' },
    { id: 'plan', icon: 'journal-text', label: '规划' },
    { id: 'profile', icon: 'person', label: '我的' }
  ];

  return (
    <div className="fixed bottom-6 left-0 right-0 max-w-md mx-auto px-6 z-50 flex justify-center pointer-events-none">
      <nav className="bg-white/80 backdrop-blur-2xl border border-white shadow-[0_16px_40px_-8px_rgba(0,0,0,0.15)] px-2 py-2 rounded-full flex justify-between items-center w-full pointer-events-auto">
        {tabs.map(item => {
          const isActive = activeTab === item.id || (activeTab === 'city-explorer' && item.id === 'city-explorer');
          return (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as ViewState)} 
              className={`flex flex-col items-center justify-center p-3 relative flex-1 transition-all duration-500 overflow-hidden ${isActive ? (isPro ? 'text-accent-pink' : 'text-accent-sage') : 'text-[#A0AEC0] hover:text-[#4A5568] hover:bg-white/50 rounded-full'}`}
            >
              {isActive && (
                <div className={`absolute inset-0 transition-opacity duration-300 rounded-full ${isPro ? 'bg-accent-pink/20' : 'bg-accent-sage/20'}`}></div>
              )}
              <div className={`relative z-10 flex flex-col items-center transition-transform duration-300 ${isActive ? '-translate-y-0.5' : ''}`}>
                <i className={`bi bi-${item.icon}${isActive ? '-fill' : ''} text-[22px] drop-shadow-sm`}></i>
                <span className={`text-[10px] font-black tracking-widest mt-1 transition-all duration-300 ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-90 h-0 overflow-hidden'}`}>{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
