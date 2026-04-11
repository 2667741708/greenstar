// ============================================================================
// 文件: src/services/poiCache.ts
// 基准版本: 新建文件（无基线版本）
// 修改内容 / Changes:
//   [新建] 基于 IndexedDB 的 POI 搜索结果缓存层
//   [NEW] IndexedDB-based POI search result caching service
//   缓存键 = city|keyword|type|radius|page
//   TTL = 24 小时（CONSTANTS.POI_CACHE_TTL）
//   与 checkinStore.ts 同构设计，独立 DB 避免 schema 冲突
// ============================================================================

import { Spot } from '../types';
import { CONSTANTS } from '../config/constants';

const DB_NAME = 'greenstar_poi_cache';
const DB_VERSION = 1;
const STORE_NAME = 'poi_results';

interface CacheEntry {
  key: string;            // 缓存键
  spots: Spot[];          // POI 搜索结果
  timestamp: number;      // 写入时间戳（ms since epoch）
  cityName: string;       // 城市名（用于按城市批量清理）
}

/**
 * 打开 IndexedDB 缓存数据库
 * Open the IndexedDB cache database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('cityName', 'cityName', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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
          // 已过期 — 返回 null，后续由调用方清理
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

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      // 查找所有 timestamp < cutoff 的条目
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
        if (purgedCount > 0) {
          console.log(`[POI Cache] Purged ${purgedCount} expired entries`);
        }
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
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
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
