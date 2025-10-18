export interface PushSubscription {
    user_id: number;
    endpoint: string;
    expiration_time: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}