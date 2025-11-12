import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/user/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET, // or your config
    });
  }

  async validate(payload: any) {
    // Fetch the complete user data including role
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['city', 'preferredTeam']
    });

    if (!user) {
      return null; // User not found
    }

    const result = {
      userId: user.id,
      mobile: user.phoneNumber,
      ...user // Include all user data (including role)
    };

    return result;
  }
}
