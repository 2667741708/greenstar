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
        const marker = new AMap.Marker({
          position: [spot.coordinates.lng, spot.coordinates.lat],
          content: `<div class="custom-marker transition-all duration-500 ${isSelected ? 'scale-125 shadow-xl' : ''}" style="background: ${spot.checkedIn ? (isPro ? '#f59e0b' : '#059669') : '#94a3b8'}; border: ${spot.checkedIn ? '3px solid white' : '1px solid white'}; opacity: ${spot.checkedIn ? '1' : '0.6'}"><i class="bi bi-${spot.category.toLowerCase().includes('cafe') ? 'cup-hot' : 'star-fill'}"></i></div>`,
          offset: new AMap.Pixel(-16, -32)
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
