import { CityInfo } from '../types';

export const CHINA_CITIES: CityInfo[] = [
  // 直辖市
  { id: 'beijing', name: '北京', province: '北京', coordinates: { lat: 39.9042, lng: 116.4074 }, description: '三千年历史底蕴的帝都', isUnlocked: true },
  { id: 'shanghai', name: '上海', province: '上海', coordinates: { lat: 31.2304, lng: 121.4737 }, description: '摩登与近代交织的魔都', isUnlocked: false },
  { id: 'tianjin', name: '天津', province: '天津', coordinates: { lat: 39.0842, lng: 117.2009 }, description: '曲苑杂坛与西洋建筑', isUnlocked: false },
  { id: 'chongqing', name: '重庆', province: '重庆', coordinates: { lat: 29.5332, lng: 106.5050 }, description: '赛博朋克风格的3D魔幻城市', isUnlocked: false },

  // 省会及主要城市
  { id: 'guangzhou', name: '广州', province: '广东', coordinates: { lat: 23.1291, lng: 113.2644 }, description: '食在广州，千年商都', isUnlocked: false },
  { id: 'shenzhen', name: '深圳', province: '广东', coordinates: { lat: 22.5429, lng: 114.0596 }, description: '科技与创新的鹏城', isUnlocked: false },
  { id: 'hangzhou', name: '杭州', province: '浙江', coordinates: { lat: 30.2741, lng: 120.1551 }, description: '人间天堂，西湖美景', isUnlocked: false },
  { id: 'nanjing', name: '南京', province: '江苏', coordinates: { lat: 32.0603, lng: 118.7969 }, description: '六朝古都，十代都会', isUnlocked: false },
  { id: 'chengdu', name: '成都', province: '四川', coordinates: { lat: 30.5723, lng: 104.0665 }, description: '天府之国，慢生活之都', isUnlocked: false },
  { id: 'wuhan', name: '武汉', province: '湖北', coordinates: { lat: 30.5928, lng: 114.3055 }, description: '九省通衢，百湖之市', isUnlocked: false },
  { id: 'xian', name: '西安', province: '陕西', coordinates: { lat: 34.3416, lng: 108.9398 }, description: '十三朝古都，丝路起点', isUnlocked: false },
  { id: 'changsha', name: '长沙', province: '湖南', coordinates: { lat: 28.2282, lng: 112.9388 }, description: '星城，网红美食之都', isUnlocked: false },
  { id: 'qingdao', name: '青岛', province: '山东', coordinates: { lat: 36.0671, lng: 120.3826 }, description: '红瓦绿树，碧海蓝天', isUnlocked: false },
  { id: 'xiamen', name: '厦门', province: '福建', coordinates: { lat: 24.4795, lng: 118.0894 }, description: '海上花园，鹭岛风情', isUnlocked: false },
  { id: 'kunming', name: '昆明', province: '云南', coordinates: { lat: 25.0406, lng: 102.7123 }, description: '春城，鲜花四季开', isUnlocked: false },
  { id: 'guiyang', name: '贵阳', province: '贵州', coordinates: { lat: 26.6470, lng: 106.7135 }, description: '林城，避暑之都', isUnlocked: false },
  { id: 'nanning', name: '南宁', province: '广西', coordinates: { lat: 22.8170, lng: 108.3661 }, description: '绿城，半城绿树半城楼', isUnlocked: false },
  { id: 'haikou', name: '海口', province: '海南', coordinates: { lat: 20.0174, lng: 110.3492 }, description: '椰城，热带海滨风光', isUnlocked: false },
  { id: 'zhengzhou', name: '郑州', province: '河南', coordinates: { lat: 34.7466, lng: 113.6253 }, description: '天地之中，华夏文明发源地', isUnlocked: false },
  { id: 'hefei', name: '合肥', province: '安徽', coordinates: { lat: 31.8206, lng: 117.2272 }, description: '大湖名城，创新高地', isUnlocked: false },
  { id: 'nanchang', name: '南昌', province: '江西', coordinates: { lat: 28.6820, lng: 115.8579 }, description: '英雄城，八一军旗升起的地方', isUnlocked: false },
  { id: 'fuzhou', name: '福州', province: '福建', coordinates: { lat: 26.0745, lng: 119.2965 }, description: '有福之州，榕城', isUnlocked: false },
  { id: 'jinan', name: '济南', province: '山东', coordinates: { lat: 36.6512, lng: 117.1201 }, description: '泉城，四面荷花三面柳', isUnlocked: false },
  { id: 'taiyuan', name: '太原', province: '山西', coordinates: { lat: 37.8706, lng: 112.5489 }, description: '龙城，汾河之畔', isUnlocked: false },
  { id: 'shijiazhuang', name: '石家庄', province: '河北', coordinates: { lat: 38.0411, lng: 114.5149 }, description: '火车拉来的城市', isUnlocked: false },
  { id: 'huhehaote', name: '呼和浩特', province: '内蒙古', coordinates: { lat: 40.8415, lng: 111.7656 }, description: '青城，草原上的明珠', isUnlocked: false },
  { id: 'shenyang', name: '沈阳', province: '辽宁', coordinates: { lat: 41.8057, lng: 123.4315 }, description: '一朝发祥地，两代帝王都', isUnlocked: false },
  { id: 'changchun', name: '长春', province: '吉林', coordinates: { lat: 43.8171, lng: 125.3235 }, description: '北国春城，电影之都', isUnlocked: false },
  { id: 'haerbin', name: '哈尔滨', province: '黑龙江', coordinates: { lat: 45.8038, lng: 126.5360 }, description: '冰城，东方小巴黎', isUnlocked: false },
  { id: 'lanzhou', name: '兰州', province: '甘肃', coordinates: { lat: 36.0611, lng: 103.8343 }, description: '黄河之都，丝路重镇', isUnlocked: false },
  { id: 'xining', name: '西宁', province: '青海', coordinates: { lat: 36.6171, lng: 101.7782 }, description: '夏都，青藏高原东方门户', isUnlocked: false },
  { id: 'yinchuan', name: '银川', province: '宁夏', coordinates: { lat: 38.4872, lng: 106.2588 }, description: '塞上江南，鱼米之乡', isUnlocked: false },
  { id: 'wulumuqi', name: '乌鲁木齐', province: '新疆', coordinates: { lat: 43.8256, lng: 87.6168 }, description: '亚心之都，大美新疆', isUnlocked: false },
  { id: 'lasa', name: '拉萨', province: '西藏', coordinates: { lat: 29.6524, lng: 91.1180 }, description: '日光城，雪域圣地', isUnlocked: false }
];
