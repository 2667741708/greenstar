// ============================================================================
// 文件: src/services/poiCache.ts
// 基准版本: poiCache.ts @ b0a1650 (210行)
// 修改内容 / Changes:
//   [升级] DB_VERSION 1 → 2, 新增 img_cache object store
//   [新增] getImageCache / setImageCache: 图片 Blob 缓存读写
//   [新增] prefetchHDImages: Pro 用户后台预取 HD 原图到 IndexedDB
//   [新增] getHDImageUrl: 从缓存获取 HD blob URL 或回退到网络 URL
//   [UPGRADE] DB_VERSION 1 → 2, add img_cache object store
//   [NEW] getImageCache / setImageCache: image blob cache R/W
//   [NEW] prefetchHDImages: Pro user background HD image prefetch
//   [NEW] getHDImageUrl: get HD blob URL from cache or fallback to network URL
// ============================================================================

import { Spot } from '../types';
import { CONSTANTS } from '../config/constants';

const DB_NAME = 'greenstar_poi_cache';
const DB_VERSION = 2;  // v2: 新增 img_cache store
const STORE_NAME = 'poi_results';
const IMG_STORE_NAME = 'img_cache';  // 图片 Blob 缓存 store

interface CacheEntry {
  key: string;            // 缓存键
  spots: Spot[];          // POI 搜索结果
  timestamp: number;      // 写入时间戳（ms since epoch）
  cityName: string;       // 城市名（用于按城市批量清理）
}

interface ImageCacheEntry {
  url: string;            // 原始图片 URL（作为 key）
  blob: Blob;             // 图片 Blob 数据
  timestamp: number;      // 缓存写入时间戳
}

/**
 * 打开 IndexedDB 缓存数据库（v2: POI 数据 + 图片 Blob）
 * Open IndexedDB cache database (v2: POI data + image blobs)
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      // v1: POI 结果缓存
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('cityName', 'cityName', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      // v2: 图片 Blob 缓存
      // v2: Image blob cache
      if (!db.objectStoreNames.contains(IMG_STORE_NAME)) {
        const imgStore = db.createObjectStore(IMG_STORE_NAME, { keyPath: 'url' });
        imgStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// POI 搜索结果缓存（与 v1 相同）
// POI search result cache (same as v1)
// ============================================================

/**
 * 生成缓存键
 * Build cache key from search parameters
 * Format: city|keyword|type|radius|page
 */
export function buildCacheKey(
  city: string,
  keyword: string,
  type: string,
  radius: number,
  page: number
): string {
  return `${city}|${keyword}|${type}|${radius}|${page}`;
}

/**
 * 读取缓存（未过期返回 Spot[]，过期或不存在返回 null）
 * Read cached POI results (returns null if expired or missing)
 */
export async function getCachedPOI(key: string): Promise<Spot[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        // TTL 校验
        const age = Date.now() - entry.timestamp;
        if (age > CONSTANTS.POI_CACHE_TTL) {
          resolve(null);
          return;
        }
        resolve(entry.spots);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 写入缓存
 * Write POI results to cache
 */
export async function setCachedPOI(
  key: string,
  spots: Spot[],
  cityName: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const entry: CacheEntry = {
        key,
        spots,
        timestamp: Date.now(),
        cityName,
      };
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[POI Cache] Write failed:', e);
  }
}

/**
 * 清除某城市的全部缓存（用于手动刷新）
 * Clear all cached POI results for a specific city
 */
export async function clearCityCache(cityName: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('cityName');
      const req = index.openCursor(IDBKeyRange.only(cityName));

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        console.log(`[POI Cache] Cleared all cache for: ${cityName}`);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[POI Cache] Clear city cache failed:', e);
  }
}

/**
 * 清除全部过期缓存（TTL 超时的条目）
 * Purge all expired cache entries
 */
