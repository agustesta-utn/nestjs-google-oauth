import { ConflictException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { GoogleUser } from '../src/auth/auth.types';
import { GoogleStrategy } from '../src/auth/google.strategy';
import { User } from '../src/users/user.entity';
import { UsersService } from '../src/users/users.service';
import { configureSession } from '../src/session';
import { Profile } from 'passport-google-oauth20';

const profile: GoogleUser = { googleId: 'google-1', email: 'ALUMNO@example.com', emailVerified: true,
  firstName: 'Ana', lastName: 'Perez', picture: '' };
const user: User = { id: 'bd5c27e7-751e-4a30-a173-fb5a51125c4f', email: 'alumno@example.com',
  googleId: 'google-1', firstName: 'Ana', lastName: 'Perez', picture: '', createdAt: new Date(), updatedAt: new Date() };

describe('Registro, vinculación y JWT', () => {
  const users = { findByGoogleId: jest.fn(), findByEmail: jest.fn(), save: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  let auth: AuthService;
  beforeEach(() => {
    jest.resetAllMocks();
    users.findByGoogleId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);
    users.save.mockResolvedValue(user);
    jwt.signAsync.mockResolvedValue('jwt-propio');
    auth = new AuthService(users as unknown as UsersService, jwt as unknown as JwtService);
  });
  it('crea el usuario y firma únicamente id y email', async () => {
    expect(await auth.validateGoogleUser(profile)).toEqual({ token: 'jwt-propio', user });
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'alumno@example.com', googleId: 'google-1' }));
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: user.id, email: user.email });
  });
  it('reutiliza el id y actualiza el perfil de un usuario conocido', async () => {
    users.findByGoogleId.mockResolvedValue(user);
    await auth.validateGoogleUser({ ...profile, firstName: 'Nuevo' });
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ id: user.id, firstName: 'Nuevo' }));
  });
  it('vincula por email conservando el id previo', async () => {
    users.findByEmail.mockResolvedValue({ ...user, googleId: null });
    await auth.validateGoogleUser(profile);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ id: user.id, googleId: 'google-1' }));
  });
  it('rechaza reemplazar otra vinculación', async () => {
    users.findByEmail.mockResolvedValue({ ...user, googleId: 'otra-cuenta' });
    await expect(auth.validateGoogleUser(profile)).rejects.toBeInstanceOf(ConflictException);
    expect(users.save).not.toHaveBeenCalled();
  });
  it.each([{ ...profile, emailVerified: false }, { ...profile, email: '' }, { ...profile, googleId: '' }])(
    'rechaza identidad incompleta o no verificada', async (data) => {
      await expect(auth.validateGoogleUser(data)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.save).not.toHaveBeenCalled();
    });
  it('la estrategia admite perfil sin foto ni nombre', async () => {
    const strategy = new GoogleStrategy(new ConfigService({ GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/redirect' }), auth);
    await strategy.validate('', '', { id: 'google-1', emails: [{ value: user.email, verified: true }] } as Profile);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ firstName: '', lastName: '', picture: '' }));
  });
});

describe('HTTP con Passport real y repositorio simulado', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const repository = { findOneBy: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({
        JWT_SECRET: 'jwt-test-secret-01234567890123456789', SESSION_SECRET: 'session-test-secret-01234567890123456789',
        GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/redirect', NODE_ENV: 'test',
      })] }), AuthModule,
    ] }).overrideProvider(getRepositoryToken(User)).useValue(repository).compile();
    app = module.createNestApplication();
    configureSession(app, app.get(ConfigService));
    await app.init();
    jwt = app.get(JwtService);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { repository.findOneBy.mockResolvedValue(user); });
  it('rechaza acceso sin token', () => request(app.getHttpServer()).get('/auth/profile').expect(401));
  it('rechaza firma inválida', () => request(app.getHttpServer()).get('/auth/profile').set('Authorization', 'Bearer falso').expect(401));
  it('rechaza token vencido', async () => {
    const token = await jwt.signAsync({ sub: user.id }, { expiresIn: -1 });
    await request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${token}`).expect(401);
  });
  it('devuelve el perfil con JWT válido', async () => {
    const token = await jwt.signAsync({ sub: user.id });
    const response = await request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body.id).toBe(user.id);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rechaza usuario eliminado', async () => {
    repository.findOneBy.mockResolvedValue(null);
    const token = await jwt.signAsync({ sub: user.id });
    await request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${token}`).expect(401);
  });
  it('redirige a Google con callback, scopes y state', async () => {
    const response = await request(app.getHttpServer()).get('/auth/google').expect(302);
    const url = new URL(response.headers.location as string);
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/google/redirect');
    expect(url.searchParams.get('scope')).toContain('email');
    expect(response.headers['set-cookie']).toBeDefined();
  });
  it('rechaza callback sin state válido antes de canjear el código', () =>
    request(app.getHttpServer()).get('/auth/google/redirect?code=falso&state=falso').expect(401));
});
