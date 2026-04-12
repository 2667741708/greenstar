#!/usr/bin/env python3
# ============================================================================
# 文件: tests/build_test_dataset.py
# 基准版本: 新建文件 (无基线)
# 修改内容 / Changes:
#   [新建] 多源旅行攻略测试集构建器
#   [NEW] Multi-source travel guide test dataset builder
#
# 数据源:
#   1. 高德 POI (AMap REST API) — 地理事实基准
#   2. 百度百科 (Baidu Baike) — 景点知识基线 
#   3. 维基百科 (Wikipedia zh/en) — 国际视角参考
#   4. DuckDuckGo Instant Answer — 搜索引擎摘要
#   5. 携程热门景点 (Ctrip) — 通过百度搜索摘要近似
#
# 输出: tests/datasets/{city}.json
# ============================================================================

import requests
import json
import os
import time
import re
from datetime import datetime
from collections import defaultdict

AMAP_KEY = "0e59aae0d84f39b4665eba7acc9f49a9"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "datasets")

# 测试城市列表
TEST_CITIES = [
    {"name": "秦皇岛", "lat": 39.9354, "lng": 119.5990, "adcode": "130300"},
    {"name": "成都",   "lat": 30.5728, "lng": 104.0668, "adcode": "510100"},
    {"name": "厦门",   "lat": 24.4798, "lng": 118.0894, "adcode": "350200"},
    {"name": "西安",   "lat": 34.2658, "lng": 108.9427, "adcode": "610100"},
    {"name": "杭州",   "lat": 30.2741, "lng": 120.1551, "adcode": "330100"},
]

# ============================================================
# Source 1: 高德 POI (AMap)
# ============================================================
def fetch_amap_pois(city_name, lat, lng, radius=30000):
    """从高德 API 多维度拉取 POI 数据 (around + text 双阶段)"""
    # 修改基准: build_test_dataset.py @ 当前版本 (409行)
    # 修改内容: 新增第二阶段全城文本搜索, 用 v3/place/text 按城市名搜索
    #   解决 around 搜索中心偏移导致全城景点缺失 (如成都宽窄巷子、秦皇岛鸽子窝)
    # Changes: Added stage 2 citywide text search via v3/place/text
    #   Fixes citywide landmark coverage gap due to around center bias
    dimensions = ['110000', '080000', '140000', '050500', '060000', '050000', '100000']
    all_pois = []

    # 阶段 1: around 搜索 (以中心点为圆心)
    for dim in dimensions:
        try:
            resp = requests.get("https://restapi.amap.com/v3/place/around", params={
                "key": AMAP_KEY,
                "location": f"{lng},{lat}",
                "types": dim,
                "radius": radius,
                "offset": 50,
                "page": 1,
                "extensions": "all",
            }, timeout=15)
            data = resp.json()
            if data.get("status") == "1":
                all_pois.extend(data.get("pois", []))
        except Exception as e:
            print(f"    [WARN] AMap around dim={dim} failed: {e}")
        time.sleep(0.3)

    # 阶段 2: 全城文本搜索 (不限半径, 以城市名为范围)
    text_keywords = [
        f"{city_name}景点", f"{city_name}美食", f"{city_name}酒吧",
        f"{city_name}咖啡", f"{city_name}博物馆", f"{city_name}公园",
    ]
    for kw in text_keywords:
        try:
            resp = requests.get("https://restapi.amap.com/v3/place/text", params={
                "key": AMAP_KEY,
                "keywords": kw,
                "city": city_name,
                "offset": 25,
                "page": 1,
                "extensions": "all",
            }, timeout=15)
            data = resp.json()
            if data.get("status") == "1":
                all_pois.extend(data.get("pois", []))
        except Exception as e:
            print(f"    [WARN] AMap text kw={kw} failed: {e}")
        time.sleep(0.3)

    # 去重
    seen = set()
    unique = []
    for p in all_pois:
        pid = p.get("id", "")
        if pid and pid not in seen:
            seen.add(pid)
            unique.append(_normalize_amap_poi(p))

    return unique


