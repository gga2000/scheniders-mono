-- An order's team-chat thread was named 'Order 1261122001' in English, and the
-- chat shows the stored name as is, so an Arabic shop read an English title.
-- Name it '#1261122001' instead: the order number reads the same in both
-- languages, as the order card writes it. Threads made before this keep
-- their old name. Nothing else in the function changes.

CREATE OR REPLACE FUNCTION public.chat_find_or_create_order_conversation(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant_id uuid;
    v_order_display text;
    v_assigned_to uuid;
    v_conv_id uuid;
BEGIN
    SELECT tenant_id, order_id, assigned_to
      INTO v_tenant_id, v_order_display, v_assigned_to
    FROM public.orders WHERE id = p_order_id;

    IF v_tenant_id IS NULL OR v_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'order not in your tenant' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_conv_id FROM public.chat_conversations WHERE kind = 'order' AND order_id = p_order_id;
    IF v_conv_id IS NULL THEN
        INSERT INTO public.chat_conversations (tenant_id, kind, name, order_id, is_private, created_by)
        VALUES (v_tenant_id, 'order', '#' || COALESCE(v_order_display, ''), p_order_id, true, auth.uid())
        RETURNING id INTO v_conv_id;
    END IF;

    INSERT INTO public.chat_members (conversation_id, user_id, role)
    VALUES (v_conv_id, auth.uid(), 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    IF v_assigned_to IS NOT NULL AND v_assigned_to <> auth.uid()
       AND EXISTS (SELECT 1 FROM public.tenant_members
                   WHERE tenant_id = v_tenant_id AND user_id = v_assigned_to AND status = 'active') THEN
        INSERT INTO public.chat_members (conversation_id, user_id, role)
        VALUES (v_conv_id, v_assigned_to, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;

    RETURN v_conv_id;
END;
$function$;

