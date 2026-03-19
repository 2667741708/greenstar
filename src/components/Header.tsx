import React from 'react';
import { useUserTier } from '../hooks/useUserTier';

interface HeaderProps {
  onRefreshLocation: () => void;
  onUpgradeKey?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onRefreshLocation, onUpgradeKey }) => {
  const { tier, setTier } = useUserTier();
  const isPro = tier === 'pro' || tier === 'ultra';

  const handleTierToggle = () => {
    if (tier === 'plus') setTier('pro');
    else if (tier === 'pro') setTier('ultra');
    else setTier('plus');
    if (onUpgradeKey) onUpgradeKey();
  };

  return (
    <header className={`p-4 sticky top-0 z-40 flex justify-between items-center transition-all duration-500 border-b ${isPro ? 'bg-slate-900 text-white border-slate-800 shadow-xl' : 'bg-white/90 backdrop-blur-md border-emerald-50 shadow-sm'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl shadow-lg flex items-center justify-center text-white ${tier === 'ultra' ? 'bg-gradient-to-tr from-purple-600 to-pink-500' : isPro ? 'bg-gradient-to-tr from-amber-500 to-yellow-300' : 'bg-emerald-600'}`}>
          <i className={`bi ${tier === 'ultra' ? 'bi-gem' : isPro ? 'bi-lightning-fill' : 'bi-star-fill'} star-shine text-lg`}></i>
        </div>
        <div>
          <h1 className={`text-xl font-black tracking-tight flex items-center gap-1`}>
            绿星 
            <span className={tier === 'ultra' ? 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500' : isPro ? 'text-amber-400' : 'text-emerald-500'}>
              {tier.toUpperCase()}
            </span>
          </h1>
          <p className="text-[10px] font-bold tracking-widest uppercase opacity-60">Smart Footprint</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onRefreshLocation} className={`p-2 rounded-xl transition-all ${isPro ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}><i className="bi bi-crosshair"></i></button>
        <button onClick={handleTierToggle} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${tier === 'ultra' ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/30' : isPro ? 'bg-white/10 border border-white/20 text-amber-300' : 'bg-emerald-50 text-emerald-700'}`}>
          {tier === 'ultra' ? 'ULTRA' : tier === 'pro' ? 'PRO' : 'UPGRADE'}
        </button>
      </div>
    </header>
  );
};

