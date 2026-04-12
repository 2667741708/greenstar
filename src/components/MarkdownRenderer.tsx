import React, { useMemo } from 'react';
import { marked } from "marked";

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const htmlResult = useMemo(() => {
    // 拦截 AI 输出常用的级联标题 ### 作为卡片的起始分割点
    if (content.includes('### ')) {
      // 通过正向预查，按行首的 ### 或者换行后的 ### 进行分割，不丢弃 ### 本身
      const blocks = content.split(/(?=^### |\n### )/gm);
      
      return (
        <div className="monet-card-layout">
          {blocks.map((block, idx) => {
            if (!block.trim()) return null;
            
            const isCard = block.trim().startsWith('###');
            const html = marked.parse(block);
            
            if (isCard) {
              // 作为精美的莫奈卡片进行渲染
              return (
                <div 
                  key={idx} 
                  className="monet-card-item markdown-content text-sm text-gray-700" 
                  dangerouslySetInnerHTML={{ __html: html as string }} 
                />
              );
            }
            
            // 引言或没带标题的普通内容，维持散文状
            return (
              <div 
                key={idx} 
                className="markdown-content text-sm text-gray-700 mb-2 px-2" 
                dangerouslySetInnerHTML={{ __html: html as string }} 
              />
            );
          })}
        </div>
      );
    }

    // 无法分割的普通渲染退路
    const html = marked.parse(content);
    return <div className="markdown-content text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: html as string }} />;
  }, [content]);

  return htmlResult;
};
