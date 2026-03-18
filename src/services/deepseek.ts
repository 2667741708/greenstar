const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY as string;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export const callDeepSeek = async (prompt: string, jsonMode = false, timeoutMs = 30000): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: any = {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
};

// ============================================================================
// 流式调用 DeepSeek API（SSE）
// Streaming call to DeepSeek API with thinking/content chunk callbacks
// ============================================================================
export interface StreamCallbacks {
  onThinking?: (chunk: string) => void;   // 思考过程增量回调
  onContent?: (chunk: string) => void;    // 输出内容增量回调
  onDone?: () => void;                    // 流结束回调
  onError?: (error: Error) => void;       // 错误回调
}

export const streamDeepSeek = async (
  prompt: string,
  callbacks: StreamCallbacks,
  timeoutMs = 120000
): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API ${res.status}: ${err}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // 保留不完整的最后一行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          callbacks.onDone?.();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;
          
          // DeepSeek reasoner 模型: reasoning_content = 思考过程, content = 最终输出
          if (delta.reasoning_content) {
            callbacks.onThinking?.(delta.reasoning_content);
          }
          if (delta.content) {
            callbacks.onContent?.(delta.content);
          }
        } catch {
          // 忽略解析错误的行
        }
      }
    }
    callbacks.onDone?.();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onError?.(new Error('请求超时'));
    } else {
      callbacks.onError?.(err);
    }
  } finally {
    clearTimeout(timer);
  }
};

// ============================================================================
// 修改基准: deepseek.ts (原始版本 36 行)
// 修改内容 / Changes:
//   [追加] generateFallbackPOIs() — 基于真实网络爬虫数据的 RAG 结构化提取
//   [APPEND] generateFallbackPOIs() — RAG-based structured extraction from real crawled data
// ============================================================================

import { Spot } from '../types';

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

    return parsed.slice(0, 8).map((item: any, index: number) => ({
      id: `ai-${regionName}-${index}-${Date.now()}`,
      name: item.name || `${regionName}地标${index + 1}`,
      description: item.description || '由 AI 基于网络资料提取',
      category: item.category || 'Landmark',
      imageUrl: '',
      coordinates: {
        lat: typeof item.lat === 'number' ? item.lat : center.lat + (Math.random() - 0.5) * 0.02,
        lng: typeof item.lng === 'number' ? item.lng : center.lng + (Math.random() - 0.5) * 0.02,
      },
      rating: typeof item.rating === 'number' ? Math.min(item.rating, 5) : 4.2,
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 3) : ['AI检索'],
      checkedIn: false,
      isAIGenerated: true,
      dataSource: '维基百科 + DeepSeek',
    }));
  } catch (err: any) {
    console.error('[RAG] generateFallbackPOIs failed:', err.message);
    return [];
  }
};
