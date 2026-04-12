#!/usr/bin/env python3
# ============================================================================
# 文件: tests/test_cat_cafe_search.py
# 基准版本: 新建文件 (无基线)
# 修改内容 / Changes:
#   [新建] 模拟 Greenstar 探索板块搜索"猫咖"的完整管线测试
#   [NEW] Simulate Greenstar explore module "猫咖" search pipeline test
#
# 测试流程:
#   1. 高德 IP 定位 → 获取当前城市和坐标
#   2. 高德 POI 周边搜索 → 模拟标签搜索 "猫咖"
#   3. 三层过滤 → Layer 1 (正面分类) + Layer 2 (负面排除+白名单) 
#   4. 输出可玩猫咖清单
# ============================================================================

import requests
import json
import sys
from datetime import datetime

# === 配置 ===
AMAP_KEY = "0e59aae0d84f39b4665eba7acc9f49a9"

# 三层过滤体系 (与 src/config/constants.ts 保持同步)
POI_TYPE_EXCLUDE = [
    '公厕', '垃圾', '变电站', '污水', '殡葬',
    '戒毒', '监狱', '看守所', '劳教',
    '加油站', '充电站', '停车场', '检票口',
    '公共厕所', '环卫', '市政设施',
    '公司', '集团', '企业', '工厂', '厂区',
    '办事处', '管理委员会', '派出所', '物业',
    '超市', '菜市场', '农贸市场', '食堂', '快餐',
    '便民', '外卖', '小卖部', '批发', '五金', '建材', '便利店',
    '药店', '诊所', '医院', '培训', '学校', '幼儿园', '驾校',
    '修理', '洗车', '中介', '地产', '快递', '网吧'
]

POI_TYPE_STRICT_INCLUDE = [
    '景区', '公园', '旅游', '名胜', '风景', '故居', '遗址', '古镇', '古城', '古村',
    '寺庙', '寺', '庙', '塔', '桥', '湖', '山', '岛', '海滩', '瀑布', '温泉',
    '美术馆', '博物馆', '展览馆', '艺术中心', '画廊', '剧院', '大剧院', '音乐厅',
    '咖啡', '甜品', '茶馆', '酒馆', '精酿', '清吧', 'LiveHouse', '奶茶',
    '密室', '剧本杀', '游乐园', '度假村', '游乐', '体验馆', '滑雪', '电竞', '蹦床', '攀岩',
    '酒店', '民宿', '客栈', '度假', '旅馆', '青旅',
    '书店', '文创园', '广场', '老街', '买手店', '步行街', '夜市', '商场', '商圈', '集市',
    '餐厅', '饭店', '美食', '小吃', '火锅', '烧烤', '烤肉', '海鲜', '面馆', '串串',
    '酒吧', '酒楼', '食堂', '私房菜', '日料', '西餐', '烘焙',
]

# 猫咖对应高德分类编码 (来自 POI_TAG_TYPE_MAP)
CAT_CAFE_TYPE_CODE = "050500"

SEARCH_RADIUS = {
    'nearby': 3000,
    'city': 30000,
    'district': 10000,
    'street': 1500,
}

