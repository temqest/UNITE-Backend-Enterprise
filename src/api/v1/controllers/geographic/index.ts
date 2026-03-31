export {
  listProvincesController,
  getProvinceController,
  createProvinceController,
  updateProvinceController,
  deleteProvinceController,
  getProvincesByRegionController,
  searchLocationController,
  getLocationHierarchyController,
} from './province.controller';

export {
  listDistrictsController,
  getDistrictController,
  createDistrictController,
  updateDistrictController,
  deleteDistrictController,
  getDistrictsByProvinceController,
} from './district.controller';

export {
  listMunicipalitiesController,
  getMunicipalityController,
  createMunicipalityController,
  updateMunicipalityController,
  deleteMunicipalityController,
  getMunicipalitiesByDistrictController,
} from './municipality.controller';
