import path from 'node:path';
import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
};
export default config;
