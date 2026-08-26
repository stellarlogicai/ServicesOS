import { describe, expect, it } from 'vitest';
import { getApprovedGrowthAIBrandContext, normalizeGrowthAIBrandProfile } from '../modules/growthAI/growthAIBrandContext';

describe('GrowthAI brand context', () => {
  it('uses canonical tenant business settings with legacy root fallbacks only', () => {
    const context = getApprovedGrowthAIBrandContext({
      tenant: {
        businessName: 'Legacy name',
        serviceArea: 'Legacy area',
        businessSettings: { businessName: 'Canonical name', serviceArea: 'Canonical area' },
        settings: { businessLogo: 'logos/tenant-a.png' },
      },
      profile: {},
    });

    expect(context).toMatchObject({
      businessName: 'Canonical name',
      serviceArea: 'Canonical area',
      logoRef: 'logos/tenant-a.png',
      tone: '',
      defaultCTA: '',
    });
  });

  it('keeps profile fields bounded and does not invent brand defaults', () => {
    expect(normalizeGrowthAIBrandProfile({
      writingStyle: '  Short and practical  ',
      platformPreferences: { instagram: true, unknown: true },
      brandColors: { primary: '#0f766e', secondary: 'bad-color' },
    })).toEqual({
      brandVoice: '',
      contentTone: '',
      writingStyle: 'Short and practical',
      defaultCTA: '',
      avoidTerms: '',
      platformPreferences: { general: false, facebook: false, instagram: true, linkedin: false, website: false },
      brandColors: { primary: '#0f766e', secondary: '', accent: '' },
    });
  });
});
