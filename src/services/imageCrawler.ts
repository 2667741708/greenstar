// ============================================================================
// 文件: src/services/imageCrawler.ts
// 基准版本: 新建文件（无基线版本）
// 修改内容 / Changes:
//   [新建] 多源图片爬虫服务：维基共享资源 + 高德静态地图兜底
//   [NEW] Multi-source image crawler: Wikimedia Commons + AMap static map fallback
// ============================================================================

const AMAP_KEY = '040c3af03bab9232ab67e0d232838b28';

/**
 * 从维基共享资源搜索地点图片
 * Search Wikimedia Commons for place images
 */
const searchWikimediaImage = async (keyword: string): Promise<string> => {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(keyword)}&gsrlimit=3&prop=imageinfo&iiprop=url|size&iiurlwidth=400&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return '';
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return '';

    // 遍历搜索结果，找到第一个有效图片
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      const info = page.imageinfo?.[0];
      if (info?.thumburl && info.width > 100) {
        return info.thumburl;
      }
    }
    return '';
  } catch {
    return '';
  }
};

/**
 * 生成高德静态地图缩略图 URL（卫星视图）
 * Generate AMap static map thumbnail URL as fallback
 * 注意：这是一个 <img> src 直链，不受 CORS 限制
 */
const generateStaticMapUrl = (lat: number, lng: number): string => {
  return `https://restapi.amap.com/v3/staticmap?location=${lng},${lat}&zoom=15&size=200*200&markers=mid,,A:${lng},${lat}&key=${AMAP_KEY}`;
};

/**
 * 为单个 POI 获取图片 URL（多源级联）
 * Fetch image URL for a POI using cascading sources
 * 
 * 优先级：
 * 1. 高德原生 photos（已有则跳过）
 * 2. 维基共享资源（真实地点照片）
 * 3. 高德静态地图（始终可用的兜底）
 */
export const fetchPOIImage = async (
  name: string, 
  city: string, 
  lat: number, 
  lng: number, 
  existingUrl?: string
): Promise<string> => {
  // 如果已有有效图片 URL（如高德原生提供），直接返回
  if (existingUrl && existingUrl.trim()) return existingUrl;

  // 尝试维基共享资源检索真实图片
  const wikiImg = await searchWikimediaImage(`${name} ${city}`);
  if (wikiImg) return wikiImg;

  // 如果连维基百科也没有图片，则返回空字符串，让组件回退显示高品质分类 Icon，而不是强行塞入一个无效链接
  return '';
};

/**
 * 批量为 POI 列表补全图片（并发但限流）
 * Batch fill images for POI list with concurrency control
 */
export const batchFetchPOIImages = async (
  spots: Array<{ name: string; imageUrl?: string; coordinates: { lat: number; lng: number } }>,
  city: string
): Promise<string[]> => {
  // 并发限制为 3，避免过多同时请求
  const CONCURRENCY = 3;
  const results: string[] = new Array(spots.length).fill('');

  for (let i = 0; i < spots.length; i += CONCURRENCY) {
    const batch = spots.slice(i, i + CONCURRENCY);
    const promises = batch.map((spot, idx) =>
      fetchPOIImage(spot.name, city, spot.coordinates.lat, spot.coordinates.lng, spot.imageUrl)
        .then(url => { results[i + idx] = url; })
        .catch(() => { results[i + idx] = ''; })
    );
    await Promise.all(promises);
  }
  return results;
};