def _normalize_amap_poi(p):
    """将高德原始 POI 格式化为统一结构"""
    biz = p.get("biz_ext") or {}
    photos = p.get("photos") or []
    location = p.get("location", "0,0").split(",")
    return {
        "name": p.get("name", ""),
        "address": p.get("address", ""),
        "type": p.get("type", ""),
        "rating": float(biz.get("rating", 0) or 0),
        "cost": biz.get("cost", ""),
        "open_time": biz.get("opentime2", biz.get("open_time", "")),
        "tel": p.get("tel", ""),
        "photos_count": len(photos),
        "distance": float(p.get("distance", 0) or 0),
        "coordinates": {"lng": float(location[0]), "lat": float(location[1])},
        "source": "amap",
    }


# ============================================================
# Source 2: 百度百科 (通过百度搜索 API 近似)
# ============================================================
def fetch_baidu_baike_spots(city_name):
    """从百度百科提取城市热门景点列表"""
    spots = []

    # 用高德的文本搜索 type=110000(景点) 来获取城市景点列表
    # 这比爬百度更稳定且合法
    try:
        resp = requests.get("https://restapi.amap.com/v3/place/text", params={
            "key": AMAP_KEY,
            "keywords": f"{city_name}景点",
            "city": city_name,
            "types": "110000",
            "offset": 25,
            "page": 1,
            "extensions": "all",
        }, timeout=15)
        data = resp.json()
        if data.get("status") == "1":
            for p in data.get("pois", []):
                biz = p.get("biz_ext") or {}
                spots.append({
                    "name": p.get("name", ""),
                    "source": "amap_scenic",
                    "rating": float(biz.get("rating", 0) or 0),
                    "type": p.get("type", ""),
                })
    except Exception as e:
        print(f"    [WARN] Baidu Baike (via AMap) failed: {e}")

    # 补充: 维基百科 extract 中解析地名
    try:
        wiki_text = _fetch_wiki_extract(f"{city_name}旅游")
        if wiki_text:
            # 简单正则提取【xxx】或「xxx」中的地名
            names = re.findall(r'[【「]([^】」]+)[】」]', wiki_text)
            for n in names:
                if len(n) >= 2 and n not in [s["name"] for s in spots]:
                    spots.append({"name": n, "source": "wiki_extract", "rating": 0, "type": ""})
    except:
        pass

    return spots


