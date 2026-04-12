#!/usr/bin/env python3
# ============================================================================
# 文件: tests/test_recommend_engine.py
# 基准版本: 新建文件 (无基线)
# 修改内容 / Changes:
#   [新建] 使用 Greenstar 推荐引擎逻辑 (constants.ts + recommendEngine.ts 的 Python 移植)
#   [NEW] Test using Greenstar recommendation engine logic (Python port of constants + recommendEngine)
#
# 对比目标: 上一次手动 ad-hoc 测试 ("秦皇岛附近酒吧") 的输出
# 验证点:
#   1. 场景推断 (SCENE_RULES) 是否正确标注风格
#   2. 多维度评分 (SORT_WEIGHTS) 的排序是否合理
#   3. 距离分段 (DISTANCE_SEGMENTS) 是否与手动分类一致
#   4. 质量门槛 (MIN_QUALITY_RATING=4.0) 过滤效果
# ============================================================================

import requests
import json
from datetime import datetime
from collections import defaultdict

# === Greenstar 系统常量 (1:1 从 constants.ts 移植) ===
AMAP_KEY = "0e59aae0d84f39b4665eba7acc9f49a9"

# DISTANCE_SEGMENTS (constants.ts L176-181)
DISTANCE_SEGMENTS = [
    {"key": "walkable",  "label": "步行可达",     "maxMeters": 1000},
    {"key": "bikeable",  "label": "骑车/打车范围", "maxMeters": 3000},
    {"key": "driveable", "label": "值得专程去",    "maxMeters": 10000},
    {"key": "far",       "label": "远程目的地",    "maxMeters": float('inf')},
]

# SORT_WEIGHTS (constants.ts L185-191)
SORT_WEIGHTS = {
    "W_RATING": 10,
    "W_PHOTO": 5,
    "W_COST": 3,
    "W_OPEN_TIME": 2,
    "W_DISTANCE": -0.001,
    "MIN_QUALITY_RATING": 4.0,
}

# SCENE_RULES (constants.ts L195-218)
SCENE_RULES = [
    {"keywords": ["精酿", "啤酒", "鲜啤"],  "scene": "精酿啤酒"},
    {"keywords": ["威士忌", "whiskey", "WHISKEY"], "scene": "威士忌"},
    {"keywords": ["鸡尾酒", "cocktail"],    "scene": "鸡尾酒"},
    {"keywords": ["清吧"],                  "scene": "清吧"},
    {"keywords": ["LiveHouse", "livehouse", "LIVE", "现场"], "scene": "LiveHouse"},
    {"keywords": ["民谣"],                  "scene": "民谣酒吧"},
    {"keywords": ["小酒馆", "酒馆"],         "scene": "小酒馆"},
    {"keywords": ["酒吧"],                  "scene": "酒吧"},
    {"keywords": ["咖啡", "coffee", "COFFEE"], "scene": "咖啡馆"},
    {"keywords": ["猫咖", "猫"],            "scene": "猫咖"},
    {"keywords": ["密室", "逃脱"],          "scene": "密室逃脱"},
    {"keywords": ["剧本杀"],               "scene": "剧本杀"},
    {"keywords": ["火锅"],                 "scene": "火锅"},
    {"keywords": ["烧烤", "烤肉", "串串"],  "scene": "烧烤"},
    {"keywords": ["日料", "寿司"],         "scene": "日料"},
    {"keywords": ["茶馆", "茶室", "茶"],   "scene": "茶馆"},
    {"keywords": ["书店", "书吧"],         "scene": "书店"},
    {"keywords": ["博物馆"],               "scene": "博物馆"},
    {"keywords": ["公园"],                 "scene": "公园"},
    {"keywords": ["景区", "风景", "名胜"], "scene": "景区"},
    {"keywords": ["酒店", "宾馆"],         "scene": "酒店"},
    {"keywords": ["民宿", "客栈"],         "scene": "民宿"},
]

# POI_TYPE_EXCLUDE (constants.ts L55-66) — 用于排除噪声
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


# === 推荐引擎核心 (1:1 从 recommendEngine.ts 移植) ===

def infer_scene(name: str, type_str: str, tags: str = '') -> str:
    """场景推断 — 对应 recommendEngine.ts inferScene()"""
    search_str = f"{name} {type_str} {tags}"
    for rule in SCENE_RULES:
        if any(kw in search_str for kw in rule["keywords"]):
            return rule["scene"]
    return "其他"


