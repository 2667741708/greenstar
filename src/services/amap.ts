// ============================================================================
// 文件: src/services/amap.ts
// 基准版本: amap.ts @ 650ddca (180行)
// 修改内容 / Changes:
//   [重构] searchPOI 增加 options 参数，支持动态 radius/type/page
//   [新增] 三层过滤逻辑: 正面限定 + 负面排除 + 用户搜索透传
//   [新增] 无图 POI 自动拼接高德静态地图 URL 作为兜底图片
//   [新增] IndexedDB 缓存层接入（getCachedPOI / setCachedPOI）
//   [新增] searchPOIPaginated() — 渐进式多页加载
//   [REFACTOR] searchPOI with options: dynamic radius/type/page
//   [NEW] 3-layer filter: positive list + negative exclude + user search bypass
//   [NEW] Static map URL fallback for POIs without photos
//   [NEW] IndexedDB cache integration
//   [NEW] searchPOIPaginated() for multi-page loading
// ============================================================================

import { Spot } from '../types';
import { CONSTANTS } from '../config/constants';
import { buildCacheKey, getCachedPOI, setCachedPOI } from './poiCache';

// 声明全局变量 AMap
// Declare global AMap variable
declare const AMap: any;

const AMAP_KEY = '040c3af03bab9232ab67e0d232838b28';

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

/**
 * 生成高德瓦片地图 URL（无需 Web 服务 Key，直接访问瓦片服务）
 * Generate AMap tile map URL (no Web API key required)
 *
 * 原静态地图 API 返回 USERKEY_PLAT_NOMATCH(10009)——Key 仅绑定 JS API 平台。
 * 改用瓦片服务: webrd01.is.autonavi.com，无需 Key，返回 512x512 高清瓦片。
 * Static map API returns 10009 — key bound to JS API only.
 * Switched to tile service: no key needed, returns 512x512 HD tiles.
 */
