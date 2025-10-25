export class ServiceError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: any,
        public readonly retryable: boolean = false
    ) {
        super(message);
        this.name = 'ServiceError';
    }
}

export class ValidationError extends ServiceError {
    constructor(message: string, details?: any) {
        super(message, 'VALIDATION_ERROR', details, false);
        this.name = 'ValidationError';
    }
}

export class TransactionError extends ServiceError {
    constructor(message: string, details?: any) {
        super(message, 'TRANSACTION_ERROR', details, true);
        this.name = 'TransactionError';
    }
}

export class IntegrationError extends ServiceError {
    constructor(message: string, details?: any) {
        super(message, 'INTEGRATION_ERROR', details, true);
        this.name = 'IntegrationError';
    }
}

export class ConfigurationError extends ServiceError {
    constructor(message: string, details?: any) {
        super(message, 'CONFIGURATION_ERROR', details, false);
        this.name = 'ConfigurationError';
    }
}
