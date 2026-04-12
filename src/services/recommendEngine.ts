// ============================================================================
// 文件: src/services/recommendEngine.ts
// 基准版本: 新建文件 (无基线)
// 修改内容 / Changes:
//   [新建] 推荐引擎: 多维度评分 + 距离分段 + 场景推断
//   [NEW] Recommendation engine: multi-dimensional scoring + distance segmentation + scene inference
//
// 职责:
//   1. inferScene()  — 从 name + type 推断人类可读的风格标签
//   2. computeScore() — 多维度加权评分 (评分/照片/人均/营业时间/距离)
//   3. segmentByDistance() — 按距离阈值分段
//   4. rankAndSegment() — 对外主 API: 排序 + 分段 + 场景推断 + 质量过滤
// ============================================================================

import { Spot } from '../types';
import { CONSTANTS } from '../config/constants';

// ============================================================
// 场景推断: 从 name + tags + description 推断场景风格
// Scene inference from name + tags + description
// ============================================================
export function inferScene(spot: Spot): string {
  const searchStr = `${spot.name} ${(spot.tags || []).join(' ')} ${spot.description || ''}`;

  for (const rule of CONSTANTS.SCENE_RULES) {
    if (rule.keywords.some(kw => searchStr.includes(kw))) {
      return rule.scene;
    }
  }

  // fallback: 使用 category
  const categoryMap: Record<string, string> = {
    'Hotel': '酒店', 'Restaurant': '餐厅', 'Cafe': '咖啡馆',
    'Park': '公园', 'Museum': '博物馆', 'Shopping': '购物',
    'Scenic': '景区', 'Landmark': '地标',
  };
  return categoryMap[spot.category] || '其他';
}

// ============================================================
// 多维度加权评分
// Multi-dimensional weighted scoring
// ============================================================
export function computeScore(spot: Spot): number {
  const W = CONSTANTS.SORT_WEIGHTS;

  const rating = typeof spot.rating === 'number' ? spot.rating : parseFloat(String(spot.rating)) || 0;
  const hasPhoto = (spot.photos && spot.photos.length > 0) || spot.imageUrl ? 1 : 0;
  const hasCost = spot.cost ? 1 : 0;
  const hasOpenTime = spot.openTime ? 1 : 0;
  const distance = spot.distance || 0;

  return (
    rating * W.W_RATING +
    hasPhoto * W.W_PHOTO +
    hasCost * W.W_COST +
    hasOpenTime * W.W_OPEN_TIME +
    distance * W.W_DISTANCE
  );
}

// ============================================================
// 距离分段
// Distance segmentation
// ============================================================
export interface DistanceGroup {
  key: string;
  label: string;
  spots: RankedSpot[];
}

export interface RankedSpot extends Spot {
  score: number;       // 多维度加权得分
  scene: string;       // 推断的场景风格
  distanceKm: number;  // 距离 (km)
  segment: string;     // 所属分段 key
}

export function segmentByDistance(spots: RankedSpot[]): DistanceGroup[] {
  const segments = CONSTANTS.DISTANCE_SEGMENTS;
  const groups: DistanceGroup[] = segments.map(s => ({
    key: s.key,
    label: s.label,
    spots: [],
  }));

  for (const spot of spots) {
    const dist = spot.distance || 0;
    for (let i = 0; i < segments.length; i++) {
      if (dist <= segments[i].maxMeters) {
        spot.segment = segments[i].key;
        groups[i].spots.push(spot);
        break;
      }
    }
  }

  return groups.filter(g => g.spots.length > 0);
}

