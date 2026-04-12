#!/usr/bin/env python3
# ============================================================================
# 文件: tests/eval_travel_planner.py
# 基准版本: 新建文件 (无基线)
# 修改内容 / Changes:
#   [新建] 旅游攻略核心程序评估器
#   [NEW] Travel planner core program evaluator
#
# 评测维度 (5个):
#   1. Coverage  — 系统推荐 ∩ GT / GT (地点覆盖率)
#   2. Precision — 系统推荐 ∩ GT / 系统推荐 (推荐准确率)
#   3. Route Logic — 推荐顺序的地理连续性 (避免折返)
#   4. Richness  — 信息完整度 (评分/人均/营业/照片 四项命中率)
#   5. Diversity — 分类多样性 (景点/餐饮/休闲 三类覆盖)
#
# 依赖:
#   - tests/datasets/*.json (由 build_test_dataset.py 生成)
#   - Greenstar 推荐引擎逻辑 (Python 1:1 移植)
# ============================================================================

import json
import os
import math
from datetime import datetime
from collections import defaultdict

DATASET_DIR = os.path.join(os.path.dirname(__file__), "datasets")

# === Greenstar 推荐引擎 (1:1 移植, 与 test_recommend_engine.py 一致) ===

SCENE_RULES = [
    {"keywords": ["精酿", "啤酒", "鲜啤"],  "scene": "精酿啤酒"},
    {"keywords": ["威士忌", "whiskey"],      "scene": "威士忌"},
    {"keywords": ["鸡尾酒", "cocktail"],     "scene": "鸡尾酒"},
    {"keywords": ["清吧"],                   "scene": "清吧"},
    {"keywords": ["LiveHouse", "livehouse"], "scene": "LiveHouse"},
    {"keywords": ["民谣"],                   "scene": "民谣酒吧"},
    {"keywords": ["小酒馆", "酒馆"],          "scene": "小酒馆"},
    {"keywords": ["酒吧"],                   "scene": "酒吧"},
    {"keywords": ["咖啡", "coffee"],         "scene": "咖啡馆"},
    {"keywords": ["猫咖", "猫"],             "scene": "猫咖"},
    {"keywords": ["密室", "逃脱"],           "scene": "密室逃脱"},
    {"keywords": ["剧本杀"],                "scene": "剧本杀"},
    {"keywords": ["火锅"],                  "scene": "火锅"},
    {"keywords": ["烧烤", "烤肉"],           "scene": "烧烤"},
    {"keywords": ["日料", "寿司"],           "scene": "日料"},
    {"keywords": ["茶馆", "茶室"],           "scene": "茶馆"},
    {"keywords": ["书店", "书吧"],           "scene": "书店"},
    {"keywords": ["博物馆"],                "scene": "博物馆"},
    {"keywords": ["公园"],                  "scene": "公园"},
    {"keywords": ["景区", "风景", "名胜"],   "scene": "景区"},
    {"keywords": ["酒店", "宾馆"],           "scene": "酒店"},
    {"keywords": ["民宿", "客栈"],           "scene": "民宿"},
]

SORT_WEIGHTS = {
    "W_RATING": 10,
    "W_PHOTO": 5,
    "W_COST": 3,
    "W_OPEN_TIME": 2,
    "W_DISTANCE": -0.001,
    "MIN_QUALITY_RATING": 4.0,
}

DISTANCE_SEGMENTS = [
    {"key": "walkable",  "label": "步行可达",     "maxMeters": 1000},
    {"key": "bikeable",  "label": "骑车/打车范围", "maxMeters": 3000},
    {"key": "driveable", "label": "值得专程去",    "maxMeters": 10000},
    {"key": "far",       "label": "远程目的地",    "maxMeters": float('inf')},
]

POI_TYPE_EXCLUDE = [
    '公厕', '垃圾', '变电站', '污水', '殡葬', '戒毒', '监狱',
    '加油站', '充电站', '停车场', '公共厕所', '环卫',
    '公司', '集团', '企业', '工厂', '办事处', '物业',
    '超市', '菜市场', '食堂', '快餐', '便民', '外卖', '小卖部',
    '药店', '诊所', '医院', '培训', '学校', '幼儿园', '驾校',
    '修理', '洗车', '中介', '地产', '快递', '网吧', '便利店',
]

