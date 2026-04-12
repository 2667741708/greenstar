#!/usr/bin/env python3
# ============================================================================
# 文件: tests/enhance_gt_with_ai.py
# 基准版本: 新建文件 (无基线)
# 修改内容 / Changes:
#   [新建] AI 增强 Ground Truth 生成器
#   [NEW] AI-enhanced Ground Truth generator
#
# 策略:
#   1. 用 DeepSeek 对每个城市生成"旅游专家级"必去景点/餐饮/休闲推荐
#   2. 将 AI 推荐与算法 GT 合并去重, 用交叉验证提升 GT 质量
#   3. 用 AI 对原始算法 GT 进行清洗, 剔除非旅游相关条目
#   4. 用高德文本搜索补充 AI 推荐中提到的地点坐标
# ============================================================================

import requests
import json
import os
import time
from datetime import datetime

DEEPSEEK_API_KEY = "sk-6918644b0dca48dfa055712b3957f99a"
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
AMAP_KEY = "0e59aae0d84f39b4665eba7acc9f49a9"
DATASET_DIR = os.path.join(os.path.dirname(__file__), "datasets")


def call_deepseek(prompt, max_tokens=2000):
    """调用 DeepSeek API"""
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.3,  # 低温度, 减少幻觉
    }
    try:
        resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=60)
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"    [ERROR] DeepSeek call failed: {e}")
        return ""


def ai_generate_gt(city_name):
    """
    用 AI 生成高质量 Ground Truth
    分三轮调用, 分别获取景点/餐饮/休闲
    """
    print(f"  [AI-GT] 生成 {city_name} 的旅游专家级推荐...")

    # Round 1: 必去景点
    prompt_scenic = f"""你是一位资深旅游编辑。请列出 {city_name} 最值得游客造访的景点/地标。
要求:
- 只列出真实存在的、游客公认的热门景区和地标
- 覆盖自然景观、历史遗迹、文化场所、网红打卡地
- 不要列出商场、酒店、餐厅
- 数量: 15-20个
- 严格以JSON数组格式返回, 不要任何其他文字

格式: ["景点名1", "景点名2", ...]"""

    # Round 2: 餐饮
    prompt_dining = f"""你是一位美食旅行博主。请列出 {city_name} 游客最值得体验的餐饮店。
要求:
- 只列出真实存在的、有口碑的特色餐饮 (不要连锁快餐/肯德基/麦当劳)
- 覆盖当地特色菜、小吃街、网红餐厅、地道老店
- 数量: 10-15个
- 严格以JSON数组格式返回

格式: ["餐厅名1", "餐厅名2", ...]"""

    # Round 3: 休闲
    prompt_leisure = f"""你是一位城市探索达人。请列出 {city_name} 游客晚上或休闲时间值得去的场所。
要求:
- 包括酒吧街/夜市/LiveHouse/清吧/文创园/特色书店/茶馆/演出场所
- 不要列出健身房、台球厅、网吧等非旅游场所
- 数量: 8-10个
- 严格以JSON数组格式返回

格式: ["场所名1", "场所名2", ...]"""

    results = {}
    for key, prompt in [("must_visit", prompt_scenic), ("dining", prompt_dining), ("leisure", prompt_leisure)]:
        raw = call_deepseek(prompt)
        try:
            # 提取 JSON 数组
            import re
            match = re.search(r'\[[\s\S]*?\]', raw)
            if match:
                items = json.loads(match.group())
                results[key] = [str(x) for x in items]
                print(f"    {key}: {len(results[key])} 条")
            else:
                results[key] = []
                print(f"    {key}: 解析失败 (无JSON数组)")
        except Exception as e:
            results[key] = []
            print(f"    {key}: 解析失败 ({e})")
        time.sleep(1)  # API rate limit

    return results


def ai_clean_gt(city_name, original_gt):
    """
    用 AI 清洗原始算法 GT, 剔除非旅游相关条目
    """
    print(f"  [AI-Clean] 清洗 {city_name} 的原始 GT...")

    all_items = []
    for key in ["must_visit", "dining", "leisure"]:
        for name in original_gt.get(key, []):
            all_items.append({"name": name, "category": key})

    if not all_items:
        return original_gt

    names_str = "\n".join(f"- [{item['category']}] {item['name']}" for item in all_items)

    prompt = f"""以下是 {city_name} 的旅游推荐候选列表。请判断每个条目是否适合作为"旅游推荐"。

候选列表:
{names_str}

判断标准:
- 保留: 游客会感兴趣的景点、特色餐饮、文化体验、夜生活场所
- 剔除: 健身房、台球厅、网吧、普通超市、培训机构、普通住宅、连锁快餐 (肯德基/麦当劳)、便利店、宾馆(非特色酒店)

请返回应该**保留**的条目名称列表, 严格JSON数组格式:
{{"must_visit": ["保留的景点1", ...], "dining": ["保留的餐饮1", ...], "leisure": ["保留的休闲1", ...]}}"""

    raw = call_deepseek(prompt, max_tokens=1500)
    try:
        import re
        match = re.search(r'\{[\s\S]*?\}', raw)
        if match:
            cleaned = json.loads(match.group())
            for key in ["must_visit", "dining", "leisure"]:
                if key in cleaned:
                    print(f"    {key}: {len(original_gt.get(key, []))} → {len(cleaned[key])}")
            return cleaned
    except:
        pass

    print(f"    清洗失败, 保留原始 GT")
    return original_gt


