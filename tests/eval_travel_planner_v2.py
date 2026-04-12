#!/usr/bin/env python3
# ============================================================================
# 文件: tests/eval_travel_planner_v2.py
# 基准版本: eval_travel_planner.py
# 修改内容 / Changes:
#   [改进] 评估前用高德文本搜索补充 GT 中的地点到 POI 池
#   [改进] 增加"增强前 vs 增强后"对比表
#   [NEW] Pre-eval POI pool expansion: search GT locations via AMap text search
#   [NEW] Before/after comparison table
# ============================================================================

import json
import os
import math
import requests
import time
from datetime import datetime
from collections import defaultdict

DATASET_DIR = os.path.join(os.path.dirname(__file__), "datasets")
AMAP_KEY = "0e59aae0d84f39b4665eba7acc9f49a9"

# === 推荐引擎 (与 eval_travel_planner.py 一致, 省略重复代码) ===
# 直接导入原有模块
import sys
sys.path.insert(0, os.path.dirname(__file__))
from eval_travel_planner import (
    run_recommend_engine, eval_coverage, eval_precision,
    eval_route_logic, eval_richness, eval_diversity
)


def expand_poi_pool(city_name, amap_pois, gt_names):
    """
    用高德文本搜索补充 GT 中提到但不在 around 搜索范围内的地点
    这模拟了 PlanPanel 中 searchPOIPaginated 的全城搜索行为
    """
    existing_names = {p["name"] for p in amap_pois}
    expanded_pois = list(amap_pois)  # 复制
    added = 0

    for gt_name in gt_names:
        # 跳过已有的
        if any(gt_name in n or n in gt_name for n in existing_names):
            continue

        try:
            resp = requests.get("https://restapi.amap.com/v3/place/text", params={
                "key": AMAP_KEY,
                "keywords": gt_name,
                "city": city_name,
                "offset": 3,
                "extensions": "all",
            }, timeout=10)
            data = resp.json()
            pois = data.get("pois", [])
            if pois:
                p = pois[0]
                biz = p.get("biz_ext") or {}
                location = p.get("location", "0,0").split(",")
                photos = p.get("photos") or []
                expanded_pois.append({
                    "name": p.get("name", gt_name),
                    "address": p.get("address", ""),
                    "type": p.get("type", ""),
                    "rating": float(biz.get("rating", 0) or 0),
                    "cost": biz.get("cost", ""),
                    "open_time": biz.get("opentime2", ""),
                    "tel": p.get("tel", ""),
                    "photos_count": len(photos),
                    "distance": 0,
                    "coordinates": {"lng": float(location[0]), "lat": float(location[1])},
                    "source": "gt_expansion",
                })
                existing_names.add(p.get("name", gt_name))
                added += 1
        except:
            pass
        time.sleep(0.15)

    return expanded_pois, added


def evaluate_city_v2(dataset_path):
    """增强版评估: 扩展 POI 池 + 前后对比"""
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    city = data["meta"]["city"]
    gt = data["ground_truth"]
    original_gt = data.get("ground_truth_original", gt)
    amap_pois = data["sources"]["amap_pois"]

    all_gt_names = gt.get("must_visit", []) + gt.get("dining", []) + gt.get("leisure", [])
    all_orig_gt = original_gt.get("must_visit", []) + original_gt.get("dining", []) + original_gt.get("leisure", [])

    # --- Baseline: 原始 POI 池 + 原始 GT ---
    ranked_baseline = run_recommend_engine(amap_pois, quality_only=True)
    baseline_names = [r["name"] for r in ranked_baseline]
    baseline = {
        "coverage": eval_coverage(baseline_names, all_orig_gt),
        "precision": eval_precision(baseline_names, all_orig_gt),
        "route_logic": eval_route_logic(ranked_baseline[:20]),
        "richness": eval_richness(ranked_baseline),
        "diversity": eval_diversity(ranked_baseline),
        "count": len(ranked_baseline),
        "gt_count": len(all_orig_gt),
    }

    # --- Enhanced: 扩展 POI 池 + AI 增强 GT ---
    print(f"  [扩展] 补充 GT 中的缺失地点...")
    expanded_pois, added = expand_poi_pool(city, amap_pois, all_gt_names)
    print(f"    补充了 {added} 条新 POI (总计 {len(expanded_pois)})")

    ranked_enhanced = run_recommend_engine(expanded_pois, quality_only=True)
    enhanced_names = [r["name"] for r in ranked_enhanced]
    enhanced = {
        "coverage": eval_coverage(enhanced_names, all_gt_names),
        "precision": eval_precision(enhanced_names, all_gt_names),
        "route_logic": eval_route_logic(ranked_enhanced[:20]),
        "richness": eval_richness(ranked_enhanced),
        "diversity": eval_diversity(ranked_enhanced),
        "count": len(ranked_enhanced),
        "gt_count": len(all_gt_names),
    }

    # 加权总分
    weights = {"coverage": 0.25, "precision": 0.25, "route_logic": 0.20, "richness": 0.15, "diversity": 0.15}
    for d in [baseline, enhanced]:
        d["total"] = sum(d[k] * weights[k] for k in weights)

    # GT 命中详情
    gt_detail = {}
    for cat in ["must_visit", "dining", "leisure"]:
        gt_list = gt.get(cat, [])
        hits = [g for g in gt_list if any(g in r or r in g for r in enhanced_names)]
        misses = [g for g in gt_list if g not in hits]
        gt_detail[cat] = {"hits": hits, "misses": misses, "total": len(gt_list)}

    return {
        "city": city,
        "baseline": baseline,
        "enhanced": enhanced,
        "gt_detail": gt_detail,
        "top10": [{"name": r["name"], "score": round(r["score"], 1), "scene": r["scene"]} for r in ranked_enhanced[:10]],
    }


