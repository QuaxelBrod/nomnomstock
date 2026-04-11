// Load environment normalization before Next initializes
// prefer the JS initializer so Node can require it directly
require('./lib/env.js')

/** @type {import('next').NextConfig} */
// Determine a basePath for deployments that run the app under a sub-path
const rawAppUrl = process.env.APP_URL || 'http://localhost:3000'
let basePath = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || ''
try {
  if (!basePath) {
    const u = new URL(rawAppUrl)
    if (u.pathname && u.pathname !== '/') basePath = u.pathname.replace(/\/$/, '')
  }
} catch (e) {
  // ignore invalid APP_URL
}

// normalize: ensure basePath starts with '/' or is empty
if (basePath && !basePath.startsWith('/')) basePath = '/' + basePath

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  // set basePath and assetPrefix when deploying under a sub-path
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath || '',
  },
};

module.exports = nextConfig;
