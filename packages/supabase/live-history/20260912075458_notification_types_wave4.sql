-- D1-D6: six new notification categories.
--
-- Each is now a row plus a trigger. The dispatcher, the per-category
-- preferences, quiet hours, mute and digest all apply to them for free — which
-- is the whole reason E1 (one notifications table) came before this.
--
-- Stock lives on `products`, not `product_variants` (that table is empty), and
-- `inventory_alerts` is written by nothing, so D1 reads the real columns.

-- ---------------------------------------------------------------------------
-- D1. Inventory — crossing INTO low stock or out of stock.
--
-- Statement-level with transition tables: a stock take or a bulk import updates
-- many products at once, and a per-row trigger would produce one notification
-- per product.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_inventory_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_crossed INTEGER;
BEGIN
    -- Only the transition matters. Staying low is not news; going low is.
    CREATE TEMP TABLE _crossed ON COMMIT DROP AS
    SELECT n.id, n.tenant_id, n.name, n.stock_quantity,
           COALESCE(n.low_stock_threshold, 0) AS threshold,
           (n.stock_quantity <= 0) AS is_out
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE n.tenant_id IS NOT NULL
      AND n.stock_quantity IS NOT NULL
      AND o.stock_quantity IS DISTINCT FROM n.stock_quantity
      AND (
            (n.stock_quantity <= 0 AND o.stock_quantity > 0)
         OR (COALESCE(n.low_stock_threshold, 0) > 0
             AND n.stock_quantity > 0
             AND n.stock_quantity <= n.low_stock_threshold
             AND o.stock_quantity > COALESCE(o.low_stock_threshold, 0))
      );

    SELECT count(*) INTO v_crossed FROM _crossed;
    IF v_crossed = 0 THEN RETURN NULL; END IF;

    IF v_crossed > 5 THEN
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, priority, group_key
        )
        SELECT c.tenant_id, 'inventory.bulk_low', 'inventory', 'tenant', 'Automation',
               NULL, NULL, NULL,
               jsonb_build_object('count', count(*),
                                  'out_of_stock', count(*) FILTER (WHERE c.is_out)),
               'high', 'inventory_bulk:' || txid_current()::text
        FROM _crossed c GROUP BY c.tenant_id;
        RETURN NULL;
    END IF;

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name,
        entity_type, entity_id, entity_label, payload, priority, group_key
    )
    SELECT c.tenant_id,
           CASE WHEN c.is_out THEN 'inventory.out_of_stock' ELSE 'inventory.low_stock' END,
           'inventory', 'tenant', 'Automation',
           'product', c.id, c.name,
           jsonb_build_object('stock', c.stock_quantity, 'threshold', c.threshold),
           CASE WHEN c.is_out THEN 'urgent' ELSE 'high' END,
           'product:' || c.id::text
    FROM _crossed c;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_inventory_notifications() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_inventory_notifications ON public.products;
CREATE TRIGGER trg_log_inventory_notifications
AFTER UPDATE ON public.products
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.log_inventory_notifications();

