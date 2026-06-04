const fs = require('fs');
const path = require('path');

const bicolProvinces = {
  '500500000': 'Albay',
  '501600000': 'Camarines Norte',
  '501700000': 'Camarines Sur',
  '504100000': 'Masbate',
};

const inputDir = path.join(__dirname, '..', 'temp_maps', '2023', 'geojson', 'provdists', 'lowres');
const outputFile = path.join(__dirname, '..', 'unite-frontend-enterprise-prototype', 'lib', 'data', 'geo', 'bicol-coverage-areas.json');

const combinedFeatures = [];

for (const [psgc, provinceName] of Object.entries(bicolProvinces)) {
  const fileName = `municities-provdist-${psgc}.0.001.json`;
  const filePath = path.join(inputDir, fileName);

  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    for (const feature of data.features) {
      // Map properties
      const mappedFeature = {
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          id: feature.properties.adm3_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), // e.g., 'city-of-naga'
          sourcePsgc: feature.properties.adm3_psgc,
          name: feature.properties.adm3_en,
          type: feature.properties.adm3_en.toLowerCase().includes('city') ? 'city' : 'municipality',
          province: provinceName,
          // Add default mock stats that will be overwritten by backend anyway
          targetUnits: 0,
          collectedUnits: 0,
          donorCount: 0,
          successfulDonations: 0,
          deferredDonors: 0,
          upcomingEvents: 0,
          lastCampaignDate: null,
          status: "no_activity",
          eventType: "community_drive",
          priorityBloodTypes: [],
          sourceGeoLevel: feature.properties.geo_level,
          sourceName: feature.properties.adm3_en,
        }
      };
      combinedFeatures.push(mappedFeature);
    }
    console.log(`Processed ${provinceName} (${data.features.length} features)`);
  } else {
    console.error(`File not found: ${filePath}`);
  }
}

const outputCollection = {
  type: "FeatureCollection",
  metadata: {
    sourceRepository: "https://github.com/faeldon/philippines-json-maps",
    generatedAt: new Date().toISOString(),
    region: "Bicol",
    includedProvinces: Object.values(bicolProvinces),
  },
  features: combinedFeatures,
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(outputCollection, null, 2));

console.log(`Successfully wrote ${combinedFeatures.length} features to ${outputFile}`);
