import { Controller, Post, Get, Body, Param, Delete, Query, HttpStatus, HttpCode, UseGuards, Request, Headers, Req } from '@nestjs/common';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import {
    CreateBookingDto,
    CancelBookingDto,
    InitiatePaymentDto,
    PaymentCallbackDto,
    VerifySlotsDto
} from '../../common/types/booking.types';

@Controller('bookings')
export class BookingController {
    constructor(private readonly bookingService: BookingService) { }

    @Post('verify-slots')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    verifySlots(@Body() dto: VerifySlotsDto, @Request() req) {
        const tokenUser = req.user;
        return this.bookingService.verifySlots(dto, tokenUser);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @UseGuards(JwtAuthGuard)
    createBooking(@Body() dto: CreateBookingDto, @Request() req) {
        // Extract user info from JWT token
        const tokenUser = req.user;
        return this.bookingService.createBooking(dto, tokenUser);
    }

    @Get(':bookingId')
    @UseGuards(JwtAuthGuard)
    getBooking(@Param('bookingId') bookingId: string) {
        return this.bookingService.getBookingById(bookingId);
    }

    @Get()
    @UseGuards(JwtAuthGuard)
    getBookings(
        @Query('userId') userId?: string,
        @Query('email') email?: string,
        @Query('status') status?: string
    ) {
        return this.bookingService.getBookings({ userId, email, status });
    }

    @Post(':bookingId/payment')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    initiatePayment(
        @Param('bookingId') bookingId: string,
        @Body() dto: InitiatePaymentDto
    ) {
        return this.bookingService.initiatePayment({ ...dto, bookingId });
    }

    @Post(':bookingId/cancel-payment')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    cancelPayment(@Param('bookingId') bookingId: string) {
        return this.bookingService.cancelPayment(bookingId);
    }

    @Post(':bookingId/payment/callback')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    handlePaymentCallback(
        @Param('bookingId') bookingId: string,
        @Body() dto: PaymentCallbackDto
    ) {
        return this.bookingService.handlePaymentCallback(bookingId, dto);
    }

    @Post('webhook')
    @Public()
    @HttpCode(HttpStatus.OK)
    handlePaymentWebhook(@Body() webhookData: any, @Headers() headers: any, @Req() req: any) {
        const signature = headers['x-razorpay-signature'];
        const rawBody = (req && req.rawBody) ? req.rawBody : JSON.stringify(webhookData);
        return this.bookingService.handlePaymentWebhook(webhookData, signature, rawBody);
    }

    @Delete(':bookingId/slots')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    cancelBookingSlots(
        @Param('bookingId') bookingId: string,
        @Body() dto: CancelBookingDto
    ) {
        return this.bookingService.cancelBookingSlots({ ...dto, bookingId });
    }

    @Delete(':bookingId')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    cancelBooking(@Param('bookingId') bookingId: string) {
        return this.bookingService.cancelBooking(bookingId);
    }
}
