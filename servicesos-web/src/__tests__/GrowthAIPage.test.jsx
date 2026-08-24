// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GrowthAIPage from '../modules/growthAI/GrowthAIPage';

const state = vi.hoisted(() => ({
  auth: {
    currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
    role: 'admin',
    tenantId: 'tenant-a',
  },
  drafts: [],
  audit: {},
  profile: null,
  opportunityWorkspace: { opportunities: [], leads: [], bookings: [], rebookingImplemented: false },
  version: 0,
}));

const service = vi.hoisted(() => ({
  loadGrowthAIBrandProfile: vi.fn(),
  saveGrowthAIBrandProfile: vi.fn(),
  listGrowthAIDrafts: vi.fn(),
  listGrowthAIDraftAudit: vi.fn(),
  createGrowthAIDraft: vi.fn(),
  updateGrowthAIDraftContent: vi.fn(),
  submitGrowthAIDraftForReview: vi.fn(),
  approveGrowthAIDraft: vi.fn(),
  returnGrowthAIDraftToDraft: vi.fn(),
}));

const opportunityService = vi.hoisted(() => ({
  refreshGrowthAIOpportunityFeed: vi.fn(),
  markGrowthAIOpportunityActed: vi.fn(),
  dismissGrowthAIOpportunity: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.auth }));

vi.mock('../modules/growthAI/growthAIFoundationService', () => ({
  GROWTH_AI_PILLARS: ['find', 'attract', 'convert', 'retain', 'reputation'],
  ...service,
}));

vi.mock('../modules/growthAI/growthAIOpportunityService', () => opportunityService);

function timestamp() {
  return { toDate: () => new Date('2026-08-24T12:00:00.000Z') };
}

function appendAudit(draft, action, fromStatus, toStatus) {
  const entry = {
    id: `audit-${draft.version}`,
    action,
    fromStatus,
    toStatus,
    timestamp: timestamp(),
    actorUid: 'admin-a',
  };
  state.audit[draft.id] = [entry, ...(state.audit[draft.id] || [])];
}

