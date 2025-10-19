export interface PaymentGatewayResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface CreateOrderResponse {
    orderId: string;
    amount: number;
    currency: string;
}

export interface VerifyPaymentResponse {
    success: boolean;
    paymentId: string;
    orderId: string;
    amount: number;
    metadata?: Record<string, any>;
}

export interface PaymentGateway {
    createOrder(
        amount: number,
        currency: string,
        metadata: Record<string, any>
    ): Promise<PaymentGatewayResponse<CreateOrderResponse>>;

    verifyPayment(
        payload: Record<string, any>,
        signature: string
    ): Promise<PaymentGatewayResponse<VerifyPaymentResponse>>;

    verifyWebhook(
        payload: any,
        signature: string
    ): Promise<boolean>;

    processRefund(
        paymentId: string,
        amount: number,
        metadata?: Record<string, any>
    ): Promise<PaymentGatewayResponse>;

    getPaymentStatus(
        paymentId: string
    ): Promise<PaymentGatewayResponse>;
}