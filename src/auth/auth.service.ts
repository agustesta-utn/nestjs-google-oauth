import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { GoogleUser, LoginResult } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService, private readonly jwt: JwtService) {}

  async validateGoogleUser(profile: GoogleUser): Promise<LoginResult> {
    const email = profile.email.trim().toLowerCase();
    if (!profile.googleId || !email || !profile.emailVerified) {
      throw new UnauthorizedException('Google no proporcionó un email verificado');
    }
    let user = await this.users.findByGoogleId(profile.googleId);
    if (!user) {
      user = await this.users.findByEmail(email);
      if (user?.googleId && user.googleId !== profile.googleId) {
        throw new ConflictException('El email ya está vinculado a otra cuenta de Google');
      }
    }
    const saved = await this.users.save({
      ...(user ?? {}),
      googleId: profile.googleId,
      email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      picture: profile.picture,
    });
    const token = await this.jwt.signAsync({ sub: saved.id, email: saved.email });
    return { token, user: saved };
  }
}
