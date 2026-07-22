import { describe, expect, it } from 'vitest';
import {
  buildCommercialProductCreate,
  buildCommercialProductReview,
  getCommercialApprovalIssues,
  isEmployeeUsableCleaningRecord,
  validateCleaningRecord,
} from '../modules/cleaning/products/cleaningProductModel';
import { getStarterCleaningMethods } from '../modules/cleaning/products/starterCleaningMethods';

const completeCommercialProduct = {
  id: 'commercial-one',
  recordType: 'commercial_product',
  scope: 'tenant',
  tenantId: 'tenant-a',
  name: 'Exact Brand Exact Product Original',
  category: 'bathroom cleaner',
  classification: 'cleaning',
  status: 'pending_review',
  intendedUses: ['Bathroom fixtures'],
  compatibleSurfaces: ['Glazed ceramic tile'],
  prohibitedSurfaces: ['Natural stone'],
  requiredTools: ['Microfiber cloth'],
  requiredPPE: ['Gloves'],
  dangerousCombinations: ['Do not mix with bleach'],
  ownerReviewNotes: 'Label reviewed against this exact container.',
  employeeVisible: false,
  brand: 'Exact Brand',
  productName: 'Exact Product',
  variant: 'Original',
  manufacturer: 'Exact Manufacturer',
  containerSize: '32 oz',
  productCategory: 'bathroom cleaner',
  containerCondition: 'good',
  labelInformationComplete: true,
  labelDirections: 'Apply according to the product label.',
  requiresDilution: false,
};

describe('cleaning product and method model', () => {
  it('provides ten immutable system defaults with the approved shower variants and warnings', () => {
    const records = getStarterCleaningMethods();
    expect(records).toHaveLength(10);
    expect(Object.isFrozen(records)).toBe(true);
    expect(records.every(record => record.scope === 'system_default')).toBe(true);
    expect(records.every(record => record.recordType === 'company_mix')).toBe(true);
    expect(records.every(record => record.classification === 'cleaning')).toBe(true);
    expect(records.every(record => record.employeeVisible === false)).toBe(true);

    const shower = records.find(record => record.id === 'ab-dawn-vinegar-shower-cleaner');
    expect(shower.status).toBe('owner_tested');
    expect(shower.approvedContainer).toBe('Dedicated 32 oz chemical-resistant Zep spray bottle');
    expect(shower.formulaVariants).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'standard', expectedYield: 'Approximately 25 oz' }),
      expect.objectContaining({ id: 'heavy-buildup', expectedYield: 'Approximately 21.5 oz' }),
    ]));
    expect(shower.prohibitedSurfaces).toEqual(expect.arrayContaining(['Marble', 'Mirrors', 'Natural stone']));
    expect(shower.dangerousCombinations).toContain('Never mix with bleach.');
    expect(shower.ownerReviewNotes).toContain('Not a sanitizer or disinfectant');
  });

  it('rejects non-cleaning company mixes and unsafe employee visibility', () => {
    const result = validateCleaningRecord({
      id: 'unsafe-mix',
      recordType: 'company_mix',
      scope: 'system_default',
      name: 'Unsafe claim',
      category: 'test',
      classification: 'disinfecting',
      status: 'candidate',
      employeeVisible: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Company-mixed records must be classified as cleaning only.');
    expect(isEmployeeUsableCleaningRecord({ status: 'candidate', employeeVisible: true })).toBe(false);
  });

  it('forces new tenant commercial products to pending review and not employee-visible', () => {
    const created = buildCommercialProductCreate(
      { ...completeCommercialProduct, status: 'approved', employeeVisible: true },
      { tenantId: 'tenant-a', actorUid: 'admin-a', now: 'now' },
    );
    expect(created.status).toBe('pending_review');
    expect(created.employeeVisible).toBe(false);
    expect(created.tenantId).toBe('tenant-a');
    expect(created.createdBy).toBe('admin-a');
  });

  it('blocks incomplete approval and allows an explicit complete owner approval', () => {
    expect(getCommercialApprovalIssues({ ...completeCommercialProduct, labelDirections: '' }))
      .toContain('Enter the complete readable label directions.');
    expect(() => buildCommercialProductReview(
      { ...completeCommercialProduct, labelDirections: '' },
      'approved',
      { actorUid: 'admin-a', now: 'review-time' },
    )).toThrow('complete readable label directions');

    const approved = buildCommercialProductReview(completeCommercialProduct, 'approved', {
      actorUid: 'admin-a',
      now: 'review-time',
    });
    expect(approved.status).toBe('approved');
    expect(approved.employeeVisible).toBe(true);
    expect(approved.reviewedBy).toBe('admin-a');
  });

  it('requires exact label contact details for sanitizing and disinfecting claims', () => {
    const sanitizerIssues = getCommercialApprovalIssues({
      ...completeCommercialProduct,
      classification: 'sanitizing',
      contactTime: '',
    });
    expect(sanitizerIssues).toContain('Enter the exact label contact time for sanitizing or disinfecting claims.');

    const disinfectantIssues = getCommercialApprovalIssues({
      ...completeCommercialProduct,
      classification: 'disinfecting',
      contactTime: '10 minutes',
      epaRegistrationNumber: '',
    });
    expect(disinfectantIssues).toContain('Enter the EPA registration number for the disinfecting claim.');
  });
});
