import React, { useState } from 'react';
import { Spot } from '../types';

interface DiscoverCardProps {
  spot: Spot;
  onClick: (spot: Spot) => void;
}

export const DiscoverCard: React.FC<DiscoverCardProps> = ({ spot, onClick }) => {
  const [imgError, setImgError] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(true);

  return (
    <div onClick={() => onClick(spot)} className="bg-white rounded-[2.5rem] p-5 shadow-sm border border-gray-50 flex gap-5 group hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer">
      <div className="w-28 h-28 bg-gray-100 rounded-3xl shrink-0 relative overflow-hidden shadow-inner flex items-center justify-center">
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
          <div className="w-full h-full flex items-center justify-center bg-emerald-50 text-emerald-200 text-3xl">
            <i className={`bi ${spot.category.toLowerCase().includes('cafe') ? 'bi-cup-hot' : 'bi-camera'}`}></i>
          </div>
        )}
        {spot.checkedIn && <div className="absolute inset-0 bg-emerald-600/10 flex items-center justify-center text-emerald-600 font-black text-[10px] rotate-[-15deg] backdrop-blur-[1px]">CHECKED</div>}
      </div>
      <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-black text-lg text-gray-900 truncate">{spot.name}</h3>
            {spot.isAIGenerated && (
              <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 animate-pulse">
                <i className="bi bi-robot"></i> AI智荐
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed font-medium">{spot.description}</p>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">{spot.distance ? `${(spot.distance / 1000).toFixed(1)}KM` : 'NEARBY'}</span>
          <div className="flex items-center gap-2">
            {spot.dataSource && (
              <span className="text-[8px] font-bold text-gray-300">{spot.dataSource}</span>
            )}
            <div className="flex items-center gap-1 text-amber-400 text-[10px] font-black"><i className="bi bi-star-fill"></i> {spot.rating}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
