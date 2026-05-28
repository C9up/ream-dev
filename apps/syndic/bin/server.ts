/*
|--------------------------------------------------------------------------
| HTTP server entrypoint
|--------------------------------------------------------------------------
|
| The "server.ts" file is the entrypoint for starting the Ream HTTP
| server. Either you can run this file directly or use the "serve"
| command to run this file and monitor file changes.
|
*/

import 'reflect-metadata'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { arch, platform } from 'node:process'
import { fileURLToPath } from 'node:url'
import { Ignitor, prettyPrintError } from '@c9up/ream'

/**
 * URL to the application root.
 */
const APP_ROOT = new URL('../', import.meta.url)

/**
 * Load HyperServer NAPI binary.
 */
const require2 = createRequire(import.meta.url)
const __dirname2 = dirname(fileURLToPath(import.meta.url))
const platformMap: Record<string, string> = {
  'linux-x64': 'linux-x64-gnu',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
}
const suffix = platformMap[`${platform}-${arch}`]
const httpNapi = suffix
  ? require2(join(__dirname2, '../../../packages/ream/tests/integration/http/index.' + suffix + '.node'))
  : null

/**
 * The importer is used to import files in context of the application.
 */
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

new Ignitor(APP_ROOT, {
  importer: IMPORTER,
  port: Number(process.env.PORT ?? 3000),
  serverFactory: httpNapi ? (port: number) => new httpNapi.HyperServer(port) : undefined,
})
  .tap((app) => {
    app.listen('SIGTERM', () => app.terminate())
    app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
  })
  .useRcFile((await import('../reamrc.js')).default)
  .httpServer()
  .start()
  .then(async (ignitor) => {
    const port = await ignitor.port()
    const logger = ignitor.getApp().container.resolve<import('@c9up/spectrum').Logger>('logger')
    logger.info(`Syndic API running on http://localhost:${port}`)
  })
  .catch((error) => {
    process.exitCode = 1
    prettyPrintError(error)
  })