def verify_with_amap(city_name, spot_names):
    """用高德搜索验证 AI 推荐的地点是否真实存在"""
    verified = []
    not_found = []

    for name in spot_names:
        try:
            resp = requests.get("https://restapi.amap.com/v3/place/text", params={
                "key": AMAP_KEY,
                "keywords": name,
                "city": city_name,
                "offset": 3,
                "extensions": "all",
            }, timeout=10)
            data = resp.json()
            pois = data.get("pois", [])

            if pois:
                # 取第一个匹配结果
                p = pois[0]
                biz = p.get("biz_ext") or {}
                location = p.get("location", "0,0").split(",")
                verified.append({
                    "name": p.get("name", name),
                    "original_query": name,
                    "type": p.get("type", ""),
                    "rating": float(biz.get("rating", 0) or 0),
                    "cost": biz.get("cost", ""),
                    "open_time": biz.get("opentime2", ""),
                    "coordinates": {"lng": float(location[0]), "lat": float(location[1])},
                    "address": p.get("address", ""),
                    "verified": True,
                })
            else:
                not_found.append(name)
        except:
            not_found.append(name)
        time.sleep(0.2)

    return verified, not_found


def merge_gt(ai_gt, algo_gt, cleaned_gt):
    """合并 AI GT + 清洗后的算法 GT, 去重"""
    merged = {}
    for key in ["must_visit", "dining", "leisure"]:
        seen = set()
        items = []
        # AI GT 优先
        for name in ai_gt.get(key, []):
            if name not in seen:
                seen.add(name)
                items.append(name)
        # 清洗后的算法 GT 补充
        for name in cleaned_gt.get(key, []):
            if name not in seen and not any(name in s or s in name for s in seen):
                seen.add(name)
                items.append(name)
        merged[key] = items

    return merged


def enhance_city_dataset(dataset_path):
    """增强单个城市的测试集"""
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    city = data["meta"]["city"]
    original_gt = data["ground_truth"]

    print(f"\n{'='*60}")
    print(f"  增强测试集: {city}")
    print(f"{'='*60}")

    # Step 1: AI 生成高质量 GT
    ai_gt = ai_generate_gt(city)

    # Step 2: AI 清洗原始算法 GT
    cleaned_gt = ai_clean_gt(city, original_gt)

    # Step 3: 合并
    merged_gt = merge_gt(ai_gt, original_gt, cleaned_gt)

    print(f"\n  [合并结果]")
    for key in ["must_visit", "dining", "leisure"]:
        orig_count = len(original_gt.get(key, []))
        new_count = len(merged_gt.get(key, []))
        print(f"    {key}: {orig_count} → {new_count}")

    # Step 4: 高德验证 AI 推荐的景点
    print(f"\n  [高德验证] 验证 AI 推荐的景点...")
    all_ai_names = ai_gt.get("must_visit", []) + ai_gt.get("dining", []) + ai_gt.get("leisure", [])
    verified, not_found = verify_with_amap(city, all_ai_names[:30])  # 限制 API 调用
    print(f"    已验证: {len(verified)}/{len(all_ai_names[:30])}")
    if not_found:
        print(f"    未找到: {', '.join(not_found[:10])}")

    # 更新数据集
    data["ground_truth"] = merged_gt
    data["ground_truth_original"] = original_gt  # 保留原始 GT 用于对比
    data["ai_enhancement"] = {
        "ai_generated_gt": ai_gt,
        "cleaned_gt": cleaned_gt,
        "verified_spots": verified,
        "not_found_spots": not_found,
        "enhance_time": datetime.now().isoformat(),
    }

    # 更新统计
    data["stats"]["ground_truth_must_visit"] = len(merged_gt.get("must_visit", []))
    data["stats"]["ground_truth_dining"] = len(merged_gt.get("dining", []))
    data["stats"]["ground_truth_leisure"] = len(merged_gt.get("leisure", []))

    # 写回
    with open(dataset_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  [OK] 增强后测试集已保存")

    return {
        "city": city,
        "original_gt_total": sum(len(original_gt.get(k, [])) for k in ["must_visit", "dining", "leisure"]),
        "enhanced_gt_total": sum(len(merged_gt.get(k, [])) for k in ["must_visit", "dining", "leisure"]),
        "verified": len(verified),
        "not_found": len(not_found),
    }


def main():
    print(f"\n{'#'*60}")
    print(f"#  AI 增强 Ground Truth 生成器")
    print(f"#  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"#  引擎: DeepSeek Chat + 高德验证")
    print(f"{'#'*60}")

    stats_list = []
    for fname in sorted(os.listdir(DATASET_DIR)):
        if fname.endswith(".json") and fname != "eval_report.md":
            path = os.path.join(DATASET_DIR, fname)
            try:
                s = enhance_city_dataset(path)
                stats_list.append(s)
            except Exception as e:
                print(f"  [ERROR] {fname}: {e}")

    # 汇总
    print(f"\n\n{'#'*60}")
    print(f"#  增强完成汇总")
    print(f"{'#'*60}")
    print(f"  {'城市':>6} | {'原始GT':>6} | {'增强GT':>6} | {'已验证':>6} | {'未找到':>6}")
    print(f"  {'-'*6} | {'-'*6} | {'-'*6} | {'-'*6} | {'-'*6}")
    for s in stats_list:
        print(f"  {s['city']:>6} | {s['original_gt_total']:>6} | {s['enhanced_gt_total']:>6} | {s['verified']:>6} | {s['not_found']:>6}")

    total_orig = sum(s["original_gt_total"] for s in stats_list)
    total_new = sum(s["enhanced_gt_total"] for s in stats_list)
    print(f"\n  GT 总量: {total_orig} → {total_new} (+{total_new - total_orig})")


if __name__ == "__main__":
    main()
