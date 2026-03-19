// ============================================================================
// 文件: src/services/routeOptimizer.ts
// 基准版本: 全新文件 (NEW)
// 修改内容 / Changes:
//   [新增] 基于贪心最近邻 + 2-opt局部优化的TSP路径优化器
//   [NEW] Greedy nearest-neighbor TSP with 2-opt local improvement
//   用于替代 RouteVisualizer 中按文本顺序连线的逻辑，
//   使路线沿地理最短路径排列，避免来回折返绕大圈
// ============================================================================

interface GeoPoint {
  name: string;
  lng: number;
  lat: number;
}

/**
 * Haversine 球面距离（单位：米）
 * Calculates the great-circle distance between two geographic points
 */
function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000; // 地球半径（米）
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 构建 N×N 距离矩阵
 * Build a symmetric distance matrix for all stops
 */
function buildDistanceMatrix(stops: GeoPoint[]): number[][] {
  const n = stops.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineDistance(stops[i], stops[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

/**
 * 计算路径总距离
 * Calculate total distance of a given order
 */
function totalDistance(order: number[], matrix: number[][]): number {
  let sum = 0;
  for (let i = 0; i < order.length - 1; i++) {
    sum += matrix[order[i]][order[i + 1]];
  }
  return sum;
}

/**
 * 贪心最近邻 TSP
 * Greedy nearest-neighbor heuristic for TSP
 * 
 * @param matrix 距离矩阵
 * @param startIdx 强制起点索引（可选）
 * @param endIdx 强制终点索引（可选）
 */
function nearestNeighborTSP(
  matrix: number[][],
  startIdx: number = 0,
  endIdx?: number
): number[] {
  const n = matrix.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);

  const visited = new Set<number>();
  const path: number[] = [];

  // 从起点出发
  let current = startIdx;
  visited.add(current);
  path.push(current);

  while (visited.size < n) {
    // 如果剩最后一个且指定了终点，则跳到终点
    if (endIdx !== undefined && visited.size === n - 1 && !visited.has(endIdx)) {
      visited.add(endIdx);
      path.push(endIdx);
      break;
    }

    let nearest = -1;
    let nearestDist = Infinity;

    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      // 如果指定了终点且不是最后一步，暂时跳过终点
      if (endIdx !== undefined && j === endIdx && visited.size < n - 1) continue;

      if (matrix[current][j] < nearestDist) {
        nearestDist = matrix[current][j];
        nearest = j;
      }
    }

    if (nearest === -1) break; // fallback
    visited.add(nearest);
    path.push(nearest);
    current = nearest;
  }

  return path;
}

/**
 * 2-opt 局部优化
 * 反转子路径段来消除交叉，降低总距离
 * 2-opt local search: reverse sub-segments to eliminate crossings
 * 
 * @param order 当前路径顺序
 * @param matrix 距离矩阵
 * @param fixStart 是否固定起点
 * @param fixEnd 是否固定终点
 */
function twoOptImprove(
  order: number[],
  matrix: number[][],
  fixStart: boolean = false,
  fixEnd: boolean = false
): number[] {
  const n = order.length;
  if (n <= 3) return order;

  let improved = true;
  let best = [...order];
  let bestDist = totalDistance(best, matrix);

  while (improved) {
    improved = false;
    const iStart = fixStart ? 1 : 0;
    const iEnd = fixEnd ? n - 1 : n;

    for (let i = iStart; i < iEnd - 1; i++) {
      for (let j = i + 1; j < iEnd; j++) {
        // 反转 [i, j] 段
        const newOrder = [...best];
        let left = i;
        let right = j;
        while (left < right) {
          [newOrder[left], newOrder[right]] = [newOrder[right], newOrder[left]];
          left++;
          right--;
        }

        const newDist = totalDistance(newOrder, matrix);
        if (newDist < bestDist - 0.01) {
          best = newOrder;
          bestDist = newDist;
          improved = true;
        }
      }
    }
  }

  return best;
}

/**
 * 对外 API：路线优化
 * Public API: Optimize the order of stops for shortest path
 * 
 * @param stops 原始站点数组（带经纬度）
 * @param startName 可选的强制起点名称
 * @param endName 可选的强制终点名称
 * @returns 重排后的站点数组
 */
export function optimizeRoute(
  stops: GeoPoint[],
  startName?: string,
  endName?: string
): GeoPoint[] {
  if (stops.length <= 2) return stops;

  const matrix = buildDistanceMatrix(stops);

  // 确定起终点索引
  let startIdx = 0;
  let endIdx: number | undefined;

  if (startName) {
    const idx = stops.findIndex(s => s.name === startName);
    if (idx >= 0) startIdx = idx;
  }

  if (endName) {
    const idx = stops.findIndex(s => s.name === endName);
    if (idx >= 0) endIdx = idx;
  }

  // Step 1: 贪心最近邻
  let order = nearestNeighborTSP(matrix, startIdx, endIdx);

  // Step 2: 2-opt 局部优化
  order = twoOptImprove(
    order,
    matrix,
    startName !== undefined,
    endName !== undefined
  );

  // 按优化后的顺序重排 stops
  return order.map(i => stops[i]);
}

/**
 * 对外 API：计算优化后的路线总距离（km）
 */
export function getOptimizedRouteDistance(stops: GeoPoint[]): number {
  if (stops.length <= 1) return 0;
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineDistance(stops[i], stops[i + 1]);
  }
  return total / 1000; // 转为 km
}
