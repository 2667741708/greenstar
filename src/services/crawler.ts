// ============================================================================
// 文件: src/services/crawler.ts
// 基准版本: 新建文件（无基线版本）
// 修改内容 / Changes:
//   [新建] 创建基于维基百科中文 API 的实时爬虫服务
//   [NEW] Create real-time crawler service using Chinese Wikipedia API
//   - fetchWikipediaExtracts(): 通过 MediaWiki API 获取城市/地区的百科摘要
//   - fetchRealWorldData(): 组合多关键词进行检索，拼接完整的上下文文本
// ============================================================================

/**
 * 从维基百科中文版抓取指定地区的百科摘要文本
 * Fetch Wikipedia extract for a given region/keyword
 * 
 * 使用 MediaWiki API，支持跨域（origin=*），无需后端代理
 */
const fetchWikipediaExtracts = async (keyword: string): Promise<string> => {
  const url = `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(keyword)}&format=json&origin=*&redirects=1`;
  
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return '';
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return '';
    
    // 取第一个非 -1 的页面
    for (const pageId of Object.keys(pages)) {
      if (pageId !== '-1' && pages[pageId].extract) {
        return pages[pageId].extract;
      }
    }
    return '';
  } catch (err) {
    console.warn('[Crawler] Wikipedia fetch failed for:', keyword, err);
    return '';
  }
};

/**
 * 组合多关键词进行维基百科检索，拼接真实世界数据上下文
 * Combine multiple keyword searches to build rich real-world context
 * 
 * @param regionName 地区名称（如"银川"、"东城区"）
 * @param searchKeyword 用户输入的搜索关键词（可选）
 * @returns 拼接后的真实世界文本上下文
 */
export const fetchRealWorldData = async (regionName: string, searchKeyword?: string): Promise<string> => {
  // 构建多角度检索词：地区本身 + 地区旅游 + 用户关键词
  const queries = [
    regionName,
    `${regionName}旅游`,
  ];
  if (searchKeyword && searchKeyword.trim()) {
    queries.push(`${regionName}${searchKeyword}`);
  }

  const results = await Promise.allSettled(
    queries.map(q => fetchWikipediaExtracts(q))
  );

  const texts: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.trim()) {
      texts.push(r.value.trim());
    }
  }

  if (texts.length === 0) {
    return `未能从网络获取到关于"${regionName}"的详细资料。请基于你的地理知识，列出该地区最知名的真实存在的地标和景点。`;
  }

  return texts.join('\n\n---\n\n');
};