def separator(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def step_print(step, msg):
    print(f"  [{step}] {msg}")

# ============================================================
# Step 1: 高德 IP 定位
# ============================================================
def get_ip_location():
    separator("Step 1: 高德 IP 定位 (AMap IP Geolocation)")
    url = f"https://restapi.amap.com/v3/ip?key={AMAP_KEY}"
    resp = requests.get(url, timeout=10)
    data = resp.json()
    
    if data.get("status") != "1":
        print(f"  [ERROR] IP定位失败: {data.get('info')}")
        sys.exit(1)
    
    city = data.get("city", "未知")
    province = data.get("province", "未知")
    adcode = data.get("adcode", "")
    rect = data.get("rectangle", "")
    
    # 从 rectangle 提取中心坐标
    # format: "lng1,lat1;lng2,lat2"
    if rect:
        parts = rect.split(";")
        coords1 = parts[0].split(",")
        coords2 = parts[1].split(",")
        center_lng = (float(coords1[0]) + float(coords2[0])) / 2
        center_lat = (float(coords1[1]) + float(coords2[1])) / 2
    else:
        center_lng, center_lat = 119.60, 39.94  # 秦皇岛默认
    
    step_print("IP", f"出口 IP 识别位置: {province} {city}")
    step_print("坐标", f"中心坐标: ({center_lat:.6f}, {center_lng:.6f})")
    step_print("行政编码", f"adcode: {adcode}")
    
    return city, center_lat, center_lng

# ============================================================
# Step 2: 高德 POI 搜索 "猫咖" (模拟标签搜索)
# ============================================================
def search_cat_cafe(city, lat, lng):
    separator("Step 2: 高德 POI 搜索 '猫咖' (AMap Around Search)")
    
    radius = SEARCH_RADIUS['city']  # 30km 城市级搜索
    step_print("搜索词", "猫咖")
    step_print("分类编码", f"{CAT_CAFE_TYPE_CODE} (咖啡茶室)")
    step_print("搜索半径", f"{radius}m ({radius/1000}km)")
    step_print("中心坐标", f"({lat}, {lng})")
    
    url = "https://restapi.amap.com/v3/place/around"
    params = {
        "key": AMAP_KEY,
        "location": f"{lng},{lat}",
        "keywords": "猫咖",
        "types": CAT_CAFE_TYPE_CODE,
        "radius": radius,
        "offset": 50,
        "page": 1,
        "extensions": "all",
    }
    
    resp = requests.get(url, params=params, timeout=10)
    data = resp.json()
    
    if data.get("status") != "1":
        step_print("ERROR", f"搜索失败: {data.get('info')}")
        return []
    
    pois = data.get("pois", [])
    total = data.get("count", 0)
    step_print("原始结果", f"高德返回 {len(pois)} 条 (总计 {total} 条)")
    
    return pois

# ============================================================
# Step 3: 三层过滤 (Layer 2: 负面排除 + 白名单校验)
# ============================================================
def apply_filters(pois):
    separator("Step 3: 三层过滤 (Layer 2 Negative + Whitelist)")
    
    passed = []
    excluded_black = []
    excluded_white = []
    
    for poi in pois:
        name = poi.get("name", "")
        type_str = poi.get("type", "")
        address = poi.get("address", "")
        search_str = f"{name} {type_str} {address}"
        
        # 黑名单排除
        if any(exc in search_str for exc in POI_TYPE_EXCLUDE):
            excluded_black.append(name)
            continue
        
        # 白名单校验
        # 猫咖搜索: 由于是标签搜索(非 isUserSearch), 需通过白名单
        # 但猫咖名字中通常含 "咖啡" 这个白名单词
        if any(inc in search_str for inc in POI_TYPE_STRICT_INCLUDE):
            passed.append(poi)
        else:
            excluded_white.append(name)
    
    step_print("黑名单剔除", f"{len(excluded_black)} 条")
    if excluded_black:
        for n in excluded_black[:5]:
            print(f"    - {n}")
    
    step_print("白名单未匹配", f"{len(excluded_white)} 条")
    if excluded_white:
        for n in excluded_white[:5]:
            print(f"    - {n}")
    
    step_print("通过过滤", f"{len(passed)} 条")
    
    return passed

# ============================================================
# Step 4: 格式化输出可玩猫咖清单
# ============================================================
def display_results(pois, city):
    separator(f"Step 4: {city} 可以去玩的猫咖清单")
    
    if not pois:
        print("  [结果] 当前区域未搜索到猫咖, 需要扩大搜索半径或更换搜索词")
        return
    
    # 按距离排序
    pois.sort(key=lambda p: float(p.get("distance", 99999)))
    
    for i, poi in enumerate(pois, 1):
        name = poi.get("name", "未知")
        address = poi.get("address", "无地址")
        type_str = poi.get("type", "")
        distance = poi.get("distance", "?")
        tel = poi.get("tel", "无电话")
        
        # 评分
        biz_ext = poi.get("biz_ext", {}) or {}
        rating = biz_ext.get("rating", "无评分")
        cost = biz_ext.get("cost", "")
        
        # 照片
        photos = poi.get("photos", []) or []
        photo_count = len(photos)
        
        # 坐标
        location = poi.get("location", "0,0")
        lng, lat = location.split(",")
        
        # 营业时间
        open_time = biz_ext.get("opentime2", biz_ext.get("open_time", ""))
        
        print(f"\n  ┌─ [{i}] {name}")
        print(f"  │ 地址: {address}")
        print(f"  │ 距离: {distance}m ({float(distance)/1000:.1f}km)")
        print(f"  │ 评分: {rating}  人均: {cost if cost else '未知'}元")
        print(f"  │ 电话: {tel}")
        print(f"  │ 分类: {type_str}")
        print(f"  │ 照片: {photo_count} 张")
        if open_time:
            print(f"  │ 营业: {open_time}")
        print(f"  │ 坐标: ({lat}, {lng})")
        if photos:
            print(f"  │ 封面: {photos[0].get('url', 'N/A')[:80]}...")
        print(f"  └─────────────────────────────")

# ============================================================
# Step 5: 扩大搜索 — 如果标签搜索结果不足, 用纯文本搜索补充
# ============================================================
def search_text_fallback(city, keyword="猫咖"):
    separator(f"Step 5: 文本全城搜索补充 (Text Search Fallback)")
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": AMAP_KEY,
        "keywords": keyword,
        "city": city,
        "offset": 50,
        "page": 1,
        "extensions": "all",
    }
    
    resp = requests.get(url, params=params, timeout=10)
    data = resp.json()
    
    if data.get("status") != "1":
        step_print("ERROR", f"文本搜索失败: {data.get('info')}")
        return []
    
    pois = data.get("pois", [])
    step_print("文本搜索", f"全城检索到 {len(pois)} 条含'{keyword}'的地点")
    return pois

