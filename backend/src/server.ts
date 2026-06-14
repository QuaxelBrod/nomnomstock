import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

import { sendApiError } from './apiContract'
import { registerAdminMaintenanceRoutes } from './routes/adminMaintenance'
import { registerAuthRoutes } from './routes/auth'
import { registerDebugRoutes } from './routes/debug'
import { registerDeviceRoutes } from './routes/devices'
import { registerHealthRoutes } from './routes/health'
import { registerLocationRoutes } from './routes/locations'
import { registerProductRoutes } from './routes/products'
import { registerProfileRoutes } from './routes/profile'
import { registerRecipeRoutes } from './routes/recipes'
import { registerScannerRoutes } from './routes/scanner'
import { registerShoppingRoutes } from './routes/shopping'
import { registerStockRoutes } from './routes/stock'
import { resolveUploadsDir } from './serverUtils'

const app = express()

app.disable('x-powered-by')
app.use(cors())
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ extended: true }))
app.use('/uploads', express.static(resolveUploadsDir()))

registerAdminMaintenanceRoutes(app)
registerHealthRoutes(app)
registerAuthRoutes(app)
registerProductRoutes(app)
registerLocationRoutes(app)
registerStockRoutes(app)
registerShoppingRoutes(app)
registerProfileRoutes(app)
registerRecipeRoutes(app)
registerDeviceRoutes(app)
registerScannerRoutes(app)
registerDebugRoutes(app)

app.use('/api', (req, res) => {
  return sendApiError(res, 404, 'not_found', `No API route matches ${req.method} ${req.path}`)
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`[backend] server listening on http://0.0.0.0:${port}`)
})