const generateTileMapUrl = (lat: number, lng: number, zoom: number = 15): string => {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  // scale=2 返回 512x512 高清瓦片；style=8 标准地图
  // scale=2 returns 512x512 HD tile; style=8 standard map
  return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=2&style=8&x=${x}&y=${y}&z=${zoom}`;
};

/**
 * 三级图片 URL 生成器
 * Tiered image URL generator
 *
 * 从高德 POI photos URL 生成三个等级的图片链接：
 * Generate three tiers of image URLs from AMap POI photos:
 *
 * | 等级 Tier  | 用途 Usage        | OSS 参数            | 大小 Approx |
 * |-----------|------------------|--------------------|-----------|
 * | thumb     | 列表卡片缩略图      | resize,w_200       | ~15KB     |
 * | standard  | Pro用户列表        | resize,w_600       | ~60KB     |
 * | hd        | 详情页全屏/预取     | 无参数(原图)        | ~200KB    |
 */
interface TieredImageUrls {
  thumb: string;      // 缩略图：普通用户列表用
  standard: string;   // 标准图：Pro用户列表用
  hd: string;         // 原图：详情页/全屏查看用
}

const generateTieredImageUrls = (
  photos: Array<{ url: string }> | null,
  lat: number,
  lng: number
): TieredImageUrls => {
  if (photos && photos.length > 0 && photos[0].url) {
    const rawUrl = photos[0].url;
    // 移除 OSS 图片处理参数，获取原图基址
    // Strip OSS params to get base URL
    const baseUrl = rawUrl.split('?')[0];

    return {
      // 缩略图: 强制 200px 宽 + JPEG 75% 压缩
      // Thumbnail: force 200px width + JPEG 75% quality
      thumb: `${baseUrl}?x-oss-process=image/resize,w_200/quality,q_75`,
      // 标准图: 600px 宽 + JPEG 85% 压缩
      // Standard: 600px width + JPEG 85% quality
      standard: `${baseUrl}?x-oss-process=image/resize,w_600/quality,q_85`,
      // 原图: 无处理参数
      // HD original: no processing params
      hd: baseUrl,
    };
  }

  // 无图 POI：用地图瓦片生成两级兜底
  // No photos: use tile map with two zoom tiers
  const thumbMap = generateTileMapUrl(lat, lng, 14);  // 街区级 (~36KB)
  const hdMap = generateTileMapUrl(lat, lng, 16);      // 街道级 (~50KB)
  return {
    thumb: thumbMap,
    standard: hdMap,
    hd: hdMap,
  };
};

// ============================================================
// searchPOI 参数接口
// Search options interface
// ============================================================
export interface SearchPOIOptions {
  radius?: number;         // 搜索半径（米），默认按层级动态计算
  type?: string;           // 高德 POI 分类编码/名称，空则使用正面列表
  pageIndex?: number;      // 分页页码，默认 1
  pageSize?: number;       // 每页条数，默认 50
  isUserSearch?: boolean;  // 是否为用户主动搜索（true = 绕过三层过滤）
}

/**
 * 内部函数：直接调用高德 PlaceSearch API
 * Internal: raw AMap PlaceSearch call
 */
const _searchPOIFromAmap = (
  city: string,
  keyword: string,
  center: { lat: number; lng: number },
  options: SearchPOIOptions = {}
): Promise<Spot[]> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') {
      reject(new Error('高德地图 JS API 未加载成功'));
      return;
    }

    // ============================================================
    // 三层过滤 Layer 1: 确定 type 参数
    // Three-layer filter Layer 1: determine type parameter
    // ============================================================
    let searchType: string;
    if (options.isUserSearch) {
      // Layer 3: 用户主动搜索 — 全分类透传，不限制
      // User explicit search: bypass all filters
      searchType = '';
    } else if (options.type) {
      // 标签精准搜索 — 使用调用方传入的分类编码
      // Tag-based search: use caller-provided category code
      searchType = options.type;
    } else {
      // Layer 1: 默认浏览 — 使用正面类型限定列表
      // Default browse: use positive-list filter
      searchType = CONSTANTS.POI_TYPE_POSITIVE;
    }

    const radius = options.radius || CONSTANTS.SEARCH_RADIUS.city;

    AMap.plugin(['AMap.PlaceSearch'], () => {
      try {
        const placeSearch = new AMap.PlaceSearch({
          city: city,
          citylimit: false,
          type: searchType,
          pageSize: options.pageSize || 50,
          pageIndex: options.pageIndex || 1,
          extensions: 'all',
        });

        // 有关键词时全城文本搜索；无关键词时周边半径检索
        // keyword → city-wide text search; no keyword → nearby radius search
        const searchFn = keyword 
          ? (cb: any) => placeSearch.search(keyword, cb)
          : (cb: any) => placeSearch.searchNearBy('', [center.lng, center.lat], radius, cb);

        searchFn((status: string, result: any) => {
          if (status === 'complete' && result.info === 'OK' && result.poiList) {
            const pois = result.poiList.pois || [];
            let spots: Spot[] = pois.map((poi: any) => {
              const ratingStr = poi.biz_ext?.rating || (4 + Math.random()).toFixed(1);
              const rating = parseFloat(ratingStr) > 5 ? 5 : parseFloat(ratingStr);
              
              let category = 'Landmark';
              if (poi.type) {
                if (poi.type.includes('酒店') || poi.type.includes('宾馆') || poi.type.includes('民宿') || poi.type.includes('住宿')) category = 'Hotel';
                else if (poi.type.includes('餐厅') || poi.type.includes('美食')) category = 'Restaurant';
                else if (poi.type.includes('咖啡')) category = 'Cafe';
                else if (poi.type.includes('公园')) category = 'Park';
                else if (poi.type.includes('博物馆')) category = 'Museum';
                else if (poi.type.includes('购物') || poi.type.includes('商场') || poi.type.includes('步行街')) category = 'Shopping';
                else if (poi.type.includes('风景') || poi.type.includes('名胜')) category = 'Scenic';
              }

              // 三级图片 URL 生成：缩略图 / 标准图 / 原图
              // Tiered image URLs: thumbnail / standard / HD original
              const tieredUrls = generateTieredImageUrls(
                poi.photos,
                poi.location.lat,
                poi.location.lng
              );

              // 默认使用缩略图（普通用户快速出图，调用方可根据 isPro 切探为 standard）
              // Default to thumbnail (fast for normal users; caller can switch to standard for Pro)
              const imageUrl = tieredUrls.thumb;

              return {
                id: poi.id,
                name: poi.name,
                description: poi.address || poi.type || '热门地点',
                category: category,
                imageUrl: imageUrl,
                imageUrlThumb: tieredUrls.thumb,
                imageUrlHD: tieredUrls.hd,
                coordinates: {
                  lat: poi.location.lat,
                  lng: poi.location.lng
                },
                rating: rating,
                tags: poi.type ? poi.type.split(';').slice(0, 2).map((t: string) => t.split('|').pop() || t) : [],
                checkedIn: false,
                distance: calculateDistance(center.lat, center.lng, poi.location.lat, poi.location.lng)
              };
            });

            // ============================================================
            // 三层过滤 Layer 2: 负面排除（非用户主动搜索时执行）
            // Layer 2: negative exclude (skip for user explicit search)
            // ============================================================
            if (!options.isUserSearch) {
              spots = spots.filter(spot => {
                const typeStr = (spot.tags || []).join(' ') + ' ' + (spot.description || '');
                return !CONSTANTS.POI_TYPE_EXCLUDE.some(exclude => typeStr.includes(exclude));
              });
            }

            resolve(spots);
          } else if (status === 'no_data') {
            resolve([]);
          } else {
            console.error('AMap PlaceSearch failed:', status, result);
            reject(new Error('获取地点数据失败'));
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};

// ============================================================
// 降级引擎：高德 Web REST API（当 JS API 因网络/代理不可用时自动切换）
// Fallback engine: AMap Web REST API (auto-switch when JS API unavailable)
//
// 使用高德 v5/place/around API 进行周边搜索
// 返回包含真实照片(photos)的 POI 数据
// Uses AMap v5/place/around API for nearby search
// Returns POIs with real photos just like JS API
// ============================================================
const _searchPOIFromREST = async (
  city: string,
  keyword: string,
  center: { lat: number; lng: number },
  options: SearchPOIOptions = {}
): Promise<Spot[]> => {
  const radius = options.radius || CONSTANTS.SEARCH_RADIUS.city;
  const page = options.pageIndex || 1;
  const pageSize = options.pageSize || 50;

  // 构建 REST API URL
  // Build REST API URL
  let url: string;
  if (keyword) {
    // 关键词搜索使用 v5/place/text
    url = `https://restapi.amap.com/v5/place/text?key=${AMAP_KEY}&keywords=${encodeURIComponent(keyword)}&region=${encodeURIComponent(city)}&page_size=${pageSize}&page_num=${page}&show_fields=photos,business`;
  } else {
    // 周边搜索使用 v5/place/around
    url = `https://restapi.amap.com/v5/place/around?key=${AMAP_KEY}&location=${center.lng},${center.lat}&radius=${radius}&page_size=${pageSize}&page_num=${page}&show_fields=photos,business`;
    
    // 非用户搜索时添加类型过滤
    // Add type filter for non-user searches
    if (!options.isUserSearch && !options.type) {
      // v5 API 使用 types 参数（分类编码）
      url += `&types=110000|050000|060000|100000|080000|140000`;
    } else if (options.type) {
      url += `&types=${options.type}`;
    }
  }

  console.log('[REST API] Falling back to Web REST API:', url.substring(0, 80) + '...');

  const resp = await fetch(url, { 
    signal: AbortSignal.timeout(10000),
    referrerPolicy: 'no-referrer' 
  });
  if (!resp.ok) throw new Error(`REST API HTTP ${resp.status}`);
  const data = await resp.json();

  if (data.status !== '1' || !data.pois || data.pois.length === 0) {
    console.warn('[REST API] No results:', data.info || data.infocode);
    return [];
  }

  let spots: Spot[] = data.pois.map((poi: any) => {
    // v5 REST API location 格式为 "lng,lat" 字符串
    const [lngStr, latStr] = (poi.location || '0,0').split(',');
    const poiLat = parseFloat(latStr);
    const poiLng = parseFloat(lngStr);

    // 评分
    const ratingStr = poi.business?.rating || (4 + Math.random()).toFixed(1);
    const rating = Math.min(parseFloat(ratingStr), 5);

    // 分类
    let category = 'Landmark';
    const typeStr = poi.type || '';
    if (typeStr.includes('酒店') || typeStr.includes('宾馆') || typeStr.includes('民宿')) category = 'Hotel';
    else if (typeStr.includes('餐厅') || typeStr.includes('美食')) category = 'Restaurant';
    else if (typeStr.includes('咖啡')) category = 'Cafe';
    else if (typeStr.includes('公园')) category = 'Park';
    else if (typeStr.includes('博物馆')) category = 'Museum';
    else if (typeStr.includes('购物') || typeStr.includes('商场') || typeStr.includes('步行街')) category = 'Shopping';
    else if (typeStr.includes('风景') || typeStr.includes('名胜')) category = 'Scenic';

    // REST API v5 photos 格式: [{url: string}]
    const photos = poi.photos && poi.photos.length > 0 ? poi.photos : null;
    const tieredUrls = generateTieredImageUrls(photos, poiLat, poiLng);

    return {
      id: poi.id || `rest-${Date.now()}-${Math.random()}`,
      name: poi.name,
      description: poi.address || typeStr || '热门地点',
      category: category,
      imageUrl: tieredUrls.thumb,
      imageUrlThumb: tieredUrls.thumb,
      imageUrlHD: tieredUrls.hd,
      coordinates: { lat: poiLat, lng: poiLng },
      rating: rating,
      tags: typeStr ? typeStr.split(';').slice(0, 2).map((t: string) => t.split('|').pop() || t) : [],
      checkedIn: false,
      distance: calculateDistance(center.lat, center.lng, poiLat, poiLng),
    };
  });

  // 负面排除（非用户搜索）
  if (!options.isUserSearch) {
    spots = spots.filter(spot => {
      const info = (spot.tags || []).join(' ') + ' ' + (spot.description || '');
      return !CONSTANTS.POI_TYPE_EXCLUDE.some(ex => info.includes(ex));
    });
  }

  console.log(`[REST API] Got ${spots.length} spots for ${city}`);
  return spots;
};