POI_TYPE_STRICT_INCLUDE = [
    '景区', '公园', '旅游', '名胜', '风景', '故居', '遗址', '古镇', '古城',
    '寺庙', '寺', '庙', '塔', '桥', '湖', '山', '岛', '海滩', '瀑布', '温泉',
    '美术馆', '博物馆', '展览馆', '艺术中心', '画廊', '剧院', '音乐厅',
    '咖啡', '甜品', '茶馆', '酒馆', '精酿', '清吧', 'LiveHouse', '奶茶',
    '密室', '剧本杀', '游乐园', '度假村', '体验馆', '滑雪', '电竞', '蹦床',
    '酒店', '民宿', '客栈', '度假', '旅馆', '青旅',
    '书店', '文创园', '广场', '老街', '步行街', '夜市', '商场', '集市',
    '餐厅', '饭店', '美食', '小吃', '火锅', '烧烤', '海鲜', '面馆',
    '酒吧', '酒楼', '私房菜', '日料', '西餐', '烘焙',
]


def infer_scene(name, type_str):
    search_str = f"{name} {type_str}"
    for rule in SCENE_RULES:
        if any(kw in search_str for kw in rule["keywords"]):
            return rule["scene"]
    return "其他"


def compute_score(poi):
    rating = poi.get("rating", 0) or 0
    has_photo = poi.get("photos_count", 0) > 0
    has_cost = bool(poi.get("cost", ""))
    has_open_time = bool(poi.get("open_time", ""))
    distance = poi.get("distance", 0) or 0
    W = SORT_WEIGHTS
    return (
        rating * W["W_RATING"] +
        (1 if has_photo else 0) * W["W_PHOTO"] +
        (1 if has_cost else 0) * W["W_COST"] +
        (1 if has_open_time else 0) * W["W_OPEN_TIME"] +
        distance * W["W_DISTANCE"]
    )


def assign_segment(distance_m):
    for seg in DISTANCE_SEGMENTS:
        if distance_m <= seg["maxMeters"]:
            return seg["key"]
    return "far"


def run_recommend_engine(amap_pois, quality_only=True):
    """运行推荐引擎, 返回排序后的推荐列表"""
    # Layer 2 过滤
    filtered = []
    for p in amap_pois:
        name = p.get("name", "")
        type_str = p.get("type", "")
        search_str = f"{name} {type_str}"
        if any(exc in search_str for exc in POI_TYPE_EXCLUDE):
            continue
        if not any(inc in search_str for inc in POI_TYPE_STRICT_INCLUDE):
            continue
        filtered.append(p)

    # 评分 + 场景推断
    ranked = []
    for p in filtered:
        score = compute_score(p)
        scene = infer_scene(p["name"], p.get("type", ""))
        segment = assign_segment(p.get("distance", 0) or 0)
        ranked.append({
            **p,
            "score": score,
            "scene": scene,
            "segment": segment,
        })

    # 质量门槛
    if quality_only:
        min_r = SORT_WEIGHTS["MIN_QUALITY_RATING"]
        ranked = [r for r in ranked if (r.get("rating", 0) or 0) >= min_r]

    # 按 score 降序
    ranked.sort(key=lambda x: -x["score"])
    return ranked


# ============================================================
# 评测维度计算
# ============================================================

