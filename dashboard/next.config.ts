import type { NextConfig } from 'next';

const repo = 'demo-auto-spec-driven-development';
const isCI = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: isCI ? `/${repo}` : '',
  assetPrefix: isCI ? `/${repo}/` : '',
};

export default nextConfig;
