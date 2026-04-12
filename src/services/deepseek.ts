// ============================================================================
// 文件: src/services/deepseek.ts
// 修改基准: 之前的 OpenAI 兼容版本 (因 OpenAI 桥接层在 Free Tier 下常报 429 Limit 0)
// 修改内容 / Changes:
//   [重构] 核心 Gemini 调用逻辑改为使用 Google 原生接口 (/v1beta/models/:generateContent)
//   [新增] fetchNativeGemini() 与 executeNativeStream() 支持原生流式解析
//   [修复] 解决 OpenAI 桥接模式下常见的 HTTP 429 Quota Exceeded 伪报错问题
//   [REFAC] Migrated Gemini calls to Native Google API to bypass OpenAI bridge quota bugs
//   [NEW] fetchNativeGemini() & executeNativeStream() with native response parsing
//   [FIX] Resolved deceptive HTTP 429 errors from OpenAI-compatible endpoint
// ============================================================================
import { getLLMSettings } from './llmSettings';
import { Spot } from '../types';

const _getGeminiKey    = () => getLLMSettings().geminiKey;
const _getDeepSeekKey  = () => getLLMSettings().deepseekKey;
const _getGeminiModel  = () => getLLMSettings().geminiModel;
const _getProvider     = () => getLLMSettings().provider;

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// ── 工具函数：原生 Gemini 请求 ─────────────────────────────
const fetchNativeGemini = async (model: string, key: string, prompt: string, jsonMode: boolean, signal: AbortSignal) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    }
  };
  if (jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Native API HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

// ── 工具函数：OpenAI 兼容请求 (用于 DeepSeek) ──────────────
const fetchOpenAICompatible = async (url: string, key: string, model: string, prompt: string, jsonMode: boolean, signal: AbortSignal) => {
  const body: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 2048,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

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
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
};

export const callDeepSeek = async (prompt: string, jsonMode = false, timeoutMs = 120000): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const provider = _getProvider();

  try {
    if (provider === 'google') {
      // 原生 Gemini 调用
      return await fetchNativeGemini(_getGeminiModel(), _getGeminiKey(), prompt, jsonMode, controller.signal);
    } else {
      try {
        return await fetchOpenAICompatible(DEEPSEEK_BASE_URL, _getDeepSeekKey(), 'deepseek-chat', prompt, jsonMode, controller.signal);
      } catch (err: any) {
        console.warn('[Warning] DeepSeek 异常，切换到 Gemini 容灾...', err.message);
        return await fetchNativeGemini(_getGeminiModel(), _getGeminiKey(), prompt, jsonMode, controller.signal);
      }
    }
  } catch (err: any) {
    throw new Error(`LLM 调用失败: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
};

// ── 流式解析 ───────────────────────────────────────────────
export interface StreamCallbacks {
  onThinking?: (chunk: string) => void;
  onContent?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

const executeNativeStream = async (model: string, key: string, prompt: string, callbacks: StreamCallbacks, signal: AbortSignal) => {
  // 注意：原生流式接口是 streamGenerateContent
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    }),
    signal,
  });

  if (!res.ok) throw new Error(`Native Gemini HTTP ${res.status}`);

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
      
      try {
        const jsonStr = trimmed.slice(6);
        const parsed = JSON.parse(jsonStr);
        // 原生返回结构: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) callbacks.onContent?.(text);
      } catch (e) {}
    }
  }
};

const executeOpenAIStream = async (url: string, key: string, model: string, prompt: string, callbacks: StreamCallbacks, signal: AbortSignal) => {
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
    signal,
  });

  if (!res.ok) throw new Error(`OpenAI-style HTTP ${res.status}`);

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
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.reasoning_content) callbacks.onThinking?.(delta.reasoning_content);
        if (delta?.content) callbacks.onContent?.(delta.content);
      } catch {}
    }
  }
};

export const streamDeepSeek = async (prompt: string, callbacks: StreamCallbacks, timeoutMs = 300000): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const provider = _getProvider();

  try {
    if (provider === 'google') {
      await executeNativeStream(_getGeminiModel(), _getGeminiKey(), prompt, callbacks, controller.signal);
      callbacks.onDone?.();
    } else {
      try {
        await executeOpenAIStream(DEEPSEEK_BASE_URL, _getDeepSeekKey(), 'deepseek-reasoner', prompt, callbacks, controller.signal);
        callbacks.onDone?.();
      } catch (err: any) {
        console.warn('[Warning] DeepSeek 流式中断，正在切换到 Gemini 原生引擎...', err.message);
        callbacks.onThinking?.('\n\n[系统提示] 检测到 DeepSeek 星球算力达到瓶颈，已切换至 Gemini 原生引擎继续计算...\n');
        await executeNativeStream(_getGeminiModel(), _getGeminiKey(), prompt, callbacks, controller.signal);
        callbacks.onDone?.();
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') callbacks.onError?.(new Error('请求超时'));
    else callbacks.onError?.(err);
  } finally {
    clearTimeout(timer);
  }
};

// ── 以下保持原有 RAG 逻辑 ──────────────────────────────────
const makeTileMapUrl = (lat: number, lng: number, zoom: number): string => {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=2&style=8&x=${x}&y=${y}&z=${zoom}`;
};

export const generateFallbackPOIs = async (regionName: string, center: { lat: number; lng: number }): Promise<Spot[]> => {
  const prompt = `你是一名资深世界旅行家。请作为高精度的数据引擎，利用你对【${regionName}】的世界知识储备，返回当地前 10 个绝不可错过的打卡名胜/探险地点。请直接返回 JSON 数组格式，不要附加 Markdown：\n[{"name":"中文名","description":"文艺短评","category":"Landmark","lat":38.48,"lng":106.23,"rating":4.5,"tags":["历史","文化"]}]`;
  try {
    const raw = await callDeepSeek(prompt, true, 20000);
    const match = raw.match(/\[[\s\S]*\]/);
    let parsed: any[] = JSON.parse(match ? match[0] : raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any, index: number) => ({
      id: `aigc-${regionName}-${index}-${Date.now()}`,
      name: item.name || `${regionName}地标${index + 1}`,
      description: item.description || '由 AI 凭空提取',
      category: item.category || 'Landmark',
      imageUrl: '', imageUrlThumb: '', imageUrlHD: '',
      coordinates: { lat: item.lat || center.lat, lng: item.lng || center.lng },
      rating: item.rating || 4.8,
      tags: item.tags || ['AI检索'],
      checkedIn: false,
      isAIGenerated: true,
      dataSource: '大模型常识库',
    }));
  } catch { return []; }
};

export const refinePOIsWithAI = async (spots: Spot[], cityName: string): Promise<Spot[]> => {
  if (spots.length === 0) return [];
  const extracted = spots.map(s => ({ id: s.id, name: s.name, category: s.category || '', type: s.tags.join(' ') }));
  const prompt = `作为资深旅行家，请从【${cityName}】的候选地点中选择最优质的 20-25 个地标：\n${JSON.stringify(extracted)}\n按 JSON 格式返回：{"refined_spots": [{"id":"原ID","ai_description":"文案","group":"must_visit|dining|leisure"}]}`;
  try {
    const raw = await callDeepSeek(prompt, true, 25000);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    const refineList = parsed.refined_spots || [];
    const finalSpots: Spot[] = [];
    for (const res of refineList) {
      const sp = spots.find(s => s.id === res.id);
      if (sp) finalSpots.push({ ...sp, description: res.ai_description || sp.description, isAIGenerated: true, aiGroup: res.group || 'must_visit' });
    }
    return finalSpots.length > 0 ? finalSpots : spots;
  } catch { return spots.slice(0, 30); }
};
