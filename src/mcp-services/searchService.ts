// ============================================================================
// 文件: src/mcp-services/searchService.ts
// 基准版本: 新建文件（无基线版本）
// 修改内容 / Changes:
//   [新建] 创建多引擎全球地点搜索 MCP 服务
//   [NEW]  Multi-engine global location search MCP service
//   - searchGlobal(): 聚合 高德 + Nominatim(OSM) 双引擎，支持中英文全球搜索
//   - searchNominatim(): OpenStreetMap Nominatim 免费地理编码（国际覆盖强）
//   - searchAMap(): 高德地理编码封装（国内精度最高）
//   - mergeResults(): 双引擎结果去重合并，择优返回
// ============================================================================

export interface SearchResult {
  name: string;          // 地点名
  nameEn?: string;       // 英文名（如有）
  lat: number;
  lng: number;
  country?: string;      // 国家
  formattedAddress: string;
  source: 'amap' | 'nominatim';  // 数据来源标记
  confidence: number;    // 0~1 置信度
  type?: string;         // 地点类型 (city, country, landmark 等)
}

// 声明全局 AMap
declare const AMap: any;

/**
 * Nominatim (OpenStreetMap) 地理编码
 * 优势：全球覆盖、支持中英文、完全免费无需 API Key
 * Nominatim geocoding - global coverage, supports Chinese & English
 */
const searchNominatim = async (query: string): Promise<SearchResult[]> => {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=5&accept-language=zh,en`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GreenStar-Travel-App/1.0' },
      signal: AbortSignal.timeout(8000),
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
    console.warn('[SearchService] Nominatim search failed:', err);
    return [];
  }
};

/**
 * 高德地理编码 (国内精度最优)
 * AMap geocoding - best accuracy for China mainland
 */
const searchAMap = (query: string): Promise<SearchResult[]> => {
  return new Promise((resolve) => {
    if (typeof AMap === 'undefined') {
      resolve([]);
      return;
    }
    AMap.plugin(['AMap.Geocoder'], () => {
      try {
        const geocoder = new AMap.Geocoder();
        geocoder.getLocation(query, (status: string, result: any) => {
          if (status === 'complete' && result.geocodes?.length) {
            const results: SearchResult[] = result.geocodes.slice(0, 3).map((geo: any) => {
              const city = geo.addressComponent?.city || geo.addressComponent?.province || geo.addressComponent?.country || '';
              return {
                name: city || query,
                nameEn: '',
                lat: geo.location.lat,
                lng: geo.location.lng,
                country: geo.addressComponent?.country || '中国',
                formattedAddress: geo.formattedAddress || query,
                source: 'amap' as const,
                confidence: 0.9, // 高德国内精度高
                type: 'city',
              };
            });
            resolve(results);
          } else {
            resolve([]);
          }
        });
      } catch {
        resolve([]);
      }
    });
  });
};

/**
 * 检测文本中是否含有中文字符
 * Detect if query contains Chinese characters
 */
const hasChinese = (text: string): boolean => /[\u4e00-\u9fff]/.test(text);

/**
 * 去重合并两个引擎的搜索结果
 * Merge and deduplicate results from both engines
 */
const mergeResults = (amapResults: SearchResult[], nominatimResults: SearchResult[]): SearchResult[] => {
  const merged: SearchResult[] = [];
  const seen = new Set<string>();

  // 添加一个结果，用坐标做近似去重 (经纬度四舍五入到小数点后2位)
  const addResult = (r: SearchResult) => {
    const key = `${r.lat.toFixed(2)}_${r.lng.toFixed(2)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  };

  // 高德结果优先（国内搜索以高德为金标准）
  amapResults.forEach(addResult);
  nominatimResults.forEach(addResult);

  // 按置信度排序
  return merged.sort((a, b) => b.confidence - a.confidence);
};

/**
 * 全球多引擎聚合搜索（对外暴露的主接口）
 * Global multi-engine aggregated search (main exported API)
 * 
 * 策略:
 * - 如果搜索词包含中文 → 同时查询高德和 Nominatim，高德结果优先
 * - 如果搜索词为纯英文 → 优先 Nominatim（国际覆盖），高德作为补充
 * - 最终去重合并，按置信度排序
 * 
 * @param query 搜索词（中文或英文）
 * @returns 排序后的搜索结果数组
 */
export const searchGlobal = async (query: string): Promise<SearchResult[]> => {
  if (!query.trim()) return [];

  const containsChinese = hasChinese(query);

  // 双引擎并行查询
  const [amapResults, nominatimResults] = await Promise.allSettled([
    searchAMap(query),
    searchNominatim(query),
  ]).then(results => [
    results[0].status === 'fulfilled' ? results[0].value : [],
    results[1].status === 'fulfilled' ? results[1].value : [],
  ]);

  // 如果是中文且高德有结果，优先给高德加权
  if (containsChinese && amapResults.length > 0) {
    amapResults.forEach(r => r.confidence = Math.min(r.confidence + 0.1, 1));
  }

  // 如果是纯英文且 Nominatim 有结果，优先给 Nominatim 加权
  if (!containsChinese && nominatimResults.length > 0) {
    nominatimResults.forEach(r => r.confidence = Math.min(r.confidence + 0.1, 1));
  }

  const merged = mergeResults(amapResults, nominatimResults);

  // 兜底：如果都无结果，只返回空数组让调用者处理
  if (merged.length === 0) {
    console.warn(`[SearchService] 双引擎均无法解析: "${query}"`);
  }

  return merged;
};
