export const commercialFieldNames = Object.freeze([
  'businessName', 'primaryContactName', 'phone', 'email', 'serviceAddress', 'facilityType',
  'approximateSquareFootage', 'areasToClean', 'numberOfRestrooms', 'frequency',
  'preferredServiceWindow', 'operatingHours', 'accessSecurityInstructions', 'knownHazards',
  'specialSurfacesMaterials', 'suppliesEquipmentNotes', 'generalNotes',
]);

export function emptyCommercialDetails() {
  return Object.fromEntries(commercialFieldNames.map(name => [name, '']));
}
