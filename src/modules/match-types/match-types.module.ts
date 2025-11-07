import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchType } from './match-types.entity';
import { MatchTypesService } from './match-types.service';
import { MatchTypesController } from './match-types.controller';

@Module({
    imports: [TypeOrmModule.forFeature([MatchType])],
    providers: [MatchTypesService],
    controllers: [MatchTypesController],
    exports: [MatchTypesService],
})
export class MatchTypesModule { }
