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

interface PlanPanelProps {
  setLoading: (loading: boolean) => void;
  setLoadingStep: (step: string) => void;
  setErrorMsg: (msg: string | null) => void;
  errorMsg: string | null;
  currentSpots?: Spot[];       // 当前城市/区域的高德 POI 数据
  currentCityName?: string;    // 当前城市名称
}

export const PlanPanel: React.FC<PlanPanelProps> = ({ 
  setLoading, setLoadingStep, setErrorMsg, errorMsg, currentSpots, currentCityName 
}) => {
  const [targetDestination, setTargetDestination] = useState(currentCityName || '');
  const [thinking, setThinking] = useState('');
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'crawling' | 'thinking' | 'writing' | 'done'>('idle');

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

  const buildPrompt = (destination: string, poiText: string, wikiText: string): string => {
    return `你是一位拥有丰富实地经验的资深旅游规划师。请基于以下**真实数据源**为用户生成一份详尽、专业的旅游攻略和路线规划。

## 真实数据源

### 高德地图 API 返回的当地 POI 数据（最高优先级信源）
${poiText || '（无高德数据可用）'}

### 网络百科检索资料
${wikiText || '（无百科数据可用）'}

## 规划要求

**目的地**: ${destination}

请生成以下内容：

### 1. 📍 目的地概览
简要介绍该地的地理位置、气候特点和文化特色。

### 2. 🚗 抵达交通
从当地主要枢纽（机场/车站）到市区的交通建议（含费用和时间参考）。

### 3. 🗺️ 精华路线推荐
基于上方高德 POI 数据中的**真实地点**，规划一条 2-3 天的最优游览路线：
- 每天的行程安排（上午/下午/晚上）
- 地点之间的交通方式和预估时间
- 每个地点的推荐游玩时长

### 4. 🍜 美食攻略
基于 POI 数据中的餐饮类地点，推荐当地特色美食和餐厅。

### 5. ⚠️ 避坑指南
当地的防坑避雷建议、安全提示。

### 6. 💰 预算参考
2-3 天行程的大致花费预估。

请使用 Markdown 格式回答，内容要详实、具体、可操作。优先引用高德 API 提供的真实地点名称。`;
  };

  const generateStreamingPlan = async (destination: string) => {
    if (!destination || isStreaming) return;
    
    setThinking('');
    setContent('');
    setIsStreaming(true);
    setErrorMsg(null);
    setShowThinking(true);

    // Step 1: 整理高德 POI 数据
    setPhase('crawling');
    setLoadingStep(`正在整理 ${destination} 的地理数据...`);
    
    let poiText = '';
    if (currentSpots && currentSpots.length > 0) {
      poiText = currentSpots.map((s, i) => 
        `${i + 1}. ${s.name} — ${s.description || '无描述'} [分类: ${s.category}] [评分: ${s.rating}] [标签: ${s.tags.join(', ')}]${s.isAIGenerated ? ' (AI检索)' : ' (高德实体)'}`
      ).join('\n');
    }

    // Step 2: 抓取网络百科数据
    let wikiText = '';
    try {
      wikiText = await fetchRealWorldData(destination);
    } catch (e) {
      console.warn('[Plan] Wiki fetch failed:', e);
    }

    // Step 3: 构建 Prompt 并开始流式调用
    const prompt = buildPrompt(destination, poiText, wikiText);
    setPhase('thinking');
    setLoadingStep('');
    
    await streamDeepSeek(prompt, {
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
              onKeyDown={e => e.key === 'Enter' && generateStreamingPlan(targetDestination)}
              placeholder="例如：成都..." 
              className="w-full bg-white/20 border-white/30 text-white rounded-2xl py-3 pl-5 pr-14 backdrop-blur-md outline-none focus:bg-white/30 transition-all placeholder:text-white/60 text-sm" 
              disabled={isStreaming}
            />
            <button 
              onClick={() => generateStreamingPlan(targetDestination)} 
              disabled={isStreaming}
              className={`absolute right-2 top-1.5 bottom-1.5 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all ${isStreaming ? 'bg-gray-300 text-gray-500' : 'bg-white text-emerald-700 active:scale-90'}`}
            >
              <i className={`bi ${isStreaming ? 'bi-hourglass-split animate-spin' : 'bi-send-fill'}`}></i>
            </button>
          </div>
          {currentSpots && currentSpots.length > 0 && (
            <p className="text-[10px] text-white/60 mt-2">
              <i className="bi bi-database-fill mr-1"></i>
              已加载 {currentSpots.length} 个高德 POI 数据作为信源
            </p>
          )}
        </div>

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

        {/* 空状态 */}
        {phase === 'idle' && !content && (
          <div className="text-center py-16 opacity-30 flex flex-col items-center">
            <i className="bi bi-map-fill text-6xl mb-4"></i>
            <p className="font-bold">输入目的地，开启 AI 全局视野</p>
            {currentCityName && (
              <p className="text-sm mt-2">当前已加载 {currentCityName} 的地理数据</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
