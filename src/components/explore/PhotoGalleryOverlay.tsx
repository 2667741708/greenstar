import React, { useState, useEffect } from 'react';
import { Spot } from '../../types';
import { Sparkles, MapPin, X } from 'lucide-react';

interface PhotoGalleryOverlayProps {
  memories: Spot[];
  onGenerateJournal: () => void;
}

export const PhotoGalleryOverlay: React.FC<PhotoGalleryOverlayProps> = ({ memories, onGenerateJournal }) => {
  if (memories.length === 0) return null;

  const allPhotos: { spotId: string; name: string; url: string; timestamp: string }[] = [];
  memories.forEach(mem => {
    (mem.photos || []).forEach(url => {
      allPhotos.push({
        spotId: mem.id,
        name: mem.name,
        url,
        timestamp: mem.checkInTimestamp || 'Today'
      });
    });
  });

  if (allPhotos.length === 0) return null;

  return (
    <>
      <div className="absolute top-28 right-0 bottom-36 w-2/3 max-w-[320px] pointer-events-none z-[60] flex flex-col items-end">
        {/* Scrollable Gallery Area */}
        <div className="flex-1 w-full overflow-y-auto overflow-x-hidden scrollbar-none pointer-events-auto flex flex-col items-center gap-[-40px] pt-10 pb-32 relative mask-image-[linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)] pr-4 sm:pr-8">
          <div className="text-[10px] font-semibold text-slate-500/80 -rotate-90 absolute left-[-40px] top-[50%] tracking-widest pointer-events-none whitespace-nowrap">
            ← Scroll for Memories →
          </div>

          {allPhotos.map((photo, i) => (
            <div 
              key={`${photo.spotId}-${i}`} 
              className="stack-card w-full sm:w-[220px] max-w-[240px] glass-panel p-3 pb-4 rounded-2xl relative cursor-pointer flex-shrink-0 origin-bottom right-0 ml-auto"
              style={{ 
                marginTop: i === 0 ? '0' : '-80px',
                transform: `rotate(${i % 2 === 0 ? '-4deg' : '5deg'}) translateX(${i % 3 === 0 ? '-10px' : '10px'})`,
                zIndex: i
              }}
            >
              <div className="w-full aspect-[4/3] bg-slate-100 rounded-[12px] overflow-hidden relative shadow-inner">
                 <img src={photo.url} className="w-full h-full object-cover" alt={photo.name} />
              </div>
              <div className="mt-3 text-left pl-1">
                <h4 className="font-bold text-slate-800 text-[14px] truncate leading-tight">{photo.name}</h4>
                <p className="text-[10px] text-slate-500 font-medium tracking-wide mt-0.5">{photo.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Action Button for AI Journal */}
      <div className="absolute bottom-10 inset-x-0 z-[70] pointer-events-none flex flex-col items-center justify-end">
        <button 
          onClick={onGenerateJournal}
          className="pointer-events-auto bg-white/90 backdrop-blur-xl px-8 py-4 rounded-full shadow-2xl border border-white flex items-center justify-center gap-3 hover:bg-white transition-all hover:scale-105 active:scale-95 group"
        >
          <Sparkles className="w-6 h-6 text-orange-500" />
          <span className="text-base font-bold text-slate-800">Check In</span>
        </button>
      </div>
    </>
  );
};
