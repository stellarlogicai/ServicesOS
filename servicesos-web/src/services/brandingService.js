import { auth } from '../firebase';
import { brandingConfig } from '../config/brandingConfig';
import { resolveOwnerOnboardingGatewayUrl } from './ownerOnboardingService';

const BRANDING_FUNCTION = 'brandingGateway';
const COLOR_KEYS = ['primary', 'primaryDark', 'accent', 'background'];

export class BrandingServiceError extends Error {
  constructor(message, code = 'branding_unavailable') {
    super(message);
    this.name = 'BrandingServiceError';
    this.code = code;
  }
}

function brandingRequest(value) {
  return {
    mode: value?.mode === 'default' ? 'default' : 'custom',
    colors: Object.fromEntries(COLOR_KEYS.map(key => [key, value?.colors?.[key] || brandingConfig.colors[key]])),
    logo: { emoji: value?.logo?.emoji || brandingConfig.logo.emoji },
    assets: { logo: value?.assets?.logo || '' },
    theme: { borderRadius: value?.theme?.borderRadius ?? brandingConfig.theme.borderRadius },
  };
}

function projectBranding(value) {
  if (!value || typeof value !== 'object' || !['default', 'custom'].includes(value.mode) || typeof value.ready !== 'boolean') {
    throw new BrandingServiceError('Branding returned invalid data.', 'invalid_response');
  }
  return {
    ...brandingConfig,
    mode: value.mode,
    colors: { ...brandingConfig.colors, ...value.colors },
    logo: { ...brandingConfig.logo, ...value.logo },
    assets: { ...brandingConfig.assets, ...value.assets },
    theme: { ...brandingConfig.theme, ...value.theme },
    brandingReady: value.ready,
  };
}

async function callBranding(body, { user = auth.currentUser, fetchImpl = fetch } = {}) {
  if (!user || typeof user.getIdToken !== 'function') {
    throw new BrandingServiceError('Sign in to manage branding.', 'unauthenticated');
  }
  const response = await fetchImpl(resolveOwnerOnboardingGatewayUrl(import.meta.env, BRANDING_FUNCTION), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload;
  try { payload = await response.json(); } catch {
    throw new BrandingServiceError('Branding is temporarily unavailable.');
  }
  if (!response.ok) {
    throw new BrandingServiceError('Branding could not be updated.', typeof payload?.code === 'string' ? payload.code : 'branding_unavailable');
  }
  return payload;
}

export async function getBranding(tenantId, options) {
  const payload = await callBranding({ action: 'get', tenantId }, options);
  return projectBranding(payload.branding);
}

export async function saveBranding(tenantId, brandingData, options) {
  const payload = await callBranding({ action: 'update', tenantId, branding: brandingRequest(brandingData) }, options);
  return projectBranding(payload.branding);
}

export async function updateBranding(tenantId, brandingData, options) {
  return saveBranding(tenantId, brandingData, options);
}

export const THEME_PRESETS = {
  pinkPurple: { name: 'Pink Purple', colors: { primary: '#e91e63', primaryDark: '#c2185b', primaryLight: '#f48fb1', accent: '#9c27b0', background: '#faf5fa', surface: '#ffffff', text: '#1a1a1a', textSecondary: '#666666', border: '#e0e0e0', success: '#4caf50', error: '#f44336', warning: '#ff9800' } },
  blueProfessional: { name: 'Blue Professional', colors: { primary: '#1976d2', primaryDark: '#0d47a1', primaryLight: '#63a4ff', accent: '#00bcd4', background: '#f5f9ff', surface: '#ffffff', text: '#1a1a1a', textSecondary: '#666666', border: '#e0e0e0', success: '#4caf50', error: '#f44336', warning: '#ff9800' } },
  greenEco: { name: 'Green Eco', colors: { primary: '#43a047', primaryDark: '#1b5e20', primaryLight: '#76d275', accent: '#8bc34a', background: '#f5faf5', surface: '#ffffff', text: '#1a1a1a', textSecondary: '#666666', border: '#e0e0e0', success: '#4caf50', error: '#f44336', warning: '#ff9800' } },
  luxuryBlackGold: { name: 'Luxury Black Gold', colors: { primary: '#000000', primaryDark: '#1a1a1a', primaryLight: '#424242', accent: '#d4af37', background: '#fafafa', surface: '#ffffff', text: '#1a1a1a', textSecondary: '#666666', border: '#e0e0e0', success: '#4caf50', error: '#f44336', warning: '#d4af37' } },
  modernGray: { name: 'Modern Gray', colors: { primary: '#424242', primaryDark: '#212121', primaryLight: '#757575', accent: '#607d8b', background: '#f5f5f5', surface: '#ffffff', text: '#1a1a1a', textSecondary: '#666666', border: '#e0e0e0', success: '#4caf50', error: '#f44336', warning: '#ff9800' } },
  navyWhite: { name: 'Navy White', colors: { primary: '#1a237e', primaryDark: '#0d134b', primaryLight: '#534bae', accent: '#ffffff', background: '#f5f7ff', surface: '#ffffff', text: '#1a1a1a', textSecondary: '#666666', border: '#e0e0e0', success: '#4caf50', error: '#f44336', warning: '#ff9800' } },
};

export function applyThemeToDOM(branding) {
  if (!branding?.colors) return;
  const root = document.documentElement;
  for (const [key, cssName] of Object.entries({
    primary: '--primary-color', primaryDark: '--primary-dark', primaryLight: '--primary-light',
    accent: '--accent-color', background: '--background-color', surface: '--surface-color',
    text: '--text-color', textSecondary: '--text-secondary', border: '--border-color',
    success: '--success-color', error: '--error-color', warning: '--warning-color',
  })) root.style.setProperty(cssName, branding.colors[key]);
  if (branding.theme) {
    root.style.setProperty('--border-radius', `${branding.theme.borderRadius}px`);
    root.style.setProperty('--font-family', branding.theme.fontFamily);
  }
}
