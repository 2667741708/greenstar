// ============================================================================
// 文件: src/mcp-services/searchService.ts
// 基准版本: searchService.ts v1 (双引擎 AMap+Nominatim)
// 修改内容 / Changes:
//   [修复] 增加中国大陆经纬度边界框检测，阻止高德把海外城市名错误匹配到国内同名地点
//   [修复] Nominatim 在大陆网络环境下极慢或被墙，增加 Photon (Komoot) 作为第二国际引擎
//   [修复] 高德对海外地名（如吉隆坡）返回国内同名地点（如贵州吉隆），需降权处理
//   [FIX] Added China bounding box to detect/demote AMap results for overseas queries
//   [FIX] Added Photon (Komoot) as faster alternative to Nominatim for international geocoding
//   [FIX] AMap returns domestic homonym for overseas cities (e.g. 吉隆坡→吉隆), now demoted
// ============================================================================

export interface SearchResult {
  name: string;          // 地点名
  nameEn?: string;       // 英文名（如有）
  lat: number;
  lng: number;
  country?: string;      // 国家
  formattedAddress: string;
  source: 'amap' | 'nominatim' | 'photon';  // 数据来源标记
  confidence: number;    // 0~1 置信度
  type?: string;         // 地点类型 (city, country, landmark 等)
}

// 声明全局 AMap
declare const AMap: any;

// ==================== 地理工具函数 ====================

/**
 * 检测坐标是否在中国大陆范围内 (粗略边界框)
 * Check if coordinates fall within China mainland bounding box
 * 中国大陆: 纬度 18°N ~ 54°N, 经度 73°E ~ 135°E
 */
const isInChina = (lat: number, lng: number): boolean => {
  return lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135;
};

/**
 * 检测文本中是否含有中文字符
 */
const hasChinese = (text: string): boolean => /[\u4e00-\u9fff]/.test(text);

/**
 * 已知海外城市名匹配表（中文 → 实际坐标）
 * 解决高德把海外城市名解析为国内同名小地方的问题
 * Known overseas city names that AMap mislocates to domestic homonyms
 */
const KNOWN_OVERSEAS_CITIES: Record<string, { lat: number; lng: number; name: string; country: string }> = {
  '吉隆坡': { lat: 3.1390, lng: 101.6869, name: '吉隆坡', country: '马来西亚' },
  '新加坡': { lat: 1.3521, lng: 103.8198, name: '新加坡', country: '新加坡' },
  '东京':   { lat: 35.6762, lng: 139.6503, name: '东京', country: '日本' },
  '首尔':   { lat: 37.5665, lng: 126.9780, name: '首尔', country: '韩国' },
  '曼谷':   { lat: 13.7563, lng: 100.5018, name: '曼谷', country: '泰国' },
  '巴黎':   { lat: 48.8566, lng: 2.3522, name: '巴黎', country: '法国' },
  '伦敦':   { lat: 51.5074, lng: -0.1278, name: '伦敦', country: '英国' },
  '纽约':   { lat: 40.7128, lng: -74.0060, name: '纽约', country: '美国' },
  '悉尼':   { lat: -33.8688, lng: 151.2093, name: '悉尼', country: '澳大利亚' },
  '迪拜':   { lat: 25.2048, lng: 55.2708, name: '迪拜', country: '阿联酋' },
  '大阪':   { lat: 34.6937, lng: 135.5023, name: '大阪', country: '日本' },
  '清迈':   { lat: 18.7883, lng: 98.9853, name: '清迈', country: '泰国' },
  '普吉岛': { lat: 7.8804, lng: 98.3923, name: '普吉岛', country: '泰国' },
  '巴厘岛': { lat: -8.3405, lng: 115.0920, name: '巴厘岛', country: '印度尼西亚' },
  '河内':   { lat: 21.0285, lng: 105.8542, name: '河内', country: '越南' },
  '胡志明市': { lat: 10.8231, lng: 106.6297, name: '胡志明市', country: '越南' },
  '马尼拉': { lat: 14.5995, lng: 120.9842, name: '马尼拉', country: '菲律宾' },
  '仰光':   { lat: 16.8661, lng: 96.1951, name: '仰光', country: '缅甸' },
  '洛杉矶': { lat: 34.0522, lng: -118.2437, name: '洛杉矶', country: '美国' },
  '旧金山': { lat: 37.7749, lng: -122.4194, name: '旧金山', country: '美国' },
  '温哥华': { lat: 49.2827, lng: -123.1207, name: '温哥华', country: '加拿大' },
  '多伦多': { lat: 43.6532, lng: -79.3832, name: '多伦多', country: '加拿大' },
  '罗马':   { lat: 41.9028, lng: 12.4964, name: '罗马', country: '意大利' },
  '柏林':   { lat: 52.5200, lng: 13.4050, name: '柏林', country: '德国' },
  '莫斯科': { lat: 55.7558, lng: 37.6173, name: '莫斯科', country: '俄罗斯' },
  '开罗':   { lat: 30.0444, lng: 31.2357, name: '开罗', country: '埃及' },
  '墨尔本': { lat: -37.8136, lng: 144.9631, name: '墨尔本', country: '澳大利亚' },
};

