// ============================================================================
// 文件: src/hooks/useGeolocation.ts
// 基准版本: useGeolocation.ts @ 650ddca (53行)
// 修改内容 / Changes:
//   [调整] 启用高精度定位模式 (enableHighAccuracy: true)
//   [调整] 增加 timeout: 10s, maximumAge: 60s 参数
//   [ADJUST] Enable high-accuracy positioning mode
//   [ADJUST] Add timeout: 10s, maximumAge: 60s parameters
// ============================================================================

import { useState, useEffect } from 'react';
import { reverseGeocode } from '../services/amap';
import { CONSTANTS } from '../config/constants';

export const useGeolocation = (onLocationFound?: (lat: number, lng: number, address: string, city: string) => void) => {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>('定位中...');
  const [city, setCity] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLocation = () => {
    if (navigator.geolocation) {
      setLoading(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        // 高精度定位成功回调
        // High-accuracy positioning success callback
        async (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(loc);
          try {
            const result = await reverseGeocode(loc.lat, loc.lng);
            setAddress(result.address);
            setCity(result.city);
            onLocationFound?.(loc.lat, loc.lng, result.address, result.city);
          } catch (err) {
            const fallbackAddr = `📍 ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
            setAddress(fallbackAddr);
            // 逆地理编码失败时，使用默认城市名确保自动跳转仍可触发
            // Fallback to default city name to ensure auto-locate still triggers
            const fallbackCity = CONSTANTS.DEFAULT_LOCATION.name;
            setCity(fallbackCity);
            onLocationFound?.(loc.lat, loc.lng, fallbackAddr, fallbackCity);
          } finally {
            setLoading(false);
          }
        },
        (err) => {
          setError('定位失败，请检查浏览器权限');
          const fallback = { lat: 31.2304, lng: 121.4737 }; // 上海
          setLocation(fallback);
          setAddress("上海定位失败，降级显示参考点");
          setCity("上海市");
          // 移除 onLocationFound?.(...) 以防止定位失败时自动跳转到上海
          setLoading(false);
        },
        // 高精度模式参数
        // High-accuracy mode parameters
        {
          enableHighAccuracy: true,  // 启用GPS/WiFi高精度定位
          timeout: 10000,            // 10秒超时
          maximumAge: 60000,         // 60秒内复用缓存位置
        }
      );
    } else {
      setError('浏览器不支持地理定位');
    }
  };

  useEffect(() => {
    refreshLocation();
  }, []);

  return { location, address, city, loading, error, refreshLocation, setLocation, setAddress, setCity };
};
