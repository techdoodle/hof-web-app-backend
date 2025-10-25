import { Logger } from '@nestjs/common';

export interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    retryableErrors?: string[];
}

export class RetryManager {
    private readonly logger = new Logger(RetryManager.name);
    private readonly defaultOptions: Required<RetryOptions> = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']
    };

    async withRetry<T>(
        operation: () => Promise<T>,
        context: string,
        options?: RetryOptions
    ): Promise<T> {
        const opts = { ...this.defaultOptions, ...options };
        let lastError: Error = new Error('Operation not attempted');
        let delay = opts.initialDelay;

        for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (!this.isRetryable(error, opts.retryableErrors)) {
                    throw lastError;
                }

                if (attempt === opts.maxRetries) {
                    break;
                }

                this.logger.warn(
                    `Retry attempt ${attempt} for ${context}: ${lastError.message}`
                );

                await this.delay(delay);
                delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
            }
        }

        throw lastError;
    }

    private isRetryable(error: any, retryableErrors: string[]): boolean {
        return error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            error.message?.toLowerCase().includes('timeout') ||
            error.message?.toLowerCase().includes('network') ||
            retryableErrors.includes(error.code);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}