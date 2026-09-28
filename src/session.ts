import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';

export function configureSession(app: INestApplication, config: ConfigService): void {
  // Guarda únicamente el state de OAuth, no la sesión de acceso a la API.
  app.use(session({
    name: 'oauth_state',
    secret: config.getOrThrow<string>('SESSION_SECRET'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.get<string>('NODE_ENV') === 'production',
      maxAge: 10 * 60 * 1000,
    },
  }));
}
