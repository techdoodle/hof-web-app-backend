import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { RefundEntity } from './refund.entity';
import { RefundStatus } from '../../common/types/booking.types';

interface InitiateRefundParams {
    bookingId: string;
    amount: number;
    reason: string;
    slots?: number[];
    metadata?: Record<string, any>;
}

@Injectable()
export class RefundService {
    constructor(
        @InjectRepository(RefundEntity)
        private refundRepository: Repository<RefundEntity>,
    ) {}

    async initiateRefund(params: InitiateRefundParams, queryRunner: QueryRunner) {
        const refund = this.refundRepository.create({
            bookingId: params.bookingId,
            amount: params.amount,
            reason: params.reason,
            status: RefundStatus.PENDING,
            metadata: {
                ...params.metadata,
                slots: params.slots
            }
        });

        // Save using the provided query runner to maintain transaction
        await queryRunner.manager.save(refund);

        // Here you would integrate with your payment gateway to initiate the actual refund
        // For now, we'll just save the record

        return refund;
    }
}
