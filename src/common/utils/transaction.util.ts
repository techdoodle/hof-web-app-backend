import { Connection, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';
import { TransactionError } from '../exceptions/service.exception';

export class TransactionManager {
    private readonly logger = new Logger(TransactionManager.name);

    constructor(private readonly connection: Connection) {}

    async withTransaction<T>(
        operation: (queryRunner: QueryRunner) => Promise<T>,
        context: string
    ): Promise<T> {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const result = await operation(queryRunner);
            await queryRunner.commitTransaction();
            return result;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(
                `Transaction failed in ${context}: ${error.message}`,
                error.stack
            );
            throw new TransactionError(
                `Transaction failed in ${context}`,
                { originalError: error.message }
            );
        } finally {
            await queryRunner.release();
        }
    }
}