// ============================================================
// 对外主 API: 排序 + 分段 + 场景推断 + 质量过滤
// Main API: rank + segment + scene inference + quality filter
//
// @param spots       原始 Spot 数组
// @param qualityOnly 是否只返回评分 >= MIN_QUALITY_RATING 的精选推荐
// @returns           按距离分段的推荐结果, 每段内部按 score 降序
// ============================================================
export function rankAndSegment(
  spots: Spot[],
  qualityOnly: boolean = false
): { groups: DistanceGroup[]; allRanked: RankedSpot[]; stats: RecommendStats } {

  // Step 1: 计算评分 + 推断场景
  let ranked: RankedSpot[] = spots.map(s => ({
    ...s,
    score: computeScore(s),
    scene: inferScene(s),
    distanceKm: (s.distance || 0) / 1000,
    segment: '',
  }));

  // Step 2: 质量门槛过滤
  if (qualityOnly) {
    const minRating = CONSTANTS.SORT_WEIGHTS.MIN_QUALITY_RATING;
    ranked = ranked.filter(s => {
      const r = typeof s.rating === 'number' ? s.rating : parseFloat(String(s.rating)) || 0;
      return r >= minRating;
    });
  }

  // Step 3: 按 score 降序排序
  ranked.sort((a, b) => b.score - a.score);

  // Step 3.5: Top-K 截断 — 防止推荐数过多导致准确率稀释
  // 修改基准: recommendEngine.ts @ 当前版本 (206行)
  // 修改内容: 新增 Top-K 截断, 使用 CONSTANTS.RECOMMEND_TOP_K
  // Changes: Added Top-K truncation using CONSTANTS.RECOMMEND_TOP_K
  const topK = CONSTANTS.RECOMMEND_TOP_K || 40;
  const beforeTopK = ranked.length;
  ranked = ranked.slice(0, topK);

  // Step 4: 距离分段
  const groups = segmentByDistance(ranked);

  // Step 5: 每个段内部按 score 降序 (已排序, 但分段后需重排)
  for (const g of groups) {
    g.spots.sort((a, b) => b.score - a.score);
  }

  // 统计
  const stats: RecommendStats = {
    totalInput: spots.length,
    totalOutput: ranked.length,
    qualityFiltered: spots.length - ranked.length,
    segmentCounts: Object.fromEntries(groups.map(g => [g.key, g.spots.length])),
    sceneCounts: countScenes(ranked),
  };

  return { groups, allRanked: ranked, stats };
}

// ============================================================
// 统计函数
// ============================================================
export interface RecommendStats {
  totalInput: number;
  totalOutput: number;
  qualityFiltered: number;
  segmentCounts: Record<string, number>;
  sceneCounts: Record<string, number>;
}

function countScenes(spots: RankedSpot[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of spots) {
    counts[s.scene] = (counts[s.scene] || 0) + 1;
  }
  return counts;
}

// ============================================================
// 工具函数: 格式化输出 (用于 CLI 测试)
// Utility: formatted output for CLI testing
// ============================================================
export function formatRecommendation(result: ReturnType<typeof rankAndSegment>): string {
  const lines: string[] = [];
  const { groups, stats } = result;

  lines.push(`推荐引擎统计: 输入 ${stats.totalInput} → 质量过滤掉 ${stats.qualityFiltered} → 输出 ${stats.totalOutput}`);
  lines.push(`场景分布: ${Object.entries(stats.sceneCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  lines.push('');

  let globalIdx = 0;
  for (const group of groups) {
    lines.push(`${'='.repeat(60)}`);
    lines.push(`  ${group.label} (${group.spots.length} 家)`);
    lines.push(`${'='.repeat(60)}`);

    for (const s of group.spots) {
      globalIdx++;
      const costStr = s.cost ? `${s.cost}元` : '未知';
      lines.push(`  ${globalIdx}. ${s.name}`);
      lines.push(`     ${s.distanceKm.toFixed(1)}km | 评分:${s.rating} | 人均:${costStr} | 风格:${s.scene}`);
      if (s.openTime) lines.push(`     营业:${s.openTime}`);
      if (s.description) lines.push(`     地址:${s.description}`);
      lines.push(`     [score=${s.score.toFixed(1)}]`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
