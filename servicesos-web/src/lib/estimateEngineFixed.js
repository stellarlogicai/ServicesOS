// lib/estimateEngine.js

export function calculateEstimate(formData, aiAnalysis) {
  const {
    bedrooms = 0,
    bathrooms = 0,
    halfBaths = 0,
    squareFootage = 0,
    pets = false,
    petCount = 0,
    children = false,
    cleaningType = "standard",
    condition = "moderate"
  } = formData;

  const totalBaths = bathrooms + halfBaths * 0.5;

  let hours =
    (bedrooms || 0) * 0.75 +
    totalBaths * 1.25 +
    (squareFootage || 0) * 0.0008;

  const conditionMultiplier = {
    light: 1,
    moderate: 1.25,
    heavy: 1.6
  };

  hours *= conditionMultiplier[condition] || 1.25;

  if (pets) hours += (petCount || 0) * 0.5;
  if (children) hours += 0.25;
  if (aiAnalysis?.estimatedAddTime)
    hours += aiAnalysis.estimatedAddTime;

  const serviceMultiplier = {
    standard: 1,
    deep: 1.25,
    moveout: 1.4,
    construction: 1.8
  };

  hours *= serviceMultiplier[cleaningType] || 1;

  const laborHours = Math.max(2, Math.round(hours * 2) / 2);

  const priceLow = Math.round(laborHours * 35);
  const priceHigh = Math.round(laborHours * 65);

  return {
    laborHours,
    priceLow,
    priceHigh,
    appointmentDuration: Math.round(laborHours * 60),
    aiEnhanced: !!aiAnalysis
  };
}
