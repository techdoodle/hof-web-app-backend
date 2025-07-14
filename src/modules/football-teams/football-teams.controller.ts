import { Controller, Get, Query, Param } from '@nestjs/common';
import { FootballTeamsService } from './football-teams.service';

@Controller('football-teams')
export class FootballTeamsController {
  constructor(private readonly footballTeamsService: FootballTeamsService) {}

  @Get('top')
  async getTopTeams(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 9;
    return this.footballTeamsService.getTopTeams(limitNum);
  }

  @Get('search')
  async searchTeams(@Query('q') query: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.footballTeamsService.searchTeamsByName(query.trim());
  }

  @Get(':id')
  async getTeamById(@Param('id') id: string) {
    return this.footballTeamsService.findById(parseInt(id, 10));
  }

  @Get()
  async getAllTeams() {
    return this.footballTeamsService.findAll();
  }
} 