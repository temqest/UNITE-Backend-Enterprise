-- Seed Albay and missing locations for Bicol Region
-- Inserts global rows (org_id = NULL), idempotent by code.

WITH province_seed AS (
    SELECT *
    FROM (VALUES
        ('Albay', 'PH05-ALB', 'Bicol Region')
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
        ('ALB-D1', '1st District', 'PH05-ALB'),
        ('ALB-D2', '2nd District', 'PH05-ALB'),
        ('ALB-D3', '3rd District', 'PH05-ALB')
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
        ('ALB-BACACAY', 'Bacacay', 'ALB-D1', 'PH05-ALB'),
        ('ALB-MALILIPOT', 'Malilipot', 'ALB-D1', 'PH05-ALB'),
        ('ALB-MALINAO', 'Malinao', 'ALB-D1', 'PH05-ALB'),
        ('ALB-SANTO_DOMINGO', 'Santo Domingo', 'ALB-D1', 'PH05-ALB'),
        ('ALB-TABACO_CITY', 'Tabaco City', 'ALB-D1', 'PH05-ALB'),
        ('ALB-TIWI', 'Tiwi', 'ALB-D1', 'PH05-ALB'),
        ('ALB-CAMALIG', 'Camalig', 'ALB-D2', 'PH05-ALB'),
        ('ALB-DARAGA', 'Daraga', 'ALB-D2', 'PH05-ALB'),
        ('ALB-LEGAZPI_CITY', 'Legazpi City', 'ALB-D2', 'PH05-ALB'),
        ('ALB-MANITO', 'Manito', 'ALB-D2', 'PH05-ALB'),
        ('ALB-RAPU_RAPU', 'Rapu-Rapu', 'ALB-D2', 'PH05-ALB'),
        ('ALB-GUINOBATAN', 'Guinobatan', 'ALB-D3', 'PH05-ALB'),
        ('ALB-JOVELLAR', 'Jovellar', 'ALB-D3', 'PH05-ALB'),
        ('ALB-LIBON', 'Libon', 'ALB-D3', 'PH05-ALB'),
        ('ALB-LIGAO_CITY', 'Ligao City', 'ALB-D3', 'PH05-ALB'),
        ('ALB-OAS', 'Oas', 'ALB-D3', 'PH05-ALB'),
        ('ALB-PIO_DURAN', 'Pio Duran', 'ALB-D3', 'PH05-ALB'),
        ('ALB-POLANGUI', 'Polangui', 'ALB-D3', 'PH05-ALB'),
        ('CSU-CITY_OF_IRIGA', 'City of Iriga', 'CSU-D2', 'PH05-CSU'),
        ('CSU-CITY_OF_NAGA', 'City of Naga', 'CSU-D3', 'PH05-CSU')
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
