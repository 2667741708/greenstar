import { useEffect, useRef } from 'react';
import { Spot, CityInfo } from '../types';

declare const AMap: any;

export const useAmap = (
  containerId: string, 
  center: { lat: number, lng: number } | null, 
  zoom: number, 
  isPro: boolean,
  spots: Spot[],
  cities: CityInfo[],
  selectedSpot: Spot | null,
  onSpotSelect: (spot: Spot | null) => void,
  onCitySelect?: (city: CityInfo) => void
) => {
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!document.getElementById(containerId)) return;
    if (typeof AMap === 'undefined') return;

    if (!mapInstance.current) {
      mapInstance.current = new AMap.Map(containerId, {
        zoom: zoom,
        center: center ? [center.lng, center.lat] : [105, 35],
        viewMode: '3D',
        pitch: 45,
        mapStyle: isPro ? 'amap://styles/darkblue' : 'amap://styles/whitesmoke'
      });
      
      mapInstance.current.on('click', () => onSpotSelect(null));

      AMap.plugin(['AMap.ToolBar'], function() {
        mapInstance.current.addControl(new AMap.ToolBar({ position: 'RB' }));
      });
    } else if (center) {
      mapInstance.current.setZoomAndCenter(zoom, [center.lng, center.lat], false, 800);
    }

    // 更新主题
    mapInstance.current.setMapStyle(isPro ? 'amap://styles/darkblue' : 'amap://styles/whitesmoke');

    // 绘制 Markers
    updateMarkers();

  }, [center, zoom, isPro, spots, cities, selectedSpot]);

  const updateMarkers = () => {
    if (!mapInstance.current) return;
    
    // 清除旧 Markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // 如果传入了 cities，则绘制城市标记（用于全国地图入口）
    if (cities && cities.length > 0) {
      cities.forEach(city => {
        const div = document.createElement('div');
        div.className = `flex flex-col items-center cursor-pointer hover:scale-110 transition-transform ${city.isUnlocked ? 'opacity-100' : 'opacity-80'}`;
        div.innerHTML = `
          <div class="w-8 h-8 rounded-full shadow-lg ${city.isUnlocked ? (isPro ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-gray-400'} border-2 border-white flex items-center justify-center text-white text-sm relative z-10">
            <i class="bi bi-geo-alt-fill"></i>
          </div>
          <div class="mt-1 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm text-xs font-bold text-gray-800 border border-gray-100 whitespace-nowrap">${city.name}</div>
        `;
        div.onclick = (e) => {
          e.stopPropagation();
          onCitySelect?.(city);
        };

        const marker = new AMap.Marker({
          position: [city.coordinates.lng, city.coordinates.lat],
          content: div,
          offset: new AMap.Pixel(-16, -16)
        });
        marker.setMap(mapInstance.current);
        markersRef.current.push(marker);
      });
      return;
    }

    // 如果传入了 spots，则按城市探索页逻辑绘制 POI
    if (spots && spots.length > 0) {
      // 绘制用户位置（以传入的 center 为准）
      if (center) {
        const userMarker = new AMap.Marker({
          position: [center.lng, center.lat],
          content: `<div class="relative"><div class="absolute inset-0 w-8 h-8 bg-blue-500/20 rounded-full animate-ping"></div><div class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-lg"></div></div>`,
          offset: new AMap.Pixel(-8, -8),
          zIndex: 100
        });
        userMarker.setMap(mapInstance.current);
        markersRef.current.push(userMarker);
      }

      spots.forEach(spot => {
        const isSelected = selectedSpot?.id === spot.id;
        let markerContent = '';
        let offsetParams: [number, number] = [-16, -32];
        let zIndex = 100;

        if (spot.checkedIn && spot.photos && spot.photos.length > 0) {
          // New High-Fidelity Polaroid Marker
          const countBadge = spot.photos.length > 1 
            ? `<div style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; z-index: 10; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">\${spot.photos.length}</div>` 
            : '';
            
          markerContent = `
            <div class="glass-panel" style="width: 110px; height: 120px; padding: 6px; border-radius: 12px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between; box-shadow: 0 10px 25px rgba(0,0,0,0.2); cursor: pointer; transition: transform 0.2s;">
              \${countBadge}
              <div style="width: 100%; height: 75px; background: #f1f5f9; border-radius: 8px; overflow: hidden;">
                <img src="\${spot.photos[spot.photos.length - 1]}" style="width: 100%; height: 100%; object-fit: cover;" alt="\${spot.name}" />
              </div>
              <div style="width: 100%; padding-top: 4px; text-align: center;">
                <div style="font-size: 11px; font-weight: 800; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1;">\${spot.name}</div>
                <div style="font-size: 9px; font-weight: 600; color: #64748b; margin-top: 2px;">Day 1</div>
              </div>
              
              <!-- 底部三角形指向路线 -->
              <div style="position: absolute; bottom: -12px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 12px solid white; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.1));"></div>
              
              <!-- 蓝色路线节点原点 -->
              <div style="position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%); width: 14px; height: 14px; background: #3b82f6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59,130,246,0.5);"></div>
            </div>
          `;
          offsetParams = [-55, -135]; // Adjust offset for the huge 110x120 marker + 24px bottom point
          zIndex = 200;
        } else {
          // Default marker
          markerContent = `<div class="custom-marker transition-all duration-500 ${isSelected ? 'scale-125 shadow-xl' : ''}" style="background: ${spot.checkedIn ? (isPro ? '#f59e0b' : '#059669') : '#94a3b8'}; border: ${spot.checkedIn ? '3px solid white' : '1px solid white'}; opacity: ${spot.checkedIn ? '1' : '0.6'}"><i class="bi bi-${spot.category.toLowerCase().includes('cafe') ? 'cup-hot' : 'star-fill'}"></i></div>`;
          offsetParams = [-16, -32];
          zIndex = isSelected ? 100 : 10;
        }

        const marker = new AMap.Marker({
          position: [spot.coordinates.lng, spot.coordinates.lat],
          content: markerContent,
          offset: new AMap.Pixel(offsetParams[0], offsetParams[1]),
          zIndex: zIndex
        });
        marker.on('click', () => { 
          onSpotSelect(spot); 
          mapInstance.current.panTo([spot.coordinates.lng, spot.coordinates.lat]); 
        });
        marker.setMap(mapInstance.current);
        markersRef.current.push(marker);
      });
    }
  };

  return { mapInstance };
};
