import { useState, useEffect } from 'react';
import { reverseGeocode } from '../services/amap';

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
            onLocationFound?.(loc.lat, loc.lng, fallbackAddr, '');
          } finally {
            setLoading(false);
          }
        },
        (err) => {
          setError('定位失败，请检查浏览器权限');
          const fallback = { lat: 31.2304, lng: 121.4737 }; // 上海
          setLocation(fallback);
          setAddress("上海市 (默认参考点)");
          setCity("上海市");
          onLocationFound?.(fallback.lat, fallback.lng, "上海市", "上海市");
          setLoading(false);
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
