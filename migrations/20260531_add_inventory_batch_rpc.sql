-- Add RPC for atomic inventory batch updates
-- Uses SECURITY INVOKER so RLS policies still apply

CREATE OR REPLACE FUNCTION public.apply_inventory_batch(
    p_inventory_updates JSONB,
    p_inventory_inserts JSONB,
    p_transaction_inserts JSONB
) RETURNS VOID AS $$
DECLARE
    v_row JSONB;
BEGIN
    -- Apply inventory updates
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_inventory_updates)
    LOOP
        UPDATE public.blood_inventory
        SET quantity = (v_row->>'quantity')::INTEGER
        WHERE id = (v_row->>'id')::UUID;
    END LOOP;

    -- Apply inventory inserts
    IF jsonb_array_length(p_inventory_inserts) > 0 THEN
        INSERT INTO public.blood_inventory (org_id, blood_type, quantity, min_threshold, location, expiry_date)
        SELECT 
            (x->>'org_id')::UUID,
            x->>'blood_type',
            (x->>'quantity')::INTEGER,
            COALESCE((x->>'min_threshold')::INTEGER, 50),
            NULLIF(x->>'location', ''),
            (x->>'expiry_date')::DATE
        FROM jsonb_array_elements(p_inventory_inserts) x;
    END IF;

    -- Apply transaction inserts
    IF jsonb_array_length(p_transaction_inserts) > 0 THEN
        INSERT INTO public.blood_inventory_transactions (org_id, blood_type, transaction_type, direction, quantity, location, expiry_date, notes, reference_type, reference_id, performed_by_user_id)
        SELECT
            (x->>'org_id')::UUID,
            x->>'blood_type',
            x->>'transaction_type',
            x->>'direction',
            (x->>'quantity')::INTEGER,
            NULLIF(x->>'location', ''),
            (x->>'expiry_date')::DATE,
            NULLIF(x->>'notes', ''),
            NULLIF(x->>'reference_type', ''),
            (x->>'reference_id')::UUID,
            (x->>'performed_by_user_id')::UUID
        FROM jsonb_array_elements(p_transaction_inserts) x;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
