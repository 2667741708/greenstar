// ============================================================================
// 文件: src/mcp-services/travelContentService.ts
// 基准版本: 新建文件（无基线版本）
// 修改内容 / Changes:
//   [新建] 创建旅行内容聚合 MCP 服务（小红书风格种草笔记 + 搜索引擎摘要）
//   [NEW]  Travel content aggregation MCP service (Xiaohongshu-style notes + search engine summaries)
//   - fetchTravelNotes(): 使用 DeepSeek 生成小红书风格旅行种草笔记
//   - fetchSearchSummary(): 基于 Wikipedia 多语言 API 获取目的地摘要
//   - fetchTravelContent(): 聚合所有数据源，返回丰富的旅行内容上下文
// ============================================================================

import { streamDeepSeek } from '../services/deepseek';

export interface TravelNote {
  title: string;
  content: string;
  tags: string[];
  source: string;
}

export interface TravelContentResult {
  notes: TravelNote[];           // 小红书风格笔记
  wikiSummaryZh: string;         // 中文维基摘要
  wikiSummaryEn: string;         // 英文维基摘要
  searchSnippets: string[];      // 搜索引擎摘要片段
}

/**
 * 使用 DeepSeek AI 生成小红书风格的旅行种草笔记
 * Generate Xiaohongshu-style travel recommendation notes via DeepSeek AI
 * 
 * @param destination 目的地名称
 * @param lang 语言偏好 ('zh' | 'en')
 */
export const fetchTravelNotes = async (destination: string, lang: 'zh' | 'en' = 'zh'): Promise<TravelNote[]> => {
  const prompt = lang === 'zh'
    ? `你现在是一个小红书旅行博主，请为目的地"${destination}"生成3条种草笔记。每条笔记需要包含：
1. 一个吸引眼球的标题（带emoji）
2. 200字左右的正文（口语化、有个人体验感、种草风格）
3. 3-5个相关话题标签（以#开头）

请严格以JSON格式返回，格式如下（不要任何其他文字）：
[{"title":"标题","content":"正文","tags":["#标签1","#标签2"]}]`
    : `You are a travel blogger. Generate 3 travel recommendation posts for "${destination}". Each post needs:
1. An eye-catching title (with emoji)
2. ~200 word body (conversational, personal experience style)
3. 3-5 related hashtags

Return STRICTLY as JSON array (no other text):
[{"title":"title","content":"body","tags":["#tag1","#tag2"]}]`;

  try {
    let fullText = '';
    await streamDeepSeek(prompt, {
      onThinking: () => {},
      onContent: (chunk) => { fullText += chunk; },
      onDone: () => {},
      onError: () => {},
    }, 30000);

    // 提取 JSON 数组
    const jsonMatch = fullText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ title: string; content: string; tags: string[] }>;
      return parsed.map(n => ({
        ...n,
        source: '🔴 小红书风格种草笔记 (AI Generated)',
      }));
    }
    return [];
  } catch (err) {
    console.warn('[TravelContent] AI notes generation failed:', err);
    return [];
  }
};

/**
 * 从维基百科获取中英文双语摘要
 * Fetch bilingual Wikipedia summaries (Chinese + English)
 */
const fetchWikiSummary = async (keyword: string, lang: 'zh' | 'en'): Promise<string> => {
  const domain = lang === 'zh' ? 'zh.wikipedia.org' : 'en.wikipedia.org';
  const url = `https://${domain}/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(keyword)}&format=json&origin=*&redirects=1`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return '';

    for (const pageId of Object.keys(pages)) {
      if (pageId !== '-1' && pages[pageId].extract) {
        // 截取前 500 字符以控制 token 消耗
        return pages[pageId].extract.substring(0, 500);
      }
    }
    return '';
  } catch {
    return '';
  }
};

/**
 * 从 DuckDuckGo Instant Answer API 获取搜索摘要
 * Fetch search snippets from DuckDuckGo Instant Answer API (free, no API key)
 */
const fetchSearchSnippets = async (query: string): Promise<string[]> => {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query + ' travel guide')}&format=json&no_html=1&skip_disambig=1`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();

    const snippets: string[] = [];
    
    // Abstract (主要摘要)
    if (data.Abstract) {
      snippets.push(`📖 ${data.AbstractSource || 'Encyclopedia'}: ${data.Abstract}`);
    }

    // RelatedTopics (相关主题)
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.slice(0, 3).forEach((topic: any) => {
        if (topic.Text) {
          snippets.push(`🔗 ${topic.Text}`);
        }
      });
    }

    return snippets;
  } catch {
    return [];
  }
};

/**
 * 聚合所有旅行内容数据源（对外暴露的主接口）
 * Aggregate all travel content sources (main exported API)
 * 
 * 包含以下 MCP 子服务：
 * 1. 小红书风格 AI 种草笔记 (DeepSeek)
 * 2. 中文维基百科摘要
 * 3. 英文维基百科摘要
 * 4. DuckDuckGo 搜索引擎摘要
 * 
 * @param destination 目的地名称（中文或英文均可）
 */
export const fetchTravelContent = async (destination: string): Promise<TravelContentResult> => {
  const [notes, wikiZh, wikiEn, snippets] = await Promise.allSettled([
    fetchTravelNotes(destination),
    fetchWikiSummary(destination, 'zh'),
    fetchWikiSummary(destination, 'en'),
    fetchSearchSnippets(destination),
  ]);

  return {
    notes: notes.status === 'fulfilled' ? notes.value : [],
    wikiSummaryZh: wikiZh.status === 'fulfilled' ? wikiZh.value : '',
    wikiSummaryEn: wikiEn.status === 'fulfilled' ? wikiEn.value : '',
    searchSnippets: snippets.status === 'fulfilled' ? snippets.value : [],
  };
};
