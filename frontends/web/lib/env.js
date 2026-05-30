const path = require('path')

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') })
} catch (e) {
  // ignore when dotenv is not available in build environment
}
