import React from 'react';
import { ViewState } from '../types';
import { monetIcons } from '../config/monetIcons';

interface BottomNavProps {
  activeTab: ViewState;
  setActiveTab: (tab: ViewState) => void;
  isPro: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab, isPro }) => {
  const tabs = [
    { id: 'china-map', icon: monetIcons.globe, label: '全国' },
    { id: 'city-explorer', icon: monetIcons.compass, label: '探索' },
    { id: 'plan', icon: monetIcons.journal, label: '规划' },
    { id: 'profile', icon: monetIcons.profile, label: '我的' }
  ];

  return (
    <div className="fixed bottom-6 left-0 right-0 max-w-md mx-auto px-6 z-50 flex justify-center pointer-events-none">
      <nav className="glass-panel px-4 py-2 rounded-full flex justify-between items-center w-full pointer-events-auto shadow-[0_20px_50px_rgba(0,0,0,0.2)] ring-1 ring-white/30">
        {tabs.map(item => {
          const isActive = activeTab === item.id || (activeTab === 'city-explorer' && item.id === 'city-explorer');
          return (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as ViewState)} 
              className={`flex flex-col items-center justify-center p-3 relative flex-1 transition-all duration-500 overflow-hidden ${isActive ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {isActive && (
                <div className="absolute inset-x-2 inset-y-1.5 bg-[var(--color-accent-lilac)]/20 blur-xl rounded-full transition-opacity duration-300"></div>
              )}
              <div className={`relative z-10 flex flex-col items-center transition-all duration-500 ${isActive ? '-translate-y-1 scale-125' : 'grayscale-[0.6] opacity-70 scale-100'}`}>
                <img 
                  src={item.icon} 
                  alt={item.label} 
                  className={`w-8 h-8 object-contain transition-all duration-500 ${isActive ? 'drop-shadow-[0_8px_12px_rgba(0,0,0,0.3)] animate-pulse' : 'drop-shadow-sm'}`} 
                />
                <span className={`text-[8px] font-black tracking-[0.25em] mt-2 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-0 h-0'}`}>{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

