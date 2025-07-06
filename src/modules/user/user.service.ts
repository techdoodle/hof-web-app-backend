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

  update(id: number, data: Partial<User>) {
    return this.userRepository.update({ id }, data);
  }

  remove(id: number) {
    return this.userRepository.delete({ id });
  }

  async findByMobile(mobile: string) {
    return this.userRepository.findOne({ where: { phoneNumber: mobile } });
  }
}
