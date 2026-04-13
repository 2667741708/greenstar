import React, { useEffect, useState, useRef } from 'react';
import { X, Navigation, Map as MapIcon, ChevronRight, Info, CheckCircle2, XCircle, AlertTriangle, Car, Coffee, Castle, MoreVertical, Layers, Search, User, Eye, Edit2, MapPin, Camera, Landmark, Maximize2, Minimize2, Zap } from 'lucide-react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { optimizeRoute, getOptimizedRouteDistance } from '../../services/routeOptimizer';
import { monetIcons } from '../../config/monetIcons';
import { SpotDetail } from '../SpotDetail'; // 导入打卡详情组件
import { saveCheckin, CheckInRecord } from '../../services/localVault'; // 导入存储服务

// 全局声明 AMap 以支持 TS
declare global {
  interface Window {
    AMap: any;
  }
}

interface Stop {
  id?: string; // 增加 ID 支持
  name: string;
  lng: number;
  lat: number;
  category?: string;
}

interface LogEntry {
  id: number;
  message: React.ReactNode;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: string;
}

interface RouteVisualizerProps {
  planText?: string;
  cityName?: string;
  onClose?: () => void;
}

// 模拟数据 (可切换使用)
const DEFAULT_PLAN = `清晨前往 **【成都大熊猫繁育研究基地】** 观看熊猫，随后地铁直达 **【天府广场】**。
步行至 **「人民公园」** 鹤鸣茶社体验盖碗茶，然后前往 **【太古里】** 与 **【春熙路】** 打卡。
下午前往 **「宽窄巷子」** 游览，然后步行至 **【青羊宫】**。
傍晚前往 **武侯祠**，最后夜游打卡 **「锦里古街」** 结束行程。`;