-- ---------------------------------------------------------------------------
-- D2. Delivery — a shipping export that failed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_shipping_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.tenant_id IS NULL OR COALESCE(NEW.succeeded, true) THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name,
        entity_type, entity_id, entity_label, payload, priority, group_key
    ) VALUES (
        NEW.tenant_id, 'delivery.export_failed', 'delivery', 'tenant', 'Automation',
        'shipping_export', NEW.id, NEW.company,
        jsonb_strip_nulls(jsonb_build_object(
            'order_count',   NEW.order_count,
            'failure_stage', NEW.failure_stage,
            'error',         left(COALESCE(NEW.error_message, ''), 200))),
        'urgent', 'shipping_export:' || NEW.id::text
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_shipping_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_shipping_notification ON public.shipping_export_log;
CREATE TRIGGER trg_log_shipping_notification
AFTER INSERT ON public.shipping_export_log
FOR EACH ROW EXECUTE FUNCTION public.log_shipping_notification();

-- ---------------------------------------------------------------------------
-- D3. Finance — the wallet dropping to its own threshold. A wallet at zero
-- stops the tenant operating, so they should hear it before a customer does.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_wallet_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_threshold NUMERIC;
BEGIN
    IF NEW.tenant_id IS NULL OR NEW.balance_iqd IS NULL THEN RETURN NEW; END IF;
    v_threshold := COALESCE(NEW.threshold_iqd, 0);

    -- Only on the way down, and only on the crossing itself.
    IF NOT (NEW.balance_iqd <= v_threshold AND COALESCE(OLD.balance_iqd, 0) > v_threshold) THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name,
        entity_type, entity_id, entity_label, payload, priority, group_key
    ) VALUES (
        NEW.tenant_id,
        CASE WHEN NEW.balance_iqd <= 0 THEN 'finance.wallet_empty' ELSE 'finance.wallet_low' END,
        'finance', 'tenant', 'Automation',
        'wallet', NEW.id, NULL,
        jsonb_build_object('balance', NEW.balance_iqd, 'threshold', v_threshold),
        'urgent', 'wallet:' || NEW.id::text
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_wallet_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_wallet_notification ON public.wallet;
CREATE TRIGGER trg_log_wallet_notification
AFTER UPDATE ON public.wallet
FOR EACH ROW EXECUTE FUNCTION public.log_wallet_notification();

-- ---------------------------------------------------------------------------
-- D4. Customer — a new review, and a cart that came back.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_review_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name,
        entity_type, entity_id, entity_label, payload, priority, group_key
    ) VALUES (
        NEW.tenant_id, 'customer.review_created', 'customer', 'tenant',
        COALESCE(NULLIF(btrim(NEW.author_name), ''), 'Customer'),
        'product', NEW.product_id,
        (SELECT p.name FROM public.products p WHERE p.id = NEW.product_id),
        jsonb_strip_nulls(jsonb_build_object(
            'rating',  NEW.rating,
            'title',   NEW.title,
            'preview', left(COALESCE(NEW.body, ''), 140),
            'status',  NEW.status)),
        -- A poor review needs an answer faster than a good one.
        CASE WHEN COALESCE(NEW.rating, 5) <= 2 THEN 'high' ELSE 'normal' END,
        'product:' || COALESCE(NEW.product_id::text, NEW.id::text)
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_review_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_review_notification ON public.product_reviews;
CREATE TRIGGER trg_log_review_notification
AFTER INSERT ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.log_review_notification();

CREATE OR REPLACE FUNCTION public.log_cart_recovered_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.tenant_id IS NULL
       OR NEW.recovered_at IS NULL
       OR OLD.recovered_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name,
        entity_type, entity_id, entity_label, payload, group_key
    ) VALUES (
        NEW.tenant_id, 'customer.cart_recovered', 'customer', 'tenant', 'Automation',
        'cart', NEW.id, NULL,
        jsonb_build_object('subtotal', NEW.subtotal_iqd),
        'cart:' || NEW.id::text
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_cart_recovered_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_cart_recovered_notification ON public.abandoned_carts;
CREATE TRIGGER trg_log_cart_recovered_notification
AFTER UPDATE ON public.abandoned_carts
FOR EACH ROW EXECUTE FUNCTION public.log_cart_recovered_notification();

-- ---------------------------------------------------------------------------
-- D5. Team — someone joined, or someone's role changed. Role changes are
-- security-relevant and were previously invisible to everyone but the person
-- who made them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_team_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_member TEXT;
    v_actor  TEXT;
    v_uid    UUID;
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

    SELECT display_name INTO v_member FROM public.user_profiles WHERE id = NEW.user_id;
    v_member := COALESCE(NULLIF(btrim(COALESCE(v_member, '')), ''), 'A teammate');

    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT display_name INTO v_actor FROM public.user_profiles WHERE id = v_uid;
    END IF;
    v_actor := COALESCE(NULLIF(btrim(COALESCE(v_actor, '')), ''), 'Automation');

    IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, group_key
        ) VALUES (
            NEW.tenant_id, 'team.member_joined', 'team', 'tenant', v_actor,
            'user', NEW.user_id, v_member,
            jsonb_build_object('role', NEW.role),
            'member:' || NEW.user_id::text
        );

    ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, priority, group_key
        ) VALUES (
            NEW.tenant_id, 'team.role_changed', 'team', 'tenant', v_actor,
            'user', NEW.user_id, v_member,
            jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role),
            'high', 'member:' || NEW.user_id::text
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_team_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_team_notification ON public.tenant_members;
CREATE TRIGGER trg_log_team_notification
AFTER INSERT OR UPDATE ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.log_team_notification();;
