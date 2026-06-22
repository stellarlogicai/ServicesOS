// src/services/brandingService.js
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Branding Service
 * Manages per-tenant branding configuration in Firestore
 */

export async function getBranding(tenantId) {
  try {
    const brandingRef = doc(db, 'tenants', tenantId, 'branding', 'config');
    const brandingDoc = await getDoc(brandingRef);
    
    if (brandingDoc.exists()) {
      return { id: brandingDoc.id, ...brandingDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching branding:', error);
    throw error;
  }
}

export async function saveBranding(tenantId, brandingData) {
  try {
    const brandingRef = doc(db, 'tenants', tenantId, 'branding', 'config');
    const data = {
      ...brandingData,
      updatedAt: new Date().toISOString()
    };
    
    await setDoc(brandingRef, data, { merge: true });
    return { id: brandingRef.id, ...data };
  } catch (error) {
    console.error('Error saving branding:', error);
    throw error;
  }
}

export async function updateBranding(tenantId, brandingData) {
  try {
    const brandingRef = doc(db, 'tenants', tenantId, 'branding', 'config');
    const data = {
      ...brandingData,
      updatedAt: new Date().toISOString()
    };
    
    await updateDoc(brandingRef, data);
    return { id: brandingRef.id, ...data };
  } catch (error) {
    console.error('Error updating branding:', error);
    throw error;
  }
}

// Theme presets
export const THEME_PRESETS = {
  pinkPurple: {
    name: 'Pink Purple',
    colors: {
      primary: '#e91e63',
      primaryDark: '#c2185b',
      primaryLight: '#f48fb1',
      accent: '#9c27b0',
      background: '#faf5fa',
      surface: '#ffffff',
      text: '#1a1a1a',
      textSecondary: '#666666',
      border: '#e0e0e0',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800'
    }
  },
  blueProfessional: {
    name: 'Blue Professional',
    colors: {
      primary: '#1976d2',
      primaryDark: '#0d47a1',
      primaryLight: '#63a4ff',
      accent: '#00bcd4',
      background: '#f5f9ff',
      surface: '#ffffff',
      text: '#1a1a1a',
      textSecondary: '#666666',
      border: '#e0e0e0',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800'
    }
  },
  greenEco: {
    name: 'Green Eco',
    colors: {
      primary: '#43a047',
      primaryDark: '#1b5e20',
      primaryLight: '#76d275',
      accent: '#8bc34a',
      background: '#f5faf5',
      surface: '#ffffff',
      text: '#1a1a1a',
      textSecondary: '#666666',
      border: '#e0e0e0',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800'
    }
  },
  luxuryBlackGold: {
    name: 'Luxury Black Gold',
    colors: {
      primary: '#000000',
      primaryDark: '#1a1a1a',
      primaryLight: '#424242',
      accent: '#D4AF37',
      background: '#fafafa',
      surface: '#ffffff',
      text: '#1a1a1a',
      textSecondary: '#666666',
      border: '#e0e0e0',
      success: '#4caf50',
      error: '#f44336',
      warning: '#D4AF37'
    }
  },
  modernGray: {
    name: 'Modern Gray',
    colors: {
      primary: '#424242',
      primaryDark: '#212121',
      primaryLight: '#757575',
      accent: '#607d8b',
      background: '#f5f5f5',
      surface: '#ffffff',
      text: '#1a1a1a',
      textSecondary: '#666666',
      border: '#e0e0e0',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800'
    }
  },
  navyWhite: {
    name: 'Navy White',
    colors: {
      primary: '#1a237e',
      primaryDark: '#0d134b',
      primaryLight: '#534bae',
      accent: '#ffffff',
      background: '#f5f7ff',
      surface: '#ffffff',
      text: '#1a1a1a',
      textSecondary: '#666666',
      border: '#e0e0e0',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800'
    }
  }
};

export function applyThemeToDOM(branding) {
  if (!branding || !branding.colors) return;
  
  const root = document.documentElement;
  const colors = branding.colors;
  
  root.style.setProperty('--primary-color', colors.primary);
  root.style.setProperty('--primary-dark', colors.primaryDark);
  root.style.setProperty('--primary-light', colors.primaryLight);
  root.style.setProperty('--accent-color', colors.accent);
  root.style.setProperty('--background-color', colors.background);
  root.style.setProperty('--surface-color', colors.surface);
  root.style.setProperty('--text-color', colors.text);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--border-color', colors.border);
  root.style.setProperty('--success-color', colors.success);
  root.style.setProperty('--error-color', colors.error);
  root.style.setProperty('--warning-color', colors.warning);
  
  if (branding.theme) {
    root.style.setProperty('--border-radius', `${branding.theme.borderRadius}px`);
    root.style.setProperty('--font-family', branding.theme.fontFamily);
  }
}
