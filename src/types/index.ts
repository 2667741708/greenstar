export interface Spot {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl?: string;
  coordinates: { lat: number; lng: number };
  rating: number;
  tags: string[];
  checkedIn: boolean;
  distance?: number;
  isAIGenerated?: boolean;    // 是否由 AI 兜底生成
  dataSource?: string;        // 数据溯源标识（如 "维基百科 + DeepSeek"）
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
