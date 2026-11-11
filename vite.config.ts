import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスで出力し、GitHub Pages などのサブパスにも置けるようにする
  base: './',
  // three.js 本体だけで 500kB を超えるので警告の閾値を上げる
  build: { chunkSizeWarningLimit: 800 },
});
