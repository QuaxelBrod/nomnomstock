// Load environment normalization before Next initializes
// prefer the JS initializer so Node can require it directly
require('./lib/env.js')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
