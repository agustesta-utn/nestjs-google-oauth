import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repository: Repository<User>) {}

  findById(id: string): Promise<User | null> { return this.repository.findOneBy({ id }); }
  findByGoogleId(googleId: string): Promise<User | null> { return this.repository.findOneBy({ googleId }); }
  findByEmail(email: string): Promise<User | null> { return this.repository.findOneBy({ email }); }

  async save(data: Partial<User>): Promise<User> {
    try {
      return await this.repository.save(this.repository.create(data));
    } catch (error: unknown) {
      // PostgreSQL 23505: se violó una restricción UNIQUE, incluso ante solicitudes simultáneas.
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505') {
        throw new ConflictException('El email o la cuenta de Google ya están registrados');
      }
      throw error;
    }
  }
}
