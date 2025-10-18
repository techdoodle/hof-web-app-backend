CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY,
    endpoint VARCHAR NOT NULL,
    expiration_time BIGINT NULL,
    keys JSONB NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);