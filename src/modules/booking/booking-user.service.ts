import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';

@Injectable()
export class BookingUserService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    async findOrCreateUserByPhone(phone: string, userData?: {
        firstName?: string;
        lastName?: string;
    }): Promise<User> {
        // First, try to find existing user by phone
        let user = await this.userRepository.findOne({
            where: { phoneNumber: phone }
        });

        if (!user) {
            // Create new user if not found
            user = this.userRepository.create({
                phoneNumber: phone,
                firstName: userData?.firstName || '',
                lastName: userData?.lastName || '',
            } as User);
            user = await this.userRepository.save(user);
        }
        // If user exists, skip updating names (don't override existing data)

        return user;
    }

    async findUserById(userId: number): Promise<User | null> {
        return this.userRepository.findOne({
            where: { id: userId }
        }) || null;
    }
}
