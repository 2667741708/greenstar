import React, { useEffect, useState, useRef } from 'react';
import { X, Navigation, Map as MapIcon, ChevronRight, Info, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 全局声明 AMap 以支持 TS
declare global {
  interface Window {
    AMap: any;
  }
}

interface Stop {
  name: string;
  lng: number;
  lat: number;
}

interface LogEntry {
  id: number;
  message: React.ReactNode;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: string;
}

interface RouteVisualizerProps {
  planText?: string;
  onClose?: () => void;
}

// 模拟数据 (可切换使用)
const DEFAULT_PLAN = `清晨前往 **【成都大熊猫繁育研究基地】** 观看熊猫，随后地铁直达 **【天府广场】**。
步行至 **「人民公园」** 鹤鸣茶社体验盖碗茶，然后前往 **【太古里】** 与 **【春熙路】** 打卡。
下午前往 **「宽窄巷子」** 游览，然后步行至 **【青羊宫】**。
傍晚前往 **武侯祠**，最后夜游打卡 **「锦里古街」** 结束行程。`;

export default function RouteVisualizer({ planText = DEFAULT_PLAN, onClose }: RouteVisualizerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersGroup = useRef<L.LayerGroup | null>(null);
  const pathLayer = useRef<L.Polyline | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeMode, setRouteMode] = useState<'drive' | 'walk' | 'straight'>('drive');
  const [summary, setSummary] = useState({ dist: '...', time: '...', count: 0 });

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
      addLog('✅ 实景地图加载就绪！', 'success');
    }
  }, []);

  // 执行核心计算链
  useEffect(() => {
    if (!mapRef.current) return;
    
    const runProcessing = async () => {
      // 1. NER
      const names = extractStops(planText);
      addLog(<>🔍 NER 提取到 <b>{names.length}</b> 个有效锚点</>, 'success');

      // 2. Geocoding
      addLog('📡 坐标解算并发进行中...', 'info');
      const newStops: Stop[] = [];
      const seen = new Set<string>();

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (seen.has(name)) continue;
        seen.add(name);

        const coord = await geocode(name);
        if (coord) {
          newStops.push({ name, ...coord });
          addLog(<>📍 [精确定位] <b>{name}</b></>, 'success');
        } else {
          addLog(<>❌ [定位失败] <b>{name}</b></>, 'error');
        }
      }

      setStops(newStops);
      setSummary(prev => ({ ...prev, count: newStops.length }));
    };

    runProcessing();
  }, [planText]);

  // 当站点或模式改变，重绘地图和路径
  useEffect(() => {
    if (!mapRef.current || stops.length === 0) return;

    const draw = async () => {
      let routePath: {lat: number, lng: number}[] = [];

      if (stops.length > 1) {
        if (routeMode === 'drive') {
          addLog('🚗 唤醒深度驾车网络规划模型...', 'info');
          const dr = await drivingRoute(stops);
          if (dr) {
            routePath = dr.path;
            const km = (dr.dist / 1000).toFixed(1);
            const min = Math.round(dr.time / 60);
            setSummary({ dist: `${km} km`, time: `${min} 分钟`, count: stops.length });
            addLog(<>✅ 驾车规划完成: <b>{km}km</b>, 耗时 <b>{min}分</b></>, 'success');
          }
        } else if (routeMode === 'walk') {
          addLog('🚶 实例化图网络分段步行分析...', 'info');
          let totalD = 0, totalT = 0;
          for (let i = 0; i < stops.length - 1; i++) {
            const r = await walkSegment(stops[i], stops[i + 1]);
            if (r) {
              routePath.push(...r.path);
              totalD += r.dist;
              totalT += r.time;
            }
          }
          const km = (totalD / 1000).toFixed(1);
          const min = Math.round(totalT / 60);
          setSummary({ dist: `${km} km`, time: `${min} 分钟`, count: stops.length });
          addLog(<>✅ 步行拟合完成: <b>{km}km</b></>, 'success');
        } else {
          // straight
          routePath = stops.map(s => ({ lat: s.lat, lng: s.lng }));
          setSummary({ dist: '直线预估', time: '无偏差', count: stops.length });
          addLog('📐 已切换无界直线向量模式', 'info');
        }
      }

      // 渲染到 Leaflet
      const map = mapRef.current!;
      if (pathLayer.current) map.removeLayer(pathLayer.current);
      markersGroup.current?.clearLayers();

      const bounds = L.latLngBounds([]);

      if (routePath.length > 1) {
        pathLayer.current = L.polyline(routePath, {
          color: routeMode === 'straight' ? '#94a3b8' : '#10b981',
          weight: routeMode === 'straight' ? 3 : 6,
          dashArray: routeMode === 'straight' ? '8, 8' : undefined,
          opacity: 0.9,
          lineJoin: 'round'
        }).addTo(map);
        routePath.forEach(p => bounds.extend([p.lat, p.lng]));
      }

      stops.forEach((s, idx) => {
        const iconHtml = `
          <div style="background:linear-gradient(135deg,#10b981,#059669); color:white; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; box-shadow:0 3px 8px rgba(0,0,0,0.4); z-index: 1000; position:relative;">${idx+1}</div>
          <div style="position:absolute; top:-3px; left:32px; background:rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); padding:4px 8px; border-radius:6px; font-size:11px; color:#d1fae5; font-weight:bold; box-shadow:0 2px 6px rgba(0,0,0,0.3); white-space:nowrap; border:1px solid rgba(16,185,129,0.3); pointer-events:none;">${s.name}</div>
        `;
        const customIcon = L.divIcon({ html: iconHtml, className: 'custom-stop-icon', iconSize: [28, 28], iconAnchor: [14, 14] });
        L.marker([s.lat, s.lng], { icon: customIcon }).addTo(markersGroup.current!);
        bounds.extend([s.lat, s.lng]);
      });

      if (stops.length > 0) {
        map.fitBounds(bounds, { padding: [60, 60] });
      }
    };

    draw();
  }, [stops, routeMode]);

  // --- 高度解耦的高德 API 工具函授 ---

  const extractStops = (text: string) => {
    const pats = [/\*\*([^*]{2,15})\*\*/g, /「([^」]{2,15})」/g, /【([^】]{2,15})】/g, /→\s*([^\s→,，。]{2,12})/g, /前往\s*([^\s,，。（(]{2,12})/g];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of pats) { let m; while ((m = p.exec(text)) !== null) { const n = m[1].trim().replace(/[【】「」『』《》\[\]]/g, '').trim(); if (n.length >= 2 && n.length <= 15 && !['建议', '提示', '注意', '推荐', '公里', '小时'].some(w => n.includes(w)) && !seen.has(n)) { seen.add(n); out.push(n); } } }
    return out.slice(0, 10);
  };

  const geocode = (name: string): Promise<{ lng: number, lat: number } | null> => {
    return new Promise((resolve) => {
      if (!window.AMap || !window.AMap.Geocoder) { resolve(null); return; }
      const timer = setTimeout(() => resolve(null), 5000);
      try {
        const g = new window.AMap.Geocoder({ city: '成都' });
        g.getLocation(name, (s: any, r: any) => {
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
            for (const step of r.routes[0].steps || []) { if (step.path) for (const p of step.path) path.push({ lng: p.lng, lat: p.lat }); }
            resolve({ path, dist: r.routes[0].distance, time: r.routes[0].time });
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
            for (const step of r.routes[0].steps || []) { if (step.path) for (const p of step.path) path.push({ lng: p.lng, lat: p.lat }); }
            resolve({ path, dist: r.routes[0].distance, time: r.routes[0].time });
          } else resolve(null);
        });
      });
    });
  };

  // 自动滚动到最新日志
  const logContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fixed inset-0 z-[100] flex font-sans bg-[#0f172a] overflow-hidden text-slate-100">
      
      {/* 绝对定位的背景地图容器（应用科幻深色滤镜） */}
      <div 
        id="gs-map-container" 
        className="absolute inset-0 z-0 bg-[#0f172a] filter invert hue-rotate-180 brightness-95 contrast-125"
        style={{ width: '100%', height: '100%' }}
      />

      {/* 悬浮毛玻璃控制面板 - Glassmorphism UI */}
      <div className="relative z-10 w-[420px] max-w-[90vw] h-full p-6 flex flex-col gap-6 backdrop-blur-3xl bg-slate-900/60 border-r border-white/5 shadow-2xl overflow-y-auto">
        
        <div className="flex justify-between items-center -mb-2">
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-2">
              <MapIcon className="w-5 h-5 text-emerald-400" />
              航线空间站 <span className="text-xs text-emerald-500/80 font-mono tracking-widest mt-1">/OS</span>
            </h1>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 控制方案选择 */}
        <div className="flex bg-slate-800/50 p-1.5 rounded-xl border border-white/5 p-1 backdrop-blur-md">
          {(['drive', 'walk', 'straight'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setRouteMode(mode)}
              className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg transition-all duration-300 ${
                routeMode === mode 
                  ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-300 shadow-lg border border-emerald-500/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              {mode === 'drive' ? '🚗 智能驾车' : mode === 'walk' ? '🚶 分段步行' : '📐 高精度飞线'}
            </button>
          ))}
        </div>

        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-slate-600 to-transparent opacity-50"></div>

        {/* 航点雷达阵列 */}
        <div className="flex flex-col gap-3 flex-1 min-h-[200px]">
          <h2 className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-2">
            <Navigation className="w-3.5 h-3.5" />
            拦截目标锚点
          </h2>
          <div className="space-y-2.5 overflow-y-auto pr-2 custom-scrollbar">
            {stops.map((stop, i) => (
              <div key={i} className="group relative flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-300 backdrop-blur-md">
                <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-slate-800 border border-emerald-500/50 text-emerald-400 font-bold text-xs shadow-[0_0_10px_rgba(16,185,129,0.2)] group-hover:shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-shadow">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200 truncate group-hover:text-emerald-300 transition-colors">
                    {stop.name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {stop.lng.toFixed(4)}, {stop.lat.toFixed(4)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
              </div>
            ))}
            {stops.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-slate-600 animate-spin"></div>
                NER 解析阵列载入中...
              </div>
            )}
          </div>
        </div>

        {/* 全局算力仪表盘 */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-4 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full transform translate-x-10 -translate-y-10 pointer-events-none"></div>
          
          <h3 className="text-xs text-slate-400 mb-4 font-semibold">全局路网拟合参数</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-slate-500 mb-1">物理向量距离</div>
              <div className="text-xl font-bold text-emerald-400 font-mono">{summary.dist}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 mb-1">推演时间消耗</div>
              <div className="text-xl font-bold text-cyan-400 font-mono">{summary.time}</div>
            </div>
          </div>
        </div>

        {/* 系统日志终端 */}
        <div className="h-40 flex flex-col bg-black/40 rounded-xl border border-white/5 backdrop-blur-md overflow-hidden relative">
          <div className="px-3 py-1.5 bg-white/5 flex items-center gap-2 border-b border-white/5 text-[10px] text-slate-400 font-mono tracking-wider">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            SYSTEM KERNEL LOG
          </div>
          <div ref={logContainerRef} className="flex-1 p-3 overflow-y-auto font-mono text-[10px] space-y-2 custom-scrollbar">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <span className="text-slate-600 flex-shrink-0 mt-0.5">[{log.timestamp}]</span>
                {log.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />}
                {log.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />}
                {log.type === 'error' && <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />}
                {log.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />}
                <span className={`flex-1 break-all ${
                  log.type === 'info' ? 'text-slate-300' :
                  log.type === 'success' ? 'text-emerald-200' :
                  log.type === 'error' ? 'text-rose-300' : 'text-amber-200'
                }`}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 隐藏系统的 Leaflet 预定义暗色样式影响以保持滤镜纯正 */}
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}} />
    </div>
  );
}
