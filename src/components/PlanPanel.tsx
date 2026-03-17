import React, { useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ItineraryData } from '../types';
import { callDeepSeek } from '../services/deepseek';

interface PlanPanelProps {
  setLoading: (loading: boolean) => void;
  setLoadingStep: (step: string) => void;
  setErrorMsg: (msg: string | null) => void;
  errorMsg: string | null;
}

export const PlanPanel: React.FC<PlanPanelProps> = ({ setLoading, setLoadingStep, setErrorMsg, errorMsg }) => {
  const [targetDestination, setTargetDestination] = useState('');
  const [itinerary, setItinerary] = useState<ItineraryData | null>(null);

  const generateDeepPlan = async (destination: string) => {
    if (!destination) return;
    setLoading(true);
    setLoadingStep(`正在为您构建 ${destination} 的深度星际航路...`);
    setErrorMsg(null);
    try {
      const prompt = `用户计划前往 "${destination}" 旅游。
请作为资深旅游向导，提供一份详尽的出行预案：
1. ## 抵达安排
从当地主要枢纽（机场/车站）到市区的交通建议（含费用和时间参考）。
2. ## 落地首选
抵达后的前 4 小时建议做什么（包含一个当地特色美食推荐）。
3. ## 出行贴士
当地的天气情况、必备物品、防坑避雷建议。
4. ## 推荐行程
3天2夜的精华路线建议。
使用 Markdown 格式回答，包含标题、列表和加粗文字，内容要详实具体。`;

      const text = await callDeepSeek(prompt, false, 30000);
      setItinerary({
        destination,
        arrivalPlan: text,
        sources: []
      });
    } catch (error: any) {
      console.error("Plan error:", error);
      if (error.name === 'AbortError') {
        setErrorMsg('⏱ 规划请求超时，请重试');
      } else {
        setErrorMsg(`❌ 规划生成失败：${error.message?.substring(0, 100)}`);
      }
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="p-6 pb-32 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-black">AI 智能规划 <span className="text-emerald-500">.</span></h2>
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10"><i className="bi bi-robot text-9xl"></i></div>
        <h3 className="text-lg font-bold mb-4 relative z-10">设定下个目的地</h3>
        <div className="relative group z-10">
          <input 
            type="text" 
            value={targetDestination} 
            onChange={e => setTargetDestination(e.target.value)} 
            placeholder="例如：成都..." 
            className="w-full bg-white/20 border-white/30 text-white rounded-2xl py-4 pl-5 pr-14 backdrop-blur-md outline-none focus:bg-white/30 transition-all placeholder:text-white/60" 
          />
          <button 
            onClick={() => generateDeepPlan(targetDestination)} 
            className="absolute right-2 top-2 bottom-2 w-10 h-10 bg-white text-emerald-700 rounded-xl flex items-center justify-center shadow-lg transition-transform active:scale-90"
          >
            <i className="bi bi-send-fill"></i>
          </button>
        </div>
      </div>
      
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-2 text-red-400 hover:text-red-600"><i className="bi bi-x-lg"></i></button>
        </div>
      )}

      {itinerary?.arrivalPlan ? (
        <div className="animate-slide-up space-y-6">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <MarkdownRenderer content={itinerary.arrivalPlan} />
          </div>
        </div>
      ) : (
        <div className="text-center py-20 opacity-30 flex flex-col items-center">
          <i className="bi bi-map-fill text-6xl mb-4"></i>
          <p className="font-bold">开启 AI 全局视野</p>
        </div>
      )}
    </div>
  );
};
