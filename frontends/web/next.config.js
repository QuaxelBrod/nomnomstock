// Load environment normalization before Next initializes
// prefer the JS initializer so Node can require it directly
require('./lib/env.js')

/** @type {import('next').NextConfig} */
// Determine a basePath for deployments that run the app under a sub-path
let basePath = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || ''
if (!basePath) {
  const urls = [process.env.APP_URL, process.env.NEXTAUTH_URL].filter(Boolean)
  for (const raw of urls) {
    try {
      const u = new URL(raw)
      if (u.pathname && u.pathname !== '/') {
        basePath = u.pathname.replace(/\/$/, '')
        break
      }
    } catch (e) {
      // ignore invalid deployment URL
    }
  }
}

// normalize: ensure basePath starts with '/' or is empty
if (basePath && !basePath.startsWith('/')) basePath = '/' + basePath

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  transpilePackages: ['nomnomstock-shared'],
  // set basePath and assetPrefix when deploying under a sub-path
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath || '',
  },
};

module.exports = nextConfig;
