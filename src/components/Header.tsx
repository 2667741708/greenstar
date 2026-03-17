import React from 'react';

interface HeaderProps {
  isPro: boolean;
  onRefreshLocation: () => void;
  onUpgradeKey: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isPro, onRefreshLocation, onUpgradeKey }) => {
  return (
    <header className={`p-4 sticky top-0 z-40 flex justify-between items-center transition-all duration-500 border-b ${isPro ? 'bg-slate-900 text-white border-slate-800 shadow-xl' : 'bg-white/90 backdrop-blur-md border-emerald-50 shadow-sm'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl shadow-lg flex items-center justify-center text-white ${isPro ? 'bg-gradient-to-tr from-amber-500 to-yellow-300' : 'bg-emerald-600'}`}>
          <i className={`bi ${isPro ? 'bi-lightning-fill' : 'bi-star-fill'} star-shine text-lg`}></i>
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">绿星 <span className={isPro ? 'text-amber-400' : 'text-emerald-500'}>{isPro ? 'PRO' : 'EXPLORE'}</span></h1>
          <p className="text-[10px] font-bold tracking-widest uppercase opacity-60">Smart Footprint</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onRefreshLocation} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 hover:bg-emerald-100 active:scale-90 transition-all"><i className="bi bi-crosshair"></i></button>
        <button onClick={onUpgradeKey} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${isPro ? 'bg-white/10 border border-white/20 text-amber-300' : 'bg-emerald-50 text-emerald-700'}`}>{isPro ? 'PRO' : 'UPGRADE'}</button>
      </div>
    </header>
  );
};
