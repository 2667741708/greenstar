// 修改来源 / Modified from: 用户提供的原始 index.tsx（使用 Gemini GoogleGenAI API）
// 修改内容 / Changes:
//   1. 移除 @google/genai 依赖，新增 callDeepSeek() 函数使用 DeepSeek API（Gemini 配额已耗尽 429）
//   2. refreshLocation 中使用高德 AMap.Geocoder 逆地理编码显示真实地址（原来只显示"当前实时位置"）
//   3. fetchSpots 和 generateDeepPlan 改为调用 DeepSeek API
//   4. 添加 20s/30s 超时保护（AbortController），避免请求卡死导致永久 loading
//   5. 添加 errorMsg 状态和 UI Toast，出错时显示友好提示

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from "marked";

// --- DeepSeek API Helper ---
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY as string;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

const callDeepSeek = async (prompt: string, jsonMode = false, timeoutMs = 30000): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: any = {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
};

// Types
interface Spot {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl?: string;
  coordinates: { lat: number; lng: number };
  rating: number;
  tags: string[];
  checkedIn: boolean;
  distance?: number;
}

interface GroundingSource {
  title: string;
  uri: string;
}

interface ItineraryData {
  destination?: string;
  arrivalPlan?: string;
  sources: GroundingSource[];
}

