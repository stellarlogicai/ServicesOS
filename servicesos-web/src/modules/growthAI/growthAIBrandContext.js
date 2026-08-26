export const GROWTH_AI_BRAND_PLATFORMS = Object.freeze(['general', 'facebook', 'instagram', 'linkedin', 'website']);
export const GROWTH_AI_BRAND_COLOR_KEYS = Object.freeze(['primary', 'secondary', 'accent']);

function text(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function color(value) {
  const normalized = text(value, 7);
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '';
}

export function normalizeGrowthAIBrandProfile(values = {}) {
  const source = values && typeof values === 'object' ? values : {};
  const preferences = source.platformPreferences && typeof source.platformPreferences === 'object' ? source.platformPreferences : {};
  const colors = source.brandColors && typeof source.brandColors === 'object' ? source.brandColors : {};
  return {
    brandVoice: text(source.brandVoice, 500),
    contentTone: text(source.contentTone, 300),
    writingStyle: text(source.writingStyle, 500),
    defaultCTA: text(source.defaultCTA, 500),
    avoidTerms: text(source.avoidTerms, 1_000),
    platformPreferences: Object.fromEntries(GROWTH_AI_BRAND_PLATFORMS.map(platform => [platform, preferences[platform] === true])),
    brandColors: Object.fromEntries(GROWTH_AI_BRAND_COLOR_KEYS.map(key => [key, color(colors[key])])),
  };
}

export function getApprovedGrowthAIBrandContext({ tenant = {}, profile = {} } = {}) {
  const businessSettings = tenant.businessSettings || {};
  const settings = tenant.settings || {};
  const normalizedProfile = normalizeGrowthAIBrandProfile(profile);
  return {
    businessName: text(businessSettings.businessName || tenant.businessName, 180),
    logoRef: text(businessSettings.logoRef || settings.businessLogo, 1_000),
    colors: normalizedProfile.brandColors,
    tone: normalizedProfile.contentTone || normalizedProfile.brandVoice,
    writingStyle: normalizedProfile.writingStyle,
    defaultCTA: normalizedProfile.defaultCTA,
    avoidTerms: normalizedProfile.avoidTerms,
    serviceArea: text(businessSettings.serviceArea || tenant.serviceArea, 180),
    platformPreferences: normalizedProfile.platformPreferences,
  };
}
