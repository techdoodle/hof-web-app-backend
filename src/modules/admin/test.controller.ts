import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { PlayerNationService } from './services/playernation.service';

@Controller('test')
export class TestController {
    constructor(
        private readonly playerNationService: PlayerNationService,
    ) {}

    @Get('admin')
    async testAdmin() {
        return { 
            message: 'Admin test endpoint working',
            timestamp: new Date().toISOString(),
            playerNationServiceAvailable: !!this.playerNationService
        };
    }

    @Get('playernation')
    async testPlayerNation() {
        try {
            const token = await this.playerNationService.getValidToken();
            return { 
                message: 'PlayerNation service working', 
                tokenLength: token ? token.length : 0,
                hasToken: !!token
            };
        } catch (error) {
            console.error('PlayerNation test error:', error.message);
            return { 
                message: 'PlayerNation service error', 
                error: error.message 
            };
        }
    }

    @Post('playernation/submit/:matchId')
    async testSubmitToPlayerNation(
        @Param('matchId') matchId: string,
        @Body() payload: any
    ) {
        console.log('=== TEST PLAYERNATION SUBMIT ===', { 
            matchId, 
            teamAPlayerCount: payload.players?.teamA?.length || 0,
            teamBPlayerCount: payload.players?.teamB?.length || 0,
            totalPlayerCount: (payload.players?.teamA?.length || 0) + (payload.players?.teamB?.length || 0)
        });
        
        try {
            const result = await this.playerNationService.submitMatch(parseInt(matchId), payload);
            console.log('Test submit success:', result);
            return result;
        } catch (error) {
            console.error('Test submit error:', error.message);
            return { error: error.message };
        }
    }
}
