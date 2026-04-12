import React, { useState, useEffect } from 'react';
import { Spot } from '../types';

interface DiscoverCardProps {
  spot: Spot;
  onClick: (spot: Spot) => void;
}

export const DiscoverCard: React.FC<DiscoverCardProps> = ({ spot, onClick }) => {
  const [imgError, setImgError] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(true);

  // 监听 imageUrl 变化以重置状态，接受来自外层异步的爬虫图片更新
  useEffect(() => {
    setImgError(false);
    setIsImgLoading(true);
  }, [spot.imageUrl]);

  return (
    <div onClick={() => onClick(spot)} className="glass-panel-light p-5 flex gap-5 group hover-magnetic cursor-pointer">
      <div className="w-28 h-28 bg-[rgba(255,255,255,0.3)] rounded-3xl shrink-0 relative overflow-hidden shadow-inner flex items-center justify-center border border-white/40">
        {isImgLoading && !imgError && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse"></div>
        )}
        {!imgError && spot.imageUrl ? (
          <img 
            src={spot.imageUrl} 
            className={`w-full h-full object-cover transition-opacity duration-500 ${isImgLoading ? 'opacity-0' : 'opacity-100'}`} 
            onLoad={() => setIsImgLoading(false)}
            onError={() => { setImgError(true); setIsImgLoading(false); }} 
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/10 text-slate-400 text-3xl">
            <i className={`bi ${spot.category.toLowerCase().includes('cafe') ? 'bi-cup-hot' : 'bi-camera'}`}></i>
          </div>
        )}
        {spot.checkedIn && <div className="absolute inset-0 bg-emerald-600/10 flex items-center justify-center text-emerald-600 font-black text-[10px] rotate-[-15deg] backdrop-blur-[1px]">CHECKED</div>}
      </div>
      <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-black text-lg text-slate-800 truncate group-hover:text-[var(--color-accent-lilac)] transition-colors">{spot.name}</h3>
            {spot.isAIGenerated && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-black text-white bg-[var(--color-accent-lilac)] px-2 py-0.5 rounded-full shadow-[0_0_8px_var(--color-accent-lilac)] animate-pulse">
                <i className="bi bi-stars"></i> AI智荐
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed font-medium">{spot.description}</p>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-700 bg-white/50 border border-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">{spot.distance ? `${(spot.distance / 1000).toFixed(1)}KM` : 'NEARBY'}</span>
            {spot.cost && spot.cost !== '0.00' && (
               <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-1 rounded-full"><i className="bi bi-currency-yen"></i> {spot.cost}</span>
            )}
            {spot.openTime && (
               <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full truncate max-w-[100px]"><i className="bi bi-clock"></i> {spot.openTime}</span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-2">
            {spot.dataSource && (
              <span className="text-[9px] font-bold text-slate-400/50 uppercase tracking-wider">{spot.dataSource}</span>
            )}
            <div className="flex items-center gap-1 text-[var(--color-accent-pink)] text-xs font-black"><i className="bi bi-star-fill drop-shadow-md"></i> {spot.rating}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
