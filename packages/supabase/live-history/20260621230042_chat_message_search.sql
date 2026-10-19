-- =============================================
-- CHAT PHASE 2B: full-text message search ('simple' config; AR+EN, no stemming)
-- =============================================
CREATE INDEX IF NOT EXISTS chat_messages_body_fts_idx
  ON public.chat_messages USING gin (to_tsvector('simple', body));

CREATE OR REPLACE FUNCTION public.chat_search_messages(p_query text, p_limit int DEFAULT 30)
RETURNS TABLE (
    message_id        uuid,
    conversation_id   uuid,
    conversation_name text,
    conversation_kind text,
    sender_id         uuid,
    body              text,
    snippet           text,
    created_at        timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
DECLARE v_q tsquery;
BEGIN
    IF coalesce(btrim(p_query), '') = '' THEN RETURN; END IF;
    v_q := websearch_to_tsquery('simple', p_query);
    IF v_q IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        m.id, m.conversation_id, c.name, c.kind, m.sender_id, m.body,
        ts_headline('simple', m.body, v_q,
            'StartSel=«,StopSel=»,MaxFragments=1,MaxWords=12,MinWords=4,ShortWord=0'),
        m.created_at
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
    WHERE m.deleted_at IS NULL
      AND to_tsvector('simple', m.body) @@ v_q
      AND m.conversation_id IN (
          SELECT cm.conversation_id FROM public.chat_members cm WHERE cm.user_id = auth.uid()
      )
    ORDER BY ts_rank(to_tsvector('simple', m.body), v_q) DESC, m.created_at DESC
    LIMIT least(coalesce(p_limit, 30), 50);
END; $$;

REVOKE EXECUTE ON FUNCTION public.chat_search_messages(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_search_messages(text, int) TO authenticated;;
