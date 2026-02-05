import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import electron from 'vite-plugin-electron/simple';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Electron 主进程入口
        entry: 'electron/main.ts',
      },
      preload: {
        // Preload 脚本入口
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // 这里的配置会让 Vite 在开发时自动处理 Electron 的启动
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
