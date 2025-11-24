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
            // Create new user if not found by phone
            user = this.userRepository.create({
                phoneNumber: phone,
                firstName: userData?.firstName || '',
                lastName: userData?.lastName || '',
                email: userData?.email || null,
            } as User);
            user = await this.userRepository.save(user);
        } else {
            // If user exists by phone, update missing fields if provided
            let needsUpdate = false;
            
            if (userData?.email && !user.email) {
                // Mark that email update is needed
                (user as any).needsEmailUpdate = userData.email;
            }
            
            // Update firstName if user has null/empty firstName and new data is provided
            if (userData?.firstName && (!user.firstName || user.firstName.trim() === '')) {
                user.firstName = userData.firstName;
                needsUpdate = true;
            }
            
            // Update lastName if user has null/empty lastName and new data is provided
            if (userData?.lastName && (!user.lastName || user.lastName.trim() === '')) {
                user.lastName = userData.lastName;
                needsUpdate = true;
            }
            
            // Save user if any updates were made
            if (needsUpdate) {
                user = await this.userRepository.save(user);
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
