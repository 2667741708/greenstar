// ============================================================================
// 文件: src/components/PlanPanel.tsx
// 基准版本: PlanPanel.tsx (99 行，非流式版本)
// 修改内容 / Changes:
//   [重写] 全面重构为流式输出模式，支持 DeepSeek Reasoner 的 thinking + content 双通道
//   [新增] 接收高德 API 返回的 POI 数据作为信源注入 Prompt
//   [新增] 思考过程和输出内容的分区实时渲染
//   [REWRITE] Full streaming mode with thinking/content dual-channel display
//   [NEW] AMap POI data injection into DeepSeek prompt as primary data source
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Spot } from '../types';
import { streamDeepSeek } from '../services/deepseek';
import { fetchRealWorldData } from '../services/crawler';
import RouteVisualizer from './explore/RouteVisualizer';
import { fetchWeatherForecast } from '../mcp-services/weatherService';
import { fetchTravelContent } from '../mcp-services/travelContentService';

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

  // 生成基础指令给用户编辑
  const generateBaseInstructions = (destination: string, keywords: string[], sp: string, ep: string): string => {
    const kwStr = keywords.length > 0 
      ? `\n\n【🚀 用户探索偏好】：${keywords.join(', ')}\n**重要指示**：用户特别指定了以上主题倾向，请务必在路线规划、餐厅安排中大幅提升这些元素的比重！`
      : '';
    
    const constraintStr = (sp || ep) 
      ? `\n\n【🚨 强制起点终点约束】：\n本次路线规划必须严格遵守以下物理空间约束：${sp ? `\n- 起点必须是【${sp}】` : ''}${ep ? `\n- 终点必须是【${ep}】` : ''}\n请确保路线是从起点顺滑过渡到终点，不要出现胡乱折返绕大圈的情况。`
      : '';

    return `你是一位拥有丰富实地经验的资深旅游规划师。请基于附加的【真实信源系统】数据，为用户生成定制旅游攻略。

## 规划核心需求
**目的地**: ${destination}${kwStr}${constraintStr}

请严格生成以下核心内容板块：

### 1. 📍 目的地硬核概览
简要说明此地的精神文化内核、气候雷区。

### 2. 🚗 交通接驳与大盘指南
机场/高铁站下车后的最优解（如何快速到核心区、网约车上车点坑位）。

### 3. 🗺️ X天Y夜的精研路书（核心）
结合传给你的真实 POI 坐标，每天怎么走最顺路？不走回头路。
- 上午/下午/晚上的详细安排
- 点与点之间的切换方式及时间耗损
- 必出片的机位或隐秘体验

### 4. 🍜 黑珍珠与苍蝇馆子
基于数据的餐厅打分，推荐必须去尝的。

### 5. ⚠️ 避雷区（含隐性消费预警）
如不该信的拉客大妈、不该买的特产。

### 6. 💰 全盘预算控制表
按照舒适游估算 2-3 天整体花销。

⚠️ **非常重要的系统指令**：
在您的全文回答中，凡是推荐的**真实物理地点（景点、餐厅、酒店、商圈等，必须是地图能搜到的实体）**，请务必使用 \`【实体名称】\` 的格式进行包裹（例如：前往 【宽窄巷子】 品尝美食）。
**千万不要**将任何形容词、文化概念、非实体名词（如：【精神文化】、【农牧交错带】、【避雷指南】）加括号，系统将在后台直接提取括号内的词进行 GPS 坐标定位！

请使用结构严谨的 Markdown 格式输出。排版必须精美好看，不要废话。`;
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

  const startStreamingPlan = async () => {
    if (!draftPrompt || isStreaming) return;
    
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

    // Step 2: 整理高德 POI 数据
    setLoadingStep(`正在整理 ${targetDestination} 的地理数据...`);
    
    let poiText = '';
    if (currentSpots && currentSpots.length > 0) {
      poiText = currentSpots.map((s, i) => 
        `${i + 1}. ${s.name} — ${s.description || '无描述'} [分类: ${s.category}] [评分: ${s.rating}] [标签: ${s.tags.join(', ')}]${s.isAIGenerated ? ' (AI检索)' : ' (高德实体)'}`
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
    const finalPrompt = `${draftPrompt}\n\n---\n## 📋 系统级真实信源系统注入数据（勿向用户展示此段原文）\n\n### 气象预报 MCP 服务（提供穿衣及室内外游玩建议）：\n${weatherText || '无'}\n\n### 高德 API 极速实况探测（最高优先）：\n${poiText || '无'}\n\n### 维基百科知识引擎索引（背景知识）：\n${wikiText || '无'}\n\n### 旅行内容聚合 MCP 服务（含小红书种草 + 搜索引擎知识图谱）：\n${travelContentText || '无'}`;
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
        setErrorMsg(`❌ 规划生成失败：${error.message}`);
        setIsStreaming(false);
        setPhase('idle');
      },
    }, 120000);
  };

  const phaseLabel = {
    idle: '',
    drafting: '📝 等待审查并点燃引擎...',
    crawling: '📡 正在抓取数据源...',
    thinking: '🧠 DeepSeek 正在深度思考...',
    writing: '✍️ 正在生成攻略...',
    done: '✅ 攻略生成完成',
  };

  return (
    <div className="flex flex-col h-full pb-20">
      {/* 顶部输入区 */}
      <div className="p-5 space-y-4 shrink-0">
        <h2 className="text-2xl font-black">AI 智能规划 <span className="text-emerald-500">.</span></h2>
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><i className="bi bi-robot text-8xl"></i></div>
          <h3 className="text-sm font-bold mb-3 relative z-10">设定下个目的地</h3>
          <div className="relative group z-10">
            <input 
              type="text" 
              value={targetDestination} 
              onChange={e => setTargetDestination(e.target.value)} 
              placeholder="例如：成都..." 
              className="w-full bg-white/20 border-white/30 text-white rounded-2xl py-3 pl-5 pr-14 backdrop-blur-md outline-none focus:bg-white/30 transition-all placeholder:text-white/60 text-sm" 
              disabled={isStreaming}
            />
          </div>
          <div className="flex gap-2 mt-3 z-10 relative">
            <input 
              type="text" 
              value={startPoint} 
              onChange={e => setStartPoint(e.target.value)} 
              placeholder="起点 (如: 某大酒店)" 
              className="w-1/2 bg-white/20 border-white/30 text-white rounded-xl py-2 px-3 backdrop-blur-md outline-none focus:bg-white/30 transition-all placeholder:text-white/60 text-xs" 
              disabled={isStreaming}
            />
            <input 
              type="text" 
              value={endPoint} 
              onChange={e => setEndPoint(e.target.value)} 
              placeholder="终点 (如: 高铁站)" 
              className="w-1/2 bg-white/20 border-white/30 text-white rounded-xl py-2 px-3 backdrop-blur-md outline-none focus:bg-white/30 transition-all placeholder:text-white/60 text-xs" 
              disabled={isStreaming}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-white/60 text-[10px]">
            <span><i className="bi bi-database-fill mr-1"></i>搭载 {currentSpots?.length || 0} 个高德核心坐标源</span>
            {currentKeywords && currentKeywords.length > 0 && <span><i className="bi bi-tag-fill mr-1"></i>聚焦主题: {currentKeywords.join(' / ')}</span>}
          </div>
        </div>

        {/* Prompt 审查编辑界（Drafting 阶段显示） */}
        {phase === 'drafting' && (
           <div className="bg-white rounded-3xl p-5 shadow-lg border-2 border-emerald-100 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 relative">
             <div className="flex justify-between items-center text-emerald-800">
               <span className="text-sm font-black"><i className="bi bi-terminal-fill mr-2"></i>定制化 Prompt 审查台</span>
               <span className="text-[10px] bg-emerald-100 px-2 py-1 rounded-md font-bold text-emerald-600 border border-emerald-200 shadow-inner">极客模式</span>
             </div>
             
             <p className="text-[11px] text-gray-400 font-bold">下面是为你自动生成的指令，可直接修改任意字符，高德和维基的实况数据已被自动折叠附加在底层。</p>
             
             <textarea 
               value={draftPrompt}
               onChange={(e) => setDraftPrompt(e.target.value)}
               className="w-full bg-slate-800 text-emerald-400 font-mono text-xs rounded-xl p-4 min-h-[220px] outline-none border border-slate-700 focus:border-emerald-500 transition-colors resize-y scrollbar-thin scrollbar-thumb-emerald-700 leading-relaxed disabled:opacity-50"
               placeholder="在这里手写你的 Prompt 指令..."
               disabled={isStreaming}
               spellCheck={false}
             />
             
             <button 
               onClick={startStreamingPlan} 
               disabled={isStreaming || !draftPrompt.trim()}
               className={`w-full py-3.5 rounded-2xl font-black shadow-lg transition-all flex items-center justify-center gap-2 
                ${(isStreaming || !draftPrompt.trim()) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white hover:shadow-emerald-200 active:scale-95'}`}
             >
               <i className={`bi ${isStreaming ? 'bi-hourglass-split animate-spin' : 'bi-rocket-takeoff-fill'}`}></i>
               锁定策略，引燃 DeepSeek 引擎
             </button>
           </div>
        )}

        {/* 状态指示 */}
        {phase !== 'idle' && phase !== 'done' && (
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 animate-pulse">
            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
            {phaseLabel[phase]}
          </div>
        )}
        {phase === 'done' && (
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
            <i className="bi bi-check-circle-fill"></i> {phaseLabel[phase]}
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-2 text-red-400 hover:text-red-600"><i className="bi bi-x-lg"></i></button>
          </div>
        )}
      </div>

      {/* 流式输出双窗口 */}
      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        {/* 思考过程窗口 */}
        {thinking && (
          <div className="bg-gray-50 border border-gray-200 rounded-[2rem] overflow-hidden">
            <button 
              onClick={() => setShowThinking(!showThinking)}
              className="w-full px-6 py-3 flex items-center justify-between text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <span>
                <i className={`bi ${phase === 'thinking' ? 'bi-lightbulb-fill text-amber-500 animate-pulse' : 'bi bi-lightbulb text-gray-400'} mr-2`}></i>
                DeepSeek 思考过程 
                <span className="text-[10px] text-gray-300 ml-2">{thinking.length} 字</span>
              </span>
              <i className={`bi bi-chevron-${showThinking ? 'up' : 'down'} text-gray-400`}></i>
            </button>
            {showThinking && (
              <div 
                ref={thinkingRef}
                className="px-6 pb-5 max-h-60 overflow-y-auto text-xs text-gray-500 leading-relaxed font-mono whitespace-pre-wrap"
              >
                {thinking}
                {phase === 'thinking' && <span className="inline-block w-1.5 h-4 bg-amber-400 ml-0.5 animate-pulse align-middle"></span>}
              </div>
            )}
          </div>
        )}

        {/* 输出内容窗口 */}
        {content && (
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100" ref={contentRef}>
            <div className="flex items-center gap-2 mb-4">
              <i className={`bi ${phase === 'writing' ? 'bi-pencil-fill text-emerald-500 animate-pulse' : 'bi-file-earmark-richtext text-emerald-600'}`}></i>
              <span className="text-sm font-bold text-gray-700">
                {phase === 'writing' ? '攻略生成中...' : '📋 攻略全文'}
              </span>
            </div>
            <div className="markdown-content">
              <MarkdownRenderer content={content} />
              {phase === 'writing' && <span className="inline-block w-2 h-5 bg-emerald-500 ml-0.5 animate-pulse align-middle"></span>}
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
              <i className={`bi ${hasSaved ? 'bi-check2-circle' : 'bi-bookmark-heart-fill'}`}></i>
              {hasSaved ? '已收藏攻略' : '保存此生必去攻略'}
            </button>
            <button 
              onClick={() => setShowRoute(true)}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <i className="bi bi-map-fill text-lg"></i>
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
            <i className="bi bi-map-fill text-6xl mb-4"></i>
            <p className="font-bold">探索城市并锁定星系，开启 AI 全局视野</p>
            {currentCityName && (
              <p className="text-sm mt-2">当前已加载 {currentCityName} 的地理数据</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
