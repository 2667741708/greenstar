import React, { useState } from 'react';

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
    setEditedGroups([...editedGroups, { label: '新分组', icon: 'bi-star', tags: [] }]);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
        
        {/* Header */}
        <div className="px-6 py-5 border-b flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-xl font-black text-gray-800">自定义探索标签</h2>
            <p className="text-xs text-gray-500 font-medium mt-1">管理你的专属兴趣分组与标签</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {editedGroups.map((group, gIndex) => (
            <div key={gIndex} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 relative group">
              <button 
                onClick={() => handleDeleteGroup(gIndex)} 
                className="absolute top-4 right-4 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除此分组"
              >
                <i className="bi bi-trash"></i>
              </button>
              
              <div className="flex gap-2 mb-4 pr-6">
                <input 
                  value={group.icon} 
                  onChange={e => handleGroupChange(gIndex, 'icon', e.target.value)}
                  className="w-10 text-center bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                  placeholder="图标"
                  title="Bootstrap Icon class (e.g., bi-star)"
                />
                <input 
                  value={group.label} 
                  onChange={e => handleGroupChange(gIndex, 'label', e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-emerald-400 outline-none py-2"
                  placeholder="分组名称"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag, tIndex) => (
                  <div key={tIndex} className="group/tag flex items-center gap-1 bg-white border border-gray-200 px-3 py-1.5 rounded-full text-xs font-bold text-gray-600">
                    {tag}
                    <button 
                      onClick={() => handleDeleteTag(gIndex, tIndex)}
                      className="text-gray-400 hover:text-red-500 w-4 h-4 rounded-full flex items-center justify-center ml-1 bg-gray-50 hover:bg-red-50"
                    >
                      <i className="bi bi-x"></i>
                    </button>
                  </div>
                ))}
                
                {/* 增加标签 Input */}
                <input 
                  type="text"
                  placeholder="+ 新标签 (回车)"
                  className="bg-white border border-gray-200 border-dashed px-3 py-1.5 rounded-full text-xs font-bold w-28 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
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

          <button 
            onClick={handleAddGroup}
            className="w-full py-4 border-2 border-dashed border-gray-200 text-gray-500 rounded-2xl hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors font-bold text-sm"
          >
            <i className="bi bi-plus-lg mr-2"></i>添加新分组
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t bg-gray-50/50 flex justify-between items-center">
          <button onClick={onReset} className="text-xs text-red-500 hover:underline font-bold">恢复默认设置</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm text-gray-600 bg-white border shadow-sm hover:bg-gray-50">取消</button>
            <button 
              onClick={() => onSave(editedGroups)} 
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-500 shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 active:scale-95 transition-all"
            >
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
