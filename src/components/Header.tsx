import React from 'react';
import { Locate, Star, Zap as ZapIcon, Gem } from 'lucide-react';
import { useUserTier } from '../hooks/useUserTier';
import { monetIcons } from '../config/monetIcons';

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
    <header className={`px-6 py-4 sticky top-0 z-40 flex justify-between items-center transition-all duration-500 border-b glass-panel !rounded-none !border-x-0 !border-t-0 ${isPro ? 'shadow-xl' : 'shadow-sm'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center text-white overflow-hidden ring-4 ring-white/30 ${tier === 'ultra' ? 'bg-gradient-to-tr from-accent-pink to-accent-lilac' : isPro ? 'bg-gradient-to-tr from-accent-blue to-accent-sage' : 'bg-accent-sage'}`}>
          <img src={monetIcons.profile} className="w-full h-full object-cover scale-110 opacity-95" alt="profile" />
        </div>
        <div>
          <h1 className={`text-2xl font-black tracking-tighter flex items-center gap-1 text-slate-800`}>
            绿星 
            <span className={tier === 'ultra' ? 'text-transparent bg-clip-text bg-gradient-to-r from-accent-pink to-accent-lilac' : isPro ? 'text-accent-blue' : 'text-accent-sage'}>
              {tier.toUpperCase()}
            </span>
            {tier === 'ultra' ? <Gem className="w-5 h-5 ml-1 text-accent-pink" /> : isPro ? <ZapIcon className="w-5 h-5 ml-1 text-accent-blue" /> : <Star className="w-5 h-5 ml-1 text-accent-sage" />}
          </h1>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase opacity-50 text-slate-600">Smart Footprint</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onRefreshLocation} className={`p-3 rounded-2xl transition-all glass-panel-light hover:bg-white active:scale-95 ${isPro ? 'text-accent-blue' : 'text-accent-sage'}`}>
          <Locate className="w-5 h-5" />
        </button>
        <button onClick={handleTierToggle} className={`px-5 py-2.5 rounded-2xl text-[10px] font-black transition-all ${tier === 'ultra' ? 'monet-btn !shadow-accent-pink/40' : isPro ? 'glass-panel-light border border-white/50 text-accent-blue' : 'glass-panel-light text-accent-sage'}`}>
          {tier === 'ultra' ? 'ULTRA' : tier === 'pro' ? 'PRO' : 'UPGRADE'}
        </button>
      </div>
    </header>
  );
};

