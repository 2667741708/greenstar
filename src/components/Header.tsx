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
    <header className={`p-4 sticky top-0 z-40 flex justify-between items-center transition-all duration-500 border-b ${isPro ? 'bg-white/60 backdrop-blur-2xl border-white/50 shadow-xl' : 'bg-white/70 backdrop-blur-xl border-white/40 shadow-sm'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl shadow-lg flex items-center justify-center text-white ${tier === 'ultra' ? 'bg-gradient-to-tr from-accent-pink to-accent-lilac' : isPro ? 'bg-gradient-to-tr from-accent-blue to-accent-sage' : 'bg-accent-sage'}`}>
          <i className={`bi ${tier === 'ultra' ? 'bi-gem' : isPro ? 'bi-lightning-fill' : 'bi-star-fill'} star-shine text-lg`}></i>
        </div>
        <div>
          <h1 className={`text-xl font-black tracking-tight flex items-center gap-1 text-[#2D3748]`}>
            绿星 
            <span className={tier === 'ultra' ? 'text-transparent bg-clip-text bg-gradient-to-r from-accent-pink to-accent-lilac' : isPro ? 'text-accent-blue' : 'text-accent-sage'}>
              {tier.toUpperCase()}
            </span>
          </h1>
          <p className="text-[10px] font-bold tracking-widest uppercase opacity-60 text-[#4A5568]">Smart Footprint</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onRefreshLocation} className={`p-2 rounded-xl transition-all bg-white/50 hover:bg-white/80 shadow-sm ${isPro ? 'text-accent-blue' : 'text-accent-sage'}`}><i className="bi bi-crosshair"></i></button>
        <button onClick={handleTierToggle} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${tier === 'ultra' ? 'bg-gradient-to-r from-accent-pink to-accent-lilac text-white shadow-lg shadow-accent-pink/30' : isPro ? 'bg-white/60 border border-white/50 text-accent-blue shadow-sm' : 'bg-white/50 text-accent-sage shadow-sm'}`}>
          {tier === 'ultra' ? 'ULTRA' : tier === 'pro' ? 'PRO' : 'UPGRADE'}
        </button>
      </div>
    </header>
  );
};

