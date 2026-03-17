import React from 'react';

interface LoadingOverlayProps {
  loadingStep: string;
  isPro: boolean;
  isCheckingIn?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loadingStep, isPro, isCheckingIn }) => {
  if (isCheckingIn) {
    return (
      <div className="fixed inset-0 bg-black z-[70] flex flex-col items-center justify-center text-white p-6 text-center">
        <div className="w-64 h-64 border-2 border-dashed border-white/30 rounded-3xl flex items-center justify-center mb-8 relative">
          <i className="bi bi-camera text-6xl opacity-20"></i>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500 px-4 py-1 rounded-full text-xs font-bold">验证中...</div>
        </div>
        <h3 className="text-lg font-bold">正在上传实地打卡证明</h3>
        <p className="text-sm opacity-60 mt-2">AI 正在进行图像指纹核对</p>
      </div>
    );
  }

  if (!loadingStep) return null;

  return (
    <div className="fixed inset-0 bg-white/70 backdrop-blur-md z-[60] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-500">
      <div className={`w-16 h-16 border-4 rounded-full animate-spin border-t-transparent ${isPro ? 'border-amber-500' : 'border-emerald-600'}`}></div>
      <p className="mt-6 font-black tracking-widest text-lg animate-pulse text-gray-800">{loadingStep}</p>
    </div>
  );
};
