-- Triggers for trust recalculation

CREATE OR REPLACE FUNCTION trigger_update_trust_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        IF OLD.phone IS NOT NULL THEN PERFORM calculate_customer_trust(OLD.phone); END IF;
        RETURN OLD;
    ELSE
        IF NEW.phone IS NOT NULL THEN PERFORM calculate_customer_trust(NEW.phone); END IF;
        IF (TG_OP = 'UPDATE' AND OLD.phone IS NOT NULL AND OLD.phone <> NEW.phone) THEN
            PERFORM calculate_customer_trust(OLD.phone);
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_trust_orders ON orders;
CREATE TRIGGER trg_update_trust_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION trigger_update_trust_on_order();

CREATE OR REPLACE FUNCTION trigger_update_trust_on_blacklist()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM calculate_customer_trust(OLD.phone);
        RETURN OLD;
    ELSE
        PERFORM calculate_customer_trust(NEW.phone);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_trust_blacklist ON blacklist;
CREATE TRIGGER trg_update_trust_blacklist
AFTER INSERT OR UPDATE OR DELETE ON blacklist
FOR EACH ROW EXECUTE FUNCTION trigger_update_trust_on_blacklist();

CREATE OR REPLACE FUNCTION trigger_update_trust_on_rating()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_customer_trust(NEW.customer_phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_trust_ratings ON community_ratings;
CREATE TRIGGER trg_update_trust_ratings
AFTER INSERT OR UPDATE ON community_ratings
FOR EACH ROW EXECUTE FUNCTION trigger_update_trust_on_rating();;
