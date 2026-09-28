import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { ConfigModule } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/users/user.entity';

describe('Persistencia en PostgreSQL real', () => {
  let db: DataSource;
  let users: UsersService;
  let auth: AuthService;
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    await ConfigModule.forRoot();
    db = new DataSource({ type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
      schema, entities: [User], synchronize: false });
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    users = new UsersService(db.getRepository(User));
    auth = new AuthService(users, new JwtService({ secret: 'solo-test', signOptions: { expiresIn: '1h' } }));
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      // Solo elimina el esquema aleatorio creado por esta prueba, nunca public.
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.destroy();
    }
  });
  it('registra, vuelve a ingresar, vincula y controla duplicados', async () => {
    const profile = { googleId: 'g1', email: 'uno@example.com', emailVerified: true, firstName: 'Ana', lastName: '', picture: '' };
    const first = await auth.validateGoogleUser(profile);
    const second = await auth.validateGoogleUser({ ...profile, firstName: 'Actualizado' });
    expect(second.user.id).toBe(first.user.id);
    expect((await users.findById(first.user.id))?.firstName).toBe('Actualizado');
    expect(await db.getRepository(User).count()).toBe(1);
    expect(first.user.createdAt).toBeInstanceOf(Date);
    const previous = await users.save({ email: 'dos@example.com', googleId: null });
    const linked = await auth.validateGoogleUser({ ...profile, email: previous.email, googleId: 'g2' });
    expect(linked.user.id).toBe(previous.id);
    await expect(users.save({ email: previous.email, googleId: 'g3' })).rejects.toBeInstanceOf(ConflictException);
    await expect(users.save({ email: 'tres@example.com', googleId: 'g2' })).rejects.toBeInstanceOf(ConflictException);
  });
});
