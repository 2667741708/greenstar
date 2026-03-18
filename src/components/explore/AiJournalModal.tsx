import React, { useState, useEffect } from 'react';
import { Spot } from '../../types';
import { Sparkles, Calendar, MapPin, X, Loader2 } from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface AiJournalModalProps {
  memories: Spot[];
  citySlug: string;
  onClose: () => void;
}

export const AiJournalModal: React.FC<AiJournalModalProps> = ({ memories, citySlug, onClose }) => {
  const [isGenerating, setIsGenerating] = useState(true);
  const [diaryText, setDiaryText] = useState('');

  useEffect(() => {
    // 模拟基于大语言模型的旅行日志流式生成
    const timer = setTimeout(() => {
      setIsGenerating(false);
      
      const spotNames = memories.map(m => m.name).join('、');
      const text = `The journey through ${citySlug} was a tapestry of wonder. We began in the historic corners, their alleys echoing with centuries of tales. Then, the rugged majesty of ${spotNames} embraced us. Each moment was a breath of fresh air...
      
> 这不仅仅是一张地图的延展，更是内心的一次漫游。`;
      setDiaryText(text);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [memories, citySlug]);

  return (
    <div className="fixed inset-x-0 bottom-0 top-auto z-[200] flex items-end justify-center pointer-events-none sm:p-6 pb-0 animate-in hidden transition-all" style={{display: 'flex'}}>
      {/* Black opaque fade behind modal for focus */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={onClose}></div>

      <div className="w-full max-w-lg bg-[#eef1ed]/95 backdrop-blur-3xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-[0_-20px_60px_rgb(0,0,0,0.15)] overflow-hidden animate-slide-up relative flex flex-col border border-white/80 pointer-events-auto max-h-[75vh]">
        
        {/* Top Handle */}
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
        </div>

        <div className="px-8 pt-4 pb-2 relative z-10 shrink-0 flex justify-between items-start">
          <div className="pr-10">
            <p className="text-xs font-medium text-slate-500 mb-1">{memories[0]?.checkInTimestamp?.split(',')[0] || 'Today'}</p>
            <h2 className="text-[32px] sm:text-4xl font-serif font-black text-slate-900 leading-[1.1] tracking-tight">
              AI Generated<br/>Travel Diary
            </h2>
          </div>
          <div className="pt-2 text-[32px] font-black glowing-ai flex items-center gap-1">AI <Sparkles className="w-6 h-6 text-purple-400" /></div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-32 relative z-10">
          {isGenerating ? (
            <div className="h-40 flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-4" />
              <p className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-indigo-500 animate-pulse">
                Weaving your journey into a tapestry of wonder...
              </p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
              <div className="font-serif text-slate-800 leading-[1.8] text-[17px]">
                <MarkdownRenderer content={diaryText} />
              </div>
            </div>
          )}
        </div>
        
        {/* Bottom Toolbar inside modal */}
        <div className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 flex justify-around p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-8 z-20">
           <div className="flex flex-col items-center opacity-40"><MapPin className="w-6 h-6 mb-1"/><span className="text-[10px] font-bold">Explore</span></div>
           <div className="flex flex-col items-center opacity-100 text-slate-900"><MapPin className="w-6 h-6 mb-1"/><span className="text-[10px] font-bold">Journey</span></div>
           <div className="flex flex-col items-center opacity-40"><MapPin className="w-6 h-6 mb-1"/><span className="text-[10px] font-bold">Photos</span></div>
           <div className="flex flex-col items-center opacity-40"><MapPin className="w-6 h-6 mb-1"/><span className="text-[10px] font-bold">Profile</span></div>
           <div className="flex flex-col items-center opacity-40 glowing-ai"><Sparkles className="w-6 h-6 mb-1"/><span className="text-[10px] font-bold">AI Insight</span></div>
        </div>

      </div>
    </div>
  );
};
