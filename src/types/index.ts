// ============================================================================
// 文件: src/types/index.ts
// 基准版本: types/index.ts @ b0a1650 (46行)
// 修改内容 / Changes:
//   [新增] imageUrlThumb: 缩略图 URL（普通用户列表展示，~200px, ~15KB）
//   [新增] imageUrlHD: 原图 URL（Pro用户预取/详情页全屏查看，~800-1200px）
//   [NEW] imageUrlThumb: thumbnail URL for normal user list display
//   [NEW] imageUrlHD: HD original URL for Pro prefetch / detail fullscreen
// ============================================================================

export interface Spot {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl?: string;            // 当前使用的图片 URL（根据用户等级动态选择）
  imageUrlThumb?: string;       // 缩略图 URL（~200px, 普通用户列表用, ~15KB/张）
  imageUrlHD?: string;          // 原图 URL（Pro 预取/详情页全屏用, ~200KB/张）
  coordinates: { lat: number; lng: number };
  rating: number;
  tags: string[];
  checkedIn: boolean;
  photos?: string[];            // 本地缓存的打卡多图 Blob URLs
  checkInTimestamp?: string;    // 打卡拍摄的具体时间
  distance?: number;
  isAIGenerated?: boolean;      // 是否由 AI 兜底生成
  dataSource?: string;          // 数据溯源标识（如 "维基百科 + DeepSeek"）
}

export interface CityInfo {
  id: string;
  name: string;
  province: string;
  coordinates: { lat: number; lng: number };
  description: string;
  isUnlocked: boolean; // 是否已解锁/访问过
}

export interface RegionNode {
  name: string;
  adcode: string;
  level: 'country' | 'province' | 'city' | 'district' | 'street';
  center: { lat: number; lng: number };
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ItineraryData {
  destination?: string;
  arrivalPlan?: string;
  sources: GroundingSource[];
}

export type ViewState = 'china-map' | 'city-explorer' | 'plan' | 'profile';
