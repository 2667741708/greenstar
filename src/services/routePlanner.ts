// ============================================================================
// 文件: src/services/routePlanner.ts
// 基准版本: 新建文件（无基线版本）
// 修改内容 / Changes:
//   [新建] 高德 AMap.Driving/Walking 路线规划服务
//   [NEW] AMap Driving/Walking route planning service
// ============================================================================

declare const AMap: any;

export interface RouteStop {
  name: string;
  position: [number, number]; // [lng, lat]
  description?: string;
}

export interface RouteResult {
  distance: number;   // 总距离（米）
  duration: number;   // 总时间（秒）
  path: [number, number][];  // polyline 坐标序列 [[lng, lat], ...]
  stops: RouteStop[];
}

/**
 * 通过高德地理编码将地点名称转为坐标
 * Geocode a place name to coordinates using AMap Geocoder
 */
export const geocodePlace = (name: string, city?: string): Promise<[number, number] | null> => {
  return new Promise((resolve) => {
    if (typeof AMap === 'undefined') { resolve(null); return; }
    AMap.plugin('AMap.Geocoder', () => {
      const geocoder = new AMap.Geocoder({ city: city || '' });
      geocoder.getLocation(name, (status: string, result: any) => {
        if (status === 'complete' && result.geocodes?.length > 0) {
          const loc = result.geocodes[0].location;
          resolve([loc.lng, loc.lat]);
        } else {
          resolve(null);
        }
      });
    });
  });
};

/**
 * 多站点驾车路线规划
 * Multi-stop driving route planning
 * 
 * @param stops 经过验证的路线站点（已含坐标）
 * @returns 路线结果（含 polyline 和汇总数据）
 */
export const planDrivingRoute = (stops: RouteStop[]): Promise<RouteResult> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') { reject(new Error('AMap 未加载')); return; }
    if (stops.length < 2) { reject(new Error('至少需要2个站点')); return; }

    AMap.plugin('AMap.Driving', () => {
      const driving = new AMap.Driving({
        policy: 0, // 最快捷模式
        ferry: 0,
      });

      const origin = new AMap.LngLat(stops[0].position[0], stops[0].position[1]);
      const destination = new AMap.LngLat(
        stops[stops.length - 1].position[0], 
        stops[stops.length - 1].position[1]
      );

      // 中间途经点
      const waypoints = stops.slice(1, -1).map(s => new AMap.LngLat(s.position[0], s.position[1]));

      driving.search(origin, destination, { waypoints }, (status: string, result: any) => {
        if (status === 'complete' && result.routes?.length > 0) {
          const route = result.routes[0];
          // 提取全路径 polyline
          const path: [number, number][] = [];
          for (const step of route.steps || []) {
            if (step.path) {
              for (const p of step.path) {
                path.push([p.lng, p.lat]);
              }
            }
          }
          resolve({
            distance: route.distance || 0,
            duration: route.time || 0,
            path,
            stops,
          });
        } else {
          reject(new Error('路线规划失败'));
        }
      });
    });
  });
};

/**
 * 步行路线规划（两点之间）
 * Walking route between two points
 */
export const planWalkingRoute = (
  origin: [number, number], 
  destination: [number, number]
): Promise<{ distance: number; duration: number; path: [number, number][] }> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') { reject(new Error('AMap 未加载')); return; }

    AMap.plugin('AMap.Walking', () => {
      const walking = new AMap.Walking();
      walking.search(
        new AMap.LngLat(origin[0], origin[1]),
        new AMap.LngLat(destination[0], destination[1]),
        (status: string, result: any) => {
          if (status === 'complete' && result.routes?.length > 0) {
            const route = result.routes[0];
            const path: [number, number][] = [];
            for (const step of route.steps || []) {
              if (step.path) {
                for (const p of step.path) {
                  path.push([p.lng, p.lat]);
                }
              }
            }
            resolve({
              distance: route.distance || 0,
              duration: route.time || 0,
              path,
            });
          } else {
            reject(new Error('步行路线规划失败'));
          }
        }
      );
    });
  });
};

/**
 * 从 AI 攻略文本中提取关键地标名称
 * 使用简单的正则匹配，无需额外 API 调用
 */
export const extractStopsFromPlan = (planText: string, cityName: string): string[] => {
  const stops: string[] = [];
  
  // 匹配中文地标名称模式（常见于攻略文本）
  // 如：**豫园**、「南京路」、【外滩】、"城隍庙"
  const patterns = [
    /\*\*([^*]{2,15})\*\*/g,           // **地名**
    /「([^」]{2,15})」/g,              // 「地名」
    /【([^】]{2,15})】/g,              // 【地名】
    /→\s*([^\s→,，。]{2,12})/g,       // → 地名
    /前往\s*([^\s,，。（(]{2,12})/g,    // 前往 地名
  ];

  const seen = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(planText)) !== null) {
      // 清洗残留的嵌套括号标记（如 **【地名】** 中 match[1] 会捕获到 【地名】）
      // Strip residual bracket markers from nested formatting like **【name】**
      const name = match[1].trim().replace(/[【】「」『』《》\[\]]/g, '').trim();
      // 过滤掉明显不是地名的内容
      if (name.length >= 2 && name.length <= 15 && 
          !name.includes('建议') && !name.includes('提示') && 
          !name.includes('注意') && !name.includes('推荐') &&
          !name.includes('公里') && !name.includes('小时') &&
          !seen.has(name)) {
        seen.add(name);
        stops.push(name);
      }
    }
  }

  return stops.slice(0, 10); // 最多返回10个关键站点
};