/**
 * 带缓存的 POI 搜索（主接口）
 * Cached POI search (main public API)
 *
 * 流程: 检查缓存 → 缓存命中直接返回 → 未命中调用高德 → 写入缓存
 * Flow: check cache → hit: return → miss: call AMap → write cache
 */
export const searchPOI = async (
  city: string,
  keyword: string,
  center: { lat: number; lng: number },
  options: SearchPOIOptions = {}
): Promise<Spot[]> => {
  const radius = options.radius || CONSTANTS.SEARCH_RADIUS.city;
  const type = options.type || (options.isUserSearch ? '' : CONSTANTS.POI_TYPE_POSITIVE);
  const page = options.pageIndex || 1;
  const cacheKey = buildCacheKey(city, keyword, type, radius, page);

  // Step 1: 检查 IndexedDB 缓存
  // Check IndexedDB cache
  const cached = await getCachedPOI(cacheKey);
  if (cached) {
    console.log(`[POI Cache HIT] ${cacheKey.substring(0, 40)}... (${cached.length} spots)`);
    return cached;
  }

  // Step 2: 双引擎搜索 — JS API 优先，失败降级 REST API
  // Dual-engine search: prefer JS API, auto-fallback to REST API
  let spots: Spot[];
  try {
    spots = await _searchPOIFromAmap(city, keyword, center, { ...options, radius });
  } catch (jsErr: any) {
    console.warn(`[AMap JS] ${jsErr.message}, 降级到 REST API / falling back to REST API`);
    try {
      spots = await _searchPOIFromREST(city, keyword, center, { ...options, radius });
    } catch (restErr: any) {
      console.error(`[REST API] Also failed: ${restErr.message}`);
      return [];  // 双引擎均失败，返回空让上层 RAG 兜底
    }
  }

  // Step 3: 写入缓存（异步，不阻塞返回）
  // Write to cache asynchronously
  if (spots.length > 0) {
    setCachedPOI(cacheKey, spots, city).catch(e => console.warn('[POI Cache] Write failed:', e));
  }

  return spots;
};