# ============================================================
# Main
# ============================================================
def main():
    print(f"\n{'#'*60}")
    print(f"#  Greenstar 探索板块模拟测试: 搜索 '猫咖'")
    print(f"#  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#'*60}")
    
    # Step 1: IP 定位
    city, lat, lng = get_ip_location()
    
    # Step 2: 周边搜索
    raw_pois = search_cat_cafe(city, lat, lng)
    
    # Step 3: 三层过滤
    filtered_pois = apply_filters(raw_pois)
    
    # Step 4: 展示结果
    display_results(filtered_pois, city)
    
    # Step 5: 如果周边搜索不够, 补充全城文本搜索
    if len(filtered_pois) < 3:
        text_pois = search_text_fallback(city)
        text_filtered = apply_filters(text_pois)
        
        # 合并去重
        seen_ids = {p.get("id") for p in filtered_pois}
        new_pois = [p for p in text_filtered if p.get("id") not in seen_ids]
        
        if new_pois:
            separator(f"补充搜索: 新增 {len(new_pois)} 个猫咖")
            display_results(new_pois, city)
    
    # 汇总
    separator("测试完成 / Test Complete")
    total = len(filtered_pois)
    print(f"  当前城市: {city}")
    print(f"  定位坐标: ({lat:.6f}, {lng:.6f})")
    print(f"  搜索词:   猫咖")
    print(f"  搜索半径: 30km")
    print(f"  最终结果: {total} 个可去的猫咖")
    if total > 0:
        print(f"\n  结论: {city}有 {total} 家猫咖可以去玩.")
    else:
        print(f"\n  结论: {city}周边 30km 范围内未找到明确的猫咖, 建议扩大搜索或尝试关键词 '猫主题' / '撸猫'.")

if __name__ == "__main__":
    main()