def compute_score(rating: float, has_photo: bool, has_cost: bool,
                  has_open_time: bool, distance: float) -> float:
    """多维度加权评分 — 对应 recommendEngine.ts computeScore()"""
    W = SORT_WEIGHTS
    return (
        rating * W["W_RATING"] +
        (1 if has_photo else 0) * W["W_PHOTO"] +
        (1 if has_cost else 0) * W["W_COST"] +
        (1 if has_open_time else 0) * W["W_OPEN_TIME"] +
        distance * W["W_DISTANCE"]
    )


def assign_segment(distance_m: float) -> dict:
    """距离分段 — 对应 recommendEngine.ts segmentByDistance()"""
    for seg in DISTANCE_SEGMENTS:
        if distance_m <= seg["maxMeters"]:
            return seg
    return DISTANCE_SEGMENTS[-1]


def rank_and_segment(pois: list, quality_only: bool = True) -> dict:
    """主 API — 对应 recommendEngine.ts rankAndSegment()"""
    ranked = []
    for p in pois:
        name = p.get("name", "")
        type_str = p.get("type", "")
        biz = p.get("biz_ext") or {}
        distance = float(p.get("distance", 0))
        rating_str = biz.get("rating", "0")
        try:
            rating = float(rating_str) if rating_str else 0
        except:
            rating = 0
        cost = biz.get("cost", "")
        open_time = biz.get("opentime2", biz.get("open_time", ""))
        photos = p.get("photos") or []
        tel = p.get("tel", "")
        addr = p.get("address", "")

        scene = infer_scene(name, type_str)
        score = compute_score(rating, len(photos) > 0, bool(cost), bool(open_time), distance)
        seg = assign_segment(distance)

        ranked.append({
            "name": name,
            "address": addr,
            "distance": distance,
            "distance_km": distance / 1000,
            "rating": rating,
            "cost": cost,
            "open_time": open_time,
            "tel": tel,
            "photos_count": len(photos),
            "type": type_str,
            "scene": scene,
            "score": score,
            "segment_key": seg["key"],
            "segment_label": seg["label"],
        })

    # 质量门槛过滤
    total_before = len(ranked)
    if quality_only:
        min_r = SORT_WEIGHTS["MIN_QUALITY_RATING"]
        ranked = [r for r in ranked if r["rating"] >= min_r]

    # 按 score 降序
    ranked.sort(key=lambda x: -x["score"])

    # 分段
    groups = defaultdict(list)
    for r in ranked:
        groups[r["segment_key"]].append(r)

    # 按 DISTANCE_SEGMENTS 顺序输出
    ordered_groups = []
    for seg in DISTANCE_SEGMENTS:
        if seg["key"] in groups:
            ordered_groups.append({
                "key": seg["key"],
                "label": seg["label"],
                "spots": sorted(groups[seg["key"]], key=lambda x: -x["score"]),
            })

    # 场景统计
    scene_counts = defaultdict(int)
    for r in ranked:
        scene_counts[r["scene"]] += 1

    return {
        "groups": ordered_groups,
        "all_ranked": ranked,
        "stats": {
            "total_input": total_before + (total_before - len(ranked)),  # 近似
            "total_output": len(ranked),
            "quality_filtered": total_before - len(ranked) if quality_only else 0,
            "scene_counts": dict(scene_counts),
        }
    }


# === 数据获取 (使用与手动测试相同的搜索逻辑) ===

def fetch_bars(center_lng, center_lat, radius=6000):
    """双轮搜索酒吧 — 与 CityExplorer doTagSearch 双轮逻辑一致"""
    all_pois = []

    # Round 1: 精准分类搜索
    for kw in ['酒吧', '清吧', '精酿啤酒', '小酒馆', '鸡尾酒']:
        resp = requests.get('https://restapi.amap.com/v3/place/around', params={
            'key': AMAP_KEY, 'keywords': kw,
            'location': f'{center_lng},{center_lat}',
            'radius': radius, 'extensions': 'all', 'offset': 50
        }, timeout=10).json()
        all_pois.extend(resp.get('pois', []))

    # 去重
    seen = set()
    unique = []
    for p in all_pois:
        pid = p.get('id', '')
        if pid and pid not in seen:
            seen.add(pid)
            unique.append(p)

    # 排除 KTV + 黑名单噪声
    ktv_words = ['KTV', 'ktv', '歌厅', '练歌', '歌城', '卡拉', '电玩']
    filtered = []
    for p in unique:
        name = p.get("name", "")
        type_str = p.get("type", "")
        search_str = f"{name} {type_str}"
        if any(k in name for k in ktv_words):
            continue
        if any(exc in search_str for exc in POI_TYPE_EXCLUDE):
            continue
        filtered.append(p)

    return filtered


