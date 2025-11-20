export interface RefundBreakdownDto {
    refundPercentage: number;
    refundAmount: number;
    hoursUntilMatch: number;
    eligibleForRefund: boolean;
    perSlotAmount: number;
    totalSlotsToCancel: number;
    baseRefundAmount: number;
    timeWindow: 'FULL_REFUND' | 'PARTIAL_REFUND' | 'NO_REFUND';
}

