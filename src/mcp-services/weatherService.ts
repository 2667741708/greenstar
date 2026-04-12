// ============================================================================
// 文件: src/mcp-services/weatherService.ts
// 基准版本: weatherService.ts @ 当前版本 (84行, Open-Meteo + 11城市硬编码)
// 修改内容 / Changes:
//   [重构] 天气数据源从 Open-Meteo 切换到高德天气 API (v3/weather/weatherInfo)
//   [重构] 移除硬编码城市坐标字典, 改为高德 adcode 自动解析 (覆盖全国所有城市)
//   [REFACTOR] Weather source: Open-Meteo → AMap Weather API (v3/weather/weatherInfo)
//   [REFACTOR] Remove hardcoded city coords, use AMap adcode auto-resolve (covers all cities)
// ============================================================================

const AMAP_KEY = '0e59aae0d84f39b4665eba7acc9f49a9';

export interface WeatherForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  description: string;
  // 高德天气扩展字段
  dayWeather?: string;
  nightWeather?: string;
  dayWind?: string;
  dayPower?: string;
}

/**
 * 从高德天气 API 获取天气预报
 * 高德 v3/weather/weatherInfo 支持全国所有城市, 无需坐标字典
 *
 * @param cityName 城市名 (如 "秦皇岛" / "厦门" / "成都")
 * @returns 未来 3 天天气预报
 */
export const fetchWeatherForecast = async (cityName: string): Promise<WeatherForecast[]> => {
  try {
    // Step 1: 先通过高德地理编码获取 adcode
    const adcode = await _resolveAdcode(cityName);
    if (!adcode) {
      console.warn(`[Weather] 无法解析城市 adcode: ${cityName}`);
      return [];
    }

    // Step 2: 调用高德天气 API (extensions=all 返回预报)
    const resp = await fetch(
      `https://restapi.amap.com/v3/weather/weatherInfo?key=${AMAP_KEY}&city=${adcode}&extensions=all`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await resp.json();

    if (data.status !== '1' || !data.forecasts?.length) {
      console.warn('[Weather] AMap weather API returned no data:', data.info);
      return [];
    }

    const forecast = data.forecasts[0];
    const casts = forecast.casts || [];

    // 取前 3 天
    return casts.slice(0, 3).map((c: any) => ({
      date: c.date,
      temperatureMax: parseFloat(c.daytemp) || 0,
      temperatureMin: parseFloat(c.nighttemp) || 0,
      weatherCode: _mapWeatherToCode(c.dayweather),
      description: `${c.dayweather}转${c.nightweather}`,
      dayWeather: c.dayweather,
      nightWeather: c.nightweather,
      dayWind: c.daywind,
      dayPower: c.daypower,
    }));
  } catch (err) {
    console.error('[Weather] AMap weather fetch failed:', err);
    return [];
  }
};

/**
 * 通过高德地理编码获取城市 adcode
 */
async function _resolveAdcode(cityName: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?key=${AMAP_KEY}&address=${encodeURIComponent(cityName)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await resp.json();
    if (data.status === '1' && data.geocodes?.length) {
      // adcode 通常是 6 位, 取前 6 位即市级编码
      const adcode = data.geocodes[0].adcode || '';
      return adcode;
    }
  } catch {
    // 静默失败
  }
  return '';
}

/**
 * 将高德天气描述映射到 WMO weather code (兼容旧接口)
 */
function _mapWeatherToCode(weather: string): number {
  if (!weather) return 0;
  const map: Record<string, number> = {
    '晴': 0, '少云': 1, '晴间多云': 1, '多云': 2,
    '阴': 3, '雾': 45, '霾': 48,
    '小雨': 61, '中雨': 63, '大雨': 65, '暴雨': 65,
    '阵雨': 61, '雷阵雨': 95, '雷阵雨并伴有冰雹': 95,
    '小雪': 71, '中雪': 73, '大雪': 75, '暴雪': 75,
    '雨夹雪': 71, '阵雪': 71,
    '浮尘': 48, '扬沙': 48, '沙尘暴': 48,
  };
  for (const [key, code] of Object.entries(map)) {
    if (weather.includes(key)) return code;
  }
  return 0;
}
