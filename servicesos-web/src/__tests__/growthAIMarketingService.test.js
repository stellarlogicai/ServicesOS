import { describe, expect, it } from 'vitest';
import { BRANDS } from '../modules/growthAI/brandProfiles';
import {
  buildMarketingSourceRefs,
  deriveTenantMarketingServices,
  MARKETING_CONTENT_TYPE_IDS,
  requiresMarketingOpportunity,
  validateMarketingSelection,
} from '../modules/growthAI/growthAIMarketingService';
import { generateDraft } from '../modules/growthAI/growthAIService';

const brand = { ...BRANDS.auntbs, name: 'Tenant A Cleaning', defaultCTA: 'Request a quote.' };

function postType(id) {
  return brand.postTypes.find(item => item.id === id);
}

describe('GrowthAI Marketing V1 contract', () => {
  it('defines every approved V1 marketing content type', () => {
    expect(MARKETING_CONTENT_TYPE_IDS).toEqual([
      'service_spotlight', 'promotional', 'seasonal', 'educational_tip', 'humor_engagement',
      'availability', 'local_community', 'completed_job', 'before_after', 'testimonial',
    ]);
  });

  it('derives only tenant booking service types without customer details', () => {
    expect(deriveTenantMarketingServices([
      { serviceType: 'deep' },
      { serviceType: 'standard' },
      { serviceType: 'deep', customerName: 'Must not be used' },
      { formData: { serviceType: 'commercial' } },
    ])).toEqual([
      { id: 'deep', label: 'Deep Cleaning' },
      { id: 'standard', label: 'Standard Cleaning' },
      { id: 'commercial', label: 'Commercial Cleaning' },
    ]);
  });

  it.each([
    ['service_spotlight', { serviceType: 'deep' }],
    ['promotional', { serviceType: 'deep', offer: 'Owner-approved offer' }],
    ['seasonal', { dateRange: 'Spring' }],
    ['educational_tip', { cleaningTopic: 'Keep entryways clear' }],
    ['humor_engagement', { cleaningTopic: 'Laundry mountain' }],
    ['availability', { serviceType: 'deep' }],
    ['local_community', {}],
  ])('creates a free deterministic %s draft without inventing restricted claims', (contentTypeId, inputs) => {
    const result = generateDraft(brand, postType(contentTypeId), { platform: 'general', ...inputs });
    expect(result.aiUsed).toBe(false);
    expect(result.generated.fullCaption).toContain('Request a quote.');
    expect(result.generated.fullCaption).not.toMatch(/slots are filling|discount|coupon|guarantee/i);
  });

  it('keeps before-and-after content at copy level without visual claims or an image prompt', () => {
    const result = generateDraft(brand, postType('before_after'), { platform: 'instagram', serviceType: 'deep' });
    expect(result.generated.fullCaption).toContain('does not infer or describe any image details');
    expect(result.generated.imagePrompt).toBe('');
  });

  it('uses platform-specific hashtag behavior without any platform API', () => {
    const general = generateDraft(brand, postType('availability'), { platform: 'general', serviceType: 'deep' });
    const instagram = generateDraft(brand, postType('availability'), { platform: 'instagram', serviceType: 'deep' });
    expect(instagram.generated.hashtags.split(' ')).toHaveLength(5);
    expect(general.generated.hashtags.split(' ')).toHaveLength(3);
    expect(instagram.generated.fullCaption.length).toBeLessThan(general.generated.fullCaption.length);
    expect(general.generated.callToAction).not.toContain('Questions?');
  });

  it('blocks unsupported service, completed-job, and testimonial generation before an action is taken', () => {
    expect(validateMarketingSelection({ contentTypeId: 'service_spotlight' })).toMatch(/Choose one/);
    expect(validateMarketingSelection({ contentTypeId: 'completed_job' })).toMatch(/eligible completed-job opportunity/);
    expect(validateMarketingSelection({ contentTypeId: 'testimonial' })).toMatch(/safe approved testimonial source/);
  });

  it('keeps completed-job source references to the opportunity ID only', () => {
    const opportunity = { id: 'marketing_photo_review__booking-a', sourceRefs: { bookingId: 'booking-a', customerId: 'customer-a' } };
    expect(requiresMarketingOpportunity('before_after')).toBe(true);
    expect(buildMarketingSourceRefs(opportunity)).toEqual({ opportunityId: 'marketing_photo_review__booking-a' });
  });
});
