// ============================================================================
// 文件: src/services/localVault.ts [NEW]
// 基准版本: 无（全新文件）
// 修改内容 / Changes:
//   [NEW] 统一本地仓库服务 — 基于 IndexedDB 的双 ObjectStore 架构
//   checkins: 打卡足迹记录（含图片 Base64）
//   saved_plans: 行程记忆库（AI 生成的攻略 Markdown 文本）
//   提供完整 CRUD（增删改查）+ 模糊搜索 + 统计 + 自动迁移 API
//   [NEW] Unified local vault service — dual ObjectStore on IndexedDB
//   checkins: check-in footprint records (with photo Base64)
//   saved_plans: saved AI itineraries (Markdown text)
//   Full CRUD + fuzzy search + stats + auto-migration from localStorage
// ============================================================================

// ── 数据库常量 ────────────────────────────────────────────────
const DB_NAME = 'greenstar_vault';
const DB_VERSION = 2; // 从 v1 (仅 checkins) 升级到 v2 (+ saved_plans)
const STORE_CHECKINS = 'checkins';
const STORE_PLANS = 'saved_plans';

// ── 数据类型定义 ──────────────────────────────────────────────

/** 打卡足迹记录 */
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

/** 行程记忆库记录 */
export interface SavedPlan {
  id: string;
  destination: string;
  content: string;        // AI 生成的 Markdown 攻略全文
  date: string;           // 创建日期（本地化字符串）
  updatedAt?: string;     // 最后编辑时间（ISO 字符串）
  tags?: string[];        // 用户自定义标签
}

// ── 数据库连接 ────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

/**
 * 打开（或创建/升级）IndexedDB 数据库连接
 * 支持从旧版 greenstar_checkins 数据库 + localStorage 自动迁移数据
 */
function openVault(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // v1 → 创建 checkins store
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_CHECKINS)) {
          const store = db.createObjectStore(STORE_CHECKINS, { keyPath: 'id' });
          store.createIndex('spotId', 'spotId', { unique: false });
          store.createIndex('cityName', 'cityName', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      }

      // v2 → 创建 saved_plans store
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_PLANS)) {
          const store = db.createObjectStore(STORE_PLANS, { keyPath: 'id' });
          store.createIndex('destination', 'destination', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      // 连接中断时清除缓存实例
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

// ── 通用事务辅助 ──────────────────────────────────────────────

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = callback(store);
    req.onsuccess = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function withStorePut<T>(
  storeName: string,
  record: T
): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ════════════════════════════════════════════════════════════════
// 一、打卡足迹 CRUD API
// ════════════════════════════════════════════════════════════════

/** 保存/更新一条打卡记录（upsert 语义） */
export async function saveCheckin(record: CheckInRecord): Promise<void> {
  return withStorePut(STORE_CHECKINS, record);
}

/** 获取所有打卡记录（按时间倒序） */
export async function getAllCheckins(): Promise<CheckInRecord[]> {
  const records = await withStore<CheckInRecord[]>(
    STORE_CHECKINS, 'readonly', (store) => store.getAll()
  );
  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return records;
}

/** 按城市名过滤打卡记录 */
export async function getCheckinsByCity(cityName: string): Promise<CheckInRecord[]> {
  const all = await getAllCheckins();
  return all.filter(r => r.cityName === cityName);
}

/** 按地点 ID 过滤打卡记录 */
export async function getCheckinsBySpot(spotId: string): Promise<CheckInRecord[]> {
  const all = await getAllCheckins();
  return all.filter(r => r.spotId === spotId);
}

/** 删除一条打卡记录 */
export async function deleteCheckin(id: string): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, 'readwrite');
    tx.objectStore(STORE_CHECKINS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 更新打卡记录的笔记内容 */
export async function updateCheckinNote(id: string, note: string): Promise<void> {
  const record = await withStore<CheckInRecord>(
    STORE_CHECKINS, 'readonly', (store) => store.get(id)
  );
  if (!record) throw new Error(`CheckIn record not found: ${id}`);
  record.note = note;
  return withStorePut(STORE_CHECKINS, record);
}

/** 获取打卡统计数据 */
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

// ════════════════════════════════════════════════════════════════
// 二、行程记忆库 CRUD API
// ════════════════════════════════════════════════════════════════

/** 保存一条新的行程攻略 */
export async function savePlan(plan: SavedPlan): Promise<void> {
  return withStorePut(STORE_PLANS, plan);
}

/** 获取所有行程攻略（按日期倒序） */
export async function getAllPlans(): Promise<SavedPlan[]> {
  const records = await withStore<SavedPlan[]>(
    STORE_PLANS, 'readonly', (store) => store.getAll()
  );
  // 按 updatedAt 或 date 倒序
  records.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.date).getTime() || 0;
    const tb = new Date(b.updatedAt || b.date).getTime() || 0;
    return tb - ta;
  });
  return records;
}

