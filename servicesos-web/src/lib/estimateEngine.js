// lib/estimateEngine.js

// MARKET PROFILES - Location-aware pricing for different markets
const marketRates = {
  rural: {
    standard: { low: 40, high: 50 },
    deep: { low: 50, high: 65 },
    moveout: { low: 55, high: 75 },
    construction: { low: 65, high: 90 },
    organizing: { low: 40, high: 60 },
    garage: { low: 50, high: 75 }
  },
  suburban: {
    standard: { low: 55, high: 65 },
    deep: { low: 65, high: 80 },
    moveout: { low: 75, high: 95 },
    construction: { low: 90, high: 110 },
    organizing: { low: 55, high: 75 },
    garage: { low: 65, high: 90 }
  },
  metro: {
    standard: { low: 65, high: 80 },
    deep: { low: 80, high: 95 },
    moveout: { low: 95, high: 120 },
    construction: { low: 110, high: 140 },
    organizing: { low: 70, high: 90 },
    garage: { low: 80, high: 110 }
  }
};

export function calculateEstimate(formData, aiAnalysis) {
  const {
    bedroomCount = 0,
    bathroomCount = 0,
    kitchenCount = 1,
    livingRoomCount = 1,
    diningRoomCount = 0,
    officeCount = 0,
    basementCount = 0,
    stairs = false,
    stairsCount = 0,
    petHairLevel = "none",
    clutterLevel = "normal",
    lastCleaned = "monthly",
    cleaningType = "standard",
    frequency = "one-time",
    marketType = "rural" // Default to rural for Bolivar, Missouri
  } = formData;

  // ROOM-BASED TIME CALCULATION
  let roomHours =
    (bedroomCount * 0.35) +
    (bathroomCount * 0.75) +
    (kitchenCount * 1.0) +
    (livingRoomCount * 0.4) +
    (diningRoomCount * 0.25) +
    (officeCount * 0.3) +
    (basementCount * 1.0);

  // STAIRS
  if (stairs) {
    roomHours += (stairsCount || 1) * 0.5;
  }

  // PET HAIR SCORING
  const petHairHours = {
    none: 0,
    light: 0.25,
    moderate: 0.75,
    heavy: 1.5
  };
  roomHours += petHairHours[petHairLevel] || 0;

  // CLUTTER SCORING
  const clutterHours = {
    none: 0,
    light: 0.15,
    normal: 0.25,
    moderate: 0.5,
    heavy: 1.5
  };
  roomHours += clutterHours[clutterLevel] || 0;

  // CLEANING HISTORY MULTIPLIER
  const cleaningHistoryMultiplier = {
    weekly: 0.85,
    biweekly: 1.0,
    monthly: 1.05,
    "2-3months": 1.15,
    "6months+": 1.3
  };
  roomHours *= cleaningHistoryMultiplier[lastCleaned] || 1.05;

  // AI DAMAGE SCORE INTEGRATION
  if (aiAnalysis?.rooms) {
    const roomScores = Object.values(aiAnalysis.rooms).map(r => r.damageScore || 0);
    const avgScore = roomScores.reduce((a, b) => a + b, 0) / roomScores.length;

    if (avgScore > 80) roomHours += 1;
    else if (avgScore > 60) roomHours += 0.5;
    else if (avgScore > 40) roomHours += 0.25;
  }

  // AI EXTRA TIME
  if (aiAnalysis?.estimatedAddTime) {
    roomHours += aiAnalysis.estimatedAddTime * 0.25; // Reduced impact
  }

  // SERVICE TYPE MULTIPLIERS
  const serviceMultiplier = {
    standard: 1,
    deep: 1.3,
    moveout: 1.5,
    construction: 2
  };
  roomHours *= serviceMultiplier[cleaningType] || 1;

  // EXTRAS / ADDITIONAL SERVICES
  const extraHours = {
    oven: 1,
    fridge: 0.75,
    windows: 1.5,
    baseboards: 1,
    cabinetsInside: 1.5,
    garageCleaning: 2,
    closetOrganization: 1.5,
    pantryOrganization: 1,
    laundryRoomCleaning: 0.5,
    basementCleaning: 1.5,
    petWasteRemoval: 1,
    blindCleaning: 1,
    ceilingFanCleaning: 0.5,
    wallSpotCleaning: 1
  };

  if (formData.extras) {
    Object.entries(formData.extras).forEach(([key, enabled]) => {
      if (enabled) {
        roomHours += extraHours[key] || 0;
      }
    });
  }

  // LEVEL-BASED PRICING FOR VARIABLE SERVICES
  if (formData.levels) {
    const { levels } = formData;
    
    const garageLevelHours = {
      none: 0,
      light: 1,
      moderate: 2,
      heavy: 4
    };
    
    const closetLevelHours = {
      none: 0,
      light: 0.5,
      moderate: 1.5,
      heavy: 3
    };

    // Only add level hours if the corresponding extra is enabled
    if (formData.extras?.garageCleaning) {
      roomHours += garageLevelHours[levels.garageLevel] || 0;
    }
    
    if (formData.extras?.closetOrganization) {
      roomHours += closetLevelHours[levels.closetLevel] || 0;
    }
  }

  // ROUND TO HALF HOURS
  let laborHours = Math.max(2, Math.round(roomHours * 2) / 2);

  // MARKET-SPECIFIC PRICING
  const market = marketRates[marketType] || marketRates.rural;
  
  // Get hourly rates based on service type
  let hourlyRates;
  if (cleaningType === 'standard') {
    hourlyRates = market.standard;
  } else if (cleaningType === 'deep') {
    hourlyRates = market.deep;
  } else if (cleaningType === 'moveout') {
    hourlyRates = market.moveout;
  } else if (cleaningType === 'construction') {
    hourlyRates = market.construction;
  } else {
    hourlyRates = market.standard;
  }

  // RECURRING CUSTOMER DISCOUNTS
  const recurringDiscount = {
    "one-time": 1,
    weekly: 0.85,
    "bi-weekly": 0.92,
    monthly: 0.97
  };

  let priceLow = laborHours * hourlyRates.low * (recurringDiscount[frequency] || 1);
  let priceHigh = laborHours * hourlyRates.high * (recurringDiscount[frequency] || 1);

  return {
    laborHours,
    appointmentDuration: laborHours, // Simplified - just return labor hours
    priceLow: Math.round(priceLow),
    priceHigh: Math.round(priceHigh),
    aiEnhanced: Boolean(aiAnalysis)
  };
}