export async function purgeExpiredCache(): Promise<void> {
  try {
    const db = await openDB();
    const cutoff = Date.now() - CONSTANTS.POI_CACHE_TTL;

    // 清理过期 POI 缓存
    // Purge expired POI cache
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const req = index.openCursor(IDBKeyRange.upperBound(cutoff));

      let purgedCount = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          purgedCount++;
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        if (purgedCount > 0) console.log(`[POI Cache] Purged ${purgedCount} expired POI entries`);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });

    // 清理过期图片缓存
    // Purge expired image cache
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMG_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IMG_STORE_NAME);
      const index = store.index('timestamp');
      const req = index.openCursor(IDBKeyRange.upperBound(cutoff));

      let purgedCount = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          purgedCount++;
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        if (purgedCount > 0) console.log(`[IMG Cache] Purged ${purgedCount} expired image entries`);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[POI Cache] Purge failed:', e);
  }
}

/**
 * 清除全部缓存
 * Clear all cached POI results
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, IMG_STORE_NAME], 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.objectStore(IMG_STORE_NAME).clear();
      tx.oncomplete = () => {
        console.log('[POI Cache] All cache cleared');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[POI Cache] Clear all failed:', e);
  }
}

// ============================================================
// 图片 Blob 缓存（Pro 用户专用）
// Image Blob cache (Pro user exclusive)
// ============================================================

/**
 * 读取图片缓存
 * Get cached image blob by URL
 */
export async function getImageCache(url: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IMG_STORE_NAME, 'readonly');
      const req = tx.objectStore(IMG_STORE_NAME).get(url);
      req.onsuccess = () => {
        const entry = req.result as ImageCacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        const age = Date.now() - entry.timestamp;
        if (age > CONSTANTS.POI_CACHE_TTL) {
          resolve(null);
          return;
        }
        resolve(entry.blob);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 写入图片缓存
 * Store image blob in cache
 */
export async function setImageCache(url: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMG_STORE_NAME, 'readwrite');
      const entry: ImageCacheEntry = {
        url,
        blob,
        timestamp: Date.now(),
      };
      tx.objectStore(IMG_STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[IMG Cache] Write failed:', e);
  }
}

/**
 * Pro 用户后台预取 HD 原图（静默下载，不阻塞 UI）
 * Pro user background HD image prefetch (silent download, non-blocking)
 *
 * 工作流程 / Workflow:
 * 1. 过滤出有 imageUrlHD 的 spots
 * 2. 逐张检查 IndexedDB 缓存是否存在
 * 3. 缓存未命中 → fetch 下载为 Blob → 写入 IndexedDB
 * 4. 全部完成后 console.log 汇报统计
 *
 * @param spots - 当前 POI 列表
 * @param concurrency - 并发下载数（默认 3，避免拥塞）
 */
export async function prefetchHDImages(
  spots: Spot[],
  concurrency: number = 3
): Promise<void> {
  const targets = spots.filter(s => s.imageUrlHD).map(s => s.imageUrlHD!);
  if (targets.length === 0) return;

  let cached = 0;
  let downloaded = 0;
  let failed = 0;

  // 信号量控制并发
  // Semaphore-based concurrency control
  const downloadOne = async (url: string) => {
    try {
      // 检查缓存
      const existing = await getImageCache(url);
      if (existing) {
        cached++;
        return;
      }

      // 下载
      const resp = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (!resp.ok) {
        failed++;
        return;
      }
      const blob = await resp.blob();
      await setImageCache(url, blob);
      downloaded++;
    } catch {
      failed++;
    }
  };

  // 分批并发执行
  // Batch concurrent execution
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(batch.map(downloadOne));
  }

  if (downloaded > 0 || cached > 0) {
    console.log(
      `[HD Prefetch] ${downloaded} downloaded, ${cached} cached, ${failed} failed (total ${targets.length})`
    );
  }
}

/**
 * 获取 HD 图片 URL：优先使用缓存 blob URL，否则回退到网络 URL
 * Get HD image: prefer cached blob URL, fallback to network URL
 *
 * @returns blob:// URL（缓存命中）或原始 HTTP URL（缓存未命中）
 */
export async function getHDImageUrl(hdUrl: string): Promise<string> {
  if (!hdUrl) return '';
  try {
    const blob = await getImageCache(hdUrl);
    if (blob) {
      return URL.createObjectURL(blob);
    }
  } catch {
    // 缓存读取失败，回退到网络 URL
  }
  return hdUrl;
}
