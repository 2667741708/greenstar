// ============================================================================
// Internal MCP Service: Virtual Weather API Wrapper
// ============================================================================

export interface WeatherForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  description: string;
}

const WMO_CODES: Record<number, string> = {
  0: '晴朗无云',
  1: '主要晴朗',
  2: '部分多云',
  3: '阴天',
  45: '起雾',
  48: '沉积雾',
  51: '微毛毛雨',
  53: '中等毛毛雨',
  55: '密集毛毛雨',
  61: '微雨',
  63: '中雨',
  65: '大雨',
  71: '微雪',
  73: '中雪',
  75: '大雪',
  95: '雷雨',
};

// Map city name to approx coordinates (fallback simulation since geocoding city names without keys can fail)
const CITY_COORDS: Record<string, { lat: number, lng: number }> = {
  '北京': { lat: 39.9042, lng: 116.4074 },
  '上海': { lat: 31.2304, lng: 121.4737 },
  '广州': { lat: 23.1291, lng: 113.2644 },
  '深圳': { lat: 22.5431, lng: 114.0579 },
  '成都': { lat: 30.5728, lng: 104.0668 },
  '重庆': { lat: 29.5630, lng: 106.5516 },
  '杭州': { lat: 30.2741, lng: 120.1551 },
  '西安': { lat: 34.3416, lng: 108.9398 },
  '武汉': { lat: 30.5928, lng: 114.3055 },
  '南京': { lat: 32.0603, lng: 118.7969 },
  '呼和浩特': { lat: 40.8423, lng: 111.7489 }
};

export const fetchWeatherForecast = async (cityName: string): Promise<WeatherForecast[]> => {
  try {
    let lat = 39.9042;
    let lng = 116.4074; // default beijing
    
    // Find matching city
    for (const city in CITY_COORDS) {
      if (cityName.includes(city) || city.includes(cityName)) {
        lat = CITY_COORDS[city].lat;
        lng = CITY_COORDS[city].lng;
        break;
      }
    }

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai`);
    const data = await res.json();
    
    if (!data.daily) return [];

    const forecasts: WeatherForecast[] = [];
    for (let i = 0; i < 3; i++) {
      const code = data.daily.weathercode[i];
      forecasts.push({
        date: data.daily.time[i],
        temperatureMax: data.daily.temperature_2m_max[i],
        temperatureMin: data.daily.temperature_2m_min[i],
        weatherCode: code,
        description: WMO_CODES[code] || '未知天气'
      });
    }
    
    return forecasts;
  } catch (err) {
    console.error('Weather MCP failed:', err);
    return [];
  }
};
