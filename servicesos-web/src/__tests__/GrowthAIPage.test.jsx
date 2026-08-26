// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GrowthAIPage from '../modules/growthAI/GrowthAIPage';

const state = vi.hoisted(() => ({
  auth: {
    currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
    role: 'admin',
    tenantId: 'tenant-a',
    userProfile: { displayName: 'Jamie Brown' },
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

const gatewayService = vi.hoisted(() => ({
  credits: 5,
  createGrowthAIIdempotencyKey: vi.fn(),
  generateGrowthAIContent: vi.fn(),
  loadGrowthAICreditBalance: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.auth }));

vi.mock('../modules/growthAI/growthAIFoundationService', () => ({
  GROWTH_AI_PILLARS: ['find', 'attract', 'convert', 'retain', 'reputation'],
  ...service,
}));

vi.mock('../modules/growthAI/growthAIOpportunityService', () => opportunityService);
vi.mock('../modules/growthAI/growthAIGatewayService', () => gatewayService);

function timestamp() {
  return { toDate: () => new Date('2026-08-24T12:00:00.000Z') };
}

function deferred() {
  let resolve;
  const promise = new Promise(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
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

function openWorkspaceView(name) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

function openHomeCapability(name) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function submitComposer(message) {
  fireEvent.change(screen.getByLabelText('Ask GrowthAI anything'), { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

async function expectCreditBalance(value) {
  const creditSummary = await screen.findByLabelText('AI credit balance');
  await waitFor(() => expect(creditSummary).toHaveTextContent(String(value)));
}

describe('GrowthAI V1 tenant draft foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth = {
      currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
      role: 'admin',
      tenantId: 'tenant-a',
      userProfile: { displayName: 'Jamie Brown' },
    };
    state.drafts = [];
    state.audit = {};
    state.profile = null;
    state.opportunityWorkspace = { opportunities: [], leads: [], bookings: [], rebookingImplemented: false };
    state.version = 0;
    gatewayService.credits = 5;
    gatewayService.createGrowthAIIdempotencyKey.mockReturnValue('idempotency-a');
    gatewayService.loadGrowthAICreditBalance.mockImplementation(async () => ({
      available: gatewayService.credits,
      reserved: 0,
      buckets: { monthly: gatewayService.credits, promotional: 0, purchased: 0 },
    }));
    gatewayService.generateGrowthAIContent.mockImplementation(async ({ actionType, sourceRefs }) => {
      gatewayService.credits -= 1;
      const draft = savedDraft({
        id: `ai-draft-${++state.version}`,
        actionType,
        pillar: actionType === 'marketing_post' ? 'attract' : 'convert',
        title: `AI ${actionType}`,
        sourceRefs,
        content: { ...savedDraft().content, fullCaption: 'AI-assisted draft for human review.' },
      });
      state.drafts = [draft, ...state.drafts];
      appendAudit(draft, 'draft_created', null, 'draft');
      return {
        success: true,
        draftId: draft.id,
        creditsCharged: 1,
        ...(actionType === 'estimate_assistance' ? {
          estimateAssistance: {
            baselinePrice: { low: 180, suggested: 220, high: 260, currency: 'USD' },
            recommendedPrice: 235,
            reasoning: 'The saved scope includes a detailed kitchen and bathrooms.',
            assumptions: ['The home is accessible at the scheduled time.'],
            scopeSuggestions: ['Confirm interior cabinet cleaning.'],
            possibleAddOns: ['Inside refrigerator'],
            complexityFlags: ['Heavy buildup may require more time.'],
          },
        } : {}),
      };
    });

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
    openHomeCapability('Review opportunities');
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

  it('shows credits and saves one AI marketing draft for a rapid duplicate click', async () => {
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Create marketing');
    const aiButton = screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' });
    fireEvent.click(aiButton);
    fireEvent.click(aiButton);
    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledTimes(1));
    expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a',
      actionType: 'marketing_post',
      idempotencyKey: 'idempotency-a',
      sourceRefs: {},
      input: expect.objectContaining({ postTypeId: 'availability' }),
    }));
    expect(await screen.findByText(/AI-assisted draft saved for human review/)).toBeInTheDocument();
    await expectCreditBalance(4);
    expect(screen.getByLabelText('Full caption')).toHaveValue('AI-assisted draft for human review.');
  });

  it('keeps deterministic tools available with zero AI credits', async () => {
    gatewayService.credits = 0;
    render(<GrowthAIPage />);
    await expectCreditBalance(0);
    openHomeCapability('Create marketing');
    expect(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' })).toBeDisabled();
    openHomeCapability('Follow up');
    expect(screen.getByRole('button', { name: 'Improve with GrowthAI · 1 credit' })).toBeDisabled();
    openHomeCapability('Create marketing');
    fireEvent.click(screen.getByRole('button', { name: 'Create deterministic draft' }));
    expect(screen.getByLabelText('Full caption')).not.toHaveValue('');
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('shows provider failure honestly and reloads the restored balance', async () => {
    gatewayService.generateGrowthAIContent.mockRejectedValueOnce(new Error('AI-assisted generation failed. Your credit was restored.'));
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Create marketing');
    fireEvent.click(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('credit was restored');
    await expectCreditBalance(5);
    expect(state.drafts).toHaveLength(0);
  });

  it('uses canonical estimate opportunity references for optional AI follow-up', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'estimate_followup__lead-a', type: 'estimate_followup', pillar: 'convert', status: 'open',
        sourceRefs: { leadId: 'lead-a' }, detectionReason: 'Estimate requires follow-up.',
      }],
      leads: [{ id: 'lead-a', formData: { fullName: 'AI Follow-Up Test' } }],
      bookings: [],
      rebookingImplemented: false,
    };
    render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Generate follow-up with AI · 1 credit' }));
    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'estimate_followup',
      sourceRefs: { opportunityId: 'estimate_followup__lead-a', leadId: 'lead-a' },
      input: { channelId: 'general' },
    })));
  });

  it('keeps deterministic customer responses free and makes AI assistance explicit', async () => {
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [{
        id: 'lead-response-a', tenantId: 'tenant-a', status: 'quoted',
        customerSnapshot: { fullName: 'Response Customer' },
        requestSnapshot: { cleaningType: 'Deep clean' },
        estimate: { priceLow: 180, priceHigh: 220, currency: 'USD' },
      }],
      bookings: [], rebookingImplemented: false,
    };
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Follow up');
    const responseAIButton = screen.getByRole('button', { name: 'Improve with GrowthAI · 1 credit' });
    expect(responseAIButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Estimate to use'), { target: { value: 'lead-response-a' } });
    expect(screen.getByRole('button', { name: 'Save response draft' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Customer message for AI'), { target: { value: 'Can you clean next week?' } });
    fireEvent.click(responseAIButton);
    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'customer_response',
      sourceRefs: { leadId: 'lead-response-a' },
      input: expect.objectContaining({ customerMessage: 'Can you clean next week?', channelId: 'sms', communicationType: 'estimate_followup' }),
    })));
  });

  it('requires an explicit completed-job selection for a neutral deterministic review request', async () => {
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [],
      bookings: [{
        id: 'booking-completed', tenantId: 'tenant-a', status: 'completed', serviceType: 'Deep clean',
        customerName: 'Completed Customer',
      }, {
        id: 'booking-active', tenantId: 'tenant-a', status: 'scheduled', serviceType: 'Standard clean',
        customerName: 'Active Customer',
      }],
      rebookingImplemented: false,
    };
    render(<GrowthAIPage />);
    openHomeCapability('Follow up');
    fireEvent.change(screen.getByLabelText('Communication type'), { target: { value: 'review_request' } });

    expect(screen.getByRole('button', { name: 'Save response draft' })).toBeDisabled();
    expect(await screen.findByRole('option', { name: /Completed Customer/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Active Customer/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Completed job to use'), { target: { value: 'booking-completed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save response draft' }));

    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'reputation',
      actionType: 'customer_response',
      title: expect.stringContaining('Deterministic customer communication'),
      sourceRefs: { bookingId: 'booking-completed' },
      content: expect.objectContaining({ fullCaption: expect.stringContaining('honest review') }),
    })));
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('hands a rebooking opportunity into the existing review-required customer communication workflow without using AI', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'rebooking_gap__customer-a', type: 'rebooking_gap', pillar: 'retain', status: 'open',
        sourceRefs: { customerId: 'customer-a' },
        detectionReason: 'Standard clean is due with no upcoming matching booking.',
      }],
      leads: [],
      bookings: [{
        id: 'booking-completed', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed',
        serviceType: 'Standard clean', customerName: 'Retention Customer',
      }],
      rebookingCandidates: [{ customerId: 'customer-a', bookingId: 'booking-completed' }],
      rebookingImplemented: true,
    };

    render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare Rebooking Draft' }));

    await waitFor(() => expect(screen.getByLabelText('Communication type')).toHaveValue('rebooking'));
    expect(screen.getByLabelText('Completed job to use')).toHaveValue('booking-completed');
    expect(screen.getByText(/Nothing is sent automatically/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save response draft' }));

    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'retain',
      actionType: 'customer_response',
      sourceRefs: { bookingId: 'booking-completed' },
      content: expect.objectContaining({ callToAction: 'Review and send manually' }),
    })));
    expect(opportunityService.markGrowthAIOpportunityActed).toHaveBeenCalledWith('tenant-a', 'rebooking_gap__customer-a');
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
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
    openHomeCapability('Review opportunities');
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
    openHomeCapability('Review opportunities');
    expect(await screen.findByText('Marketing Opportunity')).toBeInTheDocument();
    expect(screen.getByText(/decide whether they are appropriate for marketing/)).toBeInTheDocument();
    expect(screen.queryByText(/approved for marketing/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review Job' }));
    await waitFor(() => expect(onReviewJob).toHaveBeenCalledWith('booking-a'));
    expect(opportunityService.markGrowthAIOpportunityActed).toHaveBeenCalledWith('tenant-a', 'marketing_photo_review__booking-a');
  });

  it('hands an eligible completed-job opportunity to marketing without passing booking, customer, or photo references to the client gateway', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'marketing_photo_review__booking-a', type: 'marketing_photo_review', pillar: 'attract', status: 'open',
        sourceRefs: { bookingId: 'booking-a', photoIds: ['before-a', 'after-a'], customerId: 'customer-a' },
        detectionReason: 'Completed job has labeled Before and After field photos.',
      }],
      leads: [],
      bookings: [{ id: 'booking-a', serviceType: 'deep', customerName: 'Private customer' }],
      rebookingImplemented: false,
    };

    render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Create marketing draft' }));
    expect(await screen.findByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();
    expect(screen.getByLabelText('Content type')).toHaveValue('before_after');
    expect(screen.getByText(/No image analysis or customer details are included/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' }));

    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'marketing_post',
      sourceRefs: { opportunityId: 'marketing_photo_review__booking-a' },
      input: expect.objectContaining({ postTypeId: 'before_after' }),
    })));
  });

  it('uses a tenant booking service for a service spotlight and blocks testimonial generation', async () => {
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [],
      bookings: [{ id: 'booking-a', serviceType: 'deep' }],
      rebookingImplemented: false,
    };

    render(<GrowthAIPage />);
    openHomeCapability('Create marketing');
    await screen.findByRole('option', { name: 'Deep Cleaning' });
    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'service_spotlight' } });
    fireEvent.change(screen.getByLabelText('Tenant service'), { target: { value: 'deep' } });
    const createDraft = screen.getByRole('button', { name: 'Create deterministic draft' });
    await waitFor(() => expect(createDraft).toBeEnabled());
    fireEvent.click(createDraft);
    expect((await screen.findByLabelText('Full caption')).value).toContain('deep');

    openWorkspaceView('Home');
    openHomeCapability('Create marketing');
    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'testimonial' } });
    expect(screen.getByRole('button', { name: 'Create deterministic draft' })).toBeDisabled();
    expect(screen.getByText(/safe approved testimonial source/)).toBeInTheDocument();
  });

  it('uses canonical tenant identity and stores only GrowthAI brand preferences', async () => {
    render(<GrowthAIPage />);
    fireEvent.click(screen.getByRole('button', { name: /Using Tenant A Cleaning brand profile/ }));
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
    openWorkspaceView('Drafts');
    await screen.findByText('No tenant drafts saved yet.');
    openWorkspaceView('Home');
    openHomeCapability('Create marketing');
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
    openWorkspaceView('Drafts');
    expect(await screen.findByRole('button', { name: /Availability content.*cleaning service/ })).toBeInTheDocument();
    expect(service.listGrowthAIDrafts).toHaveBeenCalledWith('tenant-a');
  });

  it('supports review and approval, then invalidates approval after a material edit', async () => {
    state.drafts = [savedDraft()];
    render(<GrowthAIPage />);
    openWorkspaceView('Drafts');
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
    openWorkspaceView('Activity');
    expect(screen.getByText('Approval cleared after content changed')).toBeInTheDocument();
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
    openWorkspaceView('Drafts');
    fireEvent.click(await screen.findByRole('button', { name: /Draft A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Draft B/ }));
    openWorkspaceView('Activity');

    await act(async () => resolveDraftB([{
      id: 'audit-b', action: 'draft_b_selected', fromStatus: 'draft', toStatus: 'draft', timestamp: timestamp(),
    }]));
    expect(await screen.findByText('Draft b selected')).toBeInTheDocument();

    await act(async () => resolveDraftA([{
      id: 'audit-a', action: 'draft_a_selected', fromStatus: 'draft', toStatus: 'draft', timestamp: timestamp(),
    }]));
    expect(screen.getByText('Draft b selected')).toBeInTheDocument();
    expect(screen.queryByText('Draft a selected')).not.toBeInTheDocument();
  });

  it('restores deterministic marketing outputs and copy controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<GrowthAIPage />);
    openWorkspaceView('Drafts');
    await screen.findByText('No tenant drafts saved yet.');
    openWorkspaceView('Home');
    openHomeCapability('Create marketing');

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
    openWorkspaceView('Drafts');
    await screen.findByText('No tenant drafts saved yet.');
    openWorkspaceView('Home');
    openHomeCapability('Follow up');

    fireEvent.change(screen.getByLabelText('Response scenario'), { target: { value: 'review-request' } });
    fireEvent.change(screen.getByLabelText('Response channel'), { target: { value: 'email' } });
    expect(screen.getAllByText(/Thank you for choosing Tenant A Cleaning/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Copy quick response' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Tenant A Cleaning')));
    fireEvent.click(screen.getByRole('button', { name: 'Save quick response draft' }));

    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'convert',
      actionType: 'customer_response',
      title: expect.stringContaining('[Deterministic customer communication]'),
      content: expect.objectContaining({
        fullCaption: expect.stringContaining('Tenant A Cleaning'),
        callToAction: 'Review and send manually',
      }),
      sourceRefs: {},
    })));
    expect(await screen.findByText(/Customer response draft saved for this tenant/)).toBeInTheDocument();
    expect(screen.getByLabelText('Action type')).toHaveValue('customer_response');
  });

  it('opens on Home and exposes truthful Drafts and selected-draft Activity views', async () => {
    state.drafts = [savedDraft()];
    render(<GrowthAIPage />);

    const homeTab = screen.getByRole('tab', { name: 'Home' });
    expect(homeTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Home');
    expect(screen.getByText(/Good (morning|afternoon|evening), Jamie\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /How can I help grow Tenant A Cleaning today/ })).toBeInTheDocument();

    openWorkspaceView('Drafts');
    expect(screen.getByRole('tab', { name: 'Drafts' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(await screen.findByRole('button', { name: /Availability Post - Test City/ }));

    openWorkspaceView('Activity');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Activity');
    expect(screen.getByText(/immutable audit history for the selected draft only/)).toBeInTheDocument();
    expect(screen.getByText(/not a tenant-wide GrowthAI activity feed/)).toBeInTheDocument();
  });

  it('supports arrow, Home, and End keyboard navigation across workspace tabs', () => {
    render(<GrowthAIPage />);
    const homeTab = screen.getByRole('tab', { name: 'Home' });
    const draftsTab = screen.getByRole('tab', { name: 'Drafts' });
    const activityTab = screen.getByRole('tab', { name: 'Activity' });

    homeTab.focus();
    fireEvent.keyDown(homeTab, { key: 'ArrowRight' });
    expect(draftsTab).toHaveFocus();
    expect(draftsTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(draftsTab, { key: 'End' });
    expect(activityTab).toHaveFocus();
    expect(activityTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(activityTab, { key: 'Home' });
    expect(homeTab).toHaveFocus();
    expect(homeTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(homeTab, { key: 'ArrowLeft' });
    expect(activityTab).toHaveFocus();
    expect(activityTab).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps workflows hidden until deterministic conversation routing invokes one', async () => {
    render(<GrowthAIPage />);

    expect(screen.queryByLabelText('Tenant service')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Customer message for AI')).not.toBeInTheDocument();

    submitComposer('Please make me a Facebook post');
    expect(await screen.findByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();
    expect(screen.getByText('Please make me a Facebook post')).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();

    submitComposer('Help me reply to a customer');
    expect(await screen.findByRole('heading', { name: 'Customer response' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Marketing draft' })).not.toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();

    submitComposer('What should I work on?');
    expect(await screen.findByRole('heading', { name: 'Business briefing' })).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    await expectCreditBalance(5);
  });

  it('shows the default briefing after first-run dismissal without calling the provider', async () => {
    render(<GrowthAIPage />);
    fireEvent.click(await screen.findByRole('button', { name: "I'll explore myself" }));

    expect(await screen.findByRole('heading', { name: 'Business briefing' })).toBeInTheDocument();
    expect(screen.getByText(/not much to report yet/)).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    await expectCreditBalance(5);
  });

  it('renders a free briefing and opens suggested work without mutating records', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'estimate-follow-up', type: 'estimate_followup', status: 'open',
        detectionReason: 'Quoted estimate needs follow-up.', sourceRefs: { leadId: 'lead-a' },
      }],
      leads: [], bookings: [], rebookingImplemented: false,
    };
    render(<GrowthAIPage />);

    submitComposer('Give me my business briefing');
    expect(await screen.findByText('Quoted estimate needs follow-up.')).toBeInTheDocument();
    expect(screen.getAllByText('No AI credits used').length).toBeGreaterThan(0);
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    await expectCreditBalance(5);

    fireEvent.click(screen.getAllByRole('button', { name: 'Review estimate follow-ups' }).at(-1));
    expect(await screen.findByRole('heading', { name: 'Growth opportunities' })).toBeInTheDocument();
    expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
    expect(opportunityService.markGrowthAIOpportunityActed).not.toHaveBeenCalled();
    expect(opportunityService.dismissGrowthAIOpportunity).not.toHaveBeenCalled();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('answers help and unknown requests without opening a workflow or spending credits', async () => {
    render(<GrowthAIPage />);

    submitComposer('What can you do?');
    expect(await screen.findByText(/review growth opportunities, create marketing drafts/)).toBeInTheDocument();
    expect(screen.queryByText('Marketing draft')).not.toBeInTheDocument();

    submitComposer('Organize my filing cabinet');
    expect(await screen.findByText(/currently help with an estimate, review growth opportunities/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Create marketing' }).length).toBeGreaterThan(1);
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    await expectCreditBalance(5);
  });

  it('shows selected canonical estimate pricing without calling the AI gateway', async () => {
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [{
        id: 'lead-estimate-a', tenantId: 'tenant-a', status: 'quoted',
        customerSnapshot: { fullName: 'Estimate Customer' },
        formData: { cleaningType: 'Deep clean' }, createdAt: '2026-08-20T12:00:00.000Z',
        estimate: { priceLow: 180, priceSuggested: 220, priceHigh: 260, currency: 'USD' },
      }, {
        id: 'lead-booked', tenantId: 'tenant-a', status: 'quoted', booking: { bookingId: 'booking-a' },
        customerSnapshot: { fullName: 'Booked Customer' }, estimate: { priceLow: 100, priceHigh: 120 },
      }],
      bookings: [], rebookingImplemented: false,
    };
    render(<GrowthAIPage />);
    submitComposer('Help me with an estimate');

    const option = await screen.findByRole('button', { name: /Estimate Customer/ });
    expect(option).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Booked Customer')).not.toBeInTheDocument();
    expect(screen.queryByText('ServicesOS pricing')).not.toBeInTheDocument();
    fireEvent.click(option);

    expect(await screen.findByText('ServicesOS pricing')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();
    expect(screen.getByText('$220.00')).toBeInTheDocument();
    expect(screen.getByText('$260.00')).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('keeps saved pricing usable with zero credits and makes estimate analysis explicit', async () => {
    gatewayService.credits = 0;
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [{
        id: 'lead-estimate-a', tenantId: 'tenant-a', status: 'new',
        customerSnapshot: { fullName: 'Zero Credit Customer' },
        estimate: { priceLow: 180, priceSuggested: 220, priceHigh: 260, currency: 'USD' },
      }],
      bookings: [], rebookingImplemented: false,
    };
    render(<GrowthAIPage />);
    openHomeCapability('Help with an estimate');
    fireEvent.click(await screen.findByRole('button', { name: /Zero Credit Customer/ }));

    expect(await screen.findByText('ServicesOS pricing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze with GrowthAI · 1 credit' })).toBeDisabled();
    expect(screen.getByText(/Not enough AI credits. ServicesOS pricing remains available/)).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('uses one canonical lead request and renders an advisory estimate recommendation without mutations', async () => {
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [{
        id: 'lead-estimate-a', tenantId: 'tenant-a', status: 'quoted',
        customerSnapshot: { fullName: 'Advisory Customer' },
        estimate: { priceLow: 180, priceSuggested: 220, priceHigh: 260, currency: 'USD' },
      }],
      bookings: [], rebookingImplemented: false,
    };
    render(<GrowthAIPage />);
    openHomeCapability('Help with an estimate');
    fireEvent.click(await screen.findByRole('button', { name: /Advisory Customer/ }));
    const analyze = screen.getByRole('button', { name: 'Analyze with GrowthAI · 1 credit' });
    fireEvent.click(analyze);
    fireEvent.click(analyze);

    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledTimes(1));
    expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', actionType: 'estimate_assistance', sourceRefs: { leadId: 'lead-estimate-a' }, input: {},
    }));
    expect(await screen.findByText('GrowthAI recommendation')).toBeInTheDocument();
    expect(screen.getByText('Review before using')).toBeInTheDocument();
    expect(screen.getByText('$235.00')).toBeInTheDocument();
    expect(screen.getByText(/did not change the estimate, booking, payment, schedule, or customer record/)).toBeInTheDocument();
    expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
    expect(opportunityService.markGrowthAIOpportunityActed).not.toHaveBeenCalled();
    expect(opportunityService.dismissGrowthAIOpportunity).not.toHaveBeenCalled();
  });

  it('clears a selected Tenant A estimate before Tenant B estimates load', async () => {
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [{
        id: 'lead-tenant-a', tenantId: 'tenant-a', status: 'quoted',
        customerSnapshot: { fullName: 'Tenant A Estimate' },
        estimate: { priceLow: 180, priceSuggested: 220, priceHigh: 260, currency: 'USD' },
      }],
      bookings: [], rebookingImplemented: false,
    };
    const view = render(<GrowthAIPage />);
    openHomeCapability('Help with an estimate');
    fireEvent.click(await screen.findByRole('button', { name: /Tenant A Estimate/ }));
    expect(await screen.findByText('ServicesOS pricing')).toBeInTheDocument();

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [{
        id: 'lead-tenant-b', tenantId: 'tenant-b', status: 'new',
        customerSnapshot: { fullName: 'Tenant B Estimate' },
        estimate: { priceLow: 120, priceSuggested: 140, priceHigh: 160, currency: 'USD' },
      }],
      bookings: [], rebookingImplemented: false,
    };
    view.rerender(<GrowthAIPage />);

    expect(screen.queryByText('Tenant A Estimate')).not.toBeInTheDocument();
    expect(screen.queryByText('ServicesOS pricing')).not.toBeInTheDocument();
    openHomeCapability('Help with an estimate');
    expect(await screen.findByRole('button', { name: /Tenant B Estimate/ })).toBeInTheDocument();
    expect(screen.queryByText('Tenant A Estimate')).not.toBeInTheDocument();
  });

  it('ignores stale workspace responses across a tenant switch and reloads when switching back', async () => {
    const workspaceLoads = { 'tenant-a': [], 'tenant-b': [] };
    service.loadGrowthAIBrandProfile.mockImplementation(tenantId => {
      const request = deferred();
      workspaceLoads[tenantId].push({ kind: 'profile', request });
      return request.promise;
    });
    service.listGrowthAIDrafts.mockImplementation(tenantId => {
      const request = deferred();
      workspaceLoads[tenantId].push({ kind: 'drafts', request });
      return request.promise;
    });

    const view = render(<GrowthAIPage />);
    openWorkspaceView('Drafts');
    await waitFor(() => expect(workspaceLoads['tenant-a']).toHaveLength(2));

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(workspaceLoads['tenant-b']).toHaveLength(2));

    await act(async () => {
      workspaceLoads['tenant-a'][0].request.resolve({ brandVoice: 'Tenant A private voice' });
      workspaceLoads['tenant-a'][1].request.resolve([savedDraft({ title: 'Tenant A private draft' })]);
    });
    expect(screen.queryByText('Tenant A private draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Tenant A private voice')).not.toBeInTheDocument();

    await act(async () => {
      workspaceLoads['tenant-b'][0].request.resolve({ brandVoice: 'Tenant B voice' });
      workspaceLoads['tenant-b'][1].request.resolve([savedDraft({ id: 'draft-b', title: 'Tenant B private draft' })]);
    });
    expect(await screen.findByText('Tenant B private draft')).toBeInTheDocument();

    state.auth = {
      currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-a', userProfile: { displayName: 'Jamie Brown' },
    };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(workspaceLoads['tenant-a']).toHaveLength(4));
    await act(async () => {
      workspaceLoads['tenant-a'][2].request.resolve({ brandVoice: 'Tenant A restored voice' });
      workspaceLoads['tenant-a'][3].request.resolve([savedDraft({ title: 'Tenant A restored draft' })]);
    });
    expect(await screen.findByText('Tenant A restored draft')).toBeInTheDocument();
    expect(screen.queryByText('Tenant B private draft')).not.toBeInTheDocument();
  });

  it('never renders stale briefing data while tenants switch A to B and back to A', async () => {
    const opportunityLoads = { 'tenant-a': [], 'tenant-b': [] };
    opportunityService.refreshGrowthAIOpportunityFeed.mockImplementation(tenantId => {
      const request = deferred();
      opportunityLoads[tenantId].push(request);
      return request.promise;
    });

    const view = render(<GrowthAIPage />);
    await waitFor(() => expect(opportunityLoads['tenant-a']).toHaveLength(1));
    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(opportunityLoads['tenant-b']).toHaveLength(1));

    await act(async () => opportunityLoads['tenant-a'][0].resolve({
      opportunities: [{ id: 'a-only', type: 'estimate_followup', status: 'open', detectionReason: 'Tenant A briefing only.' }],
      leads: [], bookings: [], rebookingImplemented: false,
    }));
    submitComposer('What should I work on today?');
    expect(screen.queryByText('Tenant A briefing only.')).not.toBeInTheDocument();

    await act(async () => opportunityLoads['tenant-b'][0].resolve({
      opportunities: [{ id: 'b-only', type: 'estimate_followup', status: 'open', detectionReason: 'Tenant B briefing only.' }],
      leads: [], bookings: [], rebookingImplemented: false,
    }));
    expect(await screen.findByText('Tenant B briefing only.')).toBeInTheDocument();

    state.auth = {
      currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-a', userProfile: { displayName: 'Jamie Brown' },
    };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(opportunityLoads['tenant-a']).toHaveLength(2));
    await act(async () => opportunityLoads['tenant-a'][1].resolve({
      opportunities: [{ id: 'a-restored', type: 'estimate_followup', status: 'open', detectionReason: 'Tenant A restored briefing.' }],
      leads: [], bookings: [], rebookingImplemented: false,
    }));
    submitComposer('Give me my business briefing');
    expect(await screen.findByText('Tenant A restored briefing.')).toBeInTheDocument();
    expect(screen.queryByText('Tenant B briefing only.')).not.toBeInTheDocument();
  });

  it('ignores a stale Tenant A credit response after switching to Tenant B', async () => {
    const creditLoads = { 'tenant-a': deferred(), 'tenant-b': deferred() };
    gatewayService.loadGrowthAICreditBalance.mockImplementation(tenantId => creditLoads[tenantId].promise);

    const view = render(<GrowthAIPage />);
    await waitFor(() => expect(gatewayService.loadGrowthAICreditBalance).toHaveBeenCalledWith('tenant-a'));
    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(gatewayService.loadGrowthAICreditBalance).toHaveBeenCalledWith('tenant-b'));

    await act(async () => creditLoads['tenant-a'].resolve({ available: 99, reserved: 0 }));
    expect(screen.getByLabelText('AI credit balance')).not.toHaveTextContent('99');
    await act(async () => creditLoads['tenant-b'].resolve({ available: 7, reserved: 0 }));
    await expectCreditBalance(7);
  });

  it('ignores stale Tenant A audit results after switching to Tenant B', async () => {
    const auditA = deferred();
    state.drafts = [savedDraft({ id: 'draft-a', title: 'Tenant A draft' })];
    service.listGrowthAIDraftAudit.mockImplementation((tenantId, draftId) => {
      if (tenantId === 'tenant-a' && draftId === 'draft-a') return auditA.promise;
      return Promise.resolve([]);
    });

    const view = render(<GrowthAIPage />);
    openWorkspaceView('Drafts');
    fireEvent.click(await screen.findByRole('button', { name: /Tenant A draft/ }));
    openWorkspaceView('Activity');

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    state.drafts = [];
    view.rerender(<GrowthAIPage />);
    await act(async () => auditA.resolve([{
      id: 'audit-a', action: 'tenant_a_private_action', fromStatus: 'draft', toStatus: 'draft', timestamp: timestamp(),
    }]));

    expect(screen.queryByText('Tenant a private action')).not.toBeInTheDocument();
    expect(screen.queryByText('Tenant A draft')).not.toBeInTheDocument();
  });

  it('does not render a Tenant A AI result or message after switching to Tenant B', async () => {
    const aiResult = deferred();
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [{
        id: 'lead-estimate-a', tenantId: 'tenant-a', status: 'quoted',
        customerSnapshot: { fullName: 'Tenant A AI Customer' },
        estimate: { priceLow: 180, priceSuggested: 220, priceHigh: 260, currency: 'USD' },
      }],
      bookings: [], rebookingImplemented: false,
    };
    service.loadGrowthAIBrandProfile.mockResolvedValue({});
    service.listGrowthAIDrafts.mockResolvedValue([]);
    gatewayService.generateGrowthAIContent.mockReturnValue(aiResult.promise);

    const view = render(<GrowthAIPage />);
    openHomeCapability('Help with an estimate');
    fireEvent.click(await screen.findByRole('button', { name: /Tenant A AI Customer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze with GrowthAI · 1 credit' }));
    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledTimes(1));

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    state.opportunityWorkspace = { opportunities: [], leads: [], bookings: [], rebookingImplemented: false };
    view.rerender(<GrowthAIPage />);
    await act(async () => aiResult.resolve({
      success: true,
      draftId: 'tenant-a-ai-draft',
      creditsCharged: 1,
      estimateAssistance: {
        baselinePrice: { low: 180, suggested: 220, high: 260, currency: 'USD' },
        recommendedPrice: 235,
        reasoning: 'Tenant A only',
      },
    }));

    expect(screen.queryByText('Tenant A AI Customer')).not.toBeInTheDocument();
    expect(screen.queryByText('GrowthAI recommendation')).not.toBeInTheDocument();
    expect(screen.queryByText(/GrowthAI recommendation saved for human review/)).not.toBeInTheDocument();
    expect(screen.queryByText('Tenant A AI Customer')).not.toBeInTheDocument();
  });

  it('clears session-only conversation state when the tenant workspace remounts', async () => {
    const first = render(<GrowthAIPage />);
    submitComposer('Create a social post');
    expect(await screen.findByText('Create a social post')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();
    first.unmount();

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin',
      tenantId: 'tenant-b',
      userProfile: { displayName: 'Taylor Test' },
    };
    render(<GrowthAIPage />);

    expect(screen.getByRole('heading', { name: /How can I help grow Tenant B Cleaning today/ })).toBeInTheDocument();
    expect(screen.queryByText('Create a social post')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Marketing draft' })).not.toBeInTheDocument();
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
    openWorkspaceView('Drafts');
    expect(await screen.findByText('Tenant A private draft')).toBeInTheDocument();
    first.unmount();

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin',
      tenantId: 'tenant-b',
    };
    state.drafts = [savedDraft({ id: 'draft-b', title: 'Tenant B private draft' })];
    render(<GrowthAIPage />);
    openWorkspaceView('Drafts');

    expect(await screen.findByText('Tenant B private draft')).toBeInTheDocument();
    expect(screen.queryByText('Tenant A private draft')).not.toBeInTheDocument();
    expect(service.listGrowthAIDrafts).toHaveBeenLastCalledWith('tenant-b');
  });
});
