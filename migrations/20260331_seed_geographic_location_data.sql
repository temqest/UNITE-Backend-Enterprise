-- Seed reference location data for Bicol Region (Camarines Norte, Camarines Sur, Masbate)
-- Inserts global rows (org_id = NULL), idempotent by code.

WITH province_seed AS (
    SELECT *
    FROM (VALUES
        ('Camarines Norte', 'PH05-CNO', 'Bicol Region'),
        ('Camarines Sur', 'PH05-CSU', 'Bicol Region'),
        ('Masbate', 'PH05-MAS', 'Bicol Region')
    ) AS v(name, code, region)
)
INSERT INTO public.provinces (org_id, name, code, region)
SELECT NULL, p.name, p.code, p.region
FROM province_seed AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM public.provinces AS existing
    WHERE existing.org_id IS NULL
      AND lower(existing.code) = lower(p.code)
);

WITH district_seed AS (
    SELECT *
    FROM (VALUES
        ('CNO-D1', '1st District', 'PH05-CNO'),
        ('CNO-D2', '2nd District', 'PH05-CNO'),
        ('CSU-D1', '1st District', 'PH05-CSU'),
        ('CSU-D2', '2nd District', 'PH05-CSU'),
        ('CSU-D3', '3rd District', 'PH05-CSU'),
        ('CSU-D4', '4th District', 'PH05-CSU'),
        ('MAS-D1', '1st District', 'PH05-MAS'),
        ('MAS-D2', '2nd District', 'PH05-MAS'),
        ('MAS-D3', '3rd District', 'PH05-MAS')
    ) AS v(code, name, province_code)
)
INSERT INTO public.districts (org_id, province_id, name, code)
SELECT
    NULL,
    p.id,
    d.name,
    d.code
FROM district_seed AS d
JOIN public.provinces AS p
    ON p.org_id IS NULL
   AND lower(p.code) = lower(d.province_code)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.districts AS existing
    WHERE existing.org_id IS NULL
      AND lower(existing.code) = lower(d.code)
);

