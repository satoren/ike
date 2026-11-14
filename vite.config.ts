import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスで出力し、どのパスに置いても動くようにする
  base: './',
  // three.js 本体だけで 500kB を超えるので警告の閾値を上げる（訳の辞書は言語ごとに別ファイル）
  build: { chunkSizeWarningLimit: 900 },
});
