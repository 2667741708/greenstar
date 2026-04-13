// ============================================================================
// 文件: src/components/SpotDetail.tsx
// 基准版本: SpotDetail.tsx (100行, Blob URL版本)
// 修改内容 / Changes:
//   [修改] 打卡照片从内存 Blob URL 改为 IndexedDB Base64 持久化存储
//   [新增] 文字笔记输入框，打卡时可附带心得
//   [新增] 历史打卡照片展示区域
//   [MOD] Photos now persist via IndexedDB Base64 instead of in-memory Blob URLs
//   [NEW] Text note input for check-in
//   [NEW] Historical check-in photos display section
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { Spot } from '../types';
import { 
  fileToBase64, generateThumbnail, saveCheckin, getCheckinsBySpot, 
  CheckInRecord 
} from '../services/localVault';
import { getHDImageUrl } from '../services/poiCache';
import { monetIcons } from '../config/monetIcons';


interface SpotDetailProps {
  spot: Spot;
  cityName?: string;
  onClose: () => void;
  onCheckIn: (spot: Spot, photoUrls?: string[]) => void;
  isPro: boolean;
}

export const SpotDetail: React.FC<SpotDetailProps> = ({ spot, cityName = '未知城市', onClose, onCheckIn, isPro }) => {
  const [imgError, setImgError] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(true);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<CheckInRecord[]>([]);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [hdCoverUrl, setHdCoverUrl] = useState<string>('');  // HD 缓存封面 URL
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载该地点的历史打卡记录
  useEffect(() => {
    getCheckinsBySpot(spot.id).then(setHistory);
  }, [spot.id]);

  // 从 IndexedDB 加载 HD 封面（缓存命中返回 blob URL，否则回退网络 URL）
  // Load HD cover from IndexedDB cache (blob URL if hit, network URL if miss)
  useEffect(() => {
    const loadHD = async () => {
      if (spot.imageUrlHD) {
        const url = await getHDImageUrl(spot.imageUrlHD);
        setHdCoverUrl(url);
      } else if (spot.imageUrl) {
        setHdCoverUrl(spot.imageUrl);
      }
    };
    loadHD();
  }, [spot.id, spot.imageUrlHD, spot.imageUrl]);

  const handleCameraCheckIn = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    
    setIsSaving(true);
    try {
      // 转换所有文件为 Base64
      const base64Photos = await Promise.all(files.map(f => fileToBase64(f)));
      const thumbnail = await generateThumbnail(base64Photos[0]);

      // 持久化保存到 IndexedDB
      const record: CheckInRecord = {
        id: `${spot.id}_${Date.now()}`,
        spotId: spot.id,
        spotName: spot.name,
        cityName: cityName,
        category: spot.category,
        coordinates: spot.coordinates,
        photos: base64Photos,
        thumbnail,
        timestamp: new Date().toISOString(),
        note: note.trim(),
      };
      await saveCheckin(record);

      // 通知父组件（兼容旧逻辑）
      const blobUrls = files.map(f => URL.createObjectURL(f));
      onCheckIn(spot, blobUrls);

      // 刷新历史
      const updated = await getCheckinsBySpot(spot.id);
      setHistory(updated);
      setNote('');
    } catch (err) {
      console.error('保存打卡记录失败:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      {/* 隐藏的文件输入 */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        multiple
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />

      <div className="w-full max-w-lg glass-panel !rounded-t-[3.5rem] sm:!rounded-[3.5rem] shadow-2xl overflow-hidden animate-slide-up relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <div className="absolute top-6 right-6 z-20">
          <button onClick={onClose} className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-colors hover:bg-black/40"><i className="bi bi-x-lg"></i></button>
        </div>

        {/* 封面高清大图（优先 HD 缓存，点击可全屏查看） */}
        {/* Cover HD image (prefer cached HD, click to view fullscreen) */}
        <div className="h-80 bg-gray-100 relative overflow-hidden group cursor-pointer" onClick={() => {
          // 全屏查看使用 HD 图片
          // Fullscreen view uses HD image
          const imgSrc = (spot.photos && spot.photos.length > 0) ? spot.photos[spot.photos.length - 1] : (hdCoverUrl || spot.imageUrl);
          if (imgSrc) setViewingPhoto(imgSrc);
        }}>
          {isImgLoading && !imgError && (
            <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
              <i className="bi bi-image text-4xl text-gray-300"></i>
            </div>
          )}
          {!imgError && ((spot.photos && spot.photos.length > 0) || hdCoverUrl || spot.imageUrl) ? (
            <img 
              src={spot.photos && spot.photos.length > 0 ? spot.photos[spot.photos.length - 1] : (hdCoverUrl || spot.imageUrl)} 
              className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-110 ${isImgLoading ? 'opacity-0' : 'opacity-100'}`} 
              onLoad={() => setIsImgLoading(false)}
              onError={() => { setImgError(true); setIsImgLoading(false); }} 
              referrerPolicy="no-referrer"
              alt={spot.name}
            />
          ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/20">
            <img src={monetIcons.camera} className="w-12 h-12 object-contain opacity-20" alt="placeholder" />
          </div>
        )}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-black/10"></div>
          
          {/* 打卡徽章 */}
          {history.length > 0 && (
            <div className="absolute top-4 left-4 bg-emerald-500 text-white px-3 py-1.5 rounded-full text-[10px] font-black shadow-lg flex items-center gap-1">
              <i className="bi bi-check-circle-fill"></i>
              已打卡 {history.length} 次
            </div>
          )}
        </div>

        {/* 内容区 */}
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

          {/* 笔记输入框 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 flex items-center gap-1">
              <i className="bi bi-pencil"></i> 打卡心得（可选）
            </label>
            <textarea 
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="记录此刻的感受..."
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-none h-20 placeholder:text-gray-400"
            />
          </div>

          {/* 打卡按钮 */}
          <div className="flex gap-4">
            <button 
              onClick={handleCameraCheckIn} 
              disabled={isSaving}
              className={`flex-1 py-4 monet-btn text-sm ${isSaving ? 'opacity-50 grayscale' : ''}`}
            >
              {isSaving 
                ? <span className="flex items-center justify-center gap-2"><i className="bi bi-hourglass-split animate-spin"></i>绘写记录中...</span>
                : <div className="flex items-center justify-center gap-2">
                    <img src={monetIcons.camera} className="w-6 h-6 object-contain" alt="camera" />
                    <span>{spot.checkedIn ? '再次漫游记' : '镌刻此地回忆'}</span>
                  </div>
              }
            </button>
          </div>

          {/* 历史打卡照片 */}
          {history.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <i className="bi bi-clock-history text-emerald-500"></i>
                打卡记忆 · {history.reduce((sum, r) => sum + r.photos.length, 0)} 张照片
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {history.flatMap(r => r.photos).slice(0, 12).map((photo, i) => (
                  <img 
                    key={i} 
                    src={photo} 
                    className="w-full aspect-square object-cover rounded-xl cursor-pointer hover:opacity-80 transition-opacity shadow-sm" 
                    onClick={() => setViewingPhoto(photo)}
                    alt={`历史照片 ${i + 1}`}
                  />
                ))}
              </div>
              {history.flatMap(r => r.photos).length > 12 && (
                <p className="text-center text-[10px] text-gray-400 font-bold">还有更多照片...</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 全屏照片查看 */}
      {viewingPhoto && (
        <div 
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => { e.stopPropagation(); setViewingPhoto(null); }}
        >
          <img src={viewingPhoto} className="max-w-full max-h-full object-contain rounded-2xl" alt="" />
        </div>
      )}
    </div>
  );
};
