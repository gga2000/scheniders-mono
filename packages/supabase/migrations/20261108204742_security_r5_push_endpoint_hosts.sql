-- Security round 5 (B-09): the server POSTs to every stored push endpoint, and
-- members can write their own rows directly through the API, so the database
-- itself only accepts the push services browsers hand out (same list as
-- apps/platform/lib/chat/push-endpoint.ts). Existing rows are all FCM.
ALTER TABLE public.chat_push_subscriptions DROP CONSTRAINT IF EXISTS chat_push_subscriptions_endpoint_push_service;
ALTER TABLE public.chat_push_subscriptions
    ADD CONSTRAINT chat_push_subscriptions_endpoint_push_service CHECK (
        length(endpoint) <= 2048
        AND endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
    );
