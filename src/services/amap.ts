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
 * 生成高德高清静态地图 URL（兜底图片）
 * Generate AMap high-resolution static map URL as fallback image
 * 分辨率: 750x400 (高德免费版支持的最大尺寸)
 * Resolution: 750x400 (max supported by AMap free tier)
 */
const generateStaticMapUrl = (lat: number, lng: number): string => {
  // size=750*400 是高德静态图 API 的最大分辨率
  // zoom=16 提供街道级细节
  return `https://restapi.amap.com/v3/staticmap?location=${lng},${lat}&zoom=16&size=750*400&markers=mid,,A:${lng},${lat}&key=${AMAP_KEY}`;
};

/**
 * 从高德 POI photos URL 中提取高清原图链接
 * Extract HD original image URL from AMap POI photo URL
 *
 * 高德返回的 photos URL 通常托管在阿里云 OSS，带有裁剪/压缩参数：
 * 例如: https://xxx.amap.com/images/xxx.jpg?x-oss-process=image/resize,w_400
 * 移除 ?x-oss-process... 后缀即可获取原图
 *
 * AMap photo URLs are hosted on Alibaba Cloud OSS with resize params.
 * Removing the ?x-oss-process suffix returns the original full-res image.
 */
const extractHDPhotoUrl = (url: string): string => {
  if (!url) return '';
  // 移除 OSS 图片处理参数，保留原图 URL
  // Strip OSS image processing parameters to get original image
  const cleanUrl = url.split('?')[0];
  return cleanUrl;
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

              // 图片来源优先级：高德原生 photos 原图 → 高清静态地图 URL 兜底
              // Image priority: AMap native photos (HD original) → high-res static map fallback
              const imageUrl = (poi.photos && poi.photos.length > 0)
                ? extractHDPhotoUrl(poi.photos[0].url)
                : generateStaticMapUrl(poi.location.lat, poi.location.lng);

              return {
                id: poi.id,
                name: poi.name,
                description: poi.address || poi.type || '热门地点',
                category: category,
                imageUrl: imageUrl,
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

  // Step 2: 缓存未命中，调用高德 API
  // Cache miss: call AMap API
  const spots = await _searchPOIFromAmap(city, keyword, center, { ...options, radius });

  // Step 3: 写入缓存（异步，不阻塞返回）
  // Write to cache asynchronously
  setCachedPOI(cacheKey, spots, city).catch(e => console.warn('[POI Cache] Write failed:', e));

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
