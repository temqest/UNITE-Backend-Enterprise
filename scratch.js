const fs = require('fs');

const tsFile = fs.readFileSync('unite-frontend-enterprise-prototype/lib/data/geo/bicol-geographic-data.ts', 'utf8');

// Parse the provinces and areas from the TS file
// It has the format: name: "Albay", psgcCode: "050500000", areas: [ { name: "Bacacay", type: "municipality", psgcCode: "050501000" }, ... ]
const data = [];
let currentProvince = null;
const lines = tsFile.split('\n');
for (const line of lines) {
  if (line.includes('name:') && line.includes('psgcCode:') && !line.includes('type:')) {
    const match = line.match(/name:\s*"([^"]+)",\s*psgcCode:\s*"([^"]+)"/);
    if (match) {
      currentProvince = { name: match[1], code: match[2], areas: [] };
      data.push(currentProvince);
    }
  } else if (line.includes('name:') && line.includes('type:') && line.includes('psgcCode:')) {
    const match = line.match(/name:\s*"([^"]+)",\s*type:\s*"([^"]+)",\s*psgcCode:\s*"([^"]+)"/);
    if (match && currentProvince) {
      currentProvince.areas.push({ name: match[1], type: match[2], code: match[3] });
    }
  }
}

// Generate SQL
let sql = `-- Seed Albay and missing locations for Bicol Region
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
`;

const albayDistricts = {
  "1st District": ["Bacacay", "Malilipot", "Malinao", "Santo Domingo", "Tabaco City", "Tiwi"],
  "2nd District": ["Camalig", "Daraga", "Legazpi City", "Manito", "Rapu-Rapu"],
  "3rd District": ["Guinobatan", "Jovellar", "Libon", "Ligao City", "Oas", "Pio Duran", "Polangui"]
};

const csuDistricts = {
    "1st District": ["Caramoan", "Garchitorena", "Goa", "Lagonoy", "Presentacion", "Sangay", "San Jose", "Tigaon", "Tinambac"],
    "2nd District": ["Baao", "Balatan", "Bato", "Buhi", "Bula", "City of Iriga", "Iriga City", "Nabua"],
    "3rd District": ["Bombon", "Calabanga", "Camaligan", "Canaman", "Gainza", "Magarao", "Milaor", "Minalabac", "Ocampo", "Pamplona", "Pasacao", "Pili", "San Fernando", "City of Naga", "Naga City"],
    "4th District": ["Cabusao", "Del Gallego", "Libmanan", "Lupi", "Ragay", "Sipocot"]
};

const cnoDistricts = {
    "1st District": ["Basud", "Daet", "Jose Panganiban", "Mercedes", "Talisay", "Vinzons"],
    "2nd District": ["Capalonga", "Labo", "Paracale", "San Jose", "San Lorenzo Ruiz", "Santa Elena"]
};

const masDistricts = {
    "1st District": ["Aroroy", "Baleno", "Balud", "City of Masbate", "Masbate City", "Mandaon", "Milagros", "Mobo", "Placer"],
    "2nd District": ["Cawayan", "Claveria", "Dimasalang", "Esperanza", "Palanas", "Uson"],
    "3rd District": ["Batuan", "Cataingan", "Magdalena", "Monreal", "Pio V. Corpuz", "San Fernando", "San Jacinto", "San Pascual"]
};

const distMap = {
    "Albay": albayDistricts,
    "Camarines Sur": csuDistricts,
    "Camarines Norte": cnoDistricts,
    "Masbate": masDistricts
};

const prefixMap = {
    "Albay": "ALB",
    "Camarines Sur": "CSU",
    "Camarines Norte": "CNO",
    "Masbate": "MAS"
};

const vals = [];
for (const prov of data) {
    for (const area of prov.areas) {
        let districtNum = null;
        const dmap = distMap[prov.name];
        for (const dname of Object.keys(dmap)) {
            if (dmap[dname].includes(area.name)) {
                districtNum = dname.substring(0, 1);
                break;
            }
        }
        
        let pcode = prefixMap[prov.name];
        if (districtNum && pcode) {
            let code = area.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
            vals.push(`        ('${pcode}-${code}', '${area.name.replace(/'/g, "''")}', '${pcode}-D${districtNum}', 'PH05-${pcode}')`);
        }
    }
}

sql += vals.join(',\n');
sql += `
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
`;

fs.writeFileSync('migrations/20260603_seed_albay_and_missing_geographic_data.sql', sql, 'utf8');
console.log('Created migrations/20260603_seed_albay_and_missing_geographic_data.sql');
