import { Spot } from '../types';
import { CONSTANTS } from '../config/constants';

// 声明全局变量 AMap
declare const AMap: any;

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

export const searchPOI = (city: string, keyword: string, center: { lat: number; lng: number }): Promise<Spot[]> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') {
      reject(new Error('高德地图 JS API 未加载成功'));
      return;
    }

    AMap.plugin(['AMap.PlaceSearch'], () => {
      try {
        const placeSearch = new AMap.PlaceSearch({
          city: city, // 城市名或 citycode
          citylimit: false, // 必须设为 false 才能支持海外（如新加坡、吉隆坡）的 POI 跨区域模糊检索
          type: CONSTANTS.POI_TYPE_STRING, // 严格使用中文分类名或数字编码，非模糊 keyword
          pageSize: 50,
          pageIndex: 1,
          extensions: 'all', // 必须设置为 all 才能返回 photos 图片等详细信息
        });

        // 如果传入了精准搜索词（非空），进行全城文本搜索；如果没传，根据当前地点周边半径检索
        const searchFn = keyword 
          ? (cb: any) => placeSearch.search(keyword, cb)
          : (cb: any) => placeSearch.searchNearBy('', [center.lng, center.lat], 5000, cb); // 半径设置为 5km，防止越界

        searchFn((status: string, result: any) => {
          if (status === 'complete' && result.info === 'OK' && result.poiList) {
            const pois = result.poiList.pois || [];
            const spots: Spot[] = pois.map((poi: any) => {
              // 模拟评分和分类映射
              const ratingStr = poi.biz_ext?.rating || (4 + Math.random()).toFixed(1);
              const rating = parseFloat(ratingStr) > 5 ? 5 : parseFloat(ratingStr);
              
              let category = 'Landmark';
              if (poi.type) {
                if (poi.type.includes('酒店') || poi.type.includes('宾馆') || poi.type.includes('民宿') || poi.type.includes('住宿')) category = 'Hotel';
                else if (poi.type.includes('餐厅') || poi.type.includes('美食')) category = 'Restaurant';
                else if (poi.type.includes('咖啡')) category = 'Cafe';
                else if (poi.type.includes('公园')) category = 'Park';
                else if (poi.type.includes('博物馆')) category = 'Museum';
                else if (poi.type.includes('购物') || poi.type.includes('商场') || poi.type.includes('步行街')) category = 'Shopping';
                else if (poi.type.includes('风景') || poi.type.includes('名胜')) category = 'Scenic';
              }

              // 提取首个图片
              const imageUrl = poi.photos && poi.photos.length > 0 ? poi.photos[0].url : '';

              return {
                id: poi.id,
                name: poi.name,
                description: poi.address || poi.type || '热门地点',
                category: category,
                imageUrl: imageUrl, // 使用高德 POI 图片，不再依赖 AI 画图
                coordinates: {
                  lat: poi.location.lat,
                  lng: poi.location.lng
                },
                rating: rating,
                tags: poi.type ? poi.type.split(';').slice(0, 2).map((t: string) => t.split('|').pop() || t) : [],
                checkedIn: false,
                distance: calculateDistance(center.lat, center.lng, poi.location.lat, poi.location.lng)
              };
            });
            resolve(spots);
          } else if (status === 'no_data') {
            resolve([]);
          } else {
            console.error('AMap PlaceSearch failed:', status, result);
            reject(new Error('获取地点数据失败'));
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const reverseGeocode = (lat: number, lng: number): Promise<{ address: string; city: string }> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') {
      reject(new Error('高德地图 JS API 未加载成功'));
      return;
    }
    AMap.plugin(['AMap.Geocoder'], () => {
      try {
        const geocoder = new AMap.Geocoder();
        geocoder.getAddress([lng, lat], (status: string, result: any) => {
          if (status === 'complete' && result?.regeocode) {
            const regeo = result.regeocode;
            // 获取城市名：由于直辖市没有 city 字段，取 province 字段
            const city = regeo.addressComponent.city || regeo.addressComponent.province;
            resolve({
              address: regeo.formattedAddress || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              city: city
            });
          } else {
            reject(new Error('逆地理编码失败'));
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const geocode = (address: string): Promise<{ lat: number, lng: number, formattedAddress: string, city: string }> => {
  return new Promise((resolve, reject) => {
     if (typeof AMap === 'undefined') {
        reject(new Error('高德地图 JS API 未加载成功'));
        return;
      }
      AMap.plugin(['AMap.Geocoder'], () => {
        try {
          const geocoder = new AMap.Geocoder();
          geocoder.getLocation(address, (status: string, result: any) => {
            if (status === 'complete' && result.geocodes.length) {
              const first = result.geocodes[0];
              // 支持提取海外国家名作为 fallback，避免海外城市全是空字符串导致名称折叠
              const city = first.addressComponent?.city || first.addressComponent?.province || first.addressComponent?.country || '';
              resolve({
                 lat: first.location.lat,
                 lng: first.location.lng,
                 formattedAddress: first.formattedAddress,
                 city: city
              });
            } else {
              reject(new Error('找不到该地址'));
            }
          });
        } catch (err) {
          reject(err);
        }
      });
  });
};

export const getSubDistricts = (keyword: string, level: string = 'city'): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    if (typeof AMap === 'undefined') {
      reject(new Error('高德地图 JS API 未加载成功'));
      return;
    }
    AMap.plugin('AMap.DistrictSearch', () => {
      try {
        const districtSearch = new AMap.DistrictSearch({
          level: level,
          subdistrict: 1, // 只取下一级
          showbiz: false
        });
        districtSearch.search(keyword, (status: string, result: any) => {
          if (status === 'complete' && result.districtList && result.districtList.length > 0) {
            resolve(result.districtList[0].districtList || []);
          } else {
            resolve([]);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};
