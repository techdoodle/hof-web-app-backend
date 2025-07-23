import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  create(data: Partial<User>) {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  findAll() {
    return this.userRepository.find();
  }

  findOne(id: number) {
    return this.userRepository.findOneBy({ id });
  }

  async update(id: number, data: Partial<User>) {
    // First update with the provided data
    await this.userRepository.update({ id }, data);
    
    // Get the updated user to check if all fields are filled
    const updatedUser = await this.userRepository.findOneBy({ id });
    
    if (updatedUser) {
      // Check if all optional fields are filled
      const allFieldsFilled = updatedUser.username && 
                             updatedUser.email && 
                             updatedUser.firstName &&
                             updatedUser.lastName &&
                             updatedUser.city &&
                             updatedUser.gender &&
                             updatedUser.playerCategory && 
                             updatedUser.profilePicture &&
                             updatedUser.preferredTeam;
      
      // If all fields are filled and onboarding is not already complete, mark it as complete
      if (allFieldsFilled && !updatedUser.onboardingComplete) {
        await this.userRepository.update({ id }, { onboardingComplete: true });
      }
    }
    
    return this.userRepository.findOneBy({ id });
  }

  remove(id: number) {
    return this.userRepository.delete({ id });
  }

  async findByMobile(mobile: string) {
    return this.userRepository.findOne({ where: { phoneNumber: mobile } });
  }

  async setWhatsappInviteOpt(userId: number): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });
    
    if (!user) {
      throw new Error('User not found');
    }

    // If whatsapp invite flag is already true, set invite sent flag to false
    if (user.whatsappInviteOpt) {
      await this.userRepository.update({ id: userId }, { inviteSent: false });
    } else {
      // If whatsapp invite flag is false, set it to true
      await this.userRepository.update({ id: userId }, { whatsappInviteOpt: true });
    }

    // Return the updated user
    const updatedUser = await this.userRepository.findOneBy({ id: userId });
    if (!updatedUser) {
      throw new Error('Failed to retrieve updated user');
    }
    return updatedUser;
  }
}