def main():
    print(f"\n{'#'*65}")
    print(f"#  Greenstar 旅游攻略评估 V2 (AI增强GT + POI池扩展)")
    print(f"#  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#'*65}")

    results = []
    for fname in sorted(os.listdir(DATASET_DIR)):
        if fname.endswith(".json") and "report" not in fname:
            path = os.path.join(DATASET_DIR, fname)
            print(f"\n  评估: {fname}")
            r = evaluate_city_v2(path)
            results.append(r)
            b, e = r["baseline"], r["enhanced"]
            print(f"    Baseline: 总分={b['total']:.2f} 覆盖={b['coverage']:.2f} 准确={b['precision']:.2f}")
            print(f"    Enhanced: 总分={e['total']:.2f} 覆盖={e['coverage']:.2f} 准确={e['precision']:.2f}")

    # 生成对比报告
    lines = []
    lines.append("# Greenstar 旅游攻略评估报告 V2 (AI增强)")
    lines.append("")
    lines.append(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**改进**: AI 增强 Ground Truth + POI 池反向扩展")
    lines.append("")

    # 对比总表
    lines.append("## Baseline vs Enhanced 对比")
    lines.append("")
    lines.append("| 城市 | 版本 | 总分 | 覆盖率 | 准确率 | 路线 | 丰富 | 多样 | POI数 | GT数 |")
    lines.append("|------|------|------|--------|--------|------|------|------|-------|------|")
    for r in results:
        b, e = r["baseline"], r["enhanced"]
        lines.append(f"| {r['city']} | Baseline | {b['total']:.2f} | {b['coverage']:.2f} | {b['precision']:.2f} | {b['route_logic']:.2f} | {b['richness']:.2f} | {b['diversity']:.2f} | {b['count']} | {b['gt_count']} |")
        delta = e['total'] - b['total']
        sign = "+" if delta >= 0 else ""
        lines.append(f"| | **Enhanced** | **{e['total']:.2f}** ({sign}{delta:.2f}) | {e['coverage']:.2f} | {e['precision']:.2f} | {e['route_logic']:.2f} | {e['richness']:.2f} | {e['diversity']:.2f} | {e['count']} | {e['gt_count']} |")

    avg_b = sum(r["baseline"]["total"] for r in results) / len(results)
    avg_e = sum(r["enhanced"]["total"] for r in results) / len(results)
    lines.append("")
    lines.append(f"**平均总分: Baseline {avg_b:.2f} → Enhanced {avg_e:.2f} ({'+' if avg_e>=avg_b else ''}{avg_e-avg_b:.2f})**")

    # 每城市 GT 命中详情
    for r in results:
        lines.append("")
        lines.append(f"---")
        lines.append(f"## {r['city']} GT 命中详情")
        for cat, label in [("must_visit","必去景点"), ("dining","餐饮"), ("leisure","休闲")]:
            d = r["gt_detail"].get(cat, {})
            hits = d.get("hits", [])
            misses = d.get("misses", [])
            total = d.get("total", 0)
            rate = len(hits)*100//total if total else 0
            lines.append(f"### {label} ({len(hits)}/{total}, {rate}%)")
            if hits: lines.append(f"- 命中: {', '.join(hits[:15])}")
            if misses: lines.append(f"- 未命中: {', '.join(misses[:15])}")
            lines.append("")

    report_path = os.path.join(DATASET_DIR, "eval_report_v2.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"\n  报告已保存: {report_path}")

    # 终端汇总
    print(f"\n{'='*65}")
    print(f"  Baseline → Enhanced 变化")
    print(f"{'='*65}")
    print(f"  {'城市':>6} | {'B总分':>6} | {'E总分':>6} | {'Δ':>6} | {'B覆盖':>5} | {'E覆盖':>5} | {'B准确':>5} | {'E准确':>5}")
    print(f"  {'-'*6} | {'-'*6} | {'-'*6} | {'-'*6} | {'-'*5} | {'-'*5} | {'-'*5} | {'-'*5}")
    for r in results:
        b, e = r["baseline"], r["enhanced"]
        d = e["total"] - b["total"]
        print(f"  {r['city']:>6} | {b['total']:>6.2f} | {e['total']:>6.2f} | {d:>+6.2f} | {b['coverage']:>5.2f} | {e['coverage']:>5.2f} | {b['precision']:>5.2f} | {e['precision']:>5.2f}")


if __name__ == "__main__":
    main()
