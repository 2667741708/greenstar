import React, { useState } from 'react';
import { monetIcons } from '../config/monetIcons';
import { Trash2, X, Plus, RotateCcw, CheckCircle2, Settings2 } from 'lucide-react';

export interface TagGroup {
  label: string;
  icon: string;
  tags: string[];
}

interface TagManagerModalProps {
  groups: TagGroup[];
  onSave: (newGroups: TagGroup[]) => void;
  onClose: () => void;
  onReset: () => void;
}

export const TagManagerModal: React.FC<TagManagerModalProps> = ({ groups, onSave, onClose, onReset }) => {
  const [editedGroups, setEditedGroups] = useState<TagGroup[]>(JSON.parse(JSON.stringify(groups)));

  const handleAddGroup = () => {
    setEditedGroups([...editedGroups, { label: '新探索维度', icon: 'bi-star', tags: [] }]);
  };

  const handleDeleteGroup = (index: number) => {
    setEditedGroups(editedGroups.filter((_, i) => i !== index));
  };

  const handleGroupChange = (index: number, field: keyof TagGroup, value: string) => {
    const newGroups = [...editedGroups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    setEditedGroups(newGroups);
  };

  const handleAddTag = (groupIndex: number, tag: string) => {
    if (!tag.trim()) return;
    const newGroups = [...editedGroups];
    if (!newGroups[groupIndex].tags.includes(tag.trim())) {
      newGroups[groupIndex].tags.push(tag.trim());
      setEditedGroups(newGroups);
    }
  };

  const handleDeleteTag = (groupIndex: number, tagIndex: number) => {
    const newGroups = [...editedGroups];
    newGroups[groupIndex].tags.splice(tagIndex, 1);
    setEditedGroups(newGroups);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="monet-modal-surface rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 relative ring-1 ring-white/30">
        
        {/* Soft Watermark */}
        <div className="absolute top-0 right-0 p-8 opacity-30 pointer-events-none">
          <img src={monetIcons.compass} className="w-64 h-64 object-contain drop-shadow-xl" alt="watermark" />
        </div>

        {/* Header */}
        <div className="px-8 py-7 flex justify-between items-start relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[var(--color-accent-lilac)] to-[var(--color-accent-pink)] flex items-center justify-center shadow-lg text-white">
                <Settings2 className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-wide drop-shadow-sm">定制探索基因</h2>
            </div>
            <p className="text-sm text-slate-500 font-medium ml-13">构建你的多维旅行图谱，AI 将基于此为你推荐专属坐标</p>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white text-slate-500 hover:text-slate-800 transition-all shadow-sm border border-white/80 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 pb-6 space-y-5 scrollbar-thin scrollbar-thumb-slate-300/50 scroll-smooth relative z-10">
          {editedGroups.map((group, gIndex) => (
            <div key={gIndex} className="p-6 bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/80 shadow-[0_4px_24px_rgba(0,0,0,0.04)] relative group transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
              
              {/* Delete Group Button */}
              <button 
                onClick={() => handleDeleteGroup(gIndex)} 
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-sm"
                title="删除此维度"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              
              {/* Group Meta Info */}
              <div className="flex flex-col sm:flex-row gap-3 mb-5 pr-12">
                <input 
                  value={group.icon} 
                  onChange={e => handleGroupChange(gIndex, 'icon', e.target.value)}
                  className="w-full sm:w-36 text-center bg-white/80 border border-white hover:border-slate-200 focus:border-[var(--color-accent-lilac)] rounded-[1.2rem] text-sm focus:ring-4 focus:ring-[var(--color-accent-lilac)]/20 outline-none shadow-sm transition-all py-3 font-mono text-slate-500"
                  placeholder="图标 Class"
                  title="Bootstrap Icon class (e.g., bi-star)"
                />
                <input 
                  value={group.label} 
                  onChange={e => handleGroupChange(gIndex, 'label', e.target.value)}
                  className="flex-1 bg-white/50 border border-transparent hover:bg-white/80 focus:bg-white rounded-[1.2rem] px-5 py-3 text-lg font-black text-slate-800 focus:ring-4 focus:ring-[var(--color-accent-lilac)]/20 outline-none transition-all placeholder:text-slate-400 shadow-inner sm:shadow-none"
                  placeholder="维度名称 (如: 街区探索)"
                />
              </div>

              {/* Tags Container */}
              <div className="flex flex-wrap gap-2.5">
                {group.tags.map((tag, tIndex) => (
                  <div key={tIndex} className="group/tag flex items-center gap-1.5 bg-white border border-slate-100 pl-4 py-2 pr-2 rounded-full text-[13px] font-bold text-slate-600 shadow-sm hover:border-[var(--color-accent-lilac)]/30 transition-colors">
                    {tag}
                    <button 
                      onClick={() => handleDeleteTag(gIndex, tIndex)}
                      className="text-slate-400 hover:text-red-500 w-5 h-5 rounded-full flex items-center justify-center bg-slate-50 hover:bg-red-100 transition-colors"
                      title="删除标签"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                
                {/* Add Tag Input */}
                <input 
                  type="text"
                  placeholder="+ 增加标签 (回车)"
                  className="bg-white/40 border border-slate-200 border-dashed px-5 py-2 rounded-full text-[13px] font-bold w-40 hover:bg-white focus:bg-white focus:ring-2 focus:ring-[var(--color-accent-lilac)]/30 outline-none transition-all placeholder:text-slate-400 text-slate-700"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag(gIndex, e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>
            </div>
          ))}

          {/* Add New Group Button */}
          <button 
            onClick={handleAddGroup}
            className="w-full py-5 bg-white/30 border-2 border-dashed border-slate-300/70 text-slate-500 rounded-[2rem] hover:border-[var(--color-accent-lilac)]/50 hover:text-[var(--color-accent-lilac)] hover:bg-[var(--color-accent-lilac)]/5 transition-all duration-300 font-bold text-sm flex items-center justify-center gap-2 group shadow-sm"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" /> 挂载新维度的基因组
          </button>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-white/50 border-t border-white/40 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10 backdrop-blur-2xl">
          <button 
            onClick={onReset} 
            className="flex items-center gap-2 text-[13px] text-slate-500 hover:text-red-500 font-bold px-4 py-2 rounded-xl hover:bg-red-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> 恢复重置
          </button>
          
          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={onClose} 
              className="flex-1 sm:flex-none px-6 py-3.5 rounded-2xl font-bold text-[14px] text-slate-600 bg-white/80 border border-white shadow-sm hover:bg-white hover:text-slate-800 transition-colors"
            >
              取消退出
            </button>
            <button 
              onClick={() => onSave(editedGroups)} 
              className="flex-[2] sm:flex-none px-8 py-3.5 rounded-2xl font-black text-[14px] text-white bg-gradient-to-r from-[var(--color-accent-lilac)] to-[var(--color-accent-pink)] shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" /> 注入基因并保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
