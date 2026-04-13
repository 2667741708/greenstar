// ============================================================================
// 文件: src/components/CheckinDiary.tsx
// 基准版本: 全新文件 (NEW)
// 修改内容 / Changes:
//   [新增] 打卡日记时间线组件，按时间倒序展示所有打卡足迹
//   [NEW] Check-in diary timeline component, displays all check-in footprints
// ============================================================================

import React, { useState, useEffect } from 'react';
import { CheckInRecord, getAllCheckins, deleteCheckin } from '../services/localVault';

interface CheckinDiaryProps {
  cityFilter?: string;     // 可选城市过滤
  onClose?: () => void;
}

export const CheckinDiary: React.FC<CheckinDiaryProps> = ({ cityFilter, onClose }) => {
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
  }, [cityFilter]);

  const loadRecords = async () => {
    const all = await getAllCheckins();
    setRecords(cityFilter ? all.filter(r => r.cityName === cityFilter) : all);
  };

  const handleDelete = async (id: string) => {
    await deleteCheckin(id);
    await loadRecords();
  };

  // 按日期分组
  const groupByDate = (items: CheckInRecord[]) => {
    const groups: Record<string, CheckInRecord[]> = {};
    items.forEach(r => {
      const date = new Date(r.timestamp).toLocaleDateString('zh-CN', { 
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' 
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(r);
    });
    return groups;
  };

  const grouped = groupByDate(records);

  if (records.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-3xl flex items-center justify-center">
          <i className="bi bi-journal-richtext text-3xl text-gray-300"></i>
        </div>
        <h3 className="text-lg font-bold text-gray-400">还没有打卡记录</h3>
        <p className="text-xs text-gray-400 mt-1">去探索页面找到你喜欢的地方，拍照留念吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          {/* 日期分割线 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30"></div>
            <span className="text-sm font-black text-gray-700">{date}</span>
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="text-[10px] text-gray-400 font-bold">{items.length} 条打卡</span>
          </div>

          {/* 该日期下的打卡卡片 */}
          <div className="space-y-3 pl-5 border-l-2 border-emerald-100 ml-1.5">
            {items.map(record => {
              const isExpanded = expandedId === record.id;
              return (
                <div 
                  key={record.id} 
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all group"
                >
                  {/* 卡片头部 */}
                  <div 
                    className="p-4 cursor-pointer flex gap-3 items-center"
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  >
                    {/* 缩略图 */}
                    {record.thumbnail ? (
                      <img 
                        src={record.thumbnail} 
                        className="w-14 h-14 rounded-xl object-cover shadow-sm shrink-0" 
                        alt="" 
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-300 shrink-0">
                        <i className="bi bi-camera text-xl"></i>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-800 text-sm truncate">{record.spotName}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-bold">{record.category}</span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {new Date(record.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          <i className="bi bi-image mr-0.5"></i>{record.photos.length}张
                        </span>
                      </div>
                      {record.note && (
                        <p className="text-xs text-gray-500 mt-1 truncate italic">"{record.note}"</p>
                      )}
                    </div>

                    <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} text-gray-300 text-xs`}></i>
                  </div>

                  {/* 展开的详细内容 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      {/* 照片网格 */}
                      {record.photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {record.photos.map((photo, i) => (
                            <img 
                              key={i} 
                              src={photo} 
                              className="w-full aspect-square object-cover rounded-xl cursor-pointer hover:opacity-80 transition-opacity shadow-sm" 
                              onClick={() => setViewingPhoto(photo)}
                              alt={`打卡照片 ${i + 1}`}
                            />
                          ))}
                        </div>
                      )}
                      
                      {/* 笔记 */}
                      {record.note && (
                        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                          <p className="text-xs text-amber-800 font-medium leading-relaxed">
                            <i className="bi bi-quote mr-1 text-amber-400"></i>
                            {record.note}
                          </p>
                        </div>
                      )}

                      {/* 地点信息 */}
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span><i className="bi bi-geo-alt mr-1"></i>{record.cityName} · {record.spotName}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(record.id); }}
                          className="text-red-400 hover:text-red-500 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <i className="bi bi-trash mr-1"></i>删除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 全屏照片查看器 */}
      {viewingPhoto && (
        <div 
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setViewingPhoto(null)}
        >
          <img src={viewingPhoto} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" alt="查看大图" />
          <button 
            className="absolute top-6 right-6 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30"
            onClick={() => setViewingPhoto(null)}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      )}
    </div>
  );
};
