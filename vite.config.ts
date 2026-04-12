// ============================================================================
// 文件: vite.config.ts
// 基准版本: vite.config.ts (原始版本，仅含 react 插件)
// 修改内容 / Changes:
//   [新增] 注册 @tailwindcss/vite 插件，替代 CDN 加载
//   [NEW]  Register @tailwindcss/vite plugin to replace CDN loading
// ============================================================================
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // GitHub Pages 需要子路径 base，Vercel/Supabase 用根路径
      base: process.env.DEPLOY_TARGET === 'github' ? '/greenstar/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
          }
        },
        watch: {
          usePolling: true,
        }
      },
      plugins: [tailwindcss(), react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
