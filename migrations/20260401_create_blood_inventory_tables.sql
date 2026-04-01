BEGIN;

CREATE TABLE IF NOT EXISTS public.blood_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    blood_type TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_threshold INTEGER NOT NULL DEFAULT 50,
    expiry_date DATE NULL,
    location TEXT NULL,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blood_inventory_blood_type_check CHECK (blood_type IN ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
    CONSTRAINT blood_inventory_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT blood_inventory_threshold_non_negative CHECK (min_threshold >= 0),
    CONSTRAINT blood_inventory_location_not_blank CHECK (location IS NULL OR char_length(trim(location)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS blood_inventory_unique_batch_idx
    ON public.blood_inventory (
        org_id,
        blood_type,
        COALESCE(NULLIF(trim(location), ''), 'UNSPECIFIED'),
        COALESCE(expiry_date, DATE '9999-12-31')
    );

CREATE INDEX IF NOT EXISTS blood_inventory_org_blood_type_idx
    ON public.blood_inventory (org_id, blood_type);

CREATE INDEX IF NOT EXISTS blood_inventory_org_expiry_idx
    ON public.blood_inventory (org_id, expiry_date)
    WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS blood_inventory_org_updated_idx
    ON public.blood_inventory (org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.blood_inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    blood_type TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    location TEXT NULL,
    expiry_date DATE NULL,
    notes TEXT NULL,
    reference_type TEXT NULL,
    reference_id UUID NULL,
    performed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blood_inventory_transactions_blood_type_check CHECK (blood_type IN ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
    CONSTRAINT blood_inventory_transactions_type_check CHECK (transaction_type IN ('add_stock', 'usage', 'wastage', 'adjustment')),
    CONSTRAINT blood_inventory_transactions_direction_check CHECK (direction IN ('in', 'out')),
    CONSTRAINT blood_inventory_transactions_quantity_positive CHECK (quantity > 0),
    CONSTRAINT blood_inventory_transactions_location_not_blank CHECK (location IS NULL OR char_length(trim(location)) > 0)
);

CREATE INDEX IF NOT EXISTS blood_inventory_transactions_org_created_idx
    ON public.blood_inventory_transactions (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS blood_inventory_transactions_org_blood_type_idx
    ON public.blood_inventory_transactions (org_id, blood_type, created_at DESC);

CREATE INDEX IF NOT EXISTS blood_inventory_transactions_org_type_idx
    ON public.blood_inventory_transactions (org_id, transaction_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_blood_inventory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blood_inventory_touch_updated_at ON public.blood_inventory;
CREATE TRIGGER trg_blood_inventory_touch_updated_at
BEFORE UPDATE ON public.blood_inventory
FOR EACH ROW
EXECUTE FUNCTION public.touch_blood_inventory_updated_at();

DO $$
BEGIN
    IF to_regclass('public.roles') IS NOT NULL THEN
        INSERT INTO public.roles (name, description)
        VALUES
            ('doctor', 'Clinical approver and medical reviewer'),
            ('nurse', 'Clinical operations and blood handling')
        ON CONFLICT (name) DO NOTHING;
    END IF;

    IF to_regclass('public.role_permissions') IS NOT NULL
       AND to_regclass('public.permissions') IS NOT NULL
       AND to_regclass('public.roles') IS NOT NULL THEN
        WITH role_permission_map AS (
            SELECT role_name, permission_name
            FROM (
                VALUES
                    ('coordinator', 'inventory.read'),
                    ('coordinator', 'inventory.update'),
                    ('doctor', 'inventory.read'),
                    ('doctor', 'inventory.update'),
                    ('nurse', 'inventory.read'),
                    ('nurse', 'inventory.update'),
                    ('stakeholder', 'inventory.read')
            ) AS map(role_name, permission_name)
        )
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM role_permission_map map
        JOIN public.roles r ON r.name = map.role_name
        JOIN public.permissions p ON p.name = map.permission_name
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

COMMIT;
