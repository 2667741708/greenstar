import React from 'react';
import { Spot, CityInfo } from '../types';

interface ProfilePanelProps {
  isPro: boolean;
  spots: Spot[];
  cities: CityInfo[];
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ isPro, spots, cities }) => {
  const checkedSpots = spots.filter(s => s.checkedIn).length;
  const unlockedCities = cities.filter(c => c.isUnlocked).length;

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      <div className={`rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl transition-all duration-700 ${isPro ? 'bg-slate-900 border-2 border-amber-500/20' : 'bg-gray-900'}`}>
        <div className="relative z-10">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">
            <i className={`bi ${isPro ? 'bi-person-stars text-amber-400' : 'bi-person text-emerald-400'}`}></i>
          </div>
          <h3 className="text-2xl font-black mb-1">{isPro ? 'Pro Traveler' : 'Explorer'}</h3>
          <div className="flex flex-col gap-2 mt-4">
            <p className="text-xs opacity-70 font-bold uppercase tracking-widest bg-black/20 px-3 py-2 rounded-xl inline-block w-max">
              <i className="bi bi-geo-alt-fill text-emerald-400 mr-2"></i>解锁城市: {unlockedCities} / {cities.length}
            </p>
            <p className="text-xs opacity-70 font-bold uppercase tracking-widest bg-black/20 px-3 py-2 rounded-xl inline-block w-max">
              <i className="bi bi-pin-map-fill text-amber-400 mr-2"></i>足迹点亮: {checkedSpots} 个坐标
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
          <i className="bi bi-stars text-9xl"></i>
        </div>
      </div>
    </div>
  );
};
