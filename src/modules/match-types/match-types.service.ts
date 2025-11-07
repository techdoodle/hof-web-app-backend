import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchType } from './match-types.entity';

@Injectable()
export class MatchTypesService {
    constructor(
        @InjectRepository(MatchType)
        private readonly matchTypeRepository: Repository<MatchType>,
    ) { }

    async findAll(): Promise<MatchType[]> {
        return await this.matchTypeRepository.find();
    }

    async findOne(id: number): Promise<MatchType> {
        const matchType = await this.matchTypeRepository.findOne({ where: { id } });
        if (!matchType) throw new Error(`MatchType with ID ${id} not found`);
        return matchType;
    }

    async findByType(matchType: string): Promise<MatchType> {
        const type = await this.matchTypeRepository.findOne({ where: { matchType } });
        if (!type) throw new Error(`MatchType '${matchType}' not found`);
        return type;
    }
}
