// ============================================================================
// 文件: src/services/checkinStore.ts
// 基准版本: 全新文件 (NEW)
// 修改内容 / Changes:
//   [新增] 基于 IndexedDB 的打卡记录持久化存储服务
//   [NEW] IndexedDB-based check-in record persistence service
//   支持保存照片 Base64、文字笔记、地点坐标等打卡数据
//   照片使用 Base64 存储在 IndexedDB 中（容量可达 250MB+）
// ============================================================================

const DB_NAME = 'greenstar_checkins';
const DB_VERSION = 1;
const STORE_NAME = 'checkins';

export interface CheckInRecord {
  id: string;
  spotId: string;
  spotName: string;
  cityName: string;
  category: string;
  coordinates: { lat: number; lng: number };
  photos: string[];       // Base64 编码的图片
  thumbnail?: string;     // 首张图的缩略图 Base64
  timestamp: string;      // ISO 时间戳
  note: string;           // 用户手写笔记
}

/**
 * 打开 IndexedDB 数据库连接
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('spotId', 'spotId', { unique: false });
        store.createIndex('cityName', 'cityName', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 将 File 对象转换为 Base64 字符串
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 生成缩略图（压缩到最大 200px 宽）
 */
export function generateThumbnail(base64: string, maxWidth = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(base64); // fallback
    img.src = base64;
  });
}

/**
 * 保存打卡记录
 */
export async function saveCheckin(record: CheckInRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取所有打卡记录（按时间倒序）
 */
export async function getAllCheckins(): Promise<CheckInRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const records = req.result as CheckInRecord[];
      records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 获取某个城市的打卡记录
 */
export async function getCheckinsByCity(cityName: string): Promise<CheckInRecord[]> {
  const all = await getAllCheckins();
  return all.filter(r => r.cityName === cityName);
}

/**
 * 获取某个地点的打卡记录
 */
export async function getCheckinsBySpot(spotId: string): Promise<CheckInRecord[]> {
  const all = await getAllCheckins();
  return all.filter(r => r.spotId === spotId);
}

/**
 * 删除一条打卡记录
 */
export async function deleteCheckin(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取打卡统计
 */
export async function getCheckinStats(): Promise<{
  totalCheckins: number;
  totalPhotos: number;
  citiesVisited: number;
  spotsVisited: number;
}> {
  const all = await getAllCheckins();
  const cities = new Set(all.map(r => r.cityName));
  const spots = new Set(all.map(r => r.spotId));
  const totalPhotos = all.reduce((sum, r) => sum + r.photos.length, 0);
  return {
    totalCheckins: all.length,
    totalPhotos,
    citiesVisited: cities.size,
    spotsVisited: spots.size,
  };
}
