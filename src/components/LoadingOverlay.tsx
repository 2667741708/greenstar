import React from 'react';
import { monetIcons } from '../config/monetIcons';

interface LoadingOverlayProps {
  loadingStep: string;
  isPro: boolean;
  isCheckingIn?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loadingStep, isPro, isCheckingIn }) => {
  if (isCheckingIn) {
    return (
      <div className="fixed inset-0 bg-white/10 z-[70] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
        <div className="w-64 h-64 flex items-center justify-center mb-8 relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#EAC5D8] to-[#C0A0D1] opacity-30 blur-3xl rounded-full animate-pulse"></div>
          <img src={monetIcons.camera} className="w-40 h-40 object-contain drop-shadow-2xl animate-[bounce_4s_infinite] mix-blend-multiply" alt="camera" />
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 monet-btn px-6 py-2 rounded-full text-sm font-black italic tracking-widest shadow-xl">验证中...</div>
        </div>
        <h3 className="text-2xl font-black font-serif italic text-gray-800 tracking-wide drop-shadow-sm">正在提交流逝的光影...</h3>
        <p className="text-sm font-bold opacity-60 mt-4 tracking-widest text-[#2D3748]">AI 正在进行图像重构与指纹比对</p>
      </div>
    );
  }

  if (!loadingStep) return null;

  return (
    <div className="fixed inset-0 bg-white/10 z-[60] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-700">
      <div className="relative w-32 h-32 flex items-center justify-center mb-8">
        <div className="absolute inset-0 rounded-full mix-blend-multiply opacity-50 blur-xl bg-[#EAC5D8] animate-[spin_4s_linear_infinite] origin-bottom-right"></div>
        <div className="absolute inset-0 rounded-full mix-blend-multiply opacity-50 blur-xl bg-[#A2BEE2] animate-[spin_5s_linear_infinite_reverse] origin-top-left"></div>
        <div className="absolute inset-2 rounded-full mix-blend-multiply opacity-50 blur-xl bg-[#C0A0D1] animate-[spin_6s_linear_infinite] origin-center scale-90"></div>
        <img src={monetIcons.globe} className="w-14 h-14 object-contain absolute z-10 opacity-70 drop-shadow-md animate-pulse mix-blend-multiply" alt="globe" />
      </div>
      <p className="font-black font-serif italic text-xl tracking-[0.2em] text-gray-700 animate-pulse drop-shadow-sm">
        {loadingStep}
      </p>
    </div>
  );
};
