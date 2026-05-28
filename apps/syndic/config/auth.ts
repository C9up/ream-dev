import app from '@c9up/ream/services/app'
import { UserService } from '#modules/user/services/UserService.js'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET environment variable is required and must be at least 32 bytes. ' +
    'Set it in .env (development) or your secrets manager (production).',
  )
}

export default {
  defaultStrategy: 'jwt',
  jwt: {
    secret: jwtSecret,
    expiresInSeconds: 86400,
    findUser: (id: string) => {
      return app.container.make<UserService>(UserService).findById(id)
    },
    verifyCredentials: (email: string, password: string) => {
      return app.container.make<UserService>(UserService).verifyCredentials(email, password)
    },
  },
}
