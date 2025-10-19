import { Controller, Post, Delete, Get, Body, Query } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';

@Controller('waitlist')
export class WaitlistController {
    constructor(private readonly waitlistService: WaitlistService) {}

    @Post('join')
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
    async cancelWaitlist(
        @Query('matchId') matchId: string,
        @Query('email') email: string
    ) {
        return this.waitlistService.cancelWaitlistEntry(matchId, email);
    }

    @Get('count')
    async getWaitlistCount(@Query('matchId') matchId: string) {
        return {
            count: await this.waitlistService.getActiveWaitlistCount(matchId)
        };
    }
}
