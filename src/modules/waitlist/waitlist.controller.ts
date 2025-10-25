import { Controller, Post, Delete, Get, Body, Query, UseGuards } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('waitlist')
export class WaitlistController {
    constructor(private readonly waitlistService: WaitlistService) { }

    @Post('join')
    @UseGuards(JwtAuthGuard)
    async joinWaitlist(
        @Body() body: { matchId: string; email: string; slotsRequired: number; metadata?: any }
    ) {
        return this.waitlistService.joinWaitlist(
            body.matchId,
            body.email,
            body.slotsRequired,
            body.metadata
        );
    }

    @Delete('cancel')
    @UseGuards(JwtAuthGuard)
    async cancelWaitlist(
        @Query('matchId') matchId: string,
        @Query('email') email: string
    ) {
        return this.waitlistService.cancelWaitlistEntry(matchId, email);
    }

    @Get('count')
    @UseGuards(JwtAuthGuard)
    async getWaitlistCount(@Query('matchId') matchId: string) {
        return {
            count: await this.waitlistService.getActiveWaitlistCount(matchId)
        };
    }
}
