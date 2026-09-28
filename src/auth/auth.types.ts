import { Request } from 'express';
import { User } from '../users/user.entity';

export interface GoogleUser {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  picture: string;
}

export interface LoginResult {
  token: string;
  user: User;
}

export type GoogleRequest = Request & { user: LoginResult };
export type JwtRequest = Request & { user: User };
