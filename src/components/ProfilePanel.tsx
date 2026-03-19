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
      <div className={`rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl transition-all duration-700 ${isPro ? 'bg-slate-900 border-2 border-amber-500/20' : 'bg-gray-900'}`}>
        <div className="relative z-10">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">
            <i className={`bi ${isPro ? 'bi-person-stars text-amber-400' : 'bi-person text-emerald-400'}`}></i>
          </div>
          <h3 className="text-2xl font-black mb-1">{isPro ? 'Pro Traveler' : 'Explorer'}</h3>
          <div className="flex flex-col gap-2 mt-4">
            <p className="text-xs opacity-70 font-bold uppercase tracking-widest bg-black/20 px-3 py-2 rounded-xl inline-block w-max">
              <i className="bi bi-geo-alt-fill text-emerald-400 mr-2"></i>解锁城市: {unlockedCities} / {cities.length}
            </p>
            <p className="text-xs opacity-70 font-bold uppercase tracking-widest bg-black/20 px-3 py-2 rounded-xl inline-block w-max">
              <i className="bi bi-pin-map-fill text-amber-400 mr-2"></i>足迹点亮: {checkedSpots} 个坐标
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
          <i className="bi bi-stars text-9xl"></i>
        </div>
      </div>

      {/* 打卡统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: 'bi-camera-fill', label: '打卡', value: stats.totalCheckins, color: 'text-emerald-500 bg-emerald-50' },
          { icon: 'bi-image-fill', label: '照片', value: stats.totalPhotos, color: 'text-blue-500 bg-blue-50' },
          { icon: 'bi-geo-fill', label: '城市', value: stats.citiesVisited, color: 'text-purple-500 bg-purple-50' },
          { icon: 'bi-pin-map-fill', label: '地点', value: stats.spotsVisited, color: 'text-amber-500 bg-amber-50' },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
              <i className={`bi ${item.icon} text-lg`}></i>
            </div>
            <span className="text-xl font-black text-gray-800">{item.value}</span>
            <span className="text-[10px] text-gray-400 font-bold">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Tab 切换 */}
      <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
        <button 
          onClick={() => setActiveTab('diary')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'diary' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <i className="bi bi-journal-richtext mr-1.5"></i>打卡足迹
        </button>
        <button 
          onClick={() => setActiveTab('plans')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'plans' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
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
                  className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer flex gap-4 items-center group"
                >
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <i className="bi bi-file-earmark-richtext text-2xl"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-800 text-lg truncate">{plan.destination} 的定制行</h4>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                      <i className="bi bi-calendar2-week"></i> {plan.date} 生成
                    </p>
                  </div>
                  <div className="text-gray-300">
                    <i className="bi bi-chevron-right"></i>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/50 border border-dashed border-gray-200 rounded-3xl p-8 text-center text-gray-400">
              <i className="bi bi-box2-heart text-4xl mb-2 block text-gray-300"></i>
              <p className="font-bold text-sm">暂无保存的行程计划</p>
              <p className="text-xs mt-1">去AI规划引擎生成并收藏吧</p>
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
