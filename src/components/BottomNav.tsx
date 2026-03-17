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
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-gray-100 px-8 py-4 flex justify-between items-center z-50">
      {tabs.map(item => {
        const isActive = activeTab === item.id || (activeTab === 'city-explorer' && item.id === 'city-explorer' /* special handling if needed */);
        return (
          <button 
            key={item.id} 
            onClick={() => setActiveTab(item.id as ViewState)} 
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${isActive ? (isPro ? 'text-amber-500 scale-110' : 'text-emerald-600 scale-110') : 'text-gray-300 hover:text-gray-400'}`}
          >
            <i className={`bi bi-${item.icon}${isActive ? '-fill' : ''} text-2xl`}></i>
            <span className="text-[9px] font-black uppercase tracking-[0.1em]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
