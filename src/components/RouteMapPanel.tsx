// ============================================================================
// 文件: src/components/RouteMapPanel.tsx
// 基准版本: 新建文件（无基线版本）
// 修改内容 / Changes:
//   [新建] 攻略路线地图可视化组件
//   [NEW] Route map visualization panel for AI-generated travel plans
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RouteStop, RouteResult, geocodePlace, planDrivingRoute, extractStopsFromPlan } from '../services/routePlanner';

declare const AMap: any;

interface RouteMapPanelProps {
  planText: string;       // AI 生成的攻略全文
  cityName: string;       // 城市名称
  onClose: () => void;    // 关闭回调
}

export const RouteMapPanel: React.FC<RouteMapPanelProps> = ({ planText, cityName, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('正在提取攻略中的关键地标...');
  const [error, setError] = useState<string | null>(null);
  const [stopNames, setStopNames] = useState<string[]>([]);

  const buildRoute = useCallback(async () => {
    try {
      // Step 1: 从攻略文本中提取地标名
      setStatus('正在提取攻略中的关键地标...');
      const names = extractStopsFromPlan(planText, cityName);
      if (names.length < 2) {
        setError('攻略中未找到足够的地标信息（最少需要2个地点）');
        setLoading(false);
        return;
      }
      setStopNames(names);

      // Step 2: 地理编码，将地名转为坐标
      setStatus(`正在为 ${names.length} 个地标进行地理编码...`);
      const stops: RouteStop[] = [];
      for (const name of names) {
        const searchName = `${cityName}${name}`;
        const pos = await geocodePlace(searchName, cityName);
        if (pos) {
          stops.push({ name, position: pos, description: '' });
        }
      }

      if (stops.length < 2) {
        setError('成功编码的地标不足2个，无法规划路线');
        setLoading(false);
        return;
      }

      // Step 3: 调用高德驾车路线规划
      setStatus(`正在规划 ${stops.length} 站点路线...`);
      const result = await planDrivingRoute(stops);
      setRouteResult(result);

      // Step 4: 在地图上绘制路线
      if (mapInstanceRef.current && result.path.length > 0) {
        drawRoute(mapInstanceRef.current, result);
      }
      
      setLoading(false);
      setStatus('');
    } catch (err: any) {
      setError(`路线规划失败: ${err.message}`);
      setLoading(false);
    }
  }, [planText, cityName]);

  // 初始化地图
  useEffect(() => {
    if (!mapRef.current || typeof AMap === 'undefined') return;

    const map = new AMap.Map(mapRef.current, {
      zoom: 12,
      viewMode: '3D',
      pitch: 30,
    });
    mapInstanceRef.current = map;

    // 使用地理编码定位到城市
    AMap.plugin('AMap.Geocoder', () => {
      const geocoder = new AMap.Geocoder();
      geocoder.getLocation(cityName, (status: string, result: any) => {
        if (status === 'complete' && result.geocodes?.length > 0) {
          const loc = result.geocodes[0].location;
          map.setCenter([loc.lng, loc.lat]);
        }
      });
    });

    buildRoute();

    return () => {
      map?.destroy();
    };
  }, []);

  const drawRoute = (map: any, result: RouteResult) => {
    // 绘制路线折线
    const path = result.path.map(([lng, lat]) => new AMap.LngLat(lng, lat));
    const polyline = new AMap.Polyline({
      path,
      strokeColor: '#10B981',
      strokeWeight: 6,
      strokeOpacity: 0.8,
      lineJoin: 'round',
      lineCap: 'round',
      showDir: true,
    });
    map.add(polyline);

    // 绘制站点 Marker
    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
    result.stops.forEach((stop, i) => {
      const marker = new AMap.Marker({
        position: new AMap.LngLat(stop.position[0], stop.position[1]),
        label: {
          content: `<div style="background:${colors[i % colors.length]};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.2);">${i + 1}. ${stop.name}</div>`,
          direction: 'top',
          offset: new AMap.Pixel(0, -5),
        },
      });
      map.add(marker);
    });

    // 自适应视野
    map.setFitView(null, false, [50, 50, 50, 50]);
  };

  const formatDistance = (meters: number): string => {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${meters} 米`;
  };

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}小时${mins}分钟` : `${mins}分钟`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex flex-col">
      {/* 顶栏 */}
      <div className="bg-white px-5 py-3 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
            <i className="bi bi-x-lg text-xl"></i>
          </button>
          <h3 className="font-black text-lg">📍 攻略路线地图</h3>
          {routeResult && (
            <span className="text-xs text-gray-400">
              {formatDistance(routeResult.distance)} · {formatDuration(routeResult.duration)} · {routeResult.stops.length} 站
            </span>
          )}
        </div>
      </div>

      {/* 地图区域 */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full"></div>
        
        {/* 加载状态覆盖层 */}
        {loading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-sm font-bold text-gray-600">{status}</p>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="absolute top-4 left-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium z-10">
            {error}
          </div>
        )}
      </div>

      {/* 底部站点列表 */}
      {routeResult && (
        <div className="bg-white border-t border-gray-100 px-5 py-3 shrink-0 max-h-48 overflow-y-auto">
          <p className="text-xs font-bold text-gray-400 mb-2">🗺️ 路线站点</p>
          <div className="flex flex-wrap gap-2">
            {routeResult.stops.map((stop, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full">
                <span className="w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[9px] font-black">{i + 1}</span>
                {stop.name}
                {i < routeResult.stops.length - 1 && <i className="bi bi-arrow-right text-emerald-300 ml-1"></i>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
