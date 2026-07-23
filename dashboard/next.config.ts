import type { NextConfig } from 'next';

const repo = 'demo-auto-spec-driven-development';

// GitHub Pages はリポジトリ名のサブパス配信になるため basePath が要る。
// ただし「CI である(GITHUB_ACTIONS)」と「Pages 用にビルドする」は別物。
// GITHUB_ACTIONS で判定すると ci.yml の E2E も basePath 付き dev サーバになり、
// テストが `/` を開いて 404 → CI でだけ落ちる。デプロイ専用フラグで分離する。
const usePagesBasePath = process.env.PAGES_BASE_PATH === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: usePagesBasePath ? `/${repo}` : '',
  assetPrefix: usePagesBasePath ? `/${repo}/` : '',
  // playwright.config.ts の baseURL は 127.0.0.1 だが、Next dev サーバは既定で
  // localhost しか同一オリジンと見なさない。未設定だと HMR 等へのリクエストが
  // 毎回ブロックされ続け、E2E の webServer が不安定になる（test:e2e のゲート不通過の原因）。
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