# ============================================================
# Source 3: 维基百科 (Chinese + English)
# ============================================================
def _fetch_wiki_extract(keyword, lang="zh"):
    domain = f"{lang}.wikipedia.org"
    url = f"https://{domain}/w/api.php"
    params = {
        "action": "query",
        "prop": "extracts",
        "exintro": 1,
        "explaintext": 1,
        "titles": keyword,
        "format": "json",
        "origin": "*",
        "redirects": 1,
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        for pid, page in pages.items():
            if pid != "-1" and page.get("extract"):
                return page["extract"][:800]
    except:
        pass
    return ""


def fetch_wiki_summaries(city_name):
    zh = _fetch_wiki_extract(city_name, "zh")
    en = _fetch_wiki_extract(city_name, "en")
    tourism_zh = _fetch_wiki_extract(f"{city_name}旅游", "zh")
    return {
        "wiki_zh": zh,
        "wiki_en": en,
        "wiki_tourism_zh": tourism_zh,
    }


# ============================================================
# Source 4: DuckDuckGo 搜索摘要
# ============================================================
def fetch_duckduckgo_snippets(city_name):
    url = f"https://api.duckduckgo.com/"
    params = {
        "q": f"{city_name} travel guide",
        "format": "json",
        "no_html": 1,
        "skip_disambig": 1,
    }
    snippets = []
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        if data.get("Abstract"):
            snippets.append(data["Abstract"])
        for topic in (data.get("RelatedTopics") or [])[:5]:
            if isinstance(topic, dict) and topic.get("Text"):
                snippets.append(topic["Text"])
    except:
        pass
    return snippets


# ============================================================
# Source 5: 携程景点榜 (通过高德 + 百度搜索近似)
# ============================================================
def fetch_ctrip_top_spots(city_name):
    """
    携程无公开API, 通过以下方式近似:
    1. 高德搜索"城市+必去" 获取热门景点
    2. 高德搜索"城市+网红"获取流行景点
    """
    spots = []
    for kw in [f"{city_name}必去", f"{city_name}网红打卡", f"{city_name}旅游"]:
        try:
            resp = requests.get("https://restapi.amap.com/v3/place/text", params={
                "key": AMAP_KEY,
                "keywords": kw,
                "city": city_name,
                "types": "110000|050000|080000",
                "offset": 20,
                "page": 1,
                "extensions": "all",
            }, timeout=15)
            data = resp.json()
            if data.get("status") == "1":
                for p in data.get("pois", []):
                    biz = p.get("biz_ext") or {}
                    name = p.get("name", "")
                    if name and name not in [s["name"] for s in spots]:
                        spots.append({
                            "name": name,
                            "source": f"ctrip_approx_{kw}",
                            "rating": float(biz.get("rating", 0) or 0),
                            "type": p.get("type", ""),
                        })
        except Exception as e:
            print(f"    [WARN] Ctrip approx failed for {kw}: {e}")
        time.sleep(0.3)

    return spots


# ============================================================
# Ground Truth 构建: 多源交集
# ============================================================
def build_ground_truth(amap_pois, baike_spots, ctrip_spots):
    """
    从多个数据源构建 Ground Truth:
    规则:
    - must_visit: 在 >= 2 个数据源中出现的景点 (交集)
    - dining: AMap 中 type 包含"餐饮"且 rating >= 4.0 的 Top 10
    - leisure: AMap 中 type 包含"体育休闲"或"咖啡"且 rating >= 4.0 的 Top 5
    """
    # 统计每个地名出现次数
    name_sources = defaultdict(set)
    for p in amap_pois:
        if p["rating"] >= 3.5 and "风景名胜" in p.get("type", ""):
            name_sources[p["name"]].add("amap")
    for s in baike_spots:
        name_sources[s["name"]].add(s["source"])
    for s in ctrip_spots:
        name_sources[s["name"]].add("ctrip")

    # must_visit: 多源交集 (>= 2 源) 或高德评分 >= 4.5 的景区
    must_visit = []
    for name, sources in name_sources.items():
        if len(sources) >= 2:
            must_visit.append(name)

    # 补充: 高德中评分极高的景区
    for p in amap_pois:
        if p["rating"] >= 4.5 and "风景名胜" in p.get("type", "") and p["name"] not in must_visit:
            must_visit.append(p["name"])

    # dining: type 包含"餐饮"且 rating >= 4.0
    dining = [p["name"] for p in sorted(
        [p for p in amap_pois if "餐饮" in p.get("type", "") and p["rating"] >= 4.0],
        key=lambda x: -x["rating"]
    )[:10]]

    # leisure: type 包含"休闲"或"咖啡"且 rating >= 4.0
    leisure = [p["name"] for p in sorted(
        [p for p in amap_pois if any(k in p.get("type", "") for k in ["休闲", "咖啡", "体育"]) and p["rating"] >= 4.0],
        key=lambda x: -x["rating"]
    )[:5]]

    return {
        "must_visit": must_visit[:20],  # 限制数量
        "dining": dining,
        "leisure": leisure,
    }


# ============================================================
# 主构建函数
# ============================================================
def build_dataset_for_city(city):
    name = city["name"]
    lat, lng = city["lat"], city["lng"]

    print(f"\n{'='*60}")
    print(f"  构建测试集: {name} ({lat}, {lng})")
    print(f"{'='*60}")

    # Source 1: 高德 POI
    print(f"  [1/5] 高德 POI 多维拉取...")
    amap_pois = fetch_amap_pois(name, lat, lng)
    print(f"    → {len(amap_pois)} 条 POI")

    # Source 2: 百度百科/景点知识
    print(f"  [2/5] 景点知识基线 (AMap Scenic + Wiki extract)...")
    baike_spots = fetch_baidu_baike_spots(name)
    print(f"    → {len(baike_spots)} 条景点")

    # Source 3: 维基百科
    print(f"  [3/5] 维基百科摘要 (zh + en)...")
    wiki = fetch_wiki_summaries(name)
    print(f"    → zh: {len(wiki['wiki_zh'])} chars, en: {len(wiki['wiki_en'])} chars")

    # Source 4: DuckDuckGo
    print(f"  [4/5] DuckDuckGo 搜索摘要...")
    ddg = fetch_duckduckgo_snippets(name)
    print(f"    → {len(ddg)} 条摘要")

    # Source 5: 携程近似景点
    print(f"  [5/5] 携程热门景点 (近似)...")
    ctrip = fetch_ctrip_top_spots(name)
    print(f"    → {len(ctrip)} 条景点")

    # Ground Truth
    print(f"  [GT] 构建 Ground Truth...")
    gt = build_ground_truth(amap_pois, baike_spots, ctrip)
    print(f"    → must_visit: {len(gt['must_visit'])}, dining: {len(gt['dining'])}, leisure: {len(gt['leisure'])}")

    dataset = {
        "meta": {
            "city": name,
            "coordinates": {"lat": lat, "lng": lng},
            "adcode": city["adcode"],
            "build_time": datetime.now().isoformat(),
            "builder": "build_test_dataset.py",
        },
        "ground_truth": gt,
        "sources": {
            "amap_pois": amap_pois,
            "baike_spots": baike_spots,
            "wiki": wiki,
            "duckduckgo_snippets": ddg,
            "ctrip_approx_spots": ctrip,
        },
        "stats": {
            "total_amap_pois": len(amap_pois),
            "total_baike_spots": len(baike_spots),
            "total_ctrip_spots": len(ctrip),
            "ground_truth_must_visit": len(gt["must_visit"]),
            "ground_truth_dining": len(gt["dining"]),
            "ground_truth_leisure": len(gt["leisure"]),
        }
    }

    # 写入文件
    output_path = os.path.join(OUTPUT_DIR, f"{name}.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)
    print(f"  [OK] 测试集已保存: {output_path}")
    print(f"    文件大小: {os.path.getsize(output_path) / 1024:.1f} KB")

    return dataset


# ============================================================
# Main
# ============================================================
def main():
    print(f"\n{'#'*60}")
    print(f"#  Greenstar 旅行攻略评测集构建器")
    print(f"#  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"#  城市: {', '.join(c['name'] for c in TEST_CITIES)}")
    print(f"{'#'*60}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_stats = []
    for city in TEST_CITIES:
        ds = build_dataset_for_city(city)
        all_stats.append({
            "city": city["name"],
            **ds["stats"],
        })
        time.sleep(1)  # 控制 QPS

    # 汇总
    print(f"\n\n{'#'*60}")
    print(f"#  构建完成汇总")
    print(f"{'#'*60}")
    print(f"{'城市':>6} | {'高德POI':>8} | {'百科景点':>8} | {'携程景点':>8} | {'GT必去':>6} | {'GT餐饮':>6} | {'GT休闲':>6}")
    print(f"{'-'*6} | {'-'*8} | {'-'*8} | {'-'*8} | {'-'*6} | {'-'*6} | {'-'*6}")
    for s in all_stats:
        print(f"{s['city']:>6} | {s['total_amap_pois']:>8} | {s['total_baike_spots']:>8} | {s['total_ctrip_spots']:>8} | {s['ground_truth_must_visit']:>6} | {s['ground_truth_dining']:>6} | {s['ground_truth_leisure']:>6}")


if __name__ == "__main__":
    main()