// ==================== 搜索引擎实现 ====================

/**
 * Photon (Komoot) 地理编码 — 基于 OpenStreetMap 数据
 * 优势：速度快、不受 GFW 影响（使用 Komoot CDN）、支持中英文
 * Photon geocoding - fast, not blocked by GFW, supports Chinese & English
 */
const searchPhoton = async (query: string): Promise<SearchResult[]> => {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=default`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    if (!data.features || data.features.length === 0) return [];

    return data.features.map((f: any) => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [0, 0]; // [lng, lat]
      return {
        name: props.name || props.city || props.state || query,
        nameEn: '',
        lat: coords[1],
        lng: coords[0],
        country: props.country || '',
        formattedAddress: [props.name, props.city, props.state, props.country].filter(Boolean).join(', '),
        source: 'photon' as const,
        confidence: props.type === 'city' ? 0.85 : props.type === 'country' ? 0.9 : 0.7,
        type: props.type || '',
      };
    });
  } catch (err) {
    console.warn('[SearchService] Photon search failed:', err);
    return [];
  }
};

/**
 * Nominatim (OpenStreetMap) 地理编码 — 降低超时时间
 * Nominatim geocoding with reduced timeout for China network
 */
const searchNominatim = async (query: string): Promise<SearchResult[]> => {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=3&accept-language=zh,en`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GreenStar-Travel-App/1.0' },
      signal: AbortSignal.timeout(4000), // 降低到 4s 避免长时间挂起
    });
    if (!res.ok) return [];
    const data = await res.json();

    return data.map((item: any) => ({
      name: item.display_name?.split(',')[0] || item.name || query,
      nameEn: item.namedetails?.['name:en'] || '',
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      country: item.address?.country || '',
      formattedAddress: item.display_name || '',
      source: 'nominatim' as const,
      confidence: item.importance ? Math.min(item.importance, 1) : 0.5,
      type: item.type || item.category || '',
    }));
  } catch (err) {
    console.warn('[SearchService] Nominatim search failed (may be blocked):', err);
    return [];
  }
};

/**
 * 高德地理编码 (国内精度最优) — 带中国边界框检测
 * AMap geocoding with China bounding box filter
 */
