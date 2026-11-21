BEGIN;

-- Enable Row Level Security on blood inventory tables
ALTER TABLE IF EXISTS public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.blood_inventory_transactions ENABLE ROW LEVEL SECURITY;

-- 1. blood_inventory SELECT policy
DROP POLICY IF EXISTS blood_inventory_tenant_select ON public.blood_inventory;
CREATE POLICY blood_inventory_tenant_select
ON public.blood_inventory
FOR SELECT
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_id = auth.uid()
          AND u.org_id = blood_inventory.org_id
          AND u.is_active = true
    )
);

-- 2. blood_inventory MUTATION policy (INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS blood_inventory_tenant_mutate ON public.blood_inventory;
CREATE POLICY blood_inventory_tenant_mutate
ON public.blood_inventory
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_id = auth.uid()
          AND u.org_id = blood_inventory.org_id
          AND u.is_active = true
          AND (
              u.role->>'type' IN ('super_admin', 'admin', 'coordinator')
              OR u.role->'permissions' ? 'inventory.update'
          )
    )
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_id = auth.uid()
          AND u.org_id = blood_inventory.org_id
          AND u.is_active = true
          AND (
              u.role->>'type' IN ('super_admin', 'admin', 'coordinator')
              OR u.role->'permissions' ? 'inventory.update'
          )
    )
);

-- 3. blood_inventory_transactions SELECT policy
DROP POLICY IF EXISTS blood_inventory_transactions_tenant_select ON public.blood_inventory_transactions;
CREATE POLICY blood_inventory_transactions_tenant_select
ON public.blood_inventory_transactions
FOR SELECT
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_id = auth.uid()
          AND u.org_id = blood_inventory_transactions.org_id
          AND u.is_active = true
    )
);

-- 4. blood_inventory_transactions INSERT policy
DROP POLICY IF EXISTS blood_inventory_transactions_tenant_insert ON public.blood_inventory_transactions;
CREATE POLICY blood_inventory_transactions_tenant_insert
ON public.blood_inventory_transactions
FOR INSERT
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_id = auth.uid()
          AND u.org_id = blood_inventory_transactions.org_id
          AND u.is_active = true
          AND (
              u.role->>'type' IN ('super_admin', 'admin', 'coordinator')
              OR u.role->'permissions' ? 'inventory.update'
          )
    )
);

COMMIT;
