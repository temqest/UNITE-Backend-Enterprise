ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blood_inventory_org_read ON public.blood_inventory;
CREATE POLICY blood_inventory_org_read
ON public.blood_inventory
FOR SELECT
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
);

DROP POLICY IF EXISTS blood_inventory_org_mutate ON public.blood_inventory;
CREATE POLICY blood_inventory_org_mutate
ON public.blood_inventory
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
);

DROP POLICY IF EXISTS blood_inventory_tx_org_read ON public.blood_inventory_transactions;
CREATE POLICY blood_inventory_tx_org_read
ON public.blood_inventory_transactions
FOR SELECT
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
);

DROP POLICY IF EXISTS blood_inventory_tx_org_mutate ON public.blood_inventory_transactions;
CREATE POLICY blood_inventory_tx_org_mutate
ON public.blood_inventory_transactions
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
);
