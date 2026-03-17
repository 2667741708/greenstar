import React from 'react';
import { marked } from "marked";

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const html = marked.parse(content);
  return <div className="markdown-content text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: html as string }} />;
};
