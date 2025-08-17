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

  async create(data: Partial<User>) {
    const user = this.userRepository.create(data);
    const savedUser = await this.userRepository.save(user);
    // Return the user with relations loaded
    return this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: ['city', 'preferredTeam']
    });
  }

  findAll() {
    return this.userRepository.find();
  }

  findOne(id: number) {
    return this.userRepository.findOne({
      where: { id },
      relations: ['city', 'preferredTeam']
    });
  }

  async update(id: number, data: Partial<User>) {
    // First update with the provided data
    await this.userRepository.update({ id }, data);
    
    // Get the updated user to check if all mandatory fields are filled
    const updatedUser = await this.userRepository.findOne({
      where: { id },
      relations: ['city', 'preferredTeam']
    });
    
    if (updatedUser) {
      // Check if all mandatory onboarding fields are filled
      const mandatoryFieldsFilled = updatedUser.firstName &&
                                   updatedUser.lastName &&
                                   updatedUser.city &&
                                   updatedUser.gender &&
                                   updatedUser.profilePicture &&
                                   updatedUser.playerCategory && 
                                   updatedUser.preferredTeam;
      
      // If all mandatory fields are filled and onboarding is not already complete, mark it as complete
      if (mandatoryFieldsFilled && !updatedUser.onboardingComplete) {
        await this.userRepository.update({ id }, { onboardingComplete: true });
      }
    }
    
    return this.userRepository.findOne({
      where: { id },
      relations: ['city', 'preferredTeam']
    });
  }

  remove(id: number) {
    return this.userRepository.delete({ id });
  }

  async findByMobile(mobile: string) {
    return this.userRepository.findOne({ 
      where: { phoneNumber: mobile },
      relations: ['city', 'preferredTeam']
    });
  }

  async findByEmail(email: string) {
    return this.userRepository.findOne({ 
      where: { email },
      relations: ['city', 'preferredTeam']
    });
  }

  async setWhatsappInviteOpt(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['city', 'preferredTeam']
    });
    
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
    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['city', 'preferredTeam']
    });
    if (!updatedUser) {
      throw new Error('Failed to retrieve updated user');
    }
    return updatedUser;
  }
}