WITH municipality_seed AS (
    SELECT *
    FROM (VALUES
        -- Camarines Norte 1st District
        ('CNO-BASUD', 'Basud', 'CNO-D1', 'PH05-CNO'),
        ('CNO-DAET', 'Daet', 'CNO-D1', 'PH05-CNO'),
        ('CNO-JOSE_PANGANIBAN', 'Jose Panganiban', 'CNO-D1', 'PH05-CNO'),
        ('CNO-MERCEDES', 'Mercedes', 'CNO-D1', 'PH05-CNO'),
        ('CNO-TALISAY', 'Talisay', 'CNO-D1', 'PH05-CNO'),
        ('CNO-VINZONS', 'Vinzons', 'CNO-D1', 'PH05-CNO'),

        -- Camarines Norte 2nd District
        ('CNO-CAPALONGA', 'Capalonga', 'CNO-D2', 'PH05-CNO'),
        ('CNO-LABO', 'Labo', 'CNO-D2', 'PH05-CNO'),
        ('CNO-PARACALE', 'Paracale', 'CNO-D2', 'PH05-CNO'),
        ('CNO-SAN_JOSE', 'San Jose', 'CNO-D2', 'PH05-CNO'),
        ('CNO-SAN_LORENZO_RUIZ', 'San Lorenzo Ruiz', 'CNO-D2', 'PH05-CNO'),
        ('CNO-SANTA_ELENA', 'Santa Elena', 'CNO-D2', 'PH05-CNO'),

        -- Camarines Sur 1st District
        ('CSU-CARAMOAN', 'Caramoan', 'CSU-D1', 'PH05-CSU'),
        ('CSU-GARCHITORENA', 'Garchitorena', 'CSU-D1', 'PH05-CSU'),
        ('CSU-GOA', 'Goa', 'CSU-D1', 'PH05-CSU'),
        ('CSU-LAGONOY', 'Lagonoy', 'CSU-D1', 'PH05-CSU'),
        ('CSU-PRESENTACION', 'Presentacion', 'CSU-D1', 'PH05-CSU'),
        ('CSU-SANGAY', 'Sangay', 'CSU-D1', 'PH05-CSU'),
        ('CSU-SAN_JOSE', 'San Jose', 'CSU-D1', 'PH05-CSU'),
        ('CSU-TIGAON', 'Tigaon', 'CSU-D1', 'PH05-CSU'),
        ('CSU-TINAMBAC', 'Tinambac', 'CSU-D1', 'PH05-CSU'),

        -- Camarines Sur 2nd District
        ('CSU-BAAO', 'Baao', 'CSU-D2', 'PH05-CSU'),
        ('CSU-BALATAN', 'Balatan', 'CSU-D2', 'PH05-CSU'),
        ('CSU-BATO', 'Bato', 'CSU-D2', 'PH05-CSU'),
        ('CSU-BUHI', 'Buhi', 'CSU-D2', 'PH05-CSU'),
        ('CSU-BULA', 'Bula', 'CSU-D2', 'PH05-CSU'),
        ('CSU-IRIGA_CITY', 'Iriga City', 'CSU-D2', 'PH05-CSU'),
        ('CSU-NABUA', 'Nabua', 'CSU-D2', 'PH05-CSU'),

        -- Camarines Sur 3rd District
        ('CSU-BOMBON', 'Bombon', 'CSU-D3', 'PH05-CSU'),
        ('CSU-CALABANGA', 'Calabanga', 'CSU-D3', 'PH05-CSU'),
        ('CSU-CAMALIGAN', 'Camaligan', 'CSU-D3', 'PH05-CSU'),
        ('CSU-CANAMAN', 'Canaman', 'CSU-D3', 'PH05-CSU'),
        ('CSU-GAINZA', 'Gainza', 'CSU-D3', 'PH05-CSU'),
        ('CSU-MAGARAO', 'Magarao', 'CSU-D3', 'PH05-CSU'),
        ('CSU-MILAOR', 'Milaor', 'CSU-D3', 'PH05-CSU'),
        ('CSU-MINALABAC', 'Minalabac', 'CSU-D3', 'PH05-CSU'),
        ('CSU-OCAMPO', 'Ocampo', 'CSU-D3', 'PH05-CSU'),
        ('CSU-PAMPLONA', 'Pamplona', 'CSU-D3', 'PH05-CSU'),
        ('CSU-PASACAO', 'Pasacao', 'CSU-D3', 'PH05-CSU'),
        ('CSU-PILI', 'Pili', 'CSU-D3', 'PH05-CSU'),
        ('CSU-SAN_FERNANDO', 'San Fernando', 'CSU-D3', 'PH05-CSU'),

        -- Camarines Sur 4th District
        ('CSU-CABUSAO', 'Cabusao', 'CSU-D4', 'PH05-CSU'),
        ('CSU-DEL_GALLEGO', 'Del Gallego', 'CSU-D4', 'PH05-CSU'),
        ('CSU-LIBMANAN', 'Libmanan', 'CSU-D4', 'PH05-CSU'),
        ('CSU-LUPI', 'Lupi', 'CSU-D4', 'PH05-CSU'),
        ('CSU-RAGAY', 'Ragay', 'CSU-D4', 'PH05-CSU'),
        ('CSU-SIPOCOT', 'Sipocot', 'CSU-D4', 'PH05-CSU'),

        -- Masbate 1st District
        ('MAS-AROROY', 'Aroroy', 'MAS-D1', 'PH05-MAS'),
        ('MAS-BALENO', 'Baleno', 'MAS-D1', 'PH05-MAS'),
        ('MAS-BALUD', 'Balud', 'MAS-D1', 'PH05-MAS'),
        ('MAS-MASBATE_CITY', 'Masbate City', 'MAS-D1', 'PH05-MAS'),
        ('MAS-MANDAON', 'Mandaon', 'MAS-D1', 'PH05-MAS'),
        ('MAS-MILAGROS', 'Milagros', 'MAS-D1', 'PH05-MAS'),
        ('MAS-MOBO', 'Mobo', 'MAS-D1', 'PH05-MAS'),
        ('MAS-PLACER', 'Placer', 'MAS-D1', 'PH05-MAS'),

        -- Masbate 2nd District
        ('MAS-CAWAYAN', 'Cawayan', 'MAS-D2', 'PH05-MAS'),
        ('MAS-CLAVERIA', 'Claveria', 'MAS-D2', 'PH05-MAS'),
        ('MAS-DIMASALANG', 'Dimasalang', 'MAS-D2', 'PH05-MAS'),
        ('MAS-ESPERANZA', 'Esperanza', 'MAS-D2', 'PH05-MAS'),
        ('MAS-PALANAS', 'Palanas', 'MAS-D2', 'PH05-MAS'),
        ('MAS-USON', 'Uson', 'MAS-D2', 'PH05-MAS'),

        -- Masbate 3rd District
        ('MAS-BATUAN', 'Batuan', 'MAS-D3', 'PH05-MAS'),
        ('MAS-CATAINGAN', 'Cataingan', 'MAS-D3', 'PH05-MAS'),
        ('MAS-MAGDALENA', 'Magdalena', 'MAS-D3', 'PH05-MAS'),
        ('MAS-MONREAL', 'Monreal', 'MAS-D3', 'PH05-MAS'),
        ('MAS-PIO_V_CORPUZ', 'Pio V. Corpuz', 'MAS-D3', 'PH05-MAS'),
        ('MAS-SAN_FERNANDO', 'San Fernando', 'MAS-D3', 'PH05-MAS'),
        ('MAS-SAN_JACINTO', 'San Jacinto', 'MAS-D3', 'PH05-MAS'),
        ('MAS-SAN_PASCUAL', 'San Pascual', 'MAS-D3', 'PH05-MAS')
    ) AS v(code, name, district_code, province_code)
)
INSERT INTO public.municipalities (org_id, district_id, province_id, name, code)
SELECT
    NULL,
    d.id,
    p.id,
    m.name,
    m.code
FROM municipality_seed AS m
JOIN public.provinces AS p
    ON p.org_id IS NULL
   AND lower(p.code) = lower(m.province_code)
JOIN public.districts AS d
    ON d.org_id IS NULL
   AND d.province_id = p.id
   AND lower(d.code) = lower(m.district_code)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.municipalities AS existing
    WHERE existing.org_id IS NULL
      AND lower(existing.code) = lower(m.code)
);
