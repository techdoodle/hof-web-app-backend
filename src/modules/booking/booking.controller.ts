import { Controller, Post, Get, Body, Param, Delete, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { BookingService } from './booking.service';
import {
    CreateBookingDto,
    CancelBookingDto,
    InitiatePaymentDto,
    PaymentCallbackDto
} from '../../common/types/booking.types';

@Controller('bookings')
export class BookingController {
    constructor(private readonly bookingService: BookingService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    createBooking(@Body() dto: CreateBookingDto) {
        return this.bookingService.createBooking(dto);
    }

    @Get(':bookingId')
    getBooking(@Param('bookingId') bookingId: string) {
        return this.bookingService.getBookingById(bookingId);
    }

    @Get()
    getBookings(
        @Query('userId') userId?: string,
        @Query('email') email?: string,
        @Query('status') status?: string
    ) {
        return this.bookingService.getBookings({ userId, email, status });
    }

    @Post(':bookingId/payment')
    @HttpCode(HttpStatus.OK)
    initiatePayment(
        @Param('bookingId') bookingId: string,
        @Body() dto: InitiatePaymentDto
    ) {
        return this.bookingService.initiatePayment({ ...dto, bookingId });
    }

    @Post(':bookingId/payment/callback')
    @HttpCode(HttpStatus.OK)
    handlePaymentCallback(
        @Param('bookingId') bookingId: string,
        @Body() dto: PaymentCallbackDto
    ) {
        return this.bookingService.handlePaymentCallback(bookingId, dto);
    }

    @Delete(':bookingId/slots')
    @HttpCode(HttpStatus.OK)
    cancelBookingSlots(
        @Param('bookingId') bookingId: string,
        @Body() dto: CancelBookingDto
    ) {
        return this.bookingService.cancelBookingSlots({ ...dto, bookingId });
    }
}
