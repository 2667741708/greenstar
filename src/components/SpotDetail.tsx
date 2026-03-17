import React, { useState } from 'react';
import { Spot } from '../types';

interface SpotDetailProps {
  spot: Spot;
  onClose: () => void;
  onCheckIn: (spot: Spot) => void;
  isPro: boolean;
}

export const SpotDetail: React.FC<SpotDetailProps> = ({ spot, onClose, onCheckIn, isPro }) => {
  const [imgError, setImgError] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(true);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl overflow-hidden animate-slide-up relative" onClick={e => e.stopPropagation()}>
        <div className="absolute top-6 right-6 z-20">
          <button onClick={onClose} className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-colors hover:bg-black/40"><i className="bi bi-x-lg"></i></button>
        </div>
        <div className="h-64 bg-gray-100 relative overflow-hidden group">
          {isImgLoading && !imgError && (
            <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
              <i className="bi bi-image text-4xl text-gray-300"></i>
            </div>
          )}
          {!imgError && spot.imageUrl ? (
            <img 
              src={spot.imageUrl} 
              className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-110 ${isImgLoading ? 'opacity-0' : 'opacity-100'}`} 
              onLoad={() => setIsImgLoading(false)}
              onError={() => { setImgError(true); setIsImgLoading(false); }} 
              referrerPolicy="no-referrer"
              alt={spot.name}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-emerald-50 text-emerald-100 text-8xl">
              <i className={`bi ${spot.category.toLowerCase().includes('cafe') ? 'bi-cup-hot' : 'bi-camera'}`}></i>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-black/10"></div>
        </div>
        <div className="px-8 pb-10 pt-6 space-y-6">
          <div className="space-y-2 text-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full">{spot.category}</span>
            <h2 className="text-3xl font-black text-gray-900 leading-tight">{spot.name}</h2>
            <div className="flex items-center justify-center gap-1 text-amber-400">
              {[...Array(5)].map((_, i) => (<i key={i} className={`bi bi-star${i < Math.floor(spot.rating) ? '-fill' : ''}`}></i>))}
              <span className="text-gray-400 text-xs font-bold ml-2">({spot.rating})</span>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed font-medium text-center">{spot.description}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {spot.tags.map((tag, idx) => (<span key={idx} className="text-[10px] font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl">#{tag}</span>))}
          </div>
          <div className="pt-6 flex gap-3">
             <button onClick={() => onCheckIn(spot)} disabled={spot.checkedIn} className={`flex-1 py-4 rounded-2xl font-black tracking-widest text-sm transition-all shadow-xl active:scale-95 ${spot.checkedIn ? 'bg-gray-100 text-gray-400 shadow-none' : (isPro ? 'bg-amber-500 text-white shadow-amber-200' : 'bg-emerald-600 text-white shadow-emerald-200')}`}>{spot.checkedIn ? '已点亮足迹' : '立即实地打卡'}</button>
             <button className="px-6 py-4 bg-gray-100 rounded-2xl text-gray-600 hover:bg-gray-200 transition-all"><i className="bi bi-send-fill"></i></button>
          </div>
        </div>
      </div>
    </div>
  );
};