export default function RouteVisualizer({ planText = DEFAULT_PLAN, cityName = '全国', onClose }: RouteVisualizerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersGroup = useRef<L.LayerGroup | null>(null);
  const pathLayer = useRef<L.Polyline | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeMode, setRouteMode] = useState<'drive' | 'walk' | 'straight' | 'game' | 'optimized'>('optimized');
  const [summary, setSummary] = useState({ dist: '...', time: '...', count: 0 });
  const [routeSteps, setRouteSteps] = useState<any[]>([]);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [unlockedLevel, setUnlockedLevel] = useState(0);

  // ── 打卡联动状态 ──────────────────────────────────────
  const [selectedSpot, setSelectedSpot] = useState<any | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const logIdCounter = useRef(0);

  const addLog = (message: React.ReactNode, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const id = logIdCounter.current++;
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs(prev => [...prev, { id, message, type, timestamp: time }]);
  };

  // 初始化地图
  useEffect(() => {
    if (!mapRef.current) {
      addLog('🎨 初始化 Leaflet 实景引擎...', 'info');
      const map = L.map('gs-map-container', {
        zoomControl: false,
        attributionControl: false,
      }).setView([30.6574, 104.0659], 12);

      L.control.zoom({ position: 'topright' }).addTo(map);

      // 高德实景瓦片
      L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: ['1', '2', '3', '4'],
        maxZoom: 18,
      }).addTo(map);

      markersGroup.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      addLog('[System] 实景地图加载就绪！', 'success');
    }
  }, []);

  // 执行核心计算链
  useEffect(() => {
    if (!mapRef.current) return;
    
    const runProcessing = async () => {
      // 1. NER
      const names = extractStops(planText);
      addLog(<>[NER] 提取到 <b>{names.length}</b> 个有效锚点</>, 'success');

      // 2. Geocoding
      addLog('[Network] 坐标解算并发进行中...', 'info');
      const newStops: Stop[] = [];
      const seen = new Set<string>();

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (seen.has(name)) continue;
        seen.add(name);

        const coord = await geocode(name);
        if (coord) {
          // 这里构造一个临时的 Spot ID 以支持打卡逻辑
          newStops.push({ id: `temp_${Date.now()}_${i}`, name, ...coord });
          addLog(<>[精确定位] <b>{name}</b></>, 'success');
        } else {
          addLog(<>[定位失败] <b>{name}</b></>, 'error');
        }
      }

      setStops(newStops);
      setSummary(prev => ({ ...prev, count: newStops.length }));

      // DAG 最短路径优化：按地理最近邻重排站点顺序
      if (newStops.length > 2) {
        addLog('[Calc] 启动 DAG 有限无环图最短路径优化器...', 'info');
        const optimized = optimizeRoute(newStops);
        const beforeDist = getOptimizedRouteDistance(newStops);
        const afterDist = getOptimizedRouteDistance(optimized);
        const saved = ((1 - afterDist / beforeDist) * 100).toFixed(1);
        addLog(<>[Success] 路径优化完成！距离缩短 <b>{saved}%</b>（{beforeDist.toFixed(1)}km → {afterDist.toFixed(1)}km）</>, 'success');
        setStops(optimized);
        setSummary(prev => ({ ...prev, count: optimized.length }));
      }
    };

    runProcessing();
  }, [planText]);

  // 当站点或模式改变，重绘地图和路径
  useEffect(() => {
    if (!mapRef.current || stops.length === 0) return;

    const draw = async () => {
      let routePath: {lat: number, lng: number}[] = [];
      let newSteps: any[] = [];

      if (stops.length > 1) {
        if (routeMode === 'drive') {
          addLog('[Calc] 唤醒深度驾车网络规划模型...', 'info');
          const dr = await drivingRoute(stops);
          if (dr) {
            routePath = dr.path;
            newSteps = dr.steps || [];
            const km = (dr.dist / 1000).toFixed(1);
            const min = Math.round(dr.time / 60);
            setSummary({ dist: `${km} km`, time: `${min} 分钟`, count: stops.length });
            addLog(<>[Success] 驾车规划完成: <b>{km}km</b></>, 'success');
          }
        } else if (routeMode === 'walk') {
          addLog('[Calc] 实例化图网络分段步行分析...', 'info');
          let totalD = 0, totalT = 0;
          for (let i = 0; i < stops.length - 1; i++) {
            const r = await walkSegment(stops[i], stops[i + 1]);
            if (r) {
              routePath.push(...r.path);
              totalD += r.dist;
              totalT += r.time;
              newSteps.push(...(r.steps || []));
            }
          }
          const km = (totalD / 1000).toFixed(1);
          const min = Math.round(totalT / 60);
          setSummary({ dist: `${km} km`, time: `${min} 分钟`, count: stops.length });
          addLog(<>[Success] 步行拟合完成: <b>{km}km</b></>, 'success');
        } else if (routeMode === 'game') {
          routePath = [];
          newSteps = stops.map((s, i) => ({ instruction: i === 0 ? '出发点：' + s.name : '勇闯：' + s.name }));
          setSummary({ dist: '趣味闯关', time: '快乐无价', count: stops.length });
          addLog('[Game] 已切换游戏化萌系关卡模式', 'info');
        } else if (routeMode === 'optimized') {
          addLog('[Nav] DAG 最短路径优化驾车导航中...', 'info');
          const dr = await drivingRoute(stops);
          if (dr) {
            routePath = dr.path;
            newSteps = dr.steps || [];
            const km = (dr.dist / 1000).toFixed(1);
            const min = Math.round(dr.time / 60);
            setSummary({ dist: `${km} km`, time: `${min} 分钟`, count: stops.length });
            addLog(<>[Success] DAG 优化导航完成: <b>{km}km</b>, 无折返</>, 'success');
          }
        } else {
          routePath = stops.map(s => ({ lat: s.lat, lng: s.lng }));
          newSteps = stops.map((s, i) => ({ instruction: i === 0 ? '起点：' + s.name : '飞向：' + s.name }));
          setSummary({ dist: '直线预估', time: '无偏差', count: stops.length });
          addLog('[Math] 已切换无界直线向量模式', 'info');
        }
      }
      
      setRouteSteps(newSteps);

      const map = mapRef.current!;
      if (pathLayer.current) map.removeLayer(pathLayer.current);
      markersGroup.current?.clearLayers();

      const bounds = L.latLngBounds([]);

      if (routePath.length > 1) {
        pathLayer.current = L.polyline(routePath, {
          color: routeMode === 'straight' ? '#94a3b8' : '#0d9488',
          weight: routeMode === 'straight' ? 3 : 5,
          dashArray: routeMode === 'straight' ? '8, 8' : undefined,
          opacity: 0.9,
          lineJoin: 'round'
        }).addTo(map);
        routePath.forEach(p => bounds.extend([p.lat, p.lng]));
      }

      stops.forEach((s, idx) => {
        const monetImg = get3DEmojiForName(s.name);
        
        const iconHtml = `
            <div style="position: relative; display: flex; align-items: center; pointer-events: none; width: 250px;">
                <div style="position: absolute; top: -45px; left:-12px; z-index: 20;">
                    <img src="${monetImg}" style="width: 48px; height: 48px; object-contain: contain; filter: drop-shadow(0px 8px 12px rgba(0,0,0,0.25));" />
                </div>
                <div style="filter: drop-shadow(0px 8px 6px rgba(13, 148, 136, 0.4)); flex-shrink: 0; z-index: 10; margin-top: 10px;">
                    <svg width="28" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 0C5.373 0 0 5.373 0 12C0 21 12 36 12 36C12 36 24 21 24 12C24 5.373 18.627 0 12 0Z" fill="url(#grad1)"/>
                        <circle cx="12" cy="12" r="5" fill="white"/>
                        <defs>
                            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#14b8a6;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#0f766e;stop-opacity:1" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
                <div style="background: rgba(255,255,255,0.85); backdrop-filter: blur(8px); padding: 4px 12px; border-radius: 12px; margin-left: -4px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid rgba(255,255,255,1); z-index: 5; margin-top: 8px; pointer-events: auto; cursor: pointer;">
                    <span style="font-size:10px; font-weight:900; color:#0d9488; margin-right:4px; opacity: 0.7;">${idx+1}</span>
                    <span style="font-size:12px; font-weight:800; color:#1e293b; letter-spacing: -0.01em;">${s.name}</span>
                </div>
            </div>
        `;
        const customIcon = L.divIcon({ html: iconHtml, className: 'custom-stop-icon', iconSize: [32, 42], iconAnchor: [16, 42] });
        const marker = L.marker([s.lat, s.lng], { icon: customIcon }).addTo(markersGroup.current!);
        
        // 点击标记打开打卡详情
        marker.on('click', () => {
          setSelectedSpot({
            id: s.id || `spot_${idx}`,
            name: s.name,
            coordinates: { lat: s.lat, lng: s.lng },
            cityName: cityName,
            category: s.category || '景点',
            description: `来自行程：${cityName} 定制路线`
          });
        });

        bounds.extend([s.lat, s.lng]);
      });

      if (stops.length > 0) {
        map.fitBounds(bounds, { padding: [60, 60] });
      }
    };

    draw();
  }, [stops, routeMode]);

  // 处理打卡成功
  const handleCheckIn = async (spot: any, photoUrls?: string[]) => {
    setIsCheckingIn(true);
    addLog(<>[打卡] 正在记录 <b>{spot.name}</b> 的足迹...</>, 'info');
    
    // 构造打卡记录
    const record: CheckInRecord = {
      id: `checkin_${Date.now()}`,
      spotId: spot.id,
      spotName: spot.name,
      cityName: cityName,
      category: spot.category,
      coordinates: spot.coordinates,
      photos: photoUrls || [],
      timestamp: new Date().toISOString(),
      note: ''
    };

    try {
      await saveCheckin(record);
      addLog(<>[Success] <b>{spot.name}</b> 打卡成功！</>, 'success');
      setSelectedSpot(null);
    } catch (e) {
      addLog(<>[Error] 打卡失败: {String(e)}</>, 'error');
    } finally {
      setIsCheckingIn(false);
    }
  };

  // --- 高度解耦的高德 API 工具函数 ---

  const get3DEmojiForName = (name: string) => {
    if (name.includes('熊猫')) return monetIcons.panda;
    if (name.includes('宫') || name.includes('祠') || name.includes('寺') || name.includes('塔')) return monetIcons.temple;
    if (name.includes('公园') || name.includes('山') || name.includes('岛') || name.includes('湖')) return monetIcons.park;
    if (name.includes('太古里') || name.includes('春熙路') || name.includes('商场') || name.includes('店')) return monetIcons.shop;
    if (name.includes('巷') || name.includes('街') || name.includes('里') || name.includes('路')) return monetIcons.street;
    if (name.includes('广场') || name.includes('中心') || name.includes('大厦') || name.includes('塔')) return monetIcons.cityscape;
    return monetIcons.pin;
  };


  const extractStops = (text: string) => {
    const pats = [/【([^】]{2,15})】/g, /\[([^\]]{2,15})\]/g, /<POI>([^<]+)<\/POI>/g];
    const seen = new Set<string>();
    const out: string[] = [];
    const rejects = ['建议', '提示', '注意', '推荐', '公里', '小时', '分钟', '雷区', '备受推崇', '体验', '漫步', '打卡', '指南', '路线', '安排', '概览', '交通', '接驳', '大盘', '避雷', '预警', '消费', '预算', '花销', '详情', '隐性', '踩坑', '必须', '重点', '方案', '上午', '下午', '晚上', '内核', '文化', '交错带', '印记', '城市', '极简', '夏季', '冬季', '最优解', '周边', '中心'];
    for (const p of pats) { let m; while ((m = p.exec(text)) !== null) { const n = m[1].trim().replace(/[【】「」『』《》\[\]]/g, '').trim(); if (n.length >= 2 && n.length <= 15 && !rejects.some(w => n.includes(w)) && !seen.has(n)) { seen.add(n); out.push(n); } } }
    return out.slice(0, 15);
  };

  const geocode = (name: string): Promise<{ lng: number, lat: number } | null> => {
    return new Promise((resolve) => {
      if (!window.AMap || !window.AMap.Geocoder) { resolve(null); return; }
      const timer = setTimeout(() => resolve(null), 3500); 
      try {
        const g = new window.AMap.Geocoder({ city: cityName });
        const query = `${cityName} ${name}`; 
        g.getLocation(query, (s: any, r: any) => {
          clearTimeout(timer);
          if (s === 'complete' && r.geocodes?.length) { const loc = r.geocodes[0].location; resolve({ lng: loc.getLng(), lat: loc.getLat() }); }
          else resolve(null);
        });
      } catch (e) { clearTimeout(timer); resolve(null); }
    });
  };

  const drivingRoute = (validStops: Stop[]): Promise<any> => {
    return new Promise(resolve => {
      if (!window.AMap || !window.AMap.Driving) { resolve(null); return; }
      const timer = setTimeout(() => resolve(null), 15000);
      window.AMap.plugin('AMap.Driving', () => {
        const d = new window.AMap.Driving({ policy: 0, ferry: 0 });
        const o = new window.AMap.LngLat(validStops[0].lng, validStops[0].lat);
        const dest = new window.AMap.LngLat(validStops[validStops.length - 1].lng, validStops[validStops.length - 1].lat);
        const wps = validStops.slice(1, -1).map(s => new window.AMap.LngLat(s.lng, s.lat));
        d.search(o, dest, { waypoints: wps }, (st: any, r: any) => {
          clearTimeout(timer);
            if (st === 'complete' && r.routes?.length) {
              const path: any[] = [];
              let steps: any[] = [];
              for (const step of r.routes[0].steps || []) { 
                if (step.path) for (const p of step.path) path.push({ lng: p.lng, lat: p.lat }); 
                if (step.instruction) steps.push({ instruction: step.instruction, distance: step.distance });
              }
              resolve({ path, dist: r.routes[0].distance, time: r.routes[0].time, steps });
            } else { resolve(null); }
          });
        });
      });
    };
  
    const walkSegment = (from: Stop, to: Stop): Promise<any> => {
      return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), 8000);
        window.AMap.plugin('AMap.Walking', () => {
          const w = new window.AMap.Walking();
          w.search(new window.AMap.LngLat(from.lng, from.lat), new window.AMap.LngLat(to.lng, to.lat), (st: any, r: any) => {
            clearTimeout(timer);
            if (st === 'complete' && r.routes?.length) {
              const path: any[] = [];
              let steps: any[] = [];
              for (const step of r.routes[0].steps || []) { 
                if (step.path) for (const p of step.path) path.push({ lng: p.lng, lat: p.lat }); 
                if (step.instruction) steps.push({ instruction: step.instruction, distance: step.distance });
              }
              resolve({ path, dist: r.routes[0].distance, time: r.routes[0].time, steps });
            } else resolve(null);
        });
      });
    });
  };

  const logContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fixed inset-0 z-[100] flex font-sans bg-[#f8fafc] overflow-hidden text-slate-800">
      
      <div 
        id="gs-map-container" 
        className="absolute inset-0 z-0 bg-[#f8fafc]"
        style={{ width: '100%', height: '100%' }}
      />

      {/* 联动打卡详情弹窗 */}
      {selectedSpot && (
        <SpotDetail 
          spot={selectedSpot} 
          cityName={cityName}
          onClose={() => setSelectedSpot(null)} 
          onCheckIn={handleCheckIn} 
          isPro={true} 
        />
      )}

      {/* 联动加载蒙层 */}
      {isCheckingIn && (
        <div className="fixed inset-0 z-[300] bg-white/60 backdrop-blur-md flex flex-col items-center justify-center">
           <div className="w-20 h-20 bg-emerald-100 rounded-[2rem] flex items-center justify-center mb-6 animate-bounce shadow-xl shadow-emerald-200">
             <Camera className="w-10 h-10 text-emerald-600" />
           </div>
           <p className="text-xl font-black text-slate-800 tracking-tight">正在同步星系足迹...</p>
        </div>
      )}

      <div className="relative z-10 w-[420px] max-w-[90vw] h-full p-5 sm:p-6 flex flex-col gap-6 backdrop-blur-[24px] bg-white/50 border-r border-white/60 shadow-[8px_0_40px_-5px_rgba(0,0,0,0.1)] overflow-y-auto custom-scrollbar">
        
        <div className="flex justify-between items-center mt-1 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
              <MapPin className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-black text-slate-800 tracking-tight text-lg">城市漫游者</span>
          </div>
          <div className="flex gap-2.5">
            <button className="w-8 h-8 rounded-full bg-slate-900/5 hover:bg-slate-900/10 flex items-center justify-center transition-colors">
              <Search className="w-4 h-4 text-slate-700" />
            </button>
            <button className="w-8 h-8 rounded-full bg-slate-900/5 hover:bg-slate-900/10 flex items-center justify-center transition-colors">
              <User className="w-4 h-4 text-slate-700" />
            </button>
            {onClose && (
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        </div>

        <h1 className="text-2xl font-black text-slate-800 tracking-tight -mt-2">智能路线规划舱</h1>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-slate-800 tracking-wide mb-1">我的路线选项</h2>
          
          <div onClick={() => setRouteMode('optimized')} className={`relative overflow-hidden group p-4 rounded-[1.5rem] cursor-pointer transition-all duration-300 border backdrop-blur-md ${routeMode === 'optimized' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border-emerald-200 ring-2 ring-emerald-400/30' : 'bg-white/40 hover:bg-white/60 border-white/60'}`}>
            <div className="flex gap-4 items-center">
              <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-white shadow-lg ${routeMode === 'optimized' ? 'shadow-emerald-500/30' : 'shadow-none'} bg-gradient-to-br from-[#10b981] to-[#059669]`}>
                <Zap className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 text-[15px] truncate">DAG 最短路径</h3>
                    <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-md font-black">推荐</span>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600"><MoreVertical className="w-4 h-4" /></button>
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                  <Navigation className="w-3 h-3 text-emerald-400" />
                  <span>{routeMode === 'optimized' ? summary.dist : '~'}</span>
                  <span>•</span>
                  <span><MapPin className="inline w-3 h-3 text-emerald-400 bottom-[1px] relative" /> {stops.length} 个锚点</span>
                  <span>•</span>
                  <span>{routeMode === 'optimized' ? summary.time : '~'}</span>
                </div>
                <p className="text-[10px] text-emerald-600/70 font-medium mt-1.5">基于有限无环图算法 + 2-opt 局部优化，消除折返绕路</p>
                <div className="flex gap-2 mt-3 items-center">
                  <div className="flex bg-emerald-100/80 rounded-lg p-1 gap-1">
                    <Zap className="w-3.5 h-3.5 text-emerald-500" />
                    <MapIcon className="w-3.5 h-3.5 text-emerald-400" />
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex-1"></div>
                  <button className="bg-emerald-100 hover:bg-emerald-200 p-1.5 rounded-lg text-emerald-500 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                  <button className={`p-1.5 rounded-lg text-white shadow-md transition-colors ${routeMode === 'optimized' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-slate-300'}`}><Edit2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 1: Drive */}
          <div onClick={() => setRouteMode('drive')} className={`relative overflow-hidden group p-4 rounded-[1.5rem] cursor-pointer transition-all duration-300 border backdrop-blur-md ${routeMode === 'drive' ? 'bg-white/95 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border-white' : 'bg-white/40 hover:bg-white/60 border-white/60'}`}>
            <div className="flex gap-4 items-center">
              <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-white shadow-lg ${routeMode === 'drive' ? 'shadow-blue-500/30' : 'shadow-none'} bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]`}>
                <Car className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-800 text-[15px] truncate">极速驾车模式</h3>
                  <button className="text-slate-400 hover:text-slate-600"><MoreVertical className="w-4 h-4" /></button>
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                  <Navigation className="w-3 h-3 text-slate-400" />
                  <span>{routeMode === 'drive' ? summary.dist : '~'}</span>
                  <span>•</span>
                  <span><MapPin className="inline w-3 h-3 text-slate-400 bottom-[1px] relative" /> {stops.length} 个锚点</span>
                  <span>•</span>
                  <span>{routeMode === 'drive' ? summary.time : '~'}</span>
                </div>
                <div className="flex gap-2 mt-3 items-center">
                  <div className="flex bg-slate-100/80 rounded-lg p-1 gap-1">
                    <MapIcon className="w-3.5 h-3.5 text-slate-400" />
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="flex-1"></div>
                  <button className="bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg text-slate-500 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                  <button className={`p-1.5 rounded-lg text-white shadow-md transition-colors ${routeMode === 'drive' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20' : 'bg-slate-300'}`}><Edit2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Walk */}
          <div onClick={() => setRouteMode('walk')} className={`relative overflow-hidden group p-4 rounded-[1.5rem] cursor-pointer transition-all duration-300 border backdrop-blur-md ${routeMode === 'walk' ? 'bg-white/95 shadow-[0_8px_30_rgb(0,0,0,0.06)] border-white' : 'bg-white/40 hover:bg-white/60 border-white/60'}`}>
            <div className="flex gap-4 items-center">
              <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-white shadow-lg ${routeMode === 'walk' ? 'shadow-purple-500/30' : 'shadow-none'} bg-gradient-to-br from-[#a855f7] to-[#7e22ce]`}>
                <Coffee className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-800 text-[15px] truncate">漫步探索模式</h3>
                  <button className="text-slate-400 hover:text-slate-600"><MoreVertical className="w-4 h-4" /></button>
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                  <Navigation className="w-3 h-3 text-slate-400" />
                  <span>{routeMode === 'walk' ? summary.dist : '~'}</span>
                  <span>•</span>
                  <span><MapPin className="inline w-3 h-3 text-slate-400 bottom-[1px] relative" /> {stops.length} 个锚点</span>
                  <span>•</span>
                  <span>{routeMode === 'walk' ? summary.time : '~'}</span>
                </div>
                <div className="flex gap-2 mt-3 items-center">
                  <div className="flex bg-slate-100/80 rounded-lg p-1 gap-1">
                    <MapIcon className="w-3.5 h-3.5 text-slate-400" />
                    <Coffee className="w-3.5 h-3.5 text-slate-400" />
                    <Camera className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="flex-1"></div>
                  <button className="bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg text-slate-500 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                  <button className={`p-1.5 rounded-lg text-white shadow-md transition-colors ${routeMode === 'walk' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20' : 'bg-slate-300'}`}><Edit2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-slate-800 tracking-wide mb-1">数据仪表盘</h2>
          
          <div className="bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] p-5 rounded-[1.5rem] shadow-lg shadow-blue-500/20 text-white flex justify-between items-center border border-white/20">
            <div>
              <h3 className="font-semibold text-[16px] mb-2 tracking-wide">行程大盘</h3>
              <div className="text-[13px] font-medium text-blue-50 flex gap-3 opacity-90">
                <span>{summary.dist}</span>
                <span className="text-blue-300">|</span>
                <span>{summary.time}</span>
                <span className="text-blue-300">|</span>
                <span>{summary.count} 个点位</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md shadow-inner text-white">
              <MapPin className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#0d9488] to-[#14b8a6] p-4 rounded-[1.5rem] shadow-lg shadow-teal-500/20 text-white border border-white/20 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-[15px] tracking-wide mb-1">系统追踪日志</h3>
                <div className="text-[11px] font-medium text-teal-100 flex items-center gap-2">
                  <span className="text-white font-bold tracking-wider">活跃</span>
                  <span className="text-teal-300">|</span>
                  <span>{logs.length} 条记录</span>
                </div>
              </div>
              <button 
                onClick={() => setIsLogExpanded(true)} 
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center border border-white/10 transition-colors shadow-sm"
                title="放大日志"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="mt-3 text-[10px] font-mono opacity-80 truncate bg-black/10 px-3 py-1.5 rounded-lg border border-white/5">
              {logs[logs.length - 1]?.message || "系统引擎已初始化..."}
            </div>
          </div>
        </div>

        {routeSteps.length > 0 && (
          <div className="bg-white/70 p-5 rounded-[1.5rem] shadow-sm border border-white/80 backdrop-blur-md flex flex-col mt-2">
            <h3 className="font-bold text-slate-800 text-[14px] mb-4">路线导航指引</h3>
            <div className="flex-1 space-y-4">
              {routeSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 pl-1 relative">
                  <div className="relative flex flex-col items-center mt-0.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)] z-10 border border-white"></div>
                    {i !== routeSteps.length - 1 && (
                      <div className="absolute top-2 w-[1.5px] h-[calc(100%+12px)] bg-blue-200"></div>
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-[12px] font-medium text-slate-700 leading-snug">{step.instruction}</p>
                    {step.distance && (
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">{step.distance} m</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {isLogExpanded && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-8 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl h-[80vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center"><CheckCircle2 className="w-5 h-5"/></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">系统执行追踪网络</h2>
                  <p className="text-xs text-slate-500">深度监控与引擎指标</p>
                </div>
              </div>
              <button 
                onClick={() => setIsLogExpanded(false)}
                className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors text-slate-600"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-900 p-6 overflow-y-auto font-mono text-sm tracking-wide custom-scrollbar" ref={logContainerRef}>
              <div className="space-y-3">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start gap-4 hover:bg-white/5 p-2 rounded-lg transition-colors border border-transparent hover:border-white/10">
                    <div className="text-slate-500 text-xs mt-0.5 w-16 shrink-0">{log.timestamp}</div>
                    <div className="shrink-0 mt-0.5">
                      {log.type === 'error' ? '[Error]' : log.type === 'warning' ? '[Warn]' : log.type === 'success' ? '[Done]' : '[Info]'}
                    </div>
                    <div className={`flex-1 break-all leading-relaxed ${
                      log.type === 'error' ? 'text-red-400' : 
                      log.type === 'warning' ? 'text-yellow-400' : 
                      log.type === 'success' ? 'text-green-400' : 'text-slate-300'
                    }`}>
                      {log.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game Mode Overlay (Cute Carrot Fantasy Style) */}
      {routeMode === 'game' && (
        <div className="absolute inset-0 z-[60] bg-[#a8e6cf] overflow-y-auto custom-scrollbar flex justify-center pb-32 pt-20">
          <div className="fixed inset-0 pointer-events-none opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMiIgZmlsbD0iIzA0OGE2YyIvPjwvc3ZnPg==')]"></div>

          <div className="w-full max-w-xl relative p-6 flex flex-col items-center">
            <h1 className="text-4xl font-black text-emerald-900 mb-2 filter drop-shadow-[0_4px_0px_#34d399] tracking-widest text-center stroke-white stroke-2">奇妙城市大冒险</h1>
            <p className="text-emerald-700 font-bold bg-white/50 px-6 py-2 rounded-full shadow-inner mb-12">点击解锁你的专属关卡</p>
            
            <div className="relative w-full pb-20">
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-4 border-l-8 border-r-8 border-emerald-300/30 border-dashed z-0 rounded-full"></div>

              {stops.map((stop, index) => {
                const isLeft = index % 2 === 0;
                const isUnlocked = index <= unlockedLevel;
                const isCurrent = index === unlockedLevel;
                const emoji = get3DEmojiForName(stop.name);
                
                return (
                  <div key={index} className={`relative z-10 w-full flex items-center mb-16 ${isLeft ? 'justify-start' : 'justify-end'}`}>
                    <div className={`w-[45%] flex flex-col items-center transform transition-all duration-500 ${isUnlocked ? 'scale-100 opacity-100' : 'scale-90 opacity-60 grayscale'}`}>
                      {isCurrent && <div className="absolute -top-12 animate-bounce text-4xl text-emerald-500"><i className="bi bi-arrow-down-circle-fill"></i></div>}
                      
                      <button 
                        onClick={() => { if(index <= unlockedLevel + 1) setUnlockedLevel(index) }}
                        className={`relative group flex flex-col items-center justify-center p-4 rounded-[2rem] border-8 shadow-2xl transition-all ${isUnlocked ? 'bg-white border-emerald-400 hover:scale-105 active:scale-95' : 'bg-gray-200 border-gray-300 cursor-not-allowed'}`}
                      >
                        <div className={`text-6xl mb-2 filter drop-shadow-xl ${isUnlocked ? '' : 'opacity-50'}`}>{emoji}</div>
                        <h3 className={`font-black text-center text-sm ${isUnlocked ? 'text-emerald-800' : 'text-gray-500'}`}>{stop.name}</h3>
                        
                        <div className={`absolute -bottom-5 px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-wider border-4 border-white shadow-md ${isUnlocked ? 'bg-amber-400 text-amber-900' : 'bg-gray-400 text-white'}`}>
                          {isUnlocked ? '已解锁' : '待探索'}
                        </div>
                      </button>
                    </div>

                  </div>
                )
              })}
              
              {unlockedLevel >= stops.length - 1 && stops.length > 0 && (
                <div className="mt-20 flex flex-col items-center animate-in zoom-in spin-in-12 duration-1000">
                  <div className="text-8xl text-amber-500 filter drop-shadow-[0_10px_20px_rgba(251,191,36,0.5)]"><i className="bi bi-trophy-fill"></i></div>
                  <h2 className="text-3xl font-black text-amber-500 mt-4 filter drop-shadow-[0_3px_0px_#ffffff]">通关完成！</h2>
                  <p className="text-amber-700 font-bold bg-white/70 px-4 py-1 rounded-full mt-2">你已征服全部坐标</p>
                </div>
              )}
            </div>
          </div>

          <button onClick={() => setRouteMode('drive')} className="fixed bottom-6 right-6 z-50 bg-white text-emerald-600 font-black px-6 py-3 rounded-full shadow-2xl border-4 border-emerald-100 hover:scale-105 active:scale-95 flex items-center gap-2">
            <i className="bi bi-map-fill"></i> 退出游戏模式
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: #f8fafc !important; }
        .leaflet-tile-pane {
            filter: grayscale(40%) opacity(0.6) contrast(0.8) sepia(10%) hue-rotate(180deg) brightness(1.1); 
            transition: all 0.5s ease;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
        .custom-stop-icon { background: none; border: none; overflow: visible !important; }
      `}} />
    </div>
  );
}