/**
 * 渐进式多页 POI 加载
 * Progressive multi-page POI loading
 *
 * 自动翻页直到无更多数据或达到 maxPages 上限
 */
export const searchPOIPaginated = async (
  city: string,
  keyword: string,
  center: { lat: number; lng: number },
  options: SearchPOIOptions & { maxPages?: number } = {}
): Promise<Spot[]> => {
  const maxPages = options.maxPages || 3;
  const allSpots: Spot[] = [];
  const seenIds = new Set<string>();
  const pageSize = options.pageSize || 50;

  for (let page = 1; page <= maxPages; page++) {
    const spots = await searchPOI(city, keyword, center, { ...options, pageIndex: page });
    if (spots.length === 0) break;

    for (const s of spots) {
      if (!seenIds.has(s.id)) {
        seenIds.add(s.id);
        allSpots.push(s);
      }
    }

    // 不足一页说明已是最后一页
    // Less than a full page means no more pages
    if (spots.length < pageSize) break;
  }

  return allSpots;
};

// ============================================================
// 以下函数保持不变 / Functions below are unchanged
// ============================================================

export const reverseGeocode = (lat: number, lng: number): Promise<{ address: string; city: string }> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') {
      reject(new Error('高德地图 JS API 未加载成功'));
      return;
    }
    AMap.plugin(['AMap.Geocoder'], () => {
      try {
        const geocoder = new AMap.Geocoder();
        geocoder.getAddress([lng, lat], (status: string, result: any) => {
          if (status === 'complete' && result?.regeocode) {
            const regeo = result.regeocode;
            // 获取城市名：由于直辖市没有 city 字段，取 province 字段
            const city = regeo.addressComponent.city || regeo.addressComponent.province;
            resolve({
              address: regeo.formattedAddress || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              city: city
            });
          } else {
            reject(new Error('逆地理编码失败'));
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const geocode = (address: string): Promise<{ lat: number, lng: number, formattedAddress: string, city: string }> => {
  return new Promise((resolve, reject) => {
     if (typeof AMap === 'undefined') {
        reject(new Error('高德地图 JS API 未加载成功'));
        return;
      }
      AMap.plugin(['AMap.Geocoder'], () => {
        try {
          const geocoder = new AMap.Geocoder();
          geocoder.getLocation(address, (status: string, result: any) => {
            if (status === 'complete' && result.geocodes.length) {
              const first = result.geocodes[0];
              // 支持提取海外国家名作为 fallback，避免海外城市全是空字符串导致名称折叠
              const city = first.addressComponent?.city || first.addressComponent?.province || first.addressComponent?.country || '';
              resolve({
                 lat: first.location.lat,
                 lng: first.location.lng,
                 formattedAddress: first.formattedAddress,
                 city: city
              });
            } else {
              reject(new Error('找不到该地址'));
            }
          });
        } catch (err) {
          reject(err);
        }
      });
  });
};

export const getSubDistricts = (keyword: string, level: string = 'city'): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') {
      reject(new Error('高德地图 JS API 未加载成功'));
      return;
    }
    AMap.plugin('AMap.DistrictSearch', () => {
      try {
        const districtSearch = new AMap.DistrictSearch({
          level: level,
          subdistrict: 1, // 只取下一级
          showbiz: false
        });
        districtSearch.search(keyword, (status: string, result: any) => {
          if (status === 'complete' && result.districtList && result.districtList.length > 0) {
            resolve(result.districtList[0].districtList || []);
          } else {
            resolve([]);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};
