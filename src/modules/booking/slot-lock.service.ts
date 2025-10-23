import { Injectable, Logger } from '@nestjs/common';
import { QueryRunner } from 'typeorm';

@Injectable()
export class SlotLockService {
    private readonly logger = new Logger(SlotLockService.name);

    async tryLockSlots(
        matchId: string,
        slotNumbers: number[],
        queryRunner: QueryRunner
    ): Promise<{ success: boolean; lockKey?: string }> {
        try {
            // Get current match state with lock
            const result = await queryRunner.query(
                `SELECT version, booked_slots, locked_slots 
                 FROM matches 
                 WHERE match_id = $1 
                 FOR UPDATE`,
                [matchId]
            );

            if (!result?.length) {
                return { success: false };
            }

            const match = result[0];
            const currentTime = new Date();
            const lockedSlots = match.locked_slots || {};

            // Clean expired locks
            Object.entries(lockedSlots).forEach(([bookingId, data]: [string, any]) => {
                if (new Date(data.expires_at) < currentTime) {
                    delete lockedSlots[bookingId];
                }
            });

            // Check if any requested slots are locked
            const allLockedSlots = Object.values(lockedSlots)
                .flatMap((data: any) => data.slots);

            const isAnySlotLocked = slotNumbers.some(
                slot => allLockedSlots.includes(slot)
            );

            if (isAnySlotLocked) {
                return { success: false };
            }

            // Add new lock
            const lockExpiryTime = new Date(Date.now() + 7 * 60 * 1000); // 7 minutes
            const tempBookingId = `temp_${Date.now()}`;
            lockedSlots[tempBookingId] = {
                slots: slotNumbers,
                expires_at: lockExpiryTime
            };

            // Update match with new locks
            await queryRunner.query(
                `UPDATE matches 
                 SET locked_slots = $1,
                     version = version + 1
                 WHERE match_id = $2 
                 AND version = $3`,
                [JSON.stringify(lockedSlots), matchId, match.version]
            );

            return { success: true, lockKey: tempBookingId };
        } catch (error) {
            this.logger.error(
                `Failed to lock slots: ${error.message}`,
                error.stack
            );
            return { success: false };
        }
    }
}