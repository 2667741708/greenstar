// ============================================================================
// 文件: src/components/ProfilePanel.tsx
// 基准版本: ProfilePanel.tsx (122行, 仅展示行程计划)
// 修改内容 / Changes:
//   [新增] 打卡统计数据（总次数、照片数、城市数、地点数）
//   [新增] 嵌入 CheckinDiary 时间线组件展示打卡足迹
//   [NEW] Check-in stats from IndexedDB (total, photos, cities, spots)
//   [NEW] Embedded CheckinDiary timeline for footprint display
// ============================================================================

import React, { useState, useEffect } from 'react';
import { Spot, CityInfo } from '../types';
import { CheckinDiary } from './CheckinDiary';
import { getCheckinStats } from '../services/checkinStore';
import { monetAssets } from '../config/monetAssets';

interface SavedPlan {
  id: string;
  destination: string;
  content: string;
  date: string;
}

interface ProfilePanelProps {
  isPro: boolean;
  spots: Spot[];
  cities: CityInfo[];
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ isPro, spots, cities }) => {
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [viewingPlan, setViewingPlan] = useState<SavedPlan | null>(null);
  const [activeTab, setActiveTab] = useState<'diary' | 'plans'>('diary');
  const [stats, setStats] = useState({ totalCheckins: 0, totalPhotos: 0, citiesVisited: 0, spotsVisited: 0 });

  useEffect(() => {
    try {
      const data = localStorage.getItem('gs_saved_plans');
      if (data) setSavedPlans(JSON.parse(data));
    } catch { }
    getCheckinStats().then(setStats);
  }, []);

  const checkedSpots = spots.filter(s => s.checkedIn).length;
  const unlockedCities = cities.filter(c => c.isUnlocked).length;

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      <div 
        className="rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl transition-all duration-700 bg-cover bg-center border border-white/20"
        style={{ backgroundImage: `url(${monetAssets.bgGarden})` }}
      >
        <div className="absolute inset-0 bg-slate-900/30 mix-blend-multiply pointer-events-none"></div>
        <div className="relative z-10">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-2xl border border-white/40 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">
            <i className={`bi ${isPro ? 'bi-person-stars text-amber-400' : 'bi-person text-emerald-400'}`}></i>
          </div>
          <h3 className="text-2xl font-black mb-1 drop-shadow-md">{isPro ? 'Pro Traveler' : 'Explorer'}</h3>
          <div className="flex flex-col gap-2 mt-4">
            <p className="text-xs text-white/90 font-bold uppercase tracking-widest bg-black/20 border border-white/30 px-4 py-2.5 rounded-[1rem] shadow-inner inline-block w-max backdrop-blur-md">
              <i className="bi bi-geo-alt-fill text-[var(--color-accent-lilac)] mr-2"></i>解锁城市: {unlockedCities} / {cities.length}
            </p>
            <p className="text-xs text-white/90 font-bold uppercase tracking-widest bg-black/20 border border-white/30 px-4 py-2.5 rounded-[1rem] shadow-inner inline-block w-max backdrop-blur-md">
              <i className="bi bi-pin-map-fill text-amber-400 mr-2"></i>足迹点亮: {checkedSpots} 个坐标
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-40 rotate-12 mix-blend-overlay">
          <i className="bi bi-stars text-9xl"></i>
        </div>
      </div>

      {/* 打卡统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: 'bi-camera-fill', label: '打卡', value: stats.totalCheckins, color: 'text-emerald-600' },
          { icon: 'bi-image-fill', label: '照片', value: stats.totalPhotos, color: 'text-blue-600' },
          { icon: 'bi-geo-fill', label: '城市', value: stats.citiesVisited, color: 'text-[var(--color-accent-lilac)]' },
          { icon: 'bi-pin-map-fill', label: '地点', value: stats.spotsVisited, color: 'text-amber-600' },
        ].map((item, i) => (
          <div key={i} className="bg-white/40 backdrop-blur-xl rounded-[1.8rem] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.05)] shadow-inner border border-white/50 flex flex-col items-center gap-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center bg-white/60 border border-white/40 shadow-inner ${item.color}`}>
              <i className={`bi ${item.icon} text-lg`}></i>
            </div>
            <span className="text-xl font-black text-slate-800 drop-shadow-sm">{item.value}</span>
            <span className="text-[10px] text-slate-500 font-bold tracking-wider">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Tab 切换 */}
      <div className="flex bg-white/30 backdrop-blur-2xl border border-white/40 rounded-[1.8rem] p-1.5 gap-1 shadow-inner">
        <button 
          onClick={() => setActiveTab('diary')}
          className={`flex-1 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ease-out ${activeTab === 'diary' ? 'bg-white shadow-md text-slate-800 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-white/20'}`}
        >
          <i className="bi bi-journal-richtext mr-1.5"></i>打卡足迹
        </button>
        <button 
          onClick={() => setActiveTab('plans')}
          className={`flex-1 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ease-out ${activeTab === 'plans' ? 'bg-white shadow-md text-slate-800 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-white/20'}`}
        >
          <i className="bi bi-collection-play-fill mr-1.5"></i>行程记忆库
        </button>
      </div>

      {/* 打卡日记时间线 */}
      {activeTab === 'diary' && <CheckinDiary />}

      {/* 我的行程库 / Saved Plans */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          {savedPlans.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {savedPlans.map(plan => (
                <div 
                  key={plan.id}
                  onClick={() => setViewingPlan(plan)}
                  className="bg-white/60 backdrop-blur-2xl p-5 rounded-[2rem] shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-white/50 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 ease-out active:scale-[0.98] cursor-pointer flex gap-5 items-center group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-accent-lilac)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="w-14 h-14 bg-white/70 backdrop-blur-md shadow-inner border border-white/40 text-[var(--color-accent-lilac)] rounded-[1.2rem] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 ease-out z-10">
                    <i className="bi bi-file-earmark-richtext text-2xl drop-shadow-sm"></i>
                  </div>
                  <div className="flex-1 min-w-0 z-10">
                    <h4 className="font-bold text-slate-800 text-lg truncate drop-shadow-sm">{plan.destination} 的定制行</h4>
                    <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 font-medium">
                      <i className="bi bi-calendar2-week opacity-70"></i> {plan.date} 生成
                    </p>
                  </div>
                  <div className="text-slate-300 group-hover:text-slate-500 transition-colors z-10">
                    <i className="bi bi-chevron-right text-lg"></i>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/30 backdrop-blur-xl border border-dashed border-white/60 rounded-[2.5rem] p-10 text-center text-slate-400 shadow-inner">
              <i className="bi bi-box2-heart text-5xl mb-4 block text-slate-300 drop-shadow-sm"></i>
              <p className="font-bold text-base text-slate-600">暂无收藏的记忆区块</p>
              <p className="text-xs mt-2 font-medium opacity-80">去星系探索引擎建立专属档案吧</p>
            </div>
          )}
        </div>
      )}

      {viewingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-2xl h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-xl font-black text-gray-800">{viewingPlan.destination} 行程单</h3>
                <p className="text-xs text-gray-500 mt-1 font-bold">创建于 {viewingPlan.date}</p>
              </div>
              <button 
                onClick={() => setViewingPlan(null)}
                className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar prose prose-sm max-w-none prose-headings:text-emerald-800 prose-a:text-emerald-600">
              <div dangerouslySetInnerHTML={{ 
                __html: viewingPlan.content
                  .replace(/## /g, '<h2 class="text-xl font-black mt-6 mb-3 border-b pb-2">')
                  .replace(/### /g, '<h3 class="text-lg font-bold mt-5 mb-2 text-emerald-700">')
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-900 bg-emerald-50 px-1 rounded">$1</strong>')
                  .replace(/-\s/g, '<li class="ml-4 mb-2 list-disc marker:text-emerald-400">')
                  .replace(/\n/g, '<br/>') 
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
