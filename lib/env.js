try {
  // Load environment variables for frontend build (falls back to root .env)
  // Keep this small and safe for the browser build.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '../../.env' })
} catch (e) {
  // ignore when dotenv is not available in build environment
}
