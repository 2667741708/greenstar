// ============================================================================
// 文件: src/components/ProfilePanel.tsx
// 修改基准: ProfilePanel.tsx @ 422行版本
// 修改内容 / Changes:
//   [重构] 行程记忆库从 localStorage 迁移到 IndexedDB (localVault)
//   [新增] 行程记忆库完整 CRUD: 编辑笔记内容、删除、模糊搜索
//   [新增] 打卡足迹笔记编辑功能
//   [保留] AI 设置 Tab 完整功能不变
//   [REFACTOR] Saved plans migrated from localStorage to IndexedDB (localVault)
//   [NEW] Full CRUD for saved plans: edit content, delete, fuzzy search
//   [NEW] Check-in note editing capability
//   [KEPT] AI Settings tab unchanged
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Spot, CityInfo } from '../types';
import { CheckinDiary } from './CheckinDiary';
import {
  getCheckinStats,
  getAllPlans,
  savePlan,
  updatePlan,
  deletePlan,
  searchPlans,
  migrateFromLegacy,
  SavedPlan,
} from '../services/localVault';
import { monetAssets } from '../config/monetAssets';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  getLLMSettings,
  setLLMSettings,
  validateGeminiKey,
  GEMINI_MODELS,
  LLMProvider,
} from '../services/llmSettings';

