import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
  url: `sqlite:${join(__dirname, '..', 'data', 'syndic.db')}`,
  migrations: {
    path: join(__dirname, '..', 'database', 'migrations'),
  },
}
