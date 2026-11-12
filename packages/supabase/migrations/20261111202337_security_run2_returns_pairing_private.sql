-- Security audit run 2: the returns cockpit pairing channel is private.
--
-- The cockpit and the phone scanner paired on a public realtime topic
-- returns:<token>. Anyone holding a pairing link (an old QR, a removed
-- employee) could send scans without signing in and read customer names in
-- the replies. The topic now names the store, returns:<tenant>:<token>, and
-- only a signed-in, active member of that store who may edit orders can
-- read or send on it.

DROP POLICY IF EXISTS returns_pairing_read ON realtime.messages;
CREATE POLICY returns_pairing_read ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        realtime.topic() ~ '^returns:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9]{8,64}$'
        AND public.has_tenant_permission(substring(realtime.topic() from '^returns:([0-9a-f-]{36}):')::uuid, 'orders.edit')
    );

DROP POLICY IF EXISTS returns_pairing_write ON realtime.messages;
CREATE POLICY returns_pairing_write ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        realtime.topic() ~ '^returns:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9]{8,64}$'
        AND public.has_tenant_permission(substring(realtime.topic() from '^returns:([0-9a-f-]{36}):')::uuid, 'orders.edit')
    );
