export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const required = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL',
    'JWT_SECRET', 'SESSION_SECRET'];
  for (const key of required) {
    if (typeof env[key] !== 'string' || !env[key].trim() || env[key].startsWith('REEMPLAZAR')) {
      throw new Error(`Configurar ${key} en .env`);
    }
  }
  for (const key of ['JWT_SECRET', 'SESSION_SECRET']) {
    if (String(env[key]).length < 32) throw new Error(`${key} debe tener al menos 32 caracteres`);
  }
  if (env.JWT_SECRET === env.SESSION_SECRET) throw new Error('Usar secretos diferentes para JWT y sesión');
  for (const key of ['PORT', 'DB_PORT']) {
    const port = Number(env[key]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${key} inválido`);
  }
  if (!['true', 'false'].includes(String(env.DB_SYNCHRONIZE))) {
    throw new Error('DB_SYNCHRONIZE debe ser true o false');
  }
  if (env.NODE_ENV === 'production' && env.DB_SYNCHRONIZE === 'true') {
    throw new Error('No usar DB_SYNCHRONIZE=true en producción');
  }
  const callback = new URL(String(env.GOOGLE_CALLBACK_URL));
  if (!['http:', 'https:'].includes(callback.protocol)) throw new Error('Callback inválido');
  return env;
}
