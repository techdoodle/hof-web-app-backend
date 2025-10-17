import { Controller, Get, Param } from '@nestjs/common';
import { MatchTypesService } from './match-types.service';
import { MatchType } from './match-types.entity';

@Controller('match-types')
export class MatchTypesController {
    constructor(private readonly matchTypesService: MatchTypesService) { }

    @Get()
    async findAll(): Promise<MatchType[]> {
        return await this.matchTypesService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id') id: number): Promise<MatchType> {
        return await this.matchTypesService.findOne(id);
    }
}
