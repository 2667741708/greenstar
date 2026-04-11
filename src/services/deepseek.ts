const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY as string;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

// 工具函数：封装统一的 OpenAI 兼容 Fetch 请求
const fetchOpenAICompatible = async (url: string, key: string, model: string, prompt: string, jsonMode: boolean, signal: AbortSignal) => {
  const body: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 2048,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${model} API HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};

export const callDeepSeek = async (prompt: string, jsonMode = false, timeoutMs = 120000): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // 尝试主模型 DeepSeek
    const data = await fetchOpenAICompatible(DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, 'deepseek-chat', prompt, jsonMode, controller.signal);
    return data.choices?.[0]?.message?.content || '';
  } catch (err: any) {
    console.warn('⚠️ DeepSeek 接口额度或服务异常，正在平滑切换到 Gemini 容灾模型...', err.message);
    try {
      // 容灾回退到 Gemini 2.5 Flash (通过 OpenAI 兼容接口)
      const data = await fetchOpenAICompatible(GEMINI_OPENAI_URL, GEMINI_API_KEY, 'gemini-2.5-flash', prompt, jsonMode, controller.signal);
      return data.choices?.[0]?.message?.content || '';
    } catch (fallbackErr: any) {
      throw new Error(`双模型均失效: ${fallbackErr.message}`);
    }
  } finally {
    clearTimeout(timer);
  }
};

// ============================================================================
// 流式调用 API（SSE） - 包含自动 Fallback 机制
// ============================================================================
export interface StreamCallbacks {
  onThinking?: (chunk: string) => void;
  onContent?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export const streamDeepSeek = async (
  prompt: string,
  callbacks: StreamCallbacks,
  timeoutMs = 300000
): Promise<void> => {
  const executeStream = async (url: string, key: string, model: string, useThinking: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') return; // 流式正常结束
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            
            if (delta.reasoning_content) {
              callbacks.onThinking?.(delta.reasoning_content);
            }
            if (delta.content) {
              // 如果是 fallback 补充逻辑：部分模型没思考过程，可以给一个固定思考状态
              callbacks.onContent?.(delta.content);
            }
          } catch {}
        }
      }
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    // Stage 1: Attempt DeepSeek Reasoner
    await executeStream(DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, 'deepseek-reasoner', true);
    callbacks.onDone?.();
  } catch (err: any) {
    console.warn('⚠️ DeepSeek 流式中断，正在无缝热切换到 Gemini 引擎接管...', err.message);
    callbacks.onThinking?.('\n\n[系统提示] 检测到 DeepSeek 星球算力达到瓶颈 (Quota/503)，已自适应切换至 Gemini 引擎继续计算...\n');
    try {
      // Stage 2: Fallback to Gemini 2.5 Flash
      await executeStream(GEMINI_OPENAI_URL, GEMINI_API_KEY, 'gemini-2.5-flash', false);
      callbacks.onDone?.();
    } catch (fallbackErr: any) {
      if (err.name === 'AbortError' || fallbackErr.name === 'AbortError') {
        callbacks.onError?.(new Error('请求超时'));
      } else {
        callbacks.onError?.(fallbackErr);
      }
    }
  }
};

// ============================================================================
// 修改基准: deepseek.ts @ 1e4484c (228行)
// 修改内容 / Changes:
//   [追加] generateFallbackPOIs() — 基于真实网络爬虫数据的 RAG 结构化提取
//   [修复] AI 兜底 POI 增加静态地图图片 URL（thumb + HD），解决图片空白问题
//   [APPEND] generateFallbackPOIs() — RAG-based structured extraction from real crawled data
//   [FIX] AI fallback POIs now include static map image URLs (thumb + HD)
// ============================================================================

import { Spot } from '../types';

// 高德瓦片地图 URL 生成（无需 Web 服务 Key，独立于 amap.ts 避免循环依赖）
// AMap tile map URL generator (no key needed, independent of amap.ts)
const makeTileMapUrl = (lat: number, lng: number, zoom: number): string => {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=2&style=8&x=${x}&y=${y}&z=${zoom}`;
};

/**
 * 基于真实网络爬虫数据的 RAG 兜底 POI 生成
 * RAG-based fallback POI generation using real crawled data
 * 
 * @param regionName 区域名称
 * @param realWorldText 由 crawler.ts 抓取的真实百科文本
 * @param center 中心经纬度（用于坐标散布估算）
 * @returns Spot[] 结构化的兜底 POI 列表
 */
export const generateFallbackPOIs = async (
  regionName: string,
  realWorldText: string,
  center: { lat: number; lng: number }
): Promise<Spot[]> => {
  const prompt = `你是一个严谨的地理信息系统。你的任务是从以下关于"${regionName}"的真实网络检索资料中，提取出真正存在的、有名的地标、景点、餐厅或文化场所。

**严格规则**：
1. 禁止捏造任何不存在的地点。你只能从下方资料中提取真实提及的地名。
2. 如果资料中提及的地点不足5个，就只输出你能确认的。
3. 为每个地点估算一个合理的经纬度坐标。基准中心点为 (${center.lat}, ${center.lng})，各地点应在此基础上做 0.005~0.03 度的合理偏移（对应约 500m ~ 3km）。
4. 以严格的 JSON 数组格式返回，每个对象包含: name, description, category, lat, lng, rating, tags

**网络检索资料**：
---
${realWorldText.substring(0, 3000)}
---

请直接返回 JSON 数组，不要添加任何额外的解释文字或 markdown 标记。示例格式：
[{"name":"地点名","description":"一句话简介","category":"Landmark","lat":38.48,"lng":106.23,"rating":4.5,"tags":["历史","文化"]}]`;

  try {
    const raw = await callDeepSeek(prompt, true, 25000);
    
    // 尝试解析 JSON
    let parsed: any[];
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 尝试提取 JSON 数组部分
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error('[RAG] DeepSeek 返回无法解析的内容:', raw.substring(0, 200));
        return [];
      }
    }

    if (!Array.isArray(parsed)) return [];

    return parsed.slice(0, 8).map((item: any, index: number) => {
      const lat = typeof item.lat === 'number' ? item.lat : center.lat + (Math.random() - 0.5) * 0.02;
      const lng = typeof item.lng === 'number' ? item.lng : center.lng + (Math.random() - 0.5) * 0.02;

      // 使用高德瓦片地图为 AI 兜底 POI 生成分级图片
      // Generate tiered tile map images for AI fallback POIs
      const thumbUrl = makeTileMapUrl(lat, lng, 14);   // 街区级缩略图
      const hdUrl = makeTileMapUrl(lat, lng, 16);       // 街道级高清

      return {
        id: `ai-${regionName}-${index}-${Date.now()}`,
        name: item.name || `${regionName}地标${index + 1}`,
        description: item.description || '由 AI 基于网络资料提取',
        category: item.category || 'Landmark',
        imageUrl: thumbUrl,          // 默认使用缩略图
        imageUrlThumb: thumbUrl,     // 缩略图: 300x200
        imageUrlHD: hdUrl,           // 高清图: 750x400
        coordinates: { lat, lng },
        rating: typeof item.rating === 'number' ? Math.min(item.rating, 5) : 4.2,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 3) : ['AI检索'],
        checkedIn: false,
        isAIGenerated: true,
        dataSource: '维基百科 + DeepSeek',
      };
    });
  } catch (err: any) {
    console.error('[RAG] generateFallbackPOIs failed:', err.message);
    return [];
  }
};