/** 获取单条行程攻略 */
export async function getPlan(id: string): Promise<SavedPlan | undefined> {
  return withStore<SavedPlan>(
    STORE_PLANS, 'readonly', (store) => store.get(id)
  );
}

/** 更新行程攻略内容（编辑功能） */
export async function updatePlan(id: string, updates: Partial<Omit<SavedPlan, 'id'>>): Promise<void> {
  const existing = await getPlan(id);
  if (!existing) throw new Error(`Plan not found: ${id}`);
  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  return withStorePut(STORE_PLANS, updated);
}

/** 删除一条行程攻略 */
export async function deletePlan(id: string): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLANS, 'readwrite');
    tx.objectStore(STORE_PLANS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 按目的地模糊搜索行程 */
export async function searchPlans(keyword: string): Promise<SavedPlan[]> {
  const all = await getAllPlans();
  const kw = keyword.toLowerCase();
  return all.filter(p =>
    p.destination.toLowerCase().includes(kw) ||
    p.content.toLowerCase().includes(kw) ||
    (p.tags || []).some(t => t.toLowerCase().includes(kw))
  );
}

/** 获取行程记忆库统计 */
export async function getPlanStats(): Promise<{
  totalPlans: number;
  destinations: string[];
}> {
  const all = await getAllPlans();
  const destinations = [...new Set(all.map(p => p.destination))];
  return { totalPlans: all.length, destinations };
}

// ════════════════════════════════════════════════════════════════
// 三、数据迁移：从旧存储方案自动导入
// ════════════════════════════════════════════════════════════════

const MIGRATION_FLAG = 'gs_vault_migrated_v2';

/**
 * 自动迁移：
 *   1. 从旧 IndexedDB (greenstar_checkins) 迁移打卡数据
 *   2. 从 localStorage (gs_saved_plans) 迁移行程数据
 * 迁移完成后设置标志位，仅执行一次
 */
export async function migrateFromLegacy(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  const db = await openVault();

  // 迁移旧 checkins 数据库
  try {
    const oldDbNames = await (indexedDB as any).databases?.();
    const hasOldDb = oldDbNames?.some?.((d: any) => d.name === 'greenstar_checkins');
    if (hasOldDb) {
      const oldReq = indexedDB.open('greenstar_checkins', 1);
      await new Promise<void>((resolve, reject) => {
        oldReq.onsuccess = async () => {
          const oldDb = oldReq.result;
          try {
            if (oldDb.objectStoreNames.contains('checkins')) {
              const tx = oldDb.transaction('checkins', 'readonly');
              const getAll = tx.objectStore('checkins').getAll();
              getAll.onsuccess = async () => {
                const records = getAll.result as CheckInRecord[];
                for (const r of records) {
                  await saveCheckin(r);
                }
                console.log(`[Vault Migration] 从旧数据库迁移了 ${records.length} 条打卡记录`);
                resolve();
              };
              getAll.onerror = () => resolve();
            } else {
              resolve();
            }
          } catch {
            resolve();
          } finally {
            oldDb.close();
          }
        };
        oldReq.onerror = () => resolve();
      });
    }
  } catch (e) {
    console.warn('[Vault Migration] 旧 checkins 数据库迁移跳过:', e);
  }

  // 迁移 localStorage 中的行程数据
  try {
    const raw = localStorage.getItem('gs_saved_plans');
    if (raw) {
      const plans: SavedPlan[] = JSON.parse(raw);
      for (const p of plans) {
        await savePlan(p);
      }
      console.log(`[Vault Migration] 从 localStorage 迁移了 ${plans.length} 条行程记录`);
    }
  } catch (e) {
    console.warn('[Vault Migration] localStorage 行程数据迁移跳过:', e);
  }

  localStorage.setItem(MIGRATION_FLAG, 'true');
  console.log('[Vault Migration] 数据迁移完成');
}

// ── 图片工具函数（从 checkinStore.ts 保留） ────────────────────

/** 将 File 对象转换为 Base64 字符串 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 生成缩略图（压缩到最大 200px 宽） */
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
