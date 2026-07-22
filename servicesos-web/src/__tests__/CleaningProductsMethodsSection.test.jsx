import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CleaningProductsMethodsSection from '../components/CleaningProductsMethodsSection';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  review: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../modules/cleaning/products/cleaningProductService', () => ({
  createTenantCommercialProduct: mocks.create,
  listTenantCommercialProducts: mocks.list,
  reviewTenantCommercialProduct: mocks.review,
  updateTenantCommercialProduct: mocks.update,
}));

const pendingProduct = {
  id: 'product-one',
  recordType: 'commercial_product',
  scope: 'tenant',
  tenantId: 'tenant-a',
  name: 'Brand Product Original',
  category: 'surface cleaner',
  classification: 'cleaning',
  status: 'pending_review',
  intendedUses: ['Counters'],
  compatibleSurfaces: ['Sealed counters'],
  prohibitedSurfaces: [],
  requiredTools: [],
  requiredPPE: [],
  dangerousCombinations: [],
  ownerReviewNotes: '',
  employeeVisible: false,
  brand: 'Brand',
  productName: 'Product',
  variant: 'Original',
  manufacturer: 'Maker',
  containerSize: '24 oz',
  productCategory: 'surface cleaner',
  containerCondition: 'unknown',
  labelInformationComplete: false,
  labelDirections: '',
  dilutionInstructions: '',
  requiresDilution: false,
  contactTime: '',
  epaRegistrationNumber: '',
};

describe('CleaningProductsMethodsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
    mocks.create.mockImplementation(async (_tenantId, record) => ({
      ...pendingProduct,
      ...record,
      id: 'new-product',
      status: 'pending_review',
      employeeVisible: false,
    }));
    mocks.update.mockImplementation(async (_tenantId, recordId, record) => ({
      ...pendingProduct,
      ...record,
      id: recordId,
    }));
  });

  it('shows immutable starter methods and both shower formulas to an owner/admin', async () => {
    render(<CleaningProductsMethodsSection tenantId="tenant-a" actorUid="admin-a" canManage />);
    expect(await screen.findByText('No commercial products have been added for this tenant.')).toBeInTheDocument();
    const companyGroup = screen.getByText('Company methods').closest('details');
    expect(companyGroup).toHaveTextContent('10 system defaults');
    fireEvent.click(within(companyGroup).getByText('Company methods'));
    const shower = screen.getByText('Dawn and Vinegar Shower Cleaner').closest('details');
    fireEvent.click(within(shower).getByText('Dawn and Vinegar Shower Cleaner'));
    expect(within(shower).getByText('Standard')).toBeInTheDocument();
    expect(within(shower).getByText('Heavy buildup')).toBeInTheDocument();
    expect(within(shower).getByText('Cleaning only')).toBeInTheDocument();
    expect(within(shower).getByText('Not employee-visible')).toBeInTheDocument();
    expect(within(shower).getByText('14 days')).toBeInTheDocument();
    expect(within(shower).getByText(/inspect only · not employee-visible/i)).toBeInTheDocument();
    expect(within(shower).queryByRole('button')).not.toBeInTheDocument();
  });

  it('adds a commercial product as pending review without claiming approval', async () => {
    render(<CleaningProductsMethodsSection tenantId="tenant-a" actorUid="admin-a" canManage />);
    await screen.findByText('No commercial products have been added for this tenant.');
    const form = screen.getByRole('form', { name: 'Commercial product intake' });
    fireEvent.change(within(form).getByLabelText('Brand *'), { target: { value: 'Brand' } });
    fireEvent.change(within(form).getByLabelText('Product *'), { target: { value: 'Product' } });
    fireEvent.change(within(form).getByLabelText('Variant *'), { target: { value: 'Original' } });
    fireEvent.change(within(form).getByLabelText('Manufacturer *'), { target: { value: 'Maker' } });
    fireEvent.change(within(form).getByLabelText('Container size *'), { target: { value: '24 oz' } });
    fireEvent.change(within(form).getByLabelText('Product category *'), { target: { value: 'surface cleaner' } });
    fireEvent.change(within(form).getByLabelText('Label-supported uses *'), { target: { value: 'Counters' } });
    fireEvent.change(within(form).getByLabelText('Label directions *'), { target: { value: 'Follow label.' } });
    fireEvent.change(within(form).getByLabelText('PPE / ventilation *'), { target: { value: 'Gloves' } });
    fireEvent.change(within(form).getByLabelText('Warnings and dangerous combinations *'), { target: { value: 'Do not mix.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add for review' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ name: 'Brand Product Original', intendedUses: ['Counters'] }),
      { actorUid: 'admin-a' },
    ));
    expect(await screen.findByText(/added as pending review/i)).toBeInTheDocument();
    expect(screen.getAllByText('Pending review — do not use yet.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/product approved/i)).not.toBeInTheDocument();
  });

  it('shows an actionable approval failure and does not fabricate a status change', async () => {
    mocks.list.mockResolvedValue([pendingProduct]);
    mocks.review.mockRejectedValue(new Error('Enter the complete readable label directions.'));
    render(<CleaningProductsMethodsSection tenantId="tenant-a" actorUid="admin-a" canManage />);
    const card = (await screen.findByText('Brand Product Original')).closest('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('complete readable label directions');
    expect(within(card).getByText('Pending review')).toBeInTheDocument();
  });

  it('lets an owner correct review details without changing review status', async () => {
    mocks.list.mockResolvedValue([pendingProduct]);
    render(<CleaningProductsMethodsSection tenantId="tenant-a" actorUid="admin-a" canManage />);
    const card = (await screen.findByText('Brand Product Original')).closest('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Edit details' }));
    const form = screen.getByRole('form', { name: 'Commercial product intake' });
    expect(within(form).getByDisplayValue('Brand')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Label directions *'), { target: { value: 'Corrected exact label.' } });
    fireEvent.change(within(form).getByLabelText('PPE / ventilation *'), { target: { value: 'Gloves' } });
    fireEvent.change(within(form).getByLabelText('Warnings and dangerous combinations *'), { target: { value: 'Do not mix with bleach.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Update review details' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(
      'tenant-a',
      'product-one',
      expect.objectContaining({ labelDirections: 'Corrected exact label.' }),
      { actorUid: 'admin-a' },
    ));
    expect(await screen.findByText(/review status was not changed/i)).toBeInTheDocument();
  });

  it('does not render or load management controls for unauthorized roles', () => {
    const { container } = render(
      <CleaningProductsMethodsSection tenantId="tenant-a" actorUid="employee-a" canManage={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