# === 主入口 ===

def main():
    print(f"\n{'#' * 65}")
    print(f"#  Greenstar 推荐引擎系统测试: 搜索 '酒吧'")
    print(f"#  引擎: recommendEngine.ts (Python 1:1 移植)")
    print(f"#  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#' * 65}")

    # IP 定位
    ip_resp = requests.get(f'https://restapi.amap.com/v3/ip?key={AMAP_KEY}', timeout=10).json()
    city = ip_resp.get("city", "未知")
    rect = ip_resp.get("rectangle", "")
    if rect:
        parts = rect.split(";")
        c1 = parts[0].split(",")
        c2 = parts[1].split(",")
        center_lng = (float(c1[0]) + float(c2[0])) / 2
        center_lat = (float(c1[1]) + float(c2[1])) / 2
    else:
        center_lng, center_lat = 119.60, 39.94

    print(f"\n  定位: {city} ({center_lat:.6f}, {center_lng:.6f})")

    # 获取原始数据
    print(f"  正在搜索酒吧...")
    raw_pois = fetch_bars(center_lng, center_lat, radius=6000)
    print(f"  去重+过滤后原始 POI: {len(raw_pois)} 条")

    # === 推荐引擎处理 ===
    result = rank_and_segment(raw_pois, quality_only=True)
    stats = result["stats"]

    print(f"\n{'=' * 65}")
    print(f"  推荐引擎统计")
    print(f"{'=' * 65}")
    print(f"  输入: {len(raw_pois)} → 质量过滤(评分<{SORT_WEIGHTS['MIN_QUALITY_RATING']}): -{stats['quality_filtered']} → 输出: {stats['total_output']}")
    print(f"  场景分布: {', '.join(f'{k}({v})' for k, v in sorted(stats['scene_counts'].items(), key=lambda x: -x[1]))}")

    # 分段输出
    global_idx = 0
    for group in result["groups"]:
        print(f"\n{'=' * 65}")
        print(f"  {group['label']} ({len(group['spots'])} 家)")
        print(f"{'=' * 65}")

        for s in group["spots"]:
            global_idx += 1
            cost_str = f"{s['cost']}元" if s['cost'] else '未知'
            print(f"\n  {global_idx:2d}. {s['name']}")
            print(f"      {s['distance_km']:.1f}km | 评分:{s['rating']} | 人均:{cost_str} | 风格:{s['scene']}")
            if s['open_time']:
                print(f"      营业:{s['open_time']}")
            if s['address'] and s['address'] != '[]':
                print(f"      地址:{s['address']}")
            if s['tel'] and s['tel'] != '[]':
                print(f"      电话:{s['tel']}")
            print(f"      [score={s['score']:.1f}]")

    # === 对比验证 ===
    print(f"\n\n{'#' * 65}")
    print(f"#  对比验证: 手动测试 vs 推荐引擎")
    print(f"{'#' * 65}")

    # 手动测试中的 Top 5 (距离排序, 评分>=4.0)
    manual_top5 = [
        "佐柚酒馆",
        "德伦堡啤酒厂(人民广场店)",
        "雪熊精酿烧烤小酒馆(建设大街店)",
        "ZING鲸鱼啤酒(葡萄院店)",
        "月陌酒吧",
    ]

    # 推荐引擎的步行可达段
    walkable = [g for g in result["groups"] if g["key"] == "walkable"]
    engine_walkable = [s["name"] for s in walkable[0]["spots"]] if walkable else []

    print(f"\n  手动测试 '步行可达'(1km内) Top5:")
    for i, n in enumerate(manual_top5, 1):
        in_engine = "匹配" if n in engine_walkable else "❌ 未匹配"
        print(f"    {i}. {n} → {in_engine}")

    print(f"\n  推荐引擎 '步行可达'(1km内):")
    for i, n in enumerate(engine_walkable, 1):
        print(f"    {i}. {n}")

    # 最高分对比
    if result["all_ranked"]:
        top = result["all_ranked"][0]
        print(f"\n  推荐引擎最高分: {top['name']} (score={top['score']:.1f}, {top['distance_km']:.1f}km, 评分:{top['rating']})")

    # 总覆盖率
    all_names = {s["name"] for s in result["all_ranked"]}
    manual_in_engine = sum(1 for n in manual_top5 if n in all_names)
    print(f"\n  手动 Top5 在引擎中的覆盖率: {manual_in_engine}/5 ({manual_in_engine*100/5:.0f}%)")
    print(f"  推荐引擎总输出: {stats['total_output']} 家")


if __name__ == "__main__":
    main()
