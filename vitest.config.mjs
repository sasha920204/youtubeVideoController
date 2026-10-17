import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // 컴포넌트가 `import React` 후 클래식 JSX를 쓰므로 그대로 맞춘다
    jsx: 'transform',
    loader: 'jsx',
    include: /src\/.*\.jsx?$|tests\/.*\.jsx?$/,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    css: false,
  },
});