function savedDraft(overrides = {}) {
  return {
    id: 'draft-a',
    pillar: 'attract',
    actionType: 'marketing_post',
    title: 'Availability Post - Test City',
    content: {
      fullCaption: 'Original tenant caption',
      shortCaption: 'Short tenant caption',
      callToAction: 'Request a quote.',
      hashtags: '#TenantACleaning',
      imagePrompt: 'A clean home.',
    },
    sourceRefs: {},
    status: 'draft',
    approvedByUid: null,
    approvedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('GrowthAI V1 tenant draft foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth = {
      currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
      role: 'admin',
      tenantId: 'tenant-a',
    };
    state.drafts = [];
    state.audit = {};
    state.profile = null;
    state.opportunityWorkspace = { opportunities: [], leads: [], bookings: [], rebookingImplemented: false };
    state.version = 0;

    service.loadGrowthAIBrandProfile.mockImplementation(async tenantId => {
      expect(tenantId).toBe(state.auth.tenantId);
      return state.profile;
    });
    service.saveGrowthAIBrandProfile.mockImplementation(async (tenantId, profile) => {
      state.profile = { ...profile, tenantId };
      return state.profile;
    });
    service.listGrowthAIDrafts.mockImplementation(async tenantId => {
      expect(tenantId).toBe(state.auth.tenantId);
      return [...state.drafts];
    });
    service.listGrowthAIDraftAudit.mockImplementation(async (tenantId, draftId) => {
      expect(tenantId).toBe(state.auth.tenantId);
      return state.audit[draftId] || [];
    });
    service.createGrowthAIDraft.mockImplementation(async (tenantId, input) => {
      const draft = savedDraft({ ...input, id: `draft-${++state.version}`, version: 1 });
      state.drafts = [draft, ...state.drafts];
      appendAudit(draft, 'draft_created', null, 'draft');
      return draft;
    });
    service.updateGrowthAIDraftContent.mockImplementation(async (tenantId, id, input) => {
      const current = state.drafts.find(item => item.id === id);
      const next = {
        ...current,
        ...input,
        version: current.version + 1,
        status: current.status === 'approved' ? 'needs_review' : current.status,
        approvedByUid: current.status === 'approved' ? null : current.approvedByUid,
        approvedAt: current.status === 'approved' ? null : current.approvedAt,
      };
      state.drafts = state.drafts.map(item => item.id === id ? next : item);
      appendAudit(next, current.status === 'approved' ? 'approval_invalidated' : 'draft_edited', current.status, next.status);
      return next;
    });
    service.submitGrowthAIDraftForReview.mockImplementation(async (tenantId, id) => {
      const current = state.drafts.find(item => item.id === id);
      const next = { ...current, status: 'needs_review', version: current.version + 1 };
      state.drafts = [next];
      appendAudit(next, 'submitted_for_review', 'draft', 'needs_review');
      return next;
    });
    service.approveGrowthAIDraft.mockImplementation(async (tenantId, id) => {
      const current = state.drafts.find(item => item.id === id);
      const next = { ...current, status: 'approved', version: current.version + 1, approvedByUid: 'admin-a', approvedAt: timestamp() };
      state.drafts = [next];
      appendAudit(next, 'approved', 'needs_review', 'approved');
      return next;
    });
    opportunityService.refreshGrowthAIOpportunityFeed.mockImplementation(async tenantId => {
      expect(tenantId).toBe(state.auth.tenantId);
      return {
        ...state.opportunityWorkspace,
        opportunities: [...state.opportunityWorkspace.opportunities],
        leads: [...state.opportunityWorkspace.leads],
        bookings: [...state.opportunityWorkspace.bookings],
      };
    });
    opportunityService.markGrowthAIOpportunityActed.mockImplementation(async (_tenantId, id) => {
      state.opportunityWorkspace.opportunities = state.opportunityWorkspace.opportunities.map(item =>
        item.id === id ? { ...item, status: 'acted' } : item
      );
    });
    opportunityService.dismissGrowthAIOpportunity.mockImplementation(async (_tenantId, id) => {
      state.opportunityWorkspace.opportunities = state.opportunityWorkspace.opportunities.map(item =>
        item.id === id ? { ...item, status: 'dismissed' } : item
      );
    });
  });

  it('renders deterministic opportunities and creates a tenant follow-up draft without sending', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'estimate_followup__lead-a', type: 'estimate_followup', pillar: 'convert', status: 'open',
        sourceRefs: { leadId: 'lead-a', customerId: 'customer-a' },
        detectionReason: 'Estimate has been marked quoted for 4 days and no booking is linked.',
      }],
      leads: [{ id: 'lead-a', customerId: 'customer-a', customerSnapshot: { fullName: 'Jamie Test' } }],
      bookings: [],
      rebookingImplemented: false,
    };

    render(<GrowthAIPage />);
    expect(await screen.findByText('Estimate Follow-Up')).toBeInTheDocument();
    expect(screen.getByText('Jamie Test')).toBeInTheDocument();
    expect(screen.getByText(/Estimate has been marked quoted for 4 days/)).toHaveTextContent('no booking is linked');

    fireEvent.click(screen.getByRole('button', { name: 'Draft Follow-Up' }));
    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'convert',
      actionType: 'estimate_followup',
      sourceRefs: { leadId: 'lead-a', customerId: 'customer-a' },
      content: expect.objectContaining({ callToAction: 'Review and send manually' }),
    })));
    expect(opportunityService.markGrowthAIOpportunityActed).toHaveBeenCalledWith('tenant-a', 'estimate_followup__lead-a');
    expect(await screen.findByText(/Nothing was sent/)).toBeInTheDocument();
  });

  it('dismisses a stable opportunity and does not render it after refresh', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'estimate_followup__lead-a', type: 'estimate_followup', pillar: 'convert', status: 'open',
        sourceRefs: { leadId: 'lead-a' }, detectionReason: 'No booking is linked.',
      }],
      leads: [{ id: 'lead-a', formData: { fullName: 'Dismiss Test' } }],
      bookings: [],
      rebookingImplemented: false,
    };

    render(<GrowthAIPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(opportunityService.dismissGrowthAIOpportunity).toHaveBeenCalledWith(
      'tenant-a', 'estimate_followup__lead-a'
    ));
    expect(await screen.findByText(/Opportunity dismissed/)).toBeInTheDocument();
    expect(screen.queryByText('Dismiss Test')).not.toBeInTheDocument();
  });

  it('uses honest marketing-review wording and routes the canonical booking for review', async () => {
    const onReviewJob = vi.fn();
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'marketing_photo_review__booking-a', type: 'marketing_photo_review', pillar: 'attract', status: 'open',
        sourceRefs: { bookingId: 'booking-a', photoIds: ['before-a', 'after-a'] },
        detectionReason: 'Completed job has labeled Before and After field photos. Review the job photos to decide whether they are appropriate for marketing.',
      }],
      leads: [],
      bookings: [{ id: 'booking-a', customerName: 'Safe Test Residence' }],
      rebookingImplemented: false,
    };

    render(<GrowthAIPage onReviewJob={onReviewJob} />);
    expect(await screen.findByText('Marketing Opportunity')).toBeInTheDocument();
    expect(screen.getByText(/decide whether they are appropriate for marketing/)).toBeInTheDocument();
    expect(screen.queryByText(/approved for marketing/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review Job' }));
    await waitFor(() => expect(onReviewJob).toHaveBeenCalledWith('booking-a'));
    expect(opportunityService.markGrowthAIOpportunityActed).toHaveBeenCalledWith('tenant-a', 'marketing_photo_review__booking-a');
  });

  it('uses canonical tenant identity and stores only GrowthAI brand preferences', async () => {
    render(<GrowthAIPage />);
    expect(await screen.findByDisplayValue('Tenant A Cleaning')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tenant A Cleaning')).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText('Brand voice'), { target: { value: 'Warm and direct' } });
    fireEvent.change(screen.getByLabelText('Default call to action'), { target: { value: 'Request an estimate.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save brand preferences' }));

    await waitFor(() => expect(service.saveGrowthAIBrandProfile).toHaveBeenCalledWith('tenant-a', {
      brandVoice: 'Warm and direct',
      contentTone: '',
      defaultCTA: 'Request an estimate.',
    }));
    expect(screen.getByText(/Business identity comes from Business Settings/)).toBeInTheDocument();
  });

  it('persists a tenant draft across an unmount and reload without localStorage', async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const first = render(<GrowthAIPage />);
    await screen.findByText('No tenant drafts saved yet.');
    fireEvent.change(screen.getByLabelText('Service area'), { target: { value: 'Test City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deterministic draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as new draft' }));
    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'attract',
      actionType: 'marketing_post',
      content: expect.objectContaining({ hashtags: expect.stringContaining('#TenantACleaning') }),
    })));
    expect(localStorageSpy).not.toHaveBeenCalled();

    first.unmount();
    render(<GrowthAIPage />);
    expect(await screen.findByRole('button', { name: /Availability Post.*Test City/ })).toBeInTheDocument();
    expect(service.listGrowthAIDrafts).toHaveBeenCalledWith('tenant-a');
  });

  it('supports review and approval, then invalidates approval after a material edit', async () => {
    state.drafts = [savedDraft()];
    render(<GrowthAIPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Availability Post - Test City/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText(/Approved inside ServicesOS. Nothing was sent or published/)).toBeInTheDocument());
    expect(screen.getByText(/Approved by admin-a/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Full caption'), { target: { value: 'Materially changed customer-facing content.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText(/Prior approval was cleared/)).toBeInTheDocument());
    expect(service.updateGrowthAIDraftContent).toHaveBeenCalledWith('tenant-a', 'draft-a', expect.objectContaining({
      content: expect.objectContaining({ fullCaption: 'Materially changed customer-facing content.' }),
    }));
    expect(screen.queryByText(/Approved by admin-a/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/approval invalidated/).length).toBeGreaterThan(0);
  });

  it('keeps the current draft audit when an older audit request resolves last', async () => {
    const draftA = savedDraft({ id: 'draft-a', title: 'Draft A' });
    const draftB = savedDraft({ id: 'draft-b', title: 'Draft B' });
    state.drafts = [draftA, draftB];
    let resolveDraftA;
    let resolveDraftB;
    service.listGrowthAIDraftAudit.mockImplementation((tenantId, draftId) => {
      expect(tenantId).toBe('tenant-a');
      return new Promise(resolve => {
        if (draftId === 'draft-a') resolveDraftA = resolve;
        if (draftId === 'draft-b') resolveDraftB = resolve;
      });
    });

    render(<GrowthAIPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Draft A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Draft B/ }));

    await act(async () => resolveDraftB([{
      id: 'audit-b', action: 'draft_b_selected', fromStatus: 'draft', toStatus: 'draft', timestamp: timestamp(),
    }]));
    expect(await screen.findByText('draft b selected')).toBeInTheDocument();

    await act(async () => resolveDraftA([{
      id: 'audit-a', action: 'draft_a_selected', fromStatus: 'draft', toStatus: 'draft', timestamp: timestamp(),
    }]));
    expect(screen.getByText('draft b selected')).toBeInTheDocument();
    expect(screen.queryByText('draft a selected')).not.toBeInTheDocument();
  });

  it('restores deterministic marketing outputs and copy controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<GrowthAIPage />);
    await screen.findByText('No tenant drafts saved yet.');

    fireEvent.change(screen.getByLabelText('Service area'), { target: { value: 'Test City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deterministic draft' }));

    const fullCaption = screen.getByLabelText('Full caption').value;
    expect(fullCaption).toContain('#TenantACleaning');
    expect(screen.getByLabelText('Short caption').value).not.toBe('');
    expect(screen.getByLabelText('Call to action')).not.toHaveValue('');
    expect(screen.getByLabelText('Hashtags')).not.toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Copy full caption' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(fullCaption));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('restores deterministic customer response scenarios and persists them as tenant drafts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<GrowthAIPage />);
    await screen.findByText('No tenant drafts saved yet.');

    fireEvent.change(screen.getByLabelText('Response scenario'), { target: { value: 'review-request' } });
    fireEvent.change(screen.getByLabelText('Response channel'), { target: { value: 'email' } });
    expect(screen.getAllByText(/Thank you for choosing Tenant A Cleaning/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Copy response' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Tenant A Cleaning')));
    fireEvent.click(screen.getByRole('button', { name: 'Save response draft' }));

    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'convert',
      actionType: 'customer_response',
      title: expect.stringContaining('[Customer response]'),
      content: expect.objectContaining({
        fullCaption: expect.stringContaining('Tenant A Cleaning'),
        callToAction: 'Review and send manually',
      }),
      sourceRefs: {},
    })));
    expect(await screen.findByText(/Customer response draft saved for this tenant/)).toBeInTheDocument();
    expect(screen.getByLabelText('Action type')).toHaveValue('customer_response');
  });

  it('blocks ordinary employees before loading tenant GrowthAI records', () => {
    state.auth = { ...state.auth, role: 'employee' };
    render(<GrowthAIPage />);
    expect(screen.getByText(/available only to tenant owners and administrators/)).toBeInTheDocument();
    expect(service.listGrowthAIDrafts).not.toHaveBeenCalled();
    expect(opportunityService.refreshGrowthAIOpportunityFeed).not.toHaveBeenCalled();
  });

  it('clears Tenant A content when the workspace remounts for Tenant B', async () => {
    state.drafts = [savedDraft({ title: 'Tenant A private draft' })];
    const first = render(<GrowthAIPage />);
    expect(await screen.findByText('Tenant A private draft')).toBeInTheDocument();
    first.unmount();

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin',
      tenantId: 'tenant-b',
    };
    state.drafts = [savedDraft({ id: 'draft-b', title: 'Tenant B private draft' })];
    render(<GrowthAIPage />);

    expect(await screen.findByText('Tenant B private draft')).toBeInTheDocument();
    expect(screen.queryByText('Tenant A private draft')).not.toBeInTheDocument();
    expect(service.listGrowthAIDrafts).toHaveBeenLastCalledWith('tenant-b');
  });
});