def haversine(lat1, lng1, lat2, lng2):
    """两点间球面距离 (km)"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def eval_coverage(recommended_names, gt_names):
    """维度1: 覆盖率 = |推荐 ∩ GT| / |GT|"""
    if not gt_names:
        return 0.0
    # 模糊匹配: GT 地名是推荐地名的子串或反之
    hit = 0
    for gt in gt_names:
        for rec in recommended_names:
            if gt in rec or rec in gt:
                hit += 1
                break
    return hit / len(gt_names)


def eval_precision(recommended_names, gt_names):
    """维度2: 准确率 = |推荐 ∩ GT| / |推荐|"""
    if not recommended_names:
        return 0.0
    hit = 0
    for rec in recommended_names:
        for gt in gt_names:
            if gt in rec or rec in gt:
                hit += 1
                break
    return hit / len(recommended_names)


def eval_route_logic(ranked_pois):
    """维度3: 路线合理性 — 衡量相邻推荐点之间的地理连续性"""
    if len(ranked_pois) < 2:
        return 1.0

    # 计算相邻推荐点的距离序列
    coords = []
    for p in ranked_pois:
        c = p.get("coordinates", {})
        if c and c.get("lat") and c.get("lng"):
            coords.append((c["lat"], c["lng"]))

    if len(coords) < 2:
        return 1.0

    # 计算平均相邻距离
    adj_distances = []
    for i in range(len(coords) - 1):
        d = haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])
        adj_distances.append(d)

    avg_adj = sum(adj_distances) / len(adj_distances)

    # 评分: 平均相邻距离 < 3km → 1.0, > 15km → 0.0, 线性插值
    if avg_adj <= 3:
        return 1.0
    elif avg_adj >= 15:
        return 0.0
    else:
        return 1.0 - (avg_adj - 3) / 12


def eval_richness(ranked_pois):
    """维度4: 信息丰富度 — 评分/人均/营业时间/照片 四项命中率"""
    if not ranked_pois:
        return 0.0

    total_fields = 0
    hit_fields = 0
    for p in ranked_pois:
        total_fields += 4
        if p.get("rating", 0) > 0:
            hit_fields += 1
        if p.get("cost"):
            hit_fields += 1
        if p.get("open_time"):
            hit_fields += 1
        if p.get("photos_count", 0) > 0:
            hit_fields += 1

    return hit_fields / total_fields if total_fields > 0 else 0.0


def eval_diversity(ranked_pois):
    """维度5: 分类多样性 — 景点/餐饮/休闲 三类覆盖比例"""
    if not ranked_pois:
        return 0.0

    categories = {"景点": 0, "餐饮": 0, "休闲": 0}
    scenic_scenes = {"景区", "公园", "博物馆", "书店"}
    dining_scenes = {"火锅", "烧烤", "日料", "咖啡馆", "茶馆", "猫咖"}
    leisure_scenes = {"酒吧", "清吧", "精酿啤酒", "LiveHouse", "密室逃脱", "剧本杀", "小酒馆", "民谣酒吧", "威士忌", "鸡尾酒"}

    for p in ranked_pois:
        scene = p.get("scene", "其他")
        typ = p.get("type", "")
        if scene in scenic_scenes or "风景名胜" in typ:
            categories["景点"] += 1
        elif scene in dining_scenes or "餐饮" in typ:
            categories["餐饮"] += 1
        elif scene in leisure_scenes or "休闲" in typ or "体育" in typ:
            categories["休闲"] += 1

    # 多样性: 三类都有 → 1.0, 只有一类 → 0.33
    non_zero = sum(1 for v in categories.values() if v > 0)
    return non_zero / 3


# ============================================================
# 主评估管线
# ============================================================

def evaluate_city(dataset_path):
    """对单个城市运行完整评估"""
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    city = data["meta"]["city"]
    gt = data["ground_truth"]
    amap_pois = data["sources"]["amap_pois"]

    # 运行推荐引擎
    ranked = run_recommend_engine(amap_pois, quality_only=True)
    recommended_names = [r["name"] for r in ranked]

    # 合并 GT 所有地点
    all_gt_names = gt.get("must_visit", []) + gt.get("dining", []) + gt.get("leisure", [])

    # 5 维度评测
    coverage = eval_coverage(recommended_names, all_gt_names)
    precision = eval_precision(recommended_names, all_gt_names)
    route_logic = eval_route_logic(ranked[:20])  # 取 Top20 评估路线
    richness = eval_richness(ranked)
    diversity = eval_diversity(ranked)

    # 加权总分
    weights = {"coverage": 0.25, "precision": 0.25, "route_logic": 0.20, "richness": 0.15, "diversity": 0.15}
    total_score = (
        coverage * weights["coverage"] +
        precision * weights["precision"] +
        route_logic * weights["route_logic"] +
        richness * weights["richness"] +
        diversity * weights["diversity"]
    )

    # 详细命中分析
    gt_hit_detail = {}
    for category in ["must_visit", "dining", "leisure"]:
        gt_list = gt.get(category, [])
        hits = []
        misses = []
        for gt_name in gt_list:
            found = any(gt_name in r or r in gt_name for r in recommended_names)
            if found:
                hits.append(gt_name)
            else:
                misses.append(gt_name)
        gt_hit_detail[category] = {"hits": hits, "misses": misses}

    return {
        "city": city,
        "total_score": total_score,
        "dimensions": {
            "coverage": coverage,
            "precision": precision,
            "route_logic": route_logic,
            "richness": richness,
            "diversity": diversity,
        },
        "counts": {
            "input_pois": len(amap_pois),
            "after_filter": len(ranked),
            "gt_total": len(all_gt_names),
        },
        "gt_hit_detail": gt_hit_detail,
        "top10_recommended": [{"name": r["name"], "score": round(r["score"], 1), "scene": r["scene"]} for r in ranked[:10]],
    }


def format_report(results):
    """格式化 Markdown 评估报告"""
    lines = []
    lines.append(f"# Greenstar 旅游攻略核心程序评估报告")
    lines.append(f"")
    lines.append(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**评估引擎**: recommendEngine.ts (Python 1:1 移植)")
    lines.append(f"**评测城市**: {', '.join(r['city'] for r in results)}")
    lines.append(f"")

    # 总分表
    lines.append(f"## 综合评分")
    lines.append(f"")
    lines.append(f"| 城市 | 总分 | 覆盖率 | 准确率 | 路线逻辑 | 信息丰富 | 分类多样 | 输入→输出 |")
    lines.append(f"|------|------|--------|--------|----------|----------|----------|-----------|")
    for r in results:
        d = r["dimensions"]
        c = r["counts"]
        lines.append(
            f"| {r['city']} | **{r['total_score']:.2f}** | "
            f"{d['coverage']:.2f} | {d['precision']:.2f} | {d['route_logic']:.2f} | "
            f"{d['richness']:.2f} | {d['diversity']:.2f} | "
            f"{c['input_pois']}→{c['after_filter']} |"
        )

    avg_score = sum(r["total_score"] for r in results) / len(results)
    lines.append(f"")
    lines.append(f"**平均总分: {avg_score:.2f}**")

    # 各维度权重说明
    lines.append(f"")
    lines.append(f"权重: 覆盖率(25%) + 准确率(25%) + 路线逻辑(20%) + 信息丰富(15%) + 分类多样(15%)")

    # 每个城市的详细分析
    for r in results:
        lines.append(f"")
        lines.append(f"---")
        lines.append(f"## {r['city']} 详细分析")
        lines.append(f"")

        # GT 命中详情
        for cat_key, cat_label in [("must_visit", "必去景点"), ("dining", "餐饮推荐"), ("leisure", "休闲推荐")]:
            detail = r["gt_hit_detail"].get(cat_key, {})
            hits = detail.get("hits", [])
            misses = detail.get("misses", [])
            total = len(hits) + len(misses)
            rate = len(hits) / total * 100 if total > 0 else 0
            lines.append(f"### {cat_label} (命中 {len(hits)}/{total}, {rate:.0f}%)")
            if hits:
                lines.append(f"- 命中: {', '.join(hits)}")
            if misses:
                lines.append(f"- 未命中: {', '.join(misses)}")
            lines.append(f"")

        # Top 10 推荐
        lines.append(f"### 系统 Top 10 推荐")
        lines.append(f"| # | 名称 | 评分 | 风格 |")
        lines.append(f"|---|------|------|------|")
        for i, t in enumerate(r["top10_recommended"], 1):
            lines.append(f"| {i} | {t['name']} | {t['score']} | {t['scene']} |")

    return "\n".join(lines)


# ============================================================
# Main
# ============================================================
def main():
    print(f"\n{'#'*60}")
    print(f"#  Greenstar 旅游攻略核心程序评估")
    print(f"#  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#'*60}")

    # 加载所有测试集
    results = []
    for fname in sorted(os.listdir(DATASET_DIR)):
        if fname.endswith(".json"):
            path = os.path.join(DATASET_DIR, fname)
            print(f"\n  评估: {fname}")
            r = evaluate_city(path)
            results.append(r)

            d = r["dimensions"]
            print(f"    总分: {r['total_score']:.2f}")
            print(f"    覆盖率:{d['coverage']:.2f} 准确率:{d['precision']:.2f} 路线:{d['route_logic']:.2f} 丰富:{d['richness']:.2f} 多样:{d['diversity']:.2f}")
            print(f"    输入 {r['counts']['input_pois']} → 过滤后 {r['counts']['after_filter']} | GT {r['counts']['gt_total']} 条")

    if not results:
        print("  [ERROR] 未找到测试集, 请先运行 build_test_dataset.py")
        return

    # 生成报告
    report = format_report(results)
    report_path = os.path.join(DATASET_DIR, "eval_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\n  评估报告已保存: {report_path}")

    # 终端输出总分
    avg = sum(r["total_score"] for r in results) / len(results)
    print(f"\n{'='*60}")
    print(f"  平均总分: {avg:.2f}")
    print(f"{'='*60}")
    print(f"  {'城市':>6} | {'总分':>6} | {'覆盖':>5} | {'准确':>5} | {'路线':>5} | {'丰富':>5} | {'多样':>5}")
    print(f"  {'-'*6} | {'-'*6} | {'-'*5} | {'-'*5} | {'-'*5} | {'-'*5} | {'-'*5}")
    for r in results:
        d = r["dimensions"]
        print(f"  {r['city']:>6} | {r['total_score']:>6.2f} | {d['coverage']:>5.2f} | {d['precision']:>5.2f} | {d['route_logic']:>5.2f} | {d['richness']:>5.2f} | {d['diversity']:>5.2f}")


if __name__ == "__main__":
    main()
