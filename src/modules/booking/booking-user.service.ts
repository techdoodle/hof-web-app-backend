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
        email?: string;
    }): Promise<User> {
        // First, try to find existing user by phone
        let user = await this.userRepository.findOne({
            where: { phoneNumber: phone }
        });

        if (!user) {
            // If no user found by phone, check if user exists by email
            if (userData?.email) {
                user = await this.userRepository.findOne({
                    where: { email: userData.email }
                });
            }

            if (!user) {
                // Create new user if not found by phone or email
                user = this.userRepository.create({
                    phoneNumber: phone,
                    firstName: userData?.firstName || '',
                    lastName: userData?.lastName || '',
                    email: userData?.email || null,
                } as User);
                user = await this.userRepository.save(user);
            } else {
                // User exists by email but not by phone, update phone number
                user.phoneNumber = phone;
                if (userData?.firstName && !user.firstName) {
                    user.firstName = userData.firstName;
                }
                if (userData?.lastName && !user.lastName) {
                    user.lastName = userData.lastName;
                }
                user = await this.userRepository.save(user);
            }
        } else {
            // If user exists by phone, update email if provided and user doesn't have one
            if (userData?.email && !user.email) {
                // Mark that email update is needed
                (user as any).needsEmailUpdate = userData.email;
            }
        }

        return user;
    }

    async updateUserEmail(userId: number, email: string): Promise<void> {
        try {
            await this.userRepository.update(userId, { email });
        } catch (error) {
            console.error(`Failed to update email for user ${userId}:`, error);
            // Don't throw error - email update is not critical for booking
        }
    }

    async findUserById(userId: number): Promise<User | null> {
        return this.userRepository.findOne({
            where: { id: userId }
        }) || null;
    }
}
