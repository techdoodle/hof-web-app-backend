import { Controller, Post, Delete, Get, Body, Query, UseGuards, Param, Request } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('waitlist')
export class WaitlistController {
    constructor(private readonly waitlistService: WaitlistService) { }

    @Post('join')
    @UseGuards(JwtAuthGuard)
    async joinWaitlist(
        @Body() body: { matchId: string; email: string; slotsRequired: number; metadata?: any },
        @Request() req: any
    ) {
        const user = req.user; // Extract user from JWT token
        return this.waitlistService.joinWaitlist(
            body.matchId,
            user.id.toString(), // Pass user ID from token
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

    @Post(':waitlistId/initiate-booking')
    @UseGuards(JwtAuthGuard)
    async initiateWaitlistBooking(@Param('waitlistId') waitlistId: string) {
        return this.waitlistService.initiateWaitlistBooking(waitlistId);
    }

    @Post(':waitlistId/confirm-booking')
    @UseGuards(JwtAuthGuard)
    async confirmWaitlistBooking(
        @Param('waitlistId') waitlistId: string,
        @Body() body: { paymentOrderId: string; paymentId: string; signature: string }
    ) {
        return this.waitlistService.confirmWaitlistBooking(
            waitlistId,
            body.paymentOrderId,
            body.paymentId,
            body.signature
        );
    }

    @Get(':waitlistId')
    @UseGuards(JwtAuthGuard)
    async getWaitlistEntry(@Param('waitlistId') waitlistId: string) {
        return this.waitlistService.getWaitlistEntry(waitlistId);
    }
}