const searchAMap = (query: string): Promise<SearchResult[]> => {
  return new Promise((resolve) => {
    if (typeof AMap === 'undefined') {
      resolve([]);
      return;
    }

    // 设置 5 秒超时
    const timeout = setTimeout(() => {
      console.warn('[SearchService] AMap geocoding timeout');
      resolve([]);
    }, 5000);

    AMap.plugin(['AMap.Geocoder'], () => {
      try {
        const geocoder = new AMap.Geocoder();
        geocoder.getLocation(query, (status: string, result: any) => {
          clearTimeout(timeout);
          if (status === 'complete' && result.geocodes?.length) {
            const results: SearchResult[] = result.geocodes.slice(0, 3).map((geo: any) => {
              const lat = geo.location.lat;
              const lng = geo.location.lng;
              const city = geo.addressComponent?.city || geo.addressComponent?.province || geo.addressComponent?.country || '';
              const inChina = isInChina(lat, lng);

              return {
                name: city || query,
                nameEn: '',
                lat: lat,
                lng: lng,
                country: geo.addressComponent?.country || (inChina ? '中国' : ''),
                formattedAddress: geo.formattedAddress || query,
                source: 'amap' as const,
                // 关键修复：如果坐标在中国境内，高置信度；否则降权到 0.5
                confidence: inChina ? 0.9 : 0.5,
                type: 'city',
              };
            });
            resolve(results);
          } else {
            resolve([]);
          }
        });
      } catch {
        clearTimeout(timeout);
        resolve([]);
      }
    });
  });
};

// ==================== 合并与主接口 ====================

/**
 * 去重合并所有引擎的搜索结果
 */
const mergeResults = (...resultArrays: SearchResult[][]): SearchResult[] => {
  const merged: SearchResult[] = [];
  const seen = new Set<string>();

  const addResult = (r: SearchResult) => {
    const key = `${r.lat.toFixed(1)}_${r.lng.toFixed(1)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  };

  for (const arr of resultArrays) {
    arr.forEach(addResult);
  }

  return merged.sort((a, b) => b.confidence - a.confidence);
};

/**
 * 全球多引擎聚合搜索（对外暴露的主接口）
 * Global multi-engine aggregated search (main exported API)
 *
 * 优先级策略:
 * 1. 先检查已知海外城市名缓存（秒级返回，零网络开销）
 * 2. 并行查询 AMap + Photon + Nominatim
 * 3. AMap 返回的海外坐标自动降权
 * 4. 中文搜索时高德国内结果加权，英文搜索时国际引擎加权
 */
export const searchGlobal = async (query: string): Promise<SearchResult[]> => {
  if (!query.trim()) return [];

  // ★ 第 0 步：检查已知海外城市名缓存（瞬间返回）
  const trimmed = query.trim();
  if (KNOWN_OVERSEAS_CITIES[trimmed]) {
    const city = KNOWN_OVERSEAS_CITIES[trimmed];
    console.log(`[SearchService] 命中海外城市缓存: ${city.name} (${city.country})`);
    return [{
      name: city.name,
      nameEn: '',
      lat: city.lat,
      lng: city.lng,
      country: city.country,
      formattedAddress: `${city.name}, ${city.country}`,
      source: 'photon',
      confidence: 1.0,
      type: 'city',
    }];
  }

  const containsChinese = hasChinese(query);

  // 三引擎并行查询（Promise.allSettled 保障任一引擎超时不阻塞）
  const [amapResults, photonResults, nominatimResults] = await Promise.allSettled([
    searchAMap(query),
    searchPhoton(query),
    searchNominatim(query),
  ]).then(results => [
    results[0].status === 'fulfilled' ? results[0].value : [],
    results[1].status === 'fulfilled' ? results[1].value : [],
    results[2].status === 'fulfilled' ? results[2].value : [],
  ]);

  console.log(`[SearchService] AMap: ${amapResults.length}, Photon: ${photonResults.length}, Nominatim: ${nominatimResults.length}`);

  // 加权策略
  if (containsChinese) {
    // 中文搜索：高德国内结果加权
    amapResults.filter(r => isInChina(r.lat, r.lng)).forEach(r => r.confidence = Math.min(r.confidence + 0.1, 1));
  } else {
    // 英文搜索：国际引擎加权
    photonResults.forEach(r => r.confidence = Math.min(r.confidence + 0.15, 1));
    nominatimResults.forEach(r => r.confidence = Math.min(r.confidence + 0.1, 1));
  }

  const merged = mergeResults(amapResults, photonResults, nominatimResults);

  if (merged.length === 0) {
    console.warn(`[SearchService] 三引擎均无法解析: "${query}"`);
  }

  return merged;
};
