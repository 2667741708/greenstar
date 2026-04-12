// ============================================================================
// 文件: src/services/llmSettings.ts   [NEW]
// 修改基准: 无（全新文件）
// 功能 / Purpose:
//   统一管理用户在「个人设置 → AI 设置」Tab 中配置的 API Key 与模型选项。
//   优先级: localStorage（用户输入）> 编译时环境变量(.env.local) > 内置默认值
//   Priority: localStorage > build-time env > built-in defaults
// ============================================================================

export type LLMProvider = 'google' | 'deepseek';

// 所有支持的 Gemini 模型（含免费配额说明）
// All supported Gemini models with free quota notes
export interface GeminiModelOption {
  id: string;
  label: string;
  freeRPD: number | null;   // null = 无每日硬上限
  freeRPM: number;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash（推荐，免费 1500/天）',  freeRPD: 1500, freeRPM: 15 },
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash（免费 500/天）',         freeRPD: 500,  freeRPM: 10 },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite（免费 1500/天）',   freeRPD: 1500, freeRPM: 30 },
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro（免费 25/天，最强）',       freeRPD: 25,   freeRPM: 5  },
  { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash（免费 1500/天）',        freeRPD: 1500, freeRPM: 15 },
];

export interface LLMSettings {
  provider: LLMProvider;
  geminiKey: string;
  geminiModel: string;   // 选定的 Gemini 模型 ID
  deepseekKey: string;
  amapKey: string;
}

const LS_KEY = 'gs_llm_settings';

// 编译时注入的默认值（来自 .env.local / 环境变量）
// Build-time defaults from .env.local
const ENV_GEMINI_KEY  = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY)
  || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY)
  || '';
const ENV_DEEPSEEK_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEEPSEEK_API_KEY)
  || (typeof process !== 'undefined' && process.env?.DEEPSEEK_API_KEY)
  || '';
// 高德 Key 的硬编码备用值（amap.ts 原始值）
const ENV_AMAP_KEY = '0e59aae0d84f39b4665eba7acc9f49a9';

const DEFAULT_SETTINGS: LLMSettings = {
  provider:    'google',
  geminiKey:   ENV_GEMINI_KEY,
  geminiModel: 'gemini-2.0-flash',   // 默认 2.0 Flash（免费 1500 RPD）
  deepseekKey: ENV_DEEPSEEK_KEY,
  amapKey:     ENV_AMAP_KEY,
};

// ── 读取设置 ────────────────────────────────────────────────
// Read settings from localStorage, falling back to defaults
export const getLLMSettings = (): LLMSettings => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: Partial<LLMSettings> = JSON.parse(raw);
    // 合并：localStorage 缺失字段回退到默认值
    return {
      provider:    parsed.provider    || DEFAULT_SETTINGS.provider,
      geminiKey:   parsed.geminiKey   || DEFAULT_SETTINGS.geminiKey,
      geminiModel: parsed.geminiModel || DEFAULT_SETTINGS.geminiModel,
      deepseekKey: parsed.deepseekKey || DEFAULT_SETTINGS.deepseekKey,
      amapKey:     parsed.amapKey     || DEFAULT_SETTINGS.amapKey,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

// ── 保存设置 ────────────────────────────────────────────────
// Save (partial) settings to localStorage
export const setLLMSettings = (partial: Partial<LLMSettings>): void => {
  const current = getLLMSettings();
  const next = { ...current, ...partial };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('[LLMSettings] Failed to save to localStorage:', e);
  }
};

// ── 快捷获取当前生效的 Key / 模型 ──────────────────────────
// Convenience: get the active key based on selected provider
export const getActiveKey = (): string => {
  const s = getLLMSettings();
  return s.provider === 'google' ? s.geminiKey : s.deepseekKey;
};

export const getActiveModel = (): string => {
  const s = getLLMSettings();
  return s.provider === 'google' ? s.geminiModel : 'deepseek-chat';
};

// ── Gemini Key 校验（轻量，仅调用 models 列表，无 token 消耗）──
// Validate Gemini key by calling the models list endpoint (0 token cost)
export const validateGeminiKey = async (key: string): Promise<{ valid: boolean; modelCount?: number; error?: string }> => {
  if (!key || !key.startsWith('AIza')) {
    return { valid: false, error: 'Key 格式不符，应以 AIza 开头' };
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = await res.json();
    if (!res.ok) {
      return { valid: false, error: data?.error?.message || `HTTP ${res.status}` };
    }
    return { valid: true, modelCount: (data.models || []).length };
  } catch (e: any) {
    return { valid: false, error: e.message || '网络错误' };
  }
};