// Global AMap declaration
declare const AMap: any;

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const html = marked.parse(content);
  return <div className="markdown-content text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: html }} />;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'discover' | 'map' | 'plan' | 'profile'>('discover');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('定位中...');
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetDestination, setTargetDestination] = useState('');
  const [itinerary, setItinerary] = useState<ItineraryData | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const historyPathRef = useRef<any>(null);

  useEffect(() => {
    checkKeyStatus();
    refreshLocation();
  }, []);

  // 修改来源 / Modified from: 原始 refreshLocation（硬编码"当前实时位置"字符串）
  // 修改内容 / Changes: GPS 定位成功后使用高德 AMap.Geocoder.getAddress 逆地理编码获取真实地址
  const refreshLocation = () => {
    if (navigator.geolocation) {
      setLoading(true);
      setLoadingStep('正在同步您的地理星图...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // 使用高德逆地理编码获取真实地址
          if (typeof AMap !== 'undefined') {
            AMap.plugin(['AMap.Geocoder'], () => {
              try {
                const geocoder = new AMap.Geocoder();
                geocoder.getAddress([loc.lng, loc.lat], (status: string, result: any) => {
                  if (status === 'complete' && result?.regeocode) {
                    const addr = result.regeocode.formattedAddress || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
                    updateContext(loc, addr);
                  } else {
                    // 逆地理编码失败（如代理干扰 *.amap.com），回退显示坐标
                    updateContext(loc, `📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
                  }
                });
              } catch {
                updateContext(loc, `📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
              }
            });
          } else {
            updateContext(loc, `📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
          }
        },
        () => {
          const fallback = { lat: 31.2304, lng: 121.4737 }; // 上海
          updateContext(fallback, "上海市 (默认参考点)");
        }
      );
    }
  };

  const updateContext = (loc: { lat: number; lng: number }, address: string) => {
    setUserLocation(loc);
    setCurrentAddress(address);
    fetchSpots(loc.lat, loc.lng);
    if (mapInstance.current) {
      mapInstance.current.setCenter([loc.lng, loc.lat]);
    }
  };

  const handleManualLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    if (typeof AMap === 'undefined') {
      alert('高德地图 JS API 未加载成功，请检查网络。');
      return;
    }
    setLoading(true);
    setLoadingStep('正在定位目标坐标系...');
    AMap.plugin(['AMap.Geocoder'], () => {
      try {
        const geocoder = new AMap.Geocoder();
        geocoder.getLocation(searchQuery, (status: string, result: any) => {
          if (status === 'complete' && result.geocodes.length) {
            const first = result.geocodes[0];
            const loc = { lat: first.location.lat, lng: first.location.lng };
            updateContext(loc, first.formattedAddress);
          } else {
            alert("找不到该地址，请尝试输入更具体的城市或地点名。");
            setLoading(false);
          }
        });
      } catch {
        alert('高德地理编码初始化失败。');
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    if (activeTab === 'map' && userLocation) {
      const timer = setTimeout(() => initMap(), 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, userLocation, spots]);

  const checkKeyStatus = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsPro(hasKey);
    }
  };

  const handleUpgradeKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setIsPro(true);
    }
  };

  const initMap = () => {
    if (!document.getElementById('amap-container')) return;
    if (!mapInstance.current) {
      mapInstance.current = new AMap.Map('amap-container', {
        zoom: 14,
        center: [userLocation?.lng || 121.4737, userLocation?.lat || 31.2304],
        viewMode: '3D',
        pitch: 45,
        mapStyle: isPro ? 'amap://styles/darkblue' : 'amap://styles/whitesmoke'
      });
      mapInstance.current.on('click', () => setSelectedSpot(null));
      AMap.plugin(['AMap.ToolBar'], function() {
        mapInstance.current.addControl(new AMap.ToolBar({ position: 'RB' }));
      });
    }
    updateMarkers();
    updateTravelHistory();
  };

  const updateMarkers = () => {
    if (!mapInstance.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (userLocation) {
      const userMarker = new AMap.Marker({
        position: [userLocation.lng, userLocation.lat],
        content: `<div class="relative"><div class="absolute inset-0 w-8 h-8 bg-blue-500/20 rounded-full animate-ping"></div><div class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-lg"></div></div>`,
        offset: new AMap.Pixel(-8, -8),
        zIndex: 100
      });
      userMarker.setMap(mapInstance.current);
      markersRef.current.push(userMarker);
    }
    spots.forEach(spot => {
      const isSelected = selectedSpot?.id === spot.id;
      const marker = new AMap.Marker({
        position: [spot.coordinates.lng, spot.coordinates.lat],
        content: `<div class="custom-marker transition-all duration-500 ${isSelected ? 'scale-125 shadow-xl' : ''}" style="background: ${spot.checkedIn ? (isPro ? '#f59e0b' : '#059669') : '#94a3b8'}; border: ${spot.checkedIn ? '3px solid white' : '1px solid white'}; opacity: ${spot.checkedIn ? '1' : '0.6'}"><i class="bi bi-${spot.category.toLowerCase().includes('cafe') ? 'cup-hot' : 'star-fill'}"></i></div>`,
        offset: new AMap.Pixel(-16, -32)
      });
      marker.on('click', () => { setSelectedSpot(spot); mapInstance.current.panTo([spot.coordinates.lng, spot.coordinates.lat]); });
      marker.setMap(mapInstance.current);
      markersRef.current.push(marker);
    });
  };

  const updateTravelHistory = () => {
    if (!mapInstance.current) return;
    if (historyPathRef.current) { historyPathRef.current.setMap(null); historyPathRef.current = null; }
    const checkedInSpots = spots.filter(s => s.checkedIn);
    if (checkedInSpots.length < 2) return;
    const path = checkedInSpots.map(s => [s.coordinates.lng, s.coordinates.lat]);
    historyPathRef.current = new AMap.Polyline({
      path: path,
      isOutline: true,
      outlineColor: isPro ? '#f59e0b' : '#059669',
      strokeColor: isPro ? '#fbbf24' : '#10b981',
      strokeOpacity: 0.8,
      strokeWeight: 6,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 50,
      showDir: true
    });
    historyPathRef.current.setMap(mapInstance.current);
  };

  // 修改来源 / Modified from: 原始 fetchSpots（使用 Gemini GoogleGenAI + googleSearch grounding，两次 API 调用）
  // 修改内容 / Changes: 替换为 DeepSeek API 单次调用直接返回 JSON，添加 20 秒超时保护和错误提示
  const fetchSpots = async (lat: number, lng: number, query?: string) => {
    setLoading(true);
    setLoadingStep('正在调取卫星数据与实景快照...');
    setErrorMsg(null);
    try {
      const prompt = `你是一个本地资深导游。用户在坐标 (${lat.toFixed(4)}, ${lng.toFixed(4)}) 附近。
请推荐 5 个最值得打卡的真实地点（网红景点、咖啡馆、地标、美食等）。${query ? `用户搜索关键词："${query}"，请重点推荐相关地点。` : ''}

请严格返回以下 JSON 格式，不要有多余文字：
{"spots": [
  {
    "id": "1",
    "name": "地点名称",
    "description": "一句话中文描述",
    "category": "类别(Landmark/Cafe/Park/Museum/Restaurant等)",
    "imageUrl": "该地点的真实图片URL(优先使用Wikipedia或Wikimedia Commons图片直链，以.jpg/.png/.webp结尾)",
    "lat": 31.2304,
    "lng": 121.4737,
    "rating": 4.5,
    "tags": ["标签1", "标签2"]
  }
]}

注意：坐标必须是该地点的真实坐标，不要随机生成。评分 1-5 分。`;

      const text = await callDeepSeek(prompt, true, 20000);
      const parsed = JSON.parse(text);
      const spotsArr = parsed.spots || parsed;
      const parsedSpots = (Array.isArray(spotsArr) ? spotsArr : []).map((s: any, idx: number) => ({
        id: s.id || String(idx),
        name: s.name || '未知地点',
        description: s.description || '',
        category: s.category || 'Landmark',
        imageUrl: s.imageUrl || '',
        coordinates: { lat: Number(s.lat) || lat, lng: Number(s.lng) || lng },
        rating: Number(s.rating) || 4,
        tags: Array.isArray(s.tags) ? s.tags : [],
        checkedIn: false,
        distance: calculateDistance(lat, lng, Number(s.lat) || lat, Number(s.lng) || lng)
      }));
      setSpots(parsedSpots);
    } catch (error: any) {
      console.error("Fetch spots error:", error);
      setSpots([]);
      if (error.name === 'AbortError') {
        setErrorMsg('⏱ 请求超时，请检查网络后重试');
      } else {
        setErrorMsg(`❌ 获取推荐失败：${error.message?.substring(0, 100)}`);
      }
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // 修改来源 / Modified from: 原始 generateDeepPlan（使用 Gemini + googleSearch grounding）
  // 修改内容 / Changes: 替换为 DeepSeek API 调用，添加 30 秒超时保护和错误提示
  const generateDeepPlan = async (destination: string) => {
    if (!destination) return;
    setLoading(true);
    setLoadingStep(`正在为您构建 ${destination} 的深度星际航路...`);
    setErrorMsg(null);
    try {
      const prompt = `用户计划前往 "${destination}" 旅游。
请作为资深旅游向导，提供一份详尽的出行预案：
1. ## 抵达安排
从当地主要枢纽（机场/车站）到市区的交通建议（含费用和时间参考）。
2. ## 落地首选
抵达后的前 4 小时建议做什么（包含一个当地特色美食推荐）。
3. ## 出行贴士
当地的天气情况、必备物品、防坑避雷建议。
4. ## 推荐行程
3天2夜的精华路线建议。
使用 Markdown 格式回答，包含标题、列表和加粗文字，内容要详实具体。`;

      const text = await callDeepSeek(prompt, false, 30000);
      setItinerary({
        destination,
        arrivalPlan: text,
        sources: []
      });
      setActiveTab('plan');
    } catch (error: any) {
      console.error("Plan error:", error);
      if (error.name === 'AbortError') {
        setErrorMsg('⏱ 规划请求超时，请重试');
      } else {
        setErrorMsg(`❌ 规划生成失败：${error.message?.substring(0, 100)}`);
      }
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleCheckIn = (spot: Spot) => {
    setIsCheckingIn(true);
    setTimeout(() => {
      setSpots(prev => prev.map(s => s.id === spot.id ? { ...s, checkedIn: true } : s));
      setSelectedSpot(prev => prev?.id === spot.id ? { ...prev, checkedIn: true } : prev);
      setIsCheckingIn(false);
      alert(`🎉 打卡成功！你已点亮了 ${spot.name}`);
    }, 1500);
  };

  const SpotDetailModal: React.FC<{ spot: Spot, onClose: () => void }> = ({ spot, onClose }) => {
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
               <button onClick={() => handleCheckIn(spot)} disabled={spot.checkedIn} className={`flex-1 py-4 rounded-2xl font-black tracking-widest text-sm transition-all shadow-xl active:scale-95 ${spot.checkedIn ? 'bg-gray-100 text-gray-400 shadow-none' : 'bg-emerald-600 text-white shadow-emerald-200'}`}>{spot.checkedIn ? '已点亮足迹' : '立即实地打卡'}</button>
               <button className="px-6 py-4 bg-gray-100 rounded-2xl text-gray-600 hover:bg-gray-200 transition-all"><i className="bi bi-send-fill"></i></button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const DiscoverCard: React.FC<{ spot: Spot }> = ({ spot }) => {
    const [imgError, setImgError] = useState(false);
    const [isImgLoading, setIsImgLoading] = useState(true);

    return (
      <div onClick={() => setSelectedSpot(spot)} className="bg-white rounded-[2.5rem] p-5 shadow-sm border border-gray-50 flex gap-5 group hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer">
        <div className="w-24 h-24 bg-gray-100 rounded-3xl shrink-0 relative overflow-hidden shadow-inner flex items-center justify-center">
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
             />
           ) : (
             <div className="w-full h-full flex items-center justify-center bg-emerald-50 text-emerald-200 text-3xl">
               <i className={`bi ${spot.category.toLowerCase().includes('cafe') ? 'bi-cup-hot' : 'bi-camera'}`}></i>
             </div>
           )}
           {spot.checkedIn && <div className="absolute inset-0 bg-emerald-600/10 flex items-center justify-center text-emerald-600 font-black text-[10px] rotate-[-15deg] backdrop-blur-[1px]">CHECKED</div>}
        </div>
        <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
          <div><h3 className="font-black text-lg text-gray-900 truncate">{spot.name}</h3><p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed font-medium">{spot.description}</p></div>
          <div className="flex items-center justify-between mt-3"><span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">{spot.distance ? `${(spot.distance / 1000).toFixed(1)}KM` : 'NEARBY'}</span><div className="flex items-center gap-1 text-amber-400 text-[10px] font-black"><i className="bi bi-star-fill"></i> {spot.rating}</div></div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] text-gray-900">
      {selectedSpot && activeTab === 'discover' && <SpotDetailModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />}
      <header className={`p-4 sticky top-0 z-40 flex justify-between items-center transition-all duration-500 border-b ${isPro ? 'bg-slate-900 text-white border-slate-800 shadow-xl' : 'bg-white/90 backdrop-blur-md border-emerald-50 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl shadow-lg flex items-center justify-center text-white ${isPro ? 'bg-gradient-to-tr from-amber-500 to-yellow-300' : 'bg-emerald-600'}`}><i className={`bi ${isPro ? 'bi-lightning-fill' : 'bi-star-fill'} star-shine text-lg`}></i></div>
          <div><h1 className="text-xl font-black tracking-tight">绿星 <span className={isPro ? 'text-amber-400' : 'text-emerald-500'}>{isPro ? 'PRO' : 'EXPLORE'}</span></h1><p className="text-[10px] font-bold tracking-widest uppercase opacity-60">Smart Footprint</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={refreshLocation} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 hover:bg-emerald-100 active:scale-90 transition-all"><i className="bi bi-crosshair"></i></button>
          <button onClick={handleUpgradeKey} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${isPro ? 'bg-white/10 border border-white/20 text-amber-300' : 'bg-emerald-50 text-emerald-700'}`}>{isPro ? 'PRO' : 'UPGRADE'}</button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 relative">
        {loading && (
          <div className="fixed inset-0 bg-white/70 backdrop-blur-lg z-[60] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-500">
            <div className={`w-16 h-16 border-4 rounded-full animate-spin border-t-transparent ${isPro ? 'border-amber-500' : 'border-emerald-600'}`}></div>
            <p className="mt-6 font-black tracking-widest text-lg animate-pulse text-gray-800">{loadingStep}</p>
          </div>
        )}

        {isCheckingIn && (
          <div className="fixed inset-0 bg-black z-[70] flex flex-col items-center justify-center text-white p-6 text-center">
            <div className="w-64 h-64 border-2 border-dashed border-white/30 rounded-3xl flex items-center justify-center mb-8 relative"><i className="bi bi-camera text-6xl opacity-20"></i><div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500 px-4 py-1 rounded-full text-xs font-bold">验证中...</div></div>
            <h3 className="text-lg font-bold">正在上传实地打卡证明</h3><p className="text-sm opacity-60 mt-2">AI 正在进行图像指纹核对</p>
          </div>
        )}

        {(activeTab === 'discover' || activeTab === 'map') && (
          <div className="px-5 mt-4 relative z-30">
            <div className="bg-white/70 backdrop-blur-xl rounded-[2rem] p-2 pl-5 flex items-center gap-3 shadow-lg border border-white group focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
              <i className="bi bi-geo-alt-fill text-emerald-600"></i>
              <div className="flex-1 min-w-0"><p className="text-[10px] font-bold text-gray-400 uppercase">探索原点</p><p className="text-sm font-bold text-gray-800 truncate">{currentAddress}</p></div>
              <form onSubmit={handleManualLocation} className="flex gap-1 pr-1">
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="城市名..." className="w-20 bg-emerald-50/50 rounded-2xl px-3 py-2 text-[10px] border-none outline-none focus:bg-emerald-100 transition-colors" />
                <button type="submit" className="w-8 h-8 bg-emerald-600 text-white rounded-2xl active:scale-90 transition-transform"><i className="bi bi-arrow-right-short text-xl"></i></button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'discover' && (
          <div className="px-5 py-6 space-y-8">
            <section className="space-y-4">
              <div className="flex justify-between items-end"><h2 className="text-2xl font-black tracking-tight">为您推荐 <span className="text-emerald-500">.</span></h2><button onClick={() => userLocation && fetchSpots(userLocation.lat, userLocation.lng)} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest transition-transform active:scale-95"><i className="bi bi-arrow-clockwise mr-1"></i> 刷新</button></div>
              
              {/* Error Message Toast */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
                  <span>{errorMsg}</span>
                  <button onClick={() => setErrorMsg(null)} className="ml-2 text-red-400 hover:text-red-600"><i className="bi bi-x-lg"></i></button>
                </div>
              )}

              <div className="space-y-4">
                {spots.length > 0 ? spots.map(spot => (<DiscoverCard key={spot.id} spot={spot} />)) : (
                  <div className="py-20 text-center flex flex-col items-center"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 text-3xl mb-4"><i className="bi bi-geo"></i></div><p className="font-bold text-gray-400">该区域暂无推荐，尝试切换地址</p></div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'map' && (
           <div className="h-[calc(100vh-210px)] px-4 pt-4 relative">
              <div className="h-full bg-white rounded-[3rem] border-4 border-white shadow-2xl relative overflow-hidden">
                 <div id="amap-container" className="w-full h-full"></div>
                 {selectedSpot && (
                    <div className="absolute bottom-6 left-6 right-6 z-10 animate-slide-up">
                       <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[2.5rem] shadow-2xl border border-white flex gap-4 items-center">
                          <div className="w-16 h-16 bg-emerald-100 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center">
                             {selectedSpot.imageUrl ? (<img src={selectedSpot.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />) : (<div className="w-full h-full flex items-center justify-center text-emerald-600"><i className={`bi bi-geo-alt-fill text-2xl`}></i></div>)}
                          </div>
                          <div className="flex-1 min-w-0"><h4 className="font-black text-gray-900 truncate text-sm">{selectedSpot.name}</h4><div className="flex gap-2 mt-2"><button onClick={() => handleCheckIn(selectedSpot)} disabled={selectedSpot.checkedIn} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black transition-all ${selectedSpot.checkedIn ? 'bg-gray-100 text-gray-400' : 'bg-emerald-600 text-white shadow-sm shadow-emerald-100'}`}>打卡</button><button className="px-3 py-1.5 bg-gray-100 rounded-lg text-[9px] font-black text-gray-600">导航</button></div></div>
                          <button onClick={() => setSelectedSpot(null)} className="absolute top-3 right-3 text-gray-300 hover:text-gray-400 transition-colors"><i className="bi bi-x-circle-fill text-lg"></i></button>
                       </div>
                    </div>
                 )}
              </div>
           </div>
        )}

        {activeTab === 'plan' && (
           <div className="p-6 pb-32 space-y-8">
              <h2 className="text-3xl font-black">AI 智能规划 <span className="text-emerald-500">.</span></h2>
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-[2.5rem] p-8 text-white shadow-xl">
                <h3 className="text-lg font-bold mb-4">设定下个目的地</h3>
                <div className="relative group">
                  <input type="text" value={targetDestination} onChange={e => setTargetDestination(e.target.value)} placeholder="例如：成都..." className="w-full bg-white/20 border-white/30 text-white rounded-2xl py-4 pl-5 pr-14 backdrop-blur-md outline-none focus:bg-white/30 transition-all placeholder:text-white/60" />
                  <button onClick={() => generateDeepPlan(targetDestination)} className="absolute right-2 top-2 bottom-2 w-10 h-10 bg-white text-emerald-700 rounded-xl flex items-center justify-center shadow-lg transition-transform active:scale-90"><i className="bi bi-send-fill"></i></button>
                </div>
              </div>
              
              {/* Error Message in Plan Tab */}
              {errorMsg && activeTab === 'plan' && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
                  <span>{errorMsg}</span>
                  <button onClick={() => setErrorMsg(null)} className="ml-2 text-red-400 hover:text-red-600"><i className="bi bi-x-lg"></i></button>
                </div>
              )}

              {itinerary?.arrivalPlan ? (
                <div className="animate-slide-up space-y-6"><div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100"><MarkdownRenderer content={itinerary.arrivalPlan} /></div></div>
              ) : (
                <div className="text-center py-20 opacity-30 flex flex-col items-center"><i className="bi bi-map-fill text-6xl mb-4"></i><p className="font-bold">开启 AI 全局视野</p></div>
              )}
           </div>
        )}

        {activeTab === 'profile' && (
          <div className="p-6 space-y-8">
            <div className={`rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl transition-all duration-700 ${isPro ? 'bg-slate-900 border-2 border-amber-500/20' : 'bg-gray-900'}`}>
              <div className="relative z-10"><div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner"><i className="bi bi-person-stars text-amber-400"></i></div><h3 className="text-2xl font-black mb-1">Star Traveler</h3><p className="text-xs opacity-50 font-bold uppercase tracking-widest">足迹点亮: {spots.filter(s=>s.checkedIn).length} / {spots.length}</p></div>
              <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12"><i className="bi bi-stars text-9xl"></i></div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-gray-100 px-8 py-4 flex justify-between items-center z-50">
        {[
          {id: 'discover', icon: 'compass', label: '探索'},
          {id: 'map', icon: 'map', label: '足迹'},
          {id: 'plan', icon: 'journal-text', label: '规划'},
          {id: 'profile', icon: 'person', label: '我的'}
        ].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === item.id ? (isPro ? 'text-amber-500 scale-110' : 'text-emerald-600 scale-110') : 'text-gray-300 hover:text-gray-400'}`}>
            <i className={`bi bi-${item.icon}${activeTab === item.id ? '-fill' : ''} text-2xl`}></i>
            <span className="text-[9px] font-black uppercase tracking-[0.1em]">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);