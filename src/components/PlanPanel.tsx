// ============================================================================
// 文件: src/components/PlanPanel.tsx
// 基准版本: PlanPanel.tsx @ 当前版本 (522行)
// 修改内容 / Changes:
//   [重写] 全面重构为流式输出模式，支持 DeepSeek Reasoner 的 thinking + content 双通道
//   [新增] 接收高德 API 返回的 POI 数据作为信源注入 Prompt
//   [新增] 思考过程和输出内容的分区实时渲染
//   [增强] 路线规划信源: 新增 fetchRoutePOIPool 独立拉取 100+ 条 POI (跳过 AI 精选)
//   [增强] POI 注入 prompt 按 must_visit/dining/leisure 三分类结构化输出
//   [REWRITE] Full streaming mode with thinking/content dual-channel display
//   [NEW] AMap POI data injection into DeepSeek prompt as primary data source
//   [ENHANCE] Route POI pool: independent fetch of 100+ POIs via searchPOIPaginated
//   [ENHANCE] POI injected into prompt with 3-category grouping
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Terminal, Rocket, Lightbulb, Pencil, FileText, Heart, CheckCircle2, Map as MapIcon, Compass, Globe, Loader2, Pin, Building, ShoppingBag, Utensils, Coffee, TreePine, Landmark, Beer, Wand2 } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

const STYLE_VARIANTS = [
  { id: 'zen', label: '宁静闲适', icon: '🍃', promptAdd: '行程风格极度放缓，避开人流密集的网红打卡地，多安排茶室、自然景观、寺庙或可发呆的高分静谧之地。' },
  { id: 'sport', label: '燃脂运动', icon: '🏃', promptAdd: '行程主打活力与户外，多安排徒步、骑行、水上运动或极限挑战等高分场地，餐饮考虑轻食或体力补充。' },
  { id: 'retro', label: '怀旧复古', icon: '📻', promptAdd: '侧重城市历史肌理提取，深入老街巷、老字号、古旧建筑和拥有年代感的苍蝇馆子，体验原汁原味的本地市井气息。' },
  { id: 'lazy', label: '慵懒漫卷', icon: '☕', promptAdd: '无痛旅行法：每天睡到自然醒，步数低于一万步。只精选最极致的景观位餐厅和咖啡馆周边闲逛，不要爬山和早起。' },
  { id: 'photo', label: '绝佳出片', icon: '📸', promptAdd: '视觉系旅游指南：只挑最容易出片的极致点位。并对每个景点的最佳视觉光线时段给出极其严格甚至苛刻的指导。' }
];
import { Spot } from '../types';
import { streamDeepSeek } from '../services/deepseek';
import { fetchRealWorldData } from '../services/crawler';
import { searchPOIPaginated } from '../services/amap';
import { CONSTANTS } from '../config/constants';
import RouteVisualizer from './explore/RouteVisualizer';
import { fetchWeatherForecast } from '../mcp-services/weatherService';
import { fetchTravelContent } from '../mcp-services/travelContentService';
import { useUserTier } from '../hooks/useUserTier';
import { monetIcons } from '../config/monetIcons';

interface PlanPanelProps {
  setLoading: (loading: boolean) => void;
  setLoadingStep: (step: string) => void;
  setErrorMsg: (msg: string | null) => void;
  errorMsg: string | null;
  currentSpots?: Spot[];       // 当前城市/区域的高德 POI 数据
  currentCityName?: string;    // 当前城市名称
  currentKeywords?: string[];  // 探索页传来的 3D 主题标签
  onSavePlan?: (content: string, destination: string) => void;
}

export const PlanPanel: React.FC<PlanPanelProps> = ({ 
  setLoading, setLoadingStep, setErrorMsg, errorMsg, currentSpots, currentCityName, currentKeywords, onSavePlan
}) => {
  const [targetDestination, setTargetDestination] = useState(currentCityName || '');
  const [thinking, setThinking] = useState('');
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'drafting' | 'crawling' | 'thinking' | 'writing' | 'done'>('idle');
  const [draftPrompt, setDraftPrompt] = useState<string>('');
  const [hasSaved, setHasSaved] = useState(false);
  const [startPoint, setStartPoint] = useState('');
  const [endPoint, setEndPoint] = useState('');
  const [focusedField, setFocusedField] = useState<'start' | 'end'>('start');
  const { tier } = useUserTier();
  const [showGeekMode, setShowGeekMode] = useState(false);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);

  const thinkingRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (thinkingRef.current && showThinking) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking, showThinking]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  // 当切换城市时自动填入目的地
  useEffect(() => {
    if (currentCityName) setTargetDestination(currentCityName);
  }, [currentCityName]);

  // 生成基础指令给系统或用户审阅
  const generateBaseInstructions = (destination: string, keywords: string[], sp: string, ep: string, variantPrompt?: string): string => {
    const kwStr = keywords.length > 0 
      ? `\n\n【用户探索偏好】：${keywords.join(', ')}\n**重要指示**：用户特别指定了以上主题倾向，请务必在路线规划、餐厅安排中大幅提升这些元素的比重！`
      : '';
    
    const constraintStr = (sp || ep) 
      ? `\n\n【强制起点终点约束】：\n本次路线规划必须严格遵守以下物理空间约束：${sp ? `\n- 起点必须是【${sp}】` : ''}${ep ? `\n- 终点必须是【${ep}】` : ''}\n确保路线不乱折返。`
      : '';

    const variantStr = variantPrompt 
      ? `\n\n【🔥核心游玩情绪风格深度约束🔥】：\n${variantPrompt}\n请务必让所有推荐地点、文案基调和时间线安排无限贴近此风格！不要推荐不符合该风格的常规地点。`
      : '';

    return `你是资深旅游规划师。请基于附加的【真实信源系统】数据，生成专属定制旅游攻略。不要任何废话，直奔主题。保持生成规划的简洁性！

## 规划核心需求
**目的地**: ${destination}${kwStr}${constraintStr}${variantStr}

输出必须严格按照以下 Markdown 分界线分块（使用 "### " 开头）：

### 1. 目的地概览与避坑
当地内核与必须避免的坑（拉客大妈/假特产等）简述。

### 2. 抵达路线说明
机场/高铁站下车后的最优解。

### 3. 星行精研路书（核心）
每天怎么走最顺路？上午/下午/晚上精炼安排，点对点耗时概览。

### 4. 高分赏味与体验指南
基于极高评分黑珍珠/苍蝇馆子，以及符合风格的特种体验。

### 5. 预算速览
2到3天的预算分配概览。

**系统指令**：
- 避免冗长说明，用最短的字说明最大的干货。
- 凡是推荐的真实物理地点（景点、餐厅、酒店等），必须使用 \`【实体名称】\` 包裹（如：前往【宽窄巷子】）。千万不可将非实体词语包裹！`;
  };

  // 依赖监听：当城市或关键词变动时，自动更新草稿
  useEffect(() => {
    if (phase === 'idle' || phase === 'drafting') {
      const dest = currentCityName || '未知星球';
      setTargetDestination(dest);
      setDraftPrompt(generateBaseInstructions(dest, currentKeywords || [], startPoint, endPoint));
      setPhase('drafting');
    }
  }, [currentCityName, currentKeywords, startPoint, endPoint]);

  const startStreamingPlan = async (variantPromptOverride?: string, variantId?: string) => {
    let currentPrompt = draftPrompt;
    if (variantPromptOverride || variantId) {
      const dest = targetDestination || currentCityName || '未知星球';
      currentPrompt = generateBaseInstructions(dest, currentKeywords || [], startPoint, endPoint, variantPromptOverride);
    }
    
    if (!currentPrompt || isStreaming) return;
    
    if (variantId) setActiveVariant(variantId);
    
    setThinking('');
    setContent('');
    setIsStreaming(true);
    setErrorMsg(null);
    setShowThinking(true);
    setHasSaved(false);

    // Step 1: 获取天气预报 MCP 服务数据
    setPhase('crawling');
    setLoadingStep(`[MCP] 正在调用气象局 API 获取 ${targetDestination} 预报...`);
    const forecasts = await fetchWeatherForecast(targetDestination);
    let weatherText = '';
    if (forecasts.length > 0) {
      weatherText = '未来三天天气预报：\n' + forecasts.map(f => `- ${f.date}: ${f.description}, 气温 ${f.temperatureMin}°C ~ ${f.temperatureMax}°C`).join('\n');
    }

    // Step 2: 路线专用 POI 大池拉取 (独立于探索页的 AI 精选结果)
    // Route-specific POI pool: independent large-scale fetch bypassing AI refinement
    // 修改基准: PlanPanel.tsx @ 当前版本
    // 修改内容: 从仅依赖 currentSpots (8-10条) → 独立调用 searchPOIPaginated 拉取 100+ 条原始 POI
    // Changes: From currentSpots (8-10 items) → independent searchPOIPaginated fetch of 100+ raw POIs
    setLoadingStep(`[路线引擎] 正在独立拉取 ${targetDestination} 的大规模地理数据池...`);
    
    let routePOIPool: Spot[] = [];
    const cityCenter = currentSpots && currentSpots.length > 0 
      ? currentSpots[0].coordinates 
      : { lat: 31.2304, lng: 121.4737 }; // fallback 上海
    
    try {
      // 独立拉取: 跳过 AI 精选, 直接获取 3 页 × 50 条 = 最多 150 条原始 POI
      routePOIPool = await searchPOIPaginated(
        targetDestination,
        '',
        cityCenter,
        { maxPages: 3, pageSize: 50 }
      );
      console.log(`[Route POI Pool] 独立拉取到 ${routePOIPool.length} 条原始 POI`);
    } catch (e) {
      console.warn('[Route POI Pool] 独立拉取失败, 回退到 currentSpots:', e);
    }
    
    // 合并: 独立池 + currentSpots (AI精选结果), 去重
    const mergedMap = new Map<string, Spot>();
    routePOIPool.forEach(s => mergedMap.set(s.id, s));
    (currentSpots || []).forEach(s => {
      if (!mergedMap.has(s.id)) mergedMap.set(s.id, s);
      else {
        // AI 精选的描述更优, 覆盖原始描述
        const existing = mergedMap.get(s.id)!;
        mergedMap.set(s.id, { ...existing, description: s.description, aiGroup: s.aiGroup });
      }
    });
    
    const allPOIs = Array.from(mergedMap.values());
    
    // 按三类分组构建结构化 POI 文本
    const groupLabels: Record<string, string> = {
      'must_visit': '必去景点/地标',
      'dining': '餐饮美食体验',
      'leisure': '休闲娱乐场所',
    };
    
    // 标记 AI 精选的放前面, 未精选的按评分排序补充
    const aiTagged = allPOIs.filter(s => s.aiGroup);
    const untagged = allPOIs.filter(s => !s.aiGroup)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 60); // 截断避免 prompt 超长
    
    setLoadingStep(`[路线引擎] 已聚合 ${aiTagged.length} 条AI精选 + ${untagged.length} 条原始POI 注入规划引擎...`);
    
    let poiText = '';
    // 分组输出 AI 精选地点
    if (aiTagged.length > 0) {
      const groups = { must_visit: [] as string[], dining: [] as string[], leisure: [] as string[] };
      aiTagged.forEach((s, i) => {
        const key = (s.aiGroup || 'must_visit') as keyof typeof groups;
        if (groups[key]) {
          groups[key].push(`${s.name} — ${s.description || '无描述'} [评分: ${s.rating}] [标签: ${s.tags.join(', ')}] (AI严选)`);
        }
      });
      for (const [key, items] of Object.entries(groups)) {
        if (items.length > 0) {
          poiText += `\n#### ${groupLabels[key] || key} (AI精选, 最高优先):\n`;
          poiText += items.map((t, i) => `${i + 1}. ${t}`).join('\n');
        }
      }
    }
    // 补充未经 AI 精选的原始高德 POI 作为扩展信源
    if (untagged.length > 0) {
      poiText += `\n\n#### 补充地理实体数据 (高德API原始, 供路线规划参考):\n`;
      poiText += untagged.map((s, i) => 
        `${i + 1}. ${s.name} — ${s.description || '无描述'} [分类: ${s.category}] [评分: ${s.rating}] [标签: ${s.tags.join(', ')}] (高德实体)`
      ).join('\n');
    }

    // Step 3: 抓取网络百科数据
    setLoadingStep(`[MCP] 正在抓取维基百科知识引擎...`);
    let wikiText = '';
    try {
      wikiText = await fetchRealWorldData(targetDestination);
    } catch (e) {
      console.warn('[Plan] Wiki fetch failed:', e);
    }

    // Step 4: 聚合旅行内容 MCP 服务（小红书种草笔记 + 搜索引擎摘要）
    setLoadingStep(`[MCP] 正在抓取旅行攻略数据（小红书风格笔记 + 搜索引擎摘要）...`);
    let travelContentText = '';
    try {
      const travelContent = await fetchTravelContent(targetDestination);
      const parts: string[] = [];
      if (travelContent.notes.length > 0) {
        parts.push('小红书风格种草笔记参考：\n' + travelContent.notes.map((n, i) => `${i+1}. ${n.title}\n${n.content}\n标签：${n.tags.join(' ')}`).join('\n\n'));
      }
      if (travelContent.wikiSummaryEn) {
        parts.push('英文维基百科摘要：\n' + travelContent.wikiSummaryEn);
      }
      if (travelContent.searchSnippets.length > 0) {
        parts.push('搜索引擎摘要片段：\n' + travelContent.searchSnippets.join('\n'));
      }
      travelContentText = parts.join('\n\n');
    } catch (e) {
      console.warn('[Plan] Travel content fetch failed:', e);
    }

    // Step 5: 将底层数据隐式拼接到用户 Prompt 后，开始推流
    const finalPrompt = `${currentPrompt}\n\n---\n## 系统级真实信源系统注入数据（勿向用户展示此段原文）\n\n### 气象预报 MCP 服务（提供穿衣及室内外游玩建议）：\n${weatherText || '无'}\n\n### 高德 API 极速实况探测（最高优先）：\n${poiText || '无'}\n\n### 维基百科知识引擎索引（背景知识）：\n${wikiText || '无'}\n\n### 旅行内容聚合 MCP 服务（含小红书种草 + 搜索引擎知识图谱）：\n${travelContentText || '无'}`;
    setPhase('thinking');
    setLoadingStep('');
    
    await streamDeepSeek(finalPrompt, {
      onThinking: (chunk) => {
        setPhase('thinking');
        setThinking(prev => prev + chunk);
      },
      onContent: (chunk) => {
        setPhase('writing');
        setContent(prev => prev + chunk);
      },
      onDone: () => {
        setPhase('done');
        setIsStreaming(false);
      },
      onError: (error) => {
        setErrorMsg(`[Error] 规划生成失败：${error.message}`);
        setIsStreaming(false);
        setPhase('idle');
      },
    }, 120000);
  };

  const phaseLabel = {
    idle: '',
    drafting: '等待审查并点燃引擎...',
    crawling: '正在抓取数据源...',
    thinking: 'DeepSeek 正在深度思考...',
    writing: '正在生成攻略...',
    done: '攻略生成完成',
  };

  return (
    <div className="flex flex-col h-full pb-20">
      {/* 顶部输入区 */}
      <div className="p-5 md:p-6 space-y-5 shrink-0">
        <h2 className="text-2xl font-black text-slate-800 drop-shadow-sm">AI 智能规划 <span className="text-[var(--color-accent-lilac)]">.</span></h2>
        <div className={`bg-white/40 backdrop-blur-3xl border border-white/40 rounded-[2.5rem] p-7 shadow-[0_8px_32px_rgba(0,0,0,0.08)] relative overflow-hidden transition-all duration-700 ${phase !== 'idle' && phase !== 'drafting' ? 'max-h-[120px] pb-4' : ''}`}>
          <div className="absolute top-0 right-0 p-4 opacity-30 mix-blend-overlay pointer-events-none">
            <img src={monetIcons.robot} className="w-40 h-40 object-contain drop-shadow-2xl" alt="robot" />
          </div>
          
          <div className="flex justify-between items-center mb-4 relative z-10">
            <h3 className="text-[13px] font-black text-slate-700 uppercase tracking-widest">设定下个目的地</h3>
            {phase !== 'idle' && phase !== 'drafting' && (
              <span className="text-xs bg-[var(--color-accent-lilac)]/20 text-[var(--color-accent-lilac)] px-3 py-1 rounded-full font-bold">
                已锁定引擎
              </span>
            )}
          </div>
          
          <div className="relative group z-10">
            <input 
              type="text" 
              value={targetDestination} 
              onChange={e => setTargetDestination(e.target.value)} 
              placeholder="例如：成都..." 
              className="w-full bg-white/50 border border-white/50 text-slate-800 rounded-[1.5rem] py-4 pl-6 pr-14 shadow-inner backdrop-blur-xl outline-none focus:bg-white/80 focus:ring-2 focus:ring-[var(--color-accent-lilac)]/50 transition-all duration-300 ease-out placeholder:text-slate-500 font-medium text-sm" 
              disabled={isStreaming}
            />
          </div>
          <div className="flex gap-3 mt-4 z-10 relative">
            <input 
              type="text" 
              value={startPoint} 
              onChange={e => setStartPoint(e.target.value)} 
              onFocus={() => setFocusedField('start')}
              placeholder="点此选出发地" 
              className={`w-1/2 bg-white/40 border border-white/50 text-slate-800 rounded-[1.2rem] py-3 px-4 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 ease-out placeholder:text-slate-500 font-medium text-xs ${focusedField === 'start' ? 'ring-2 ring-[var(--color-accent-lilac)]/50 bg-white/70' : ''}`}
              disabled={isStreaming}
            />
            <input 
              type="text" 
              value={endPoint} 
              onChange={e => setEndPoint(e.target.value)} 
              onFocus={() => setFocusedField('end')}
              placeholder="点此选目的地" 
              className={`w-1/2 bg-white/40 border border-white/50 text-slate-800 rounded-[1.2rem] py-3 px-4 shadow-inner backdrop-blur-xl outline-none transition-all duration-300 ease-out placeholder:text-slate-500 font-medium text-xs ${focusedField === 'end' ? 'ring-2 ring-[var(--color-accent-lilac)]/50 bg-white/70' : ''}`}
              disabled={isStreaming}
            />
          </div>

          {/* 浮动标签区：高德 POI 实况快捷选择 (在流式输出时隐藏避免干扰视野) */}
          {currentSpots && currentSpots.length > 0 && phase === 'drafting' && (
            <div className="mt-4 flex flex-col gap-2 z-10 relative animate-in fade-in slide-in-from-top-2">
              <span className="text-[11px] text-slate-600 font-bold flex items-center tracking-wide">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[var(--color-accent-lilac)]" /> 热门推荐 · 点击填入{focusedField === 'start' ? '出发地' : '目的地'}:
              </span>
              <div className="flex overflow-x-auto gap-2.5 scrollbar-thin scrollbar-thumb-[var(--color-accent-pink)]/50 pt-1 pb-3 scroll-smooth">
                {[...currentSpots].sort((a, b) => {
                  // 优先级排序：住 > 玩 > 逛 > 其他
                  const getPriority = (s: typeof a) => {
                    if (s.category === 'Hotel' || s.name.includes('酒店') || s.name.includes('宾馆') || s.name.includes('民宿')) return 0;
                    if (s.category === 'Scenic' || s.category === 'Park' || s.category === 'Museum' || s.name.includes('公园') || s.name.includes('博物') || s.name.includes('景')) return 1;
                    if (s.name.includes('广场') || s.name.includes('商场') || s.name.includes('步行街') || s.category === 'Cafe' || s.name.includes('咖啡')) return 2;
                    if (s.category === 'Restaurant' || s.name.includes('餐') || s.name.includes('食')) return 3;
                    return 4;
                  };
                  return getPriority(a) - getPriority(b);
                }).slice(0, 50).map(spot => {
                  let icon = <Pin className="w-3.5 h-3.5 opacity-70" />;
                  if (spot.category === 'Restaurant' || spot.name.includes('餐') || spot.name.includes('食')) icon = <Utensils className="w-3.5 h-3.5 opacity-70" />;
                  else if (spot.category === 'Cafe' || spot.name.includes('咖啡')) icon = <Coffee className="w-3.5 h-3.5 opacity-70" />;
                  else if (spot.category === 'Park' || spot.name.includes('公园')) icon = <TreePine className="w-3.5 h-3.5 opacity-70" />;
                  else if (spot.category === 'Museum' || spot.name.includes('博物')) icon = <Landmark className="w-3.5 h-3.5 opacity-70" />;
                  else if (spot.category === 'Hotel' || spot.name.includes('酒店') || spot.name.includes('宾馆')) icon = <Building className="w-3.5 h-3.5 opacity-70" />;
                  else if (spot.name.includes('酒吧') || spot.name.includes('Live')) icon = <Beer className="w-3.5 h-3.5 opacity-70" />;

                  return (
                    <button 
                      key={spot.id}
                      onClick={() => {
                        if (focusedField === 'start') setStartPoint(spot.name);
                        else setEndPoint(spot.name);
                      }}
                       title={spot.category}
                      className="px-4 py-2 bg-white/60 hover:bg-white border border-white/60 rounded-full text-[12px] text-slate-700 font-semibold backdrop-blur-md transition-all duration-300 ease-out active:scale-95 shadow-sm hover:shadow-md flex items-center gap-1.5"
                    >
                      {icon}
                      {spot.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(phase === 'idle' || phase === 'drafting') && (
            <div className="mt-5 pt-4 border-t border-white/20 flex flex-wrap gap-y-2 items-center justify-between text-slate-500 font-medium text-[11px]">
              <span className="flex items-center"><Compass className="w-4 h-4 mr-1.5" />搭载 {currentSpots?.length || 0} 个高德坐标源</span>
              {currentKeywords && currentKeywords.length > 0 && <span className="flex items-center"><Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />聚焦: {currentKeywords.join(' / ')}</span>}
            </div>
          )}
        </div>

        {/* 新版一键开启或极客模式（持久挂载，流式加载时作为进度条展现） */}
        <div className="flex flex-col gap-4 mt-6">
          <button 
            onClick={() => startStreamingPlan()} 
            disabled={isStreaming || !draftPrompt.trim()}
            className={`w-full py-5 rounded-[1.8rem] text-base font-black transition-all duration-500 ease-out flex items-center justify-center gap-3 shadow-lg 
              ${isStreaming ? 'bg-white text-slate-800 border-2 border-[var(--color-accent-pink)] shadow-none scale-100 cursor-default' : 'bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-[0_12px_24px_rgba(0,0,0,0.15)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.2)] active:scale-[0.97]'} 
              ${(!isStreaming && !draftPrompt.trim()) ? 'opacity-40 grayscale cursor-not-allowed shadow-none active:scale-100' : ''}`}
          >
            {isStreaming ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent-pink)]" />
                <span className="text-[var(--color-accent-pink)] tracking-wide">{phaseLabel[phase] || '运行引擎中...'}</span>
              </div>
            ) : (
              <>
                <img src={monetIcons.rocket} className="w-7 h-7 object-contain drop-shadow-md" alt="rocket" />
                <span className="tracking-wide">一键生成定制攻略卡片</span>
              </>
            )}
          </button>
             
          {phase === 'drafting' && (
            <div className="text-right mt-1">
              <button onClick={() => setShowGeekMode(!showGeekMode)} className="text-[10px] text-slate-500 hover:text-slate-800 transition-colors underline underline-offset-2 cursor-pointer relative z-10">
                {showGeekMode ? '收起底层逻辑' : '极客模式: 编辑微调 Prompt'}
              </button>
            </div>
          )}

          {showGeekMode && phase === 'drafting' && (
            <div className="glass-panel p-6 shadow-lg flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 mt-2 relative z-10">
              <div className="flex justify-between items-center text-slate-700">
                <span className="text-sm font-black flex items-center gap-2"><Terminal className="w-4 h-4 text-[var(--color-accent-lilac)]" />极客模式：Prompt 重写</span>
              </div>
              <textarea 
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                className="w-full bg-white/40 text-slate-700 font-mono text-xs rounded-xl p-4 min-h-[160px] outline-none border border-white/60 focus:border-[var(--color-accent-lilac)] resize-y scrollbar-thin"
                placeholder="手写高级 Prompt..."
                disabled={isStreaming}
              />
            </div>
          )}
        </div>


        {phase === 'done' && (
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> {phaseLabel[phase]}
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-2 text-red-400 hover:text-red-600">关闭</button>
          </div>
        )}
      </div>

      {/* 流式输出双窗口 */}
      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        {/* 思考过程窗口 */}
        {thinking && (
          <div className="bg-white/60 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.06)] rounded-[2rem] overflow-hidden transition-all duration-500 ease-out">
            <button 
              onClick={() => setShowThinking(!showThinking)}
              className="w-full px-6 py-4 flex items-center justify-between text-[13px] font-bold text-slate-600 hover:bg-white/40 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <img src={monetIcons.lightbulb} className={`w-5 h-5 object-contain ${phase === 'thinking' ? 'animate-pulse' : 'opacity-60'}`} alt="bulb" />
                思考微缩模型引擎
                <span className="text-[10px] text-slate-400 ml-2 font-mono px-2 py-0.5 bg-slate-100 rounded-full">{thinking.length} 字</span>
              </span>
              <span className="text-xs font-semibold bg-white/50 px-3 py-1 rounded-full">{showThinking ? '收起折叠' : '展开矩阵'}</span>
            </button>
            {showThinking && (
              <div 
                ref={thinkingRef}
                className="px-7 pb-6 max-h-[30vh] overflow-y-auto text-[12px] text-slate-500 leading-relaxed font-mono whitespace-pre-wrap scrollbar-thin scrollbar-thumb-black/10"
              >
                {thinking}
                {phase === 'thinking' && <span className="inline-block w-1.5 h-4 bg-slate-400 ml-1 animate-pulse align-middle rounded-full"></span>}
              </div>
            )}
          </div>
        )}

        {/* 输出内容窗口 */}
        {content && (
          <div className="monet-modal-surface rounded-[2.5rem] p-8 md:p-10 transition-all duration-700 ease-out relative ring-1 ring-white/30 overflow-hidden" ref={contentRef}>
            <div className="absolute top-0 right-0 p-8 opacity-10 mix-blend-overlay pointer-events-none">
                <img src={monetIcons.journal} className="w-64 h-64 object-contain" alt="watermark" />
            </div>
            <div className="flex items-center gap-3 mb-8 relative z-10">
              {phase === 'writing' ? <Pencil className="w-5 h-5 text-[var(--color-accent-pink)] animate-pulse" /> : <img src={monetIcons.journal} className="w-8 h-8 object-contain drop-shadow-sm" alt="journal" />}
              <span className="text-lg font-black tracking-widest uppercase text-slate-800 drop-shadow-sm">
                {phase === 'writing' ? '星行漫游绘印中...' : '深度漫游指南'}
              </span>
            </div>
            <div className="markdown-content relative z-10 text-[15px] leading-loose text-slate-700">
              <MarkdownRenderer content={content} />
              {phase === 'writing' && <span className="inline-block w-2.5 h-5 bg-[var(--color-accent-pink)] ml-1 animate-pulse align-middle rounded-sm"></span>}
            </div>
          </div>
        )}

        {/* 风格迭代变体（悬浮在下方） */}
        {phase === 'done' && content && (
          <div className="mt-8 mb-4 border-t border-gray-200/50 pt-6 animate-in fade-in slide-in-from-bottom-4">
            <h4 className="text-sm font-black text-slate-700 flex items-center gap-2 mb-3">
               <Wand2 className="w-4 h-4 text-[var(--color-accent-pink)]" />
               不满意？一键重造攻略情绪风格
            </h4>
            <div className="flex flex-wrap gap-2">
              {STYLE_VARIANTS.map(v => (
                 <button 
                   key={v.id}
                   onClick={() => startStreamingPlan(v.promptAdd, v.id)}
                   disabled={isStreaming}
                   className={`px-4 py-2 flex items-center gap-1 rounded-xl text-xs font-bold transition-all shadow-sm ${activeVariant === v.id ? 'bg-gradient-to-r from-[var(--color-accent-pink)] to-[var(--color-accent-lilac)] text-white scale-105' : 'bg-white text-gray-600 border border-gray-200 hover:border-[var(--color-accent-lilac)] hover:text-[var(--color-accent-lilac)] hover:bg-[var(--color-accent-lilac)]/5'}`}
                 >
                   <span>{v.icon}</span> {v.label}
                 </button>
              ))}
            </div>
          </div>
        )}

        {/* 攻略完成后的动作面板 */}
        {phase === 'done' && content && (
          <div className="flex gap-3">
            <button 
              onClick={() => {
                if (onSavePlan && !hasSaved) {
                  onSavePlan(content, targetDestination || currentCityName || '旅行');
                  setHasSaved(true);
                }
              }}
              className={`flex-1 py-4 rounded-2xl font-black shadow-lg transition-all flex items-center justify-center gap-2 ${hasSaved ? 'bg-gray-100 text-gray-500 shadow-none' : 'bg-white text-emerald-600 border-2 border-emerald-500 hover:bg-emerald-50 active:scale-95'}`}
            >
              {hasSaved ? <CheckCircle2 className="w-5 h-5" /> : <Heart className="w-5 h-5 fill-emerald-500 text-emerald-500" />}
              {hasSaved ? '已收藏攻略' : '保存此生必去攻略'}
            </button>
            <button 
              onClick={() => setShowRoute(true)}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <img src={monetIcons.globe} className="w-6 h-6 object-contain " alt="globe" />
              <span>查看全局地图</span>
            </button>
          </div>
        )}

        {/* 路线地图全屏毛玻璃面板 */}
        {showRoute && content && (
          <RouteVisualizer 
            planText={content} 
            cityName={targetDestination || currentCityName || '全国'}
            onClose={() => setShowRoute(false)} 
          />
        )}

        {/* 空状态 */}
        {phase === 'idle' && !content && (
          <div className="text-center py-16 opacity-30 flex flex-col items-center">
            <img src={monetIcons.globe} className="w-20 h-20 object-contain grayscale" alt="globe" />
            <p className="font-bold mt-4">探索城市并锁定星系，开启 AI 全局视野</p>
            {currentCityName && (
              <p className="text-sm mt-2">当前已加载 {currentCityName} 的地理数据</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