interface ProfilePanelProps {
  isPro: boolean;
  spots: Spot[];
  cities: CityInfo[];
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ isPro, spots, cities }) => {
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [viewingPlan, setViewingPlan] = useState<SavedPlan | null>(null);
  const [activeTab, setActiveTab] = useState<'diary' | 'plans' | 'settings'>('diary');
  const [stats, setStats] = useState({ totalCheckins: 0, totalPhotos: 0, citiesVisited: 0, spotsVisited: 0 });

  // ── 行程记忆库 CRUD 状态 ─────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPlan, setEditingPlan] = useState<SavedPlan | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [planActionFeedback, setPlanActionFeedback] = useState('');

  // ── AI 设置 Tab 状态 ────────────────────────────────────
  const [provider, setProvider] = useState<LLMProvider>('google');
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [amapKey, setAmapKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [showAmapKey, setShowAmapKey] = useState(false);

  // 验证状态: idle | loading | ok | error
  const [validateStatus, setValidateStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [validateMsg, setValidateMsg] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── 初始化：迁移 + 加载 ──────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // 自动迁移旧数据（仅执行一次）
      await migrateFromLegacy();
      // 加载数据
      await loadPlans();
      const s = await getCheckinStats();
      setStats(s);
    };
    init();
    // 读取已保存的 AI 设置
    const s = getLLMSettings();
    setProvider(s.provider);
    setGeminiKey(s.geminiKey);
    setGeminiModel(s.geminiModel);
    setDeepseekKey(s.deepseekKey);
    setAmapKey(s.amapKey);
  }, []);

  // ── 行程记忆库数据加载 ──────────────────────────────────
  const loadPlans = useCallback(async () => {
    const plans = searchQuery.trim()
      ? await searchPlans(searchQuery.trim())
      : await getAllPlans();
    setSavedPlans(plans);
  }, [searchQuery]);

  // 搜索框变化时重新加载
  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const checkedSpots = spots.filter(s => s.checkedIn).length;
  const unlockedCities = cities.filter(c => c.isUnlocked).length;

  // ── 行程 CRUD 操作 ─────────────────────────────────────
  const handleDeletePlan = async (id: string) => {
    await deletePlan(id);
    setDeleteConfirmId(null);
    setViewingPlan(null);
    await loadPlans();
    showFeedback('行程已删除');
  };

  const handleStartEdit = (plan: SavedPlan) => {
    setEditingPlan(plan);
    setEditContent(plan.content);
    setEditDestination(plan.destination);
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;
    await updatePlan(editingPlan.id, {
      content: editContent,
      destination: editDestination,
    });
    setEditingPlan(null);
    // 刷新正在查看的详情
    if (viewingPlan?.id === editingPlan.id) {
      setViewingPlan({ ...editingPlan, content: editContent, destination: editDestination, updatedAt: new Date().toISOString() });
    }
    await loadPlans();
    showFeedback('修改已保存');
  };

  const showFeedback = (msg: string) => {
    setPlanActionFeedback(msg);
    setTimeout(() => setPlanActionFeedback(''), 2000);
  };

  // ── 保存 AI 设置 ──────────────────────────────────────
  const handleSaveSettings = () => {
    setLLMSettings({ provider, geminiKey, geminiModel, deepseekKey, amapKey });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // ── Gemini Key 验证 ───────────────────────────────────
  const handleValidateGemini = async () => {
    setValidateStatus('loading');
    setValidateMsg('');
    const result = await validateGeminiKey(geminiKey);
    if (result.valid) {
      setValidateStatus('ok');
      setValidateMsg(`有效 · 可访问 ${result.modelCount} 个模型`);
    } else {
      setValidateStatus('error');
      setValidateMsg(result.error || '验证失败');
    }
  };

  // 当前选中模型的配额信息
  const selectedModel = GEMINI_MODELS.find(m => m.id === geminiModel);

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      {/* 顶部用户卡 */}
      <div
        className="rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl transition-all duration-700 bg-cover bg-center border border-white/20"
        style={{ backgroundImage: `url(${monetAssets.bgGarden})` }}
      >
        <div className="absolute inset-0 bg-slate-900/30 mix-blend-multiply pointer-events-none"></div>
        <div className="relative z-10">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-2xl border border-white/40 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">
            <i className={`bi ${isPro ? 'bi-person-stars text-amber-400' : 'bi-person text-emerald-400'}`}></i>
          </div>
          <h3 className="text-2xl font-black mb-1 drop-shadow-md">{isPro ? 'Pro Traveler' : 'Explorer'}</h3>
          <div className="flex flex-col gap-2 mt-4">
            <p className="text-xs text-white/90 font-bold uppercase tracking-widest bg-black/20 border border-white/30 px-4 py-2.5 rounded-[1rem] shadow-inner inline-block w-max backdrop-blur-md">
              <i className="bi bi-geo-alt-fill text-[var(--color-accent-lilac)] mr-2"></i>解锁城市: {unlockedCities} / {cities.length}
            </p>
            <p className="text-xs text-white/90 font-bold uppercase tracking-widest bg-black/20 border border-white/30 px-4 py-2.5 rounded-[1rem] shadow-inner inline-block w-max backdrop-blur-md">
              <i className="bi bi-pin-map-fill text-amber-400 mr-2"></i>足迹点亮: {checkedSpots} 个坐标
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-40 rotate-12 mix-blend-overlay">
          <i className="bi bi-stars text-9xl"></i>
        </div>
      </div>

      {/* 打卡统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: 'bi-camera-fill', label: '打卡', value: stats.totalCheckins, color: 'text-emerald-600' },
          { icon: 'bi-image-fill', label: '照片', value: stats.totalPhotos, color: 'text-blue-600' },
          { icon: 'bi-geo-fill', label: '城市', value: stats.citiesVisited, color: 'text-[var(--color-accent-lilac)]' },
          { icon: 'bi-pin-map-fill', label: '地点', value: stats.spotsVisited, color: 'text-amber-600' },
        ].map((item, i) => (
          <div key={i} className="bg-white/40 backdrop-blur-xl rounded-[1.8rem] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.05)] shadow-inner border border-white/50 flex flex-col items-center gap-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center bg-white/60 border border-white/40 shadow-inner ${item.color}`}>
              <i className={`bi ${item.icon} text-lg`}></i>
            </div>
            <span className="text-xl font-black text-slate-800 drop-shadow-sm">{item.value}</span>
            <span className="text-[10px] text-slate-500 font-bold tracking-wider">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Tab 切换 */}
      <div className="flex bg-white/30 backdrop-blur-2xl border border-white/40 rounded-[1.8rem] p-1.5 gap-1 shadow-inner">
        <button
          onClick={() => setActiveTab('diary')}
          className={`flex-1 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ease-out ${activeTab === 'diary' ? 'bg-white shadow-md text-slate-800 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-white/20'}`}
        >
          <i className="bi bi-journal-richtext mr-1.5"></i>打卡足迹
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex-1 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ease-out ${activeTab === 'plans' ? 'bg-white shadow-md text-slate-800 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-white/20'}`}
        >
          <i className="bi bi-collection-play-fill mr-1.5"></i>行程记忆库
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-300 ease-out ${activeTab === 'settings' ? 'bg-white shadow-md text-slate-800 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-white/20'}`}
        >
          <i className="bi bi-cpu-fill mr-1.5"></i>AI 设置
        </button>
      </div>

      {/* 打卡日记时间线 */}
      {activeTab === 'diary' && <CheckinDiary />}

      {/* ══ 行程记忆库 Tab（完整 CRUD 版本）══════════════════ */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          {/* 搜索栏 */}
          <div className="relative">
            <i className="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索目的地、内容关键词..."
              className="w-full bg-white/50 backdrop-blur-xl border border-white/50 rounded-[1.5rem] py-3.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none focus:bg-white/80 focus:ring-2 focus:ring-[var(--color-accent-lilac)]/40 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <i className="bi bi-x-circle-fill"></i>
              </button>
            )}
          </div>

          {/* 操作反馈 */}
          {planActionFeedback && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-[1rem] text-sm font-bold flex items-center gap-2 animate-in fade-in">
              <i className="bi bi-check-circle-fill"></i>
              {planActionFeedback}
            </div>
          )}

          {/* 记录数量统计 */}
          {savedPlans.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-slate-500 font-bold">
                <i className="bi bi-database mr-1"></i>
                {searchQuery ? `搜索到 ${savedPlans.length} 条` : `共 ${savedPlans.length} 条行程记录`}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                <i className="bi bi-hdd mr-1"></i>IndexedDB 本地仓库
              </span>
            </div>
          )}

          {savedPlans.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {savedPlans.map(plan => (
                <div
                  key={plan.id}
                  className="bg-white/60 backdrop-blur-2xl p-5 rounded-[2rem] shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-white/50 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 ease-out active:scale-[0.98] cursor-pointer flex gap-5 items-center group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-accent-lilac)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  {/* 点击主体进入详情 */}
                  <div
                    className="flex gap-5 items-center flex-1 min-w-0 z-10"
                    onClick={() => setViewingPlan(plan)}
                  >
                    <div className="w-14 h-14 bg-white/70 backdrop-blur-md shadow-inner border border-white/40 text-[var(--color-accent-lilac)] rounded-[1.2rem] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 ease-out">
                      <i className="bi bi-file-earmark-richtext text-2xl drop-shadow-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-800 text-lg truncate drop-shadow-sm">{plan.destination} 的定制行程</h4>
                      <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 font-medium">
                        <i className="bi bi-calendar2-week opacity-70"></i> {plan.date} 生成
                        {plan.updatedAt && (
                          <span className="text-[10px] text-[var(--color-accent-lilac)] bg-[var(--color-accent-lilac)]/10 px-1.5 py-0.5 rounded-md">
                            已编辑
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 右侧操作按钮组 */}
                  <div className="flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartEdit(plan); }}
                      className="w-9 h-9 rounded-xl bg-white/70 border border-white/40 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm"
                      title="编辑"
                    >
                      <i className="bi bi-pencil-square text-sm"></i>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(plan.id); }}
                      className="w-9 h-9 rounded-xl bg-white/70 border border-white/40 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all shadow-sm"
                      title="删除"
                    >
                      <i className="bi bi-trash3 text-sm"></i>
                    </button>
                  </div>

                  <div className="text-slate-300 group-hover:text-slate-500 transition-colors z-10" onClick={() => setViewingPlan(plan)}>
                    <i className="bi bi-chevron-right text-lg"></i>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/30 backdrop-blur-xl border border-dashed border-white/60 rounded-[2.5rem] p-10 text-center text-slate-400 shadow-inner">
              <i className="bi bi-box2-heart text-5xl mb-4 block text-slate-300 drop-shadow-sm"></i>
              <p className="font-bold text-base text-slate-600">
                {searchQuery ? '未找到匹配的行程记录' : '暂无收藏的记忆区块'}
              </p>
              <p className="text-xs mt-2 font-medium opacity-80">
                {searchQuery ? '尝试其它关键词' : '去星系探索引擎建立专属档案吧'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── AI 设置 Tab ─────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

          {/* 服务商选择 */}
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              <i className="bi bi-diagram-3-fill mr-1.5 text-[var(--color-accent-lilac)]"></i>AI 服务商
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: 'google', label: 'Google Gemini', icon: 'bi-google', sub: '默认 · 免费额度充足', color: 'border-blue-400 bg-blue-50/60' },
                { id: 'deepseek', label: 'DeepSeek', icon: 'bi-stars', sub: '中文推理更强', color: 'border-purple-400 bg-purple-50/60' },
              ] as const).map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-[1.4rem] border-2 transition-all duration-200 ${
                    provider === p.id ? p.color + ' shadow-md scale-[1.02]' : 'border-white/60 bg-white/30 hover:bg-white/50'
                  }`}
                >
                  <i className={`bi ${p.icon} text-2xl ${provider === p.id ? 'text-slate-700' : 'text-slate-400'}`}></i>
                  <span className={`text-sm font-bold ${provider === p.id ? 'text-slate-800' : 'text-slate-500'}`}>{p.label}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{p.sub}</span>
                  {provider === p.id && <i className="bi bi-check-circle-fill text-emerald-500 text-xs"></i>}
                </button>
              ))}
            </div>
          </div>

          {/* Gemini 配置区 */}
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.04)] space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              <i className="bi bi-google mr-1.5 text-blue-500"></i>Gemini API Key
            </p>

            {/* Key 输入框 + 验证 */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => { setGeminiKey(e.target.value); setValidateStatus('idle'); }}
                  placeholder="AIzaSy..."
                  className="w-full bg-white/70 border border-white/60 rounded-[1rem] px-4 py-3 text-sm font-mono text-slate-700 placeholder-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  onClick={() => setShowGeminiKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <i className={`bi ${showGeminiKey ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                </button>
              </div>
              <button
                onClick={handleValidateGemini}
                disabled={validateStatus === 'loading' || !geminiKey}
                className="px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-bold rounded-[1rem] transition-all whitespace-nowrap flex items-center gap-1.5 shadow-md"
              >
                {validateStatus === 'loading'
                  ? <><i className="bi bi-arrow-repeat animate-spin"></i> 验证中</>
                  : <><i className="bi bi-shield-check"></i> 验证</>
                }
              </button>
            </div>

            {/* 验证结果 */}
            {validateStatus !== 'idle' && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-[1rem] text-sm font-medium ${
                validateStatus === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : validateStatus === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                <i className={`bi ${validateStatus === 'ok' ? 'bi-check-circle-fill' : validateStatus === 'error' ? 'bi-x-circle-fill' : 'bi-arrow-repeat animate-spin'}`}></i>
                <span>{validateMsg || (validateStatus === 'loading' ? '正在验证...' : '')}</span>
              </div>
            )}

            {/* Gemini 模型选择 */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                <i className="bi bi-cpu mr-1.5 text-blue-500"></i>Gemini 模型
              </p>
              <select
                value={geminiModel}
                onChange={e => setGeminiModel(e.target.value)}
                className="w-full bg-white/70 border border-white/60 rounded-[1rem] px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
              >
                {GEMINI_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              {/* 当前模型配额提示 */}
              {selectedModel && (
                <div className="mt-2 flex gap-3 text-[11px] font-medium text-slate-500">
                  <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full">
                    <i className="bi bi-sunrise mr-1"></i>RPM {selectedModel.freeRPM}
                  </span>
                  {selectedModel.freeRPD !== null && (
                    <span className="bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full">
                      <i className="bi bi-calendar-day mr-1"></i>每日 {selectedModel.freeRPD.toLocaleString()} 次
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* DeepSeek 配置区 */}
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              <i className="bi bi-stars mr-1.5 text-purple-500"></i>DeepSeek API Key
            </p>
            <div className="relative">
              <input
                type={showDeepseekKey ? 'text' : 'password'}
                value={deepseekKey}
                onChange={e => setDeepseekKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-white/70 border border-white/60 rounded-[1rem] px-4 py-3 text-sm font-mono text-slate-700 placeholder-slate-300 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                onClick={() => setShowDeepseekKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <i className={`bi ${showDeepseekKey ? 'bi-eye-slash' : 'bi-eye'}`}></i>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">当服务商选为 DeepSeek 时生效；Gemini 作为自动 fallback</p>
          </div>

          {/* 高德 AMap Key 配置区 */}
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              <i className="bi bi-map-fill mr-1.5 text-amber-500"></i>高德地图 API Key
            </p>
            <div className="relative">
              <input
                type={showAmapKey ? 'text' : 'password'}
                value={amapKey}
                onChange={e => setAmapKey(e.target.value)}
                placeholder="高德 Web 服务 Key..."
                className="w-full bg-white/70 border border-white/60 rounded-[1rem] px-4 py-3 text-sm font-mono text-slate-700 placeholder-slate-300 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                onClick={() => setShowAmapKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <i className={`bi ${showAmapKey ? 'bi-eye-slash' : 'bi-eye'}`}></i>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">用于 POI 搜索与地理编码；修改后即时生效</p>
          </div>

          {/* 保存按钮 */}
          <button
            onClick={handleSaveSettings}
            className={`w-full py-4 rounded-[1.5rem] text-base font-bold transition-all duration-300 shadow-lg flex items-center justify-center gap-2 ${
              saveSuccess
                ? 'bg-emerald-500 text-white scale-[1.01] shadow-emerald-200'
                : 'bg-gradient-to-r from-[var(--color-accent-lilac)] to-blue-500 text-white hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98]'
            }`}
          >
            {saveSuccess
              ? <><i className="bi bi-check-circle-fill"></i> 已保存到本地</>
              : <><i className="bi bi-floppy2-fill"></i> 保存设置</>
            }
          </button>

          {/* 隐私说明 */}
          <p className="text-[10px] text-slate-400 text-center font-medium">
            <i className="bi bi-lock-fill mr-1 text-slate-300"></i>
            所有 Key 仅存储于你的设备 localStorage，不上传至任何服务器
          </p>
        </div>
      )}

      {/* ── 删除确认弹窗 ──────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-[2rem] p-8 shadow-2xl max-w-sm w-full space-y-5 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto bg-red-50 rounded-2xl flex items-center justify-center">
                <i className="bi bi-exclamation-triangle-fill text-3xl text-red-500"></i>
              </div>
              <h3 className="text-lg font-black text-slate-800">确认删除此行程？</h3>
              <p className="text-sm text-slate-500">删除后无法恢复，请谨慎操作</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3 rounded-[1.2rem] bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDeletePlan(deleteConfirmId)}
                className="flex-1 py-3 rounded-[1.2rem] bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors shadow-md active:scale-95"
              >
                <i className="bi bi-trash3 mr-1"></i>确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 编辑行程弹窗 ──────────────────────────────────── */}
      {editingPlan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setEditingPlan(null)}>
          <div className="bg-white w-full max-w-2xl h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            {/* 编辑头部 */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">目的地</label>
                <input
                  type="text"
                  value={editDestination}
                  onChange={e => setEditDestination(e.target.value)}
                  className="text-xl font-black text-gray-800 bg-transparent border-b-2 border-dashed border-gray-200 focus:border-[var(--color-accent-lilac)] outline-none w-full pb-1 transition-colors"
                />
              </div>
              <button
                onClick={() => setEditingPlan(null)}
                className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors ml-4 shrink-0"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            {/* 编辑器主体 */}
            <div className="flex-1 overflow-hidden p-6">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full h-full bg-slate-50/50 border border-slate-200 rounded-2xl p-5 text-sm text-slate-700 font-mono leading-relaxed outline-none focus:border-[var(--color-accent-lilac)] focus:ring-2 focus:ring-[var(--color-accent-lilac)]/20 resize-none scrollbar-thin"
                placeholder="编辑攻略 Markdown 内容..."
              />
            </div>
            {/* 编辑底部操作 */}
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setEditingPlan(null)}
                className="flex-1 py-3.5 rounded-[1.2rem] bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-3.5 rounded-[1.2rem] bg-gradient-to-r from-[var(--color-accent-lilac)] to-blue-500 text-white font-bold text-sm hover:brightness-110 transition-all shadow-lg active:scale-95"
              >
                <i className="bi bi-check-lg mr-1"></i>保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 行程详情查看弹窗 ─────────────────────────────── */}
      {viewingPlan && !editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-2xl h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-xl font-black text-gray-800">{viewingPlan.destination} 行程单</h3>
                <p className="text-xs text-gray-500 mt-1 font-bold">
                  创建于 {viewingPlan.date}
                  {viewingPlan.updatedAt && (
                    <span className="ml-2 text-[var(--color-accent-lilac)]">
                      · 编辑于 {new Date(viewingPlan.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { handleStartEdit(viewingPlan); }}
                  className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                  title="编辑"
                >
                  <i className="bi bi-pencil-square"></i>
                </button>
                <button
                  onClick={() => setViewingPlan(null)}
                  className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar markdown-content text-[15px] leading-loose text-gray-700">
              <MarkdownRenderer content={viewingPlan.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
