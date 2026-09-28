import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoogleRequest, JwtRequest, LoginResult } from './auth.types';
import { User } from '../users/user.entity';

@Controller('auth')
export class AuthController {
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    // Passport envía la redirección a Google antes de ejecutar este método.
  }

  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  @Header('Cache-Control', 'no-store')
  googleAuthRedirect(@Req() req: GoogleRequest): LoginResult {
    return req.user;
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @Header('Cache-Control', 'no-store')
  profile(@Req() req: JwtRequest): User {
    return req.user;
  }
}
