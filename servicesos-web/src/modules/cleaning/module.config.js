/**
 * Cleaning Module Configuration
 * 
 * This module defines cleaning-specific features and configurations
 * that extend the core ServicesOS platform.
 */

export const cleaningModule = {
  id: "cleaning",
  name: "Cleaning",
  version: "1.0.0",
  
  enabledFeatures: [
    "room_estimates",
    "cleaning_checklists",
    "pet_notes",
    "before_after_photos",
    "training",
    "access_notes",
    "chemical_safety"
  ],
  
  serviceTypes: [
    "standard_clean",
    "deep_clean",
    "move_out_clean",
    "recurring_clean",
    "post_construction_clean"
  ],
  
  estimateFields: [
    "bedrooms",
    "bathrooms",
    "halfBaths",
    "squareFootage",
    "pets",
    "petCount",
    "petTypes",
    "children",
    "smokingInside",
    "condition",
    "levels",
    "garage",
    "basement",
    "serviceScope"
  ],
  
  checklistTemplates: {
    standard_clean: [
      "dust_all_surfaces",
      "clean_mirrors",
      "vacuum_carpets",
      "mop_floors",
      "clean_kitchen_sink",
      "wipe_countertops",
      "clean_bathroom_sink",
      "clean_toilet",
      "empty_trash"
    ],
    deep_clean: [
      "dust_all_surfaces",
      "clean_mirrors",
      "vacuum_carpets",
      "mop_floors",
      "clean_kitchen_sink",
      "wipe_countertops",
      "clean_bathroom_sink",
      "clean_toilet",
      "empty_trash",
      "clean_inside_oven",
      "clean_inside_fridge",
      "clean_inside_cabinets",
      "clean_baseboards",
      "clean_windows"
    ],
    move_out_clean: [
      "dust_all_surfaces",
      "clean_mirrors",
      "vacuum_carpets",
      "mop_floors",
      "clean_kitchen_sink",
      "wipe_countertops",
      "clean_bathroom_sink",
      "clean_toilet",
      "empty_trash",
      "clean_inside_oven",
      "clean_inside_fridge",
      "clean_inside_cabinets",
      "clean_baseboards",
      "clean_windows",
      "clean_light_fixtures",
      "clean_vent_covers"
    ]
  },
  
  trainingModules: [
    "chemical_safety",
    "proper_cleaning_techniques",
    "customer_service",
    "time_management",
    "safety_protocols"
  ],
  
  pricingRules: {
    baseLaborRate: 0.75, // hours per bedroom
    bathroomRate: 1.25, // hours per bathroom
    squareFootRate: 0.0008, // hours per sq ft
    conditionMultipliers: {
      light: 1.0,
      moderate: 1.25,
      heavy: 1.6
    }
  },
  
  jobRequirements: {
    beforePhotos: true,
    afterPhotos: true,
    checklist: true,
    timeTracking: true,
    customerSignature: false
  }
};

export default cleaningModule;
