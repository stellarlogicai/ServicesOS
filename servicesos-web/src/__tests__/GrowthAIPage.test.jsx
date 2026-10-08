// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GrowthAIPage from '../modules/growthAI/GrowthAIPage';
import * as businessIntelligence from '../modules/growthAI/growthAIBusinessIntelligence';

const state = vi.hoisted(() => ({
  auth: {
    currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
    role: 'admin',
    tenantId: 'tenant-a',
    user: { uid: 'admin-a', displayName: 'Jamie Brown' },
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
  routeGrowthAIConversation: vi.fn(),
}));

const fieldPhotoService = vi.hoisted(() => ({
  listFieldPhotosForMarketing: vi.fn(),
  loadFieldPhotoBlob: vi.fn(),
}));
const catalogService = vi.hoisted(() => ({ listOwnerServices: vi.fn() }));
vi.mock('../services/serviceCatalogService', () => catalogService);

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.auth }));

vi.mock('../modules/growthAI/growthAIFoundationService', () => ({
  GROWTH_AI_PILLARS: ['find', 'attract', 'convert', 'retain', 'reputation'],
  ...service,
}));

vi.mock('../modules/growthAI/growthAIOpportunityService', () => opportunityService);
vi.mock('../modules/growthAI/growthAIGatewayService', () => gatewayService);
vi.mock('../services/fieldPhotoService', () => ({
  FIELD_PHOTO_PHASES: ['before', 'after'],
  listFieldPhotosForMarketing: fieldPhotoService.listFieldPhotosForMarketing,
  loadFieldPhotoBlob: fieldPhotoService.loadFieldPhotoBlob,
}));

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
  const quickAction = {
    'Create marketing': 'Create marketing post',
    'Follow up': 'Draft customer message',
    'Review opportunities': 'Find rebooking opportunities',
  }[name];
  if (quickAction) {
    fireEvent.click(screen.getByRole('button', { name: quickAction }));
    if (name === 'Review opportunities') fireEvent.click(screen.getByRole('button', { name: 'All' }));
    return;
  }
  if (name === 'Help with an estimate') {
    submitComposer('Help me with an estimate');
    return;
  }
  fireEvent.click(screen.getByRole('button', { name }));
}

function submitComposer(message) {
  fireEvent.change(screen.getByLabelText('Ask SLAI Assistant anything'), { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

async function expectCreditBalance(value) {
  const creditSummary = await screen.findByLabelText('AI credit balance');
  await waitFor(() => expect(creditSummary).toHaveTextContent(String(value)));
}

function canonicalCreditBalance(available, overrides = {}) {
  return {
    available,
    reserved: 0,
    buckets: { monthly: available, promotional: 0, purchased: 0 },
    monthlyAllowance: 100,
    periodStart: '2026-08-01T05:00:00.000Z',
    nextResetAt: '2026-09-01T05:00:00.000Z',
    timeZone: 'America/Chicago',
    ...overrides,
  };
}

describe('GrowthAI V1 tenant draft foundation', () => {
  const contextFixtures = () => {
    state.auth.currentTenant.businessSettings = { timeZone: 'UTC' };
    state.opportunityWorkspace = { opportunities: [], rebookingImplemented: false,
      bookings: [
        { id: 'context-booking', tenantId: 'tenant-a', customerId: 'context-customer', customerName: 'Synthetic Context Customer', serviceType: 'standard', status: 'scheduled', date: '2099-01-01', startTime: '10:00', agreedPrice: 180, leadId: 'context-estimate' },
        { id: 'context-past', tenantId: 'tenant-a', customerId: 'context-customer', customerName: 'Synthetic Context Customer', serviceType: 'standard', status: 'completed', date: '2020-01-01' },
        { id: 'foreign-booking', tenantId: 'tenant-b', customerId: 'foreign-customer', customerName: 'Foreign Context Customer', serviceType: 'deep', status: 'scheduled', date: '2099-01-01' },
      ],
      leads: [
        { id: 'context-estimate', tenantId: 'tenant-a', customerId: 'context-customer', customerName: 'Synthetic Context Customer', status: 'quoted', formData: { cleaningType: 'standard' }, createdAt: '2026-01-01T12:00:00Z', estimate: { priceLow: 170, priceHigh: 190 } },
        { id: 'context-estimate-second', tenantId: 'tenant-a', customerId: 'context-second', customerName: 'Synthetic Second Customer', status: 'quoted', formData: { cleaningType: 'deep' }, createdAt: '2026-02-01T12:00:00Z', estimate: { priceLow: 220, priceHigh: 250 } },
      ],
    };
    catalogService.listOwnerServices.mockResolvedValue([
      { id: 'standard-service', name: 'Canonical Standard Cleaning', serviceType: 'standard', active: true, priceCents: 18500, durationMinutes: 90 },
      { id: 'deep-service', name: 'Canonical Deep Cleaning', serviceType: 'deep', active: true, priceCents: 25000, durationMinutes: 120 },
    ]);
  };
  const expectReadOnlyContext = () => {
    expect(gatewayService.routeGrowthAIConversation).not.toHaveBeenCalled();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
    expect(opportunityService.markGrowthAIOpportunityActed).not.toHaveBeenCalled();
  };
  it.each([
    ['America/Chicago', '2026-10-04T04:00:00Z', '10/3/2026'],
    ['America/Los_Angeles', '2026-10-04T04:00:00Z', '10/3/2026'],
    ['UTC', '2026-10-04T04:00:00Z', '10/4/2026'],
    ['Asia/Tokyo', '2026-10-04T16:00:00Z', '10/5/2026'],
    ['Pacific/Kiritimati', '2026-10-04T12:00:00Z', '10/5/2026'],
    ['Not/AZone', '2026-10-04T04:00:00Z', null],
    ['America/Chicago', 'malformed', null],
  ])('renders tenant-local estimate creation for %s without provider calls or mutations', async (timeZone, createdAt, expected) => {
    contextFixtures(); state.auth.currentTenant.businessSettings = { timeZone };
    state.opportunityWorkspace.bookings = [];
    state.opportunityWorkspace.leads = [{ ...state.opportunityWorkspace.leads[0], createdAt }];
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Open estimates'); await screen.findByText(/1 eligible open estimates:/);
    submitComposer('When did we create that estimate?');
    const reply = await screen.findByText(expected ? `Created ${expected}.` : 'The estimate creation date is unavailable.');
    if (timeZone === 'America/Chicago') expect(reply).not.toHaveTextContent('Created 10/4/2026.');
    expectReadOnlyContext(); await expectCreditBalance(5);
    expect(state.opportunityWorkspace).toEqual(original);
  });
  it('clears estimate date references on reset and tenant/identity switch and uses the new tenant zone', async () => {
    contextFixtures(); state.auth.currentTenant.businessSettings = { timeZone: 'America/Chicago' };
    state.opportunityWorkspace.bookings = [];
    state.opportunityWorkspace.leads = [{ ...state.opportunityWorkspace.leads[0], createdAt: '2026-10-04T04:00:00Z' }];
    const view = render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Open estimates'); await screen.findByText(/1 eligible open estimates:/);
    submitComposer('When did we create that estimate?'); await screen.findByText('Created 10/3/2026.');
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText('Created 10/3/2026.')).not.toBeInTheDocument();
    submitComposer('When did we create that estimate?'); await screen.findByText(/Which booking, customer, estimate, or service do you mean/);
    state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'Pacific/Kiritimati' } }, user: { uid: 'synthetic-admin-b' } };
    state.opportunityWorkspace.leads = state.opportunityWorkspace.leads.map(item => ({ ...item, tenantId: 'tenant-b' }));
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/Which booking, customer, estimate, or service do you mean/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('When did we create that estimate?'); await screen.findByText(/Which booking, customer, estimate, or service do you mean/);
    submitComposer('Open estimates'); await screen.findByText(/1 eligible open estimates:/);
    submitComposer('When did we create that estimate?'); await screen.findByText('Created 10/4/2026.');
    state.auth = { ...state.auth, user: { uid: 'different-synthetic-admin-b' } };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText('Created 10/4/2026.')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('When did we create that estimate?'); await screen.findByText(/Which booking, customer, estimate, or service do you mean/);
    expectReadOnlyContext(); await expectCreditBalance(5);
  });
  const appointmentFixtures = () => {
    contextFixtures(); state.auth.currentTenant.businessSettings = { timeZone: 'America/Chicago' };
    const base = state.opportunityWorkspace.bookings[0];
    state.opportunityWorkspace.bookings = [{ ...base, customerName: 'Synthetic A', date: '2026-10-05', startTime: '10:00' },
      { ...base, id: 'appointment-b', customerId: 'customer-b', customerName: 'Synthetic B', date: '2026-10-06', startTime: '13:00' }];
    state.opportunityWorkspace.leads = [];
  };
  it.each([
    ['conflict', "When is Synthetic B's appointment for that job?", /named customer and referenced booking/],
    ['what-conflict', "What is Synthetic B's appointment for that job?", /named customer and referenced booking/],
    ['clean', "When is Synthetic B's appointment?", /^2026-10-06 at 13:00\.$/],
    ['coherent', "When is Synthetic B's appointment for that job?", /^2026-10-06 at 13:00\.$/],
    ['same', "When is Synthetic A's appointment for that job?", /^2026-10-05 at 10:00\.$/],
    ['context', 'When is their appointment for that job?', /^2026-10-05 at 10:00\.$/],
    ['unknown', "When is Synthetic Z's appointment for that job?", /specific own-tenant customer/],
    ['ambiguous', "When is Synthetic B's appointment?", /specific own-tenant customer/],
  ])('renders customer-coherent appointment for %s without provider calls, credits or writes', async (scenario, input, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      appointmentFixtures();
      if (scenario === 'ambiguous') state.opportunityWorkspace.bookings.push({ ...state.opportunityWorkspace.bookings[1], id: 'another-b', customerId: 'other-b' });
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (scenario === 'coherent') { submitComposer("When is Synthetic B's appointment?"); await screen.findByText(/^2026-10-06 at 13:00\.$/); }
      submitComposer(input);
      if (scenario === 'coherent') await waitFor(() => expect(screen.getAllByText(/^2026-10-06 at 13:00\.$/)).toHaveLength(2));
      else { const reply = await screen.findByText(expected); if (!['same', 'context'].includes(scenario)) expect(reply).not.toHaveTextContent('2026-10-05'); }
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { vi.useRealTimers(); }
  });
  it('clears appointment references on reset and tenant/identity switch without retaining A', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      appointmentFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      submitComposer("When is Synthetic B's appointment?"); await screen.findByText(/^2026-10-06 at 13:00\.$/);
      submitComposer("When is Synthetic B's appointment for that job?");
      await waitFor(() => expect(screen.getAllByText(/^2026-10-06 at 13:00\.$/)).toHaveLength(2));
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      submitComposer("When is Synthetic B's appointment for that job?"); await screen.findByText(/named customer and referenced booking/);
      state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'America/Chicago' } }, user: { uid: 'synthetic-admin-b' } };
      state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b' }];
      view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("When is Synthetic B's appointment for that job?"); await screen.findByText(/named customer and referenced booking/);
      submitComposer("When is Synthetic B's appointment?"); await screen.findByText(/^2026-10-06 at 13:00\.$/);
      state.auth = { ...state.auth, user: { uid: 'other-admin-b' } }; view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/^2026-10-06 at 13:00\.$/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("When is Synthetic B's appointment for that job?"); await screen.findByText(/named customer and referenced booking/);
      expectReadOnlyContext(); await expectCreditBalance(5);
    } finally { vi.useRealTimers(); }
  });
  const bookingServiceFixtures = () => {
    appointmentFixtures();
    state.opportunityWorkspace.bookings[0].serviceType = 'standard';
    state.opportunityWorkspace.bookings[1].serviceType = 'deep';
  };
  const phoneFixtures = () => {
    bookingServiceFixtures();
    state.opportunityWorkspace.bookings[0].customerSnapshot = { phone: '555-0110' };
    state.opportunityWorkspace.bookings[1].customerSnapshot = { phone: '555-0111' };
  };
  const emailFixtures = () => {
    phoneFixtures();
    state.opportunityWorkspace.bookings[0].customerSnapshot.email = 'a@example.test';
    state.opportunityWorkspace.bookings[1].customerSnapshot.email = 'b@example.test';
  };
  it.each(['modern', 'legacy'])('clarifies unrecognized named references through %s without cost or writes', async path => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    let modern;
    try {
      emailFixtures(); const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (path === 'legacy') modern = vi.spyOn(businessIntelligence, 'answerBusinessQuestion').mockReturnValue({ status: 'unsupported' });
      for (const [index, input] of [
        'When is that appointment for Synthetic B?', 'What service is that job for Synthetic B?',
        'What is the status of that job for Synthetic B?', 'How much is that job for Synthetic B?',
      ].entries()) {
        submitComposer(input);
        await waitFor(() => expect(screen.getAllByText(/Choose the specific own-tenant record from a current result list/)).toHaveLength(index + 1));
      }
      for (const [index, input] of [
        'How many times has Synthetic B booked for that job?', 'When did we last work with Synthetic B for that job?',
        'What are we charging Synthetic B for that job?', "What time is Synthetic B's appointment for that job?",
      ].entries()) {
        submitComposer(input);
        await waitFor(() => expect(screen.getAllByText(/named customer and referenced booking/)).toHaveLength(index + 1));
      }
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { modern?.mockRestore(); vi.useRealTimers(); }
  });
  it.each(['modern', 'legacy'])('renders all six freeze-blocker refusals through %s with zero cost or writes', async path => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    let modern;
    try {
      emailFixtures(); state.opportunityWorkspace.bookings[0].agreedPrice = 111.111;
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (path === 'legacy') modern = vi.spyOn(businessIntelligence, 'answerBusinessQuestion').mockReturnValue({ status: 'unsupported' });
      for (const [index, input] of [
        'Tell me about Synthetic B for that job?', 'Has Synthetic B used us before for that job?',
        "When was Synthetic B's estimate created for that job?", 'How much is Synthetic B paying for that job?',
        'What service is Synthetic B getting for that job?', 'What did we quote Synthetic B for that job?',
      ].entries()) {
        submitComposer(input);
        await waitFor(() => expect(screen.getAllByText(/named customer and referenced booking/)).toHaveLength(index + 1));
      }
      submitComposer('How much are we charging Synthetic A?'); await screen.findByText(/unavailable|missing canonical/);
      expect(screen.queryByText(/\$111\.11/)).not.toBeInTheDocument();
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { modern?.mockRestore(); vi.useRealTimers(); }
  });
  it.each(['modern', 'legacy'])('renders coherent freeze-blocker fields through %s without substituting appointment for creation', async path => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    let modern;
    try {
      emailFixtures(); state.opportunityWorkspace.bookings[1].agreedPrice = 222.22;
      state.opportunityWorkspace.bookings[1].leadId = 'estimate-b';
      state.opportunityWorkspace.leads = [{ id: 'estimate-b', tenantId: 'tenant-a', customerId: 'customer-b', customerName: 'Synthetic B',
        status: 'quoted', createdAt: '2026-10-03T05:30:00Z', estimate: { priceLow: 220, priceHigh: 240 } }];
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/);
      if (path === 'legacy') modern = vi.spyOn(businessIntelligence, 'answerBusinessQuestion').mockReturnValue({ status: 'unsupported' });
      for (const [input, expected] of [
        ['Tell me about Synthetic B for that job?', /^Synthetic B: Deep Cleaning/],
        ['Has Synthetic B used us before for that job?', /0 completed bookings/],
        ["When was Synthetic B's estimate created for that job?", /^Created 10\/3\/2026\.$/],
        ['How much is Synthetic B paying for that job?', /^Saved booking amount: \$222\.22\.$/],
        ['What did we quote Synthetic B for that job?', /Saved estimate range: \$220\.00 to \$240\.00/],
      ]) { submitComposer(input); await screen.findByText(expected); }
      submitComposer('What service is Synthetic B getting for that job?');
      await waitFor(() => expect(screen.getAllByText(/^Deep Cleaning$/)).toHaveLength(2));
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { modern?.mockRestore(); vi.useRealTimers(); }
  });
  it('invalidates repaired summary references on conversation, tenant and identity changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      emailFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/);
      submitComposer('Tell me about Synthetic B for that job?'); await screen.findByText(/^Synthetic B: Deep Cleaning/);
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      submitComposer('Tell me about Synthetic B for that job?'); await screen.findByText(/named customer and referenced booking/);
      state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessSettings: { timeZone: 'America/Chicago' } }, user: { uid: 'admin-b' } };
      state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b' }];
      view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Tell me about Synthetic B for that job?'); await screen.findByText(/named customer and referenced booking/);
      submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/);
      state.auth = { ...state.auth, user: { uid: 'other-admin-b' } }; view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/^Deep Cleaning$/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Tell me about Synthetic B for that job?'); await screen.findByText(/named customer and referenced booking/);
      expectReadOnlyContext(); await expectCreditBalance(5);
    } finally { vi.useRealTimers(); }
  });
  it.each([
    ['conflict', "What is Synthetic B's contact info for that job?", /named customer and referenced booking/],
    ['clean', "What is Synthetic B's contact info?", /^Synthetic B.*Phone: 555-0111/],
    ['coherent', "What is Synthetic B's contact info for that job?", /^Synthetic B.*Phone: 555-0111/],
    ['same', "What is Synthetic A's contact info for that job?", /^Synthetic A.*Phone: 555-0110/],
    ['context', 'What is their contact info for that job?', /^Synthetic A.*Phone: 555-0110/],
    ['unknown', "What is Synthetic Z's contact info for that job?", /specific own-tenant customer/],
    ['ambiguous', "What is Synthetic B's contact info for that job?", /specific own-tenant customer/],
    ['missing-phone', "What is Synthetic B's contact info for that job?", /unavailable/],
  ])('renders contact-info integrity for %s without provider, credits or writes', async (scenario, input, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      emailFixtures();
      if (scenario === 'ambiguous') state.opportunityWorkspace.bookings.push({ ...state.opportunityWorkspace.bookings[1], id: 'another-b', customerId: 'other-b' });
      if (scenario === 'missing-phone') state.opportunityWorkspace.bookings[1].customerSnapshot.phone = '';
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (scenario === 'coherent') { submitComposer("What is Synthetic B's contact info?"); await screen.findByText(/^Synthetic B.*Phone: 555-0111/); }
      if (scenario === 'missing-phone') { submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/); }
      submitComposer(input);
      if (scenario === 'coherent') await waitFor(() => expect(screen.getAllByText(/^Synthetic B.*Phone: 555-0111/)).toHaveLength(2));
      else { const reply = await screen.findByText(expected); if (!['same', 'context'].includes(scenario)) expect(reply).not.toHaveTextContent('555-0110'); }
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { vi.useRealTimers(); }
  });
  it.each(['conflict', 'coherent', 'context'])('renders existing legacy contact-info %s when modern execution is unsupported', async scenario => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    let modern;
    try {
      emailFixtures(); const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (scenario === 'coherent') { submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/); }
      modern = vi.spyOn(businessIntelligence, 'answerBusinessQuestion').mockReturnValue({ status: 'unsupported' });
      submitComposer(scenario === 'context' ? 'What is their contact info for that job?' : "What is Synthetic B's contact info for that job?");
      const reply = await screen.findByText(scenario === 'conflict' ? /named customer and referenced booking/
        : scenario === 'coherent' ? /^Synthetic B.*Phone: 555-0111/ : /^Synthetic A: Standard Cleaning/);
      if (scenario !== 'context') expect(reply).not.toHaveTextContent('555-0110');
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { modern?.mockRestore(); vi.useRealTimers(); }
  });
  it('clears contact-info references on reset and tenant/identity switches and accepts coherent context replacement', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      emailFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      submitComposer("What is Synthetic B's contact info?"); await screen.findByText(/^Synthetic B.*Phone: 555-0111/);
      submitComposer("What is Synthetic B's contact info for that job?");
      await waitFor(() => expect(screen.getAllByText(/^Synthetic B.*Phone: 555-0111/)).toHaveLength(2));
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      submitComposer("What is Synthetic B's contact info for that job?"); await screen.findByText(/named customer and referenced booking/);
      state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'America/Chicago' } }, user: { uid: 'synthetic-admin-b' } };
      state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b' }]; view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's contact info for that job?"); await screen.findByText(/named customer and referenced booking/);
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic B/);
      submitComposer("What is Synthetic B's contact info for that job?"); await screen.findByText(/^Synthetic B.*Phone: 555-0111/);
      state.auth = { ...state.auth, user: { uid: 'other-admin-b' } }; view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/^Synthetic B.*Phone: 555-0111/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's contact info for that job?"); await screen.findByText(/named customer and referenced booking/);
      expectReadOnlyContext(); await expectCreditBalance(5);
    } finally { vi.useRealTimers(); }
  });
  it.each([
    ['conflict', "What is Synthetic B's email address for that job?", /named customer and referenced booking/],
    ['clean', "What is Synthetic B's email address?", /^Synthetic B.*Email: b@example.test/],
    ['coherent', "What is Synthetic B's email address for that job?", /^Synthetic B.*Email: b@example.test/],
    ['same', "What is Synthetic A's email address for that job?", /^Synthetic A.*Email: a@example.test/],
    ['context', 'What is their email address for that job?', /^Synthetic A.*Email: a@example.test/],
    ['unknown', "What is Synthetic Z's email address for that job?", /specific own-tenant customer/],
    ['ambiguous', "What is Synthetic B's email address for that job?", /specific own-tenant customer/],
    ['missing-email', "What is Synthetic B's email address for that job?", /unavailable/],
  ])('renders coherent email lookup for %s with zero provider calls, credits or writes', async (scenario, input, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      emailFixtures();
      if (scenario === 'ambiguous') state.opportunityWorkspace.bookings.push({ ...state.opportunityWorkspace.bookings[1], id: 'another-b', customerId: 'other-b' });
      if (scenario === 'missing-email') state.opportunityWorkspace.bookings[1].customerSnapshot.email = '';
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (scenario === 'coherent') { submitComposer("What is Synthetic B's email address?"); await screen.findByText(/^Synthetic B.*Email: b@example.test/); }
      if (scenario === 'missing-email') { submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/); }
      submitComposer(input);
      if (scenario === 'coherent') await waitFor(() => expect(screen.getAllByText(/^Synthetic B.*Email: b@example.test/)).toHaveLength(2));
      else { const reply = await screen.findByText(expected); if (!['same', 'context'].includes(scenario)) expect(reply).not.toHaveTextContent('a@example.test'); }
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { vi.useRealTimers(); }
  });
  it('clears email references on reset and tenant/identity switches while permitting coherent B replacement', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      emailFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      submitComposer("What is Synthetic B's email address?"); await screen.findByText(/^Synthetic B.*Email: b@example.test/);
      submitComposer("What is Synthetic B's email address for that job?");
      await waitFor(() => expect(screen.getAllByText(/^Synthetic B.*Email: b@example.test/)).toHaveLength(2));
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      submitComposer("What is Synthetic B's email address for that job?"); await screen.findByText(/named customer and referenced booking/);
      state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'America/Chicago' } }, user: { uid: 'synthetic-admin-b' } };
      state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b' }];
      view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's email address for that job?"); await screen.findByText(/named customer and referenced booking/);
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic B/);
      submitComposer("What is Synthetic B's email address for that job?"); await screen.findByText(/^Synthetic B.*Email: b@example.test/);
      state.auth = { ...state.auth, user: { uid: 'other-admin-b' } }; view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/^Synthetic B.*Email: b@example.test/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's email address for that job?"); await screen.findByText(/named customer and referenced booking/);
      expectReadOnlyContext(); await expectCreditBalance(5);
    } finally { vi.useRealTimers(); }
  });
  it.each([
    ['conflict', "What is Synthetic B's phone number for that job?", /named customer and referenced booking/],
    ['clean', "What is Synthetic B's phone number?", /^Synthetic B.*Phone: 555-0111/],
    ['coherent', "What is Synthetic B's phone number for that job?", /^Synthetic B.*Phone: 555-0111/],
    ['same', "What is Synthetic A's phone number for that job?", /^Synthetic A.*Phone: 555-0110/],
    ['context', 'What is their phone number for that job?', /^Synthetic A.*Phone: 555-0110/],
    ['unknown', "What is Synthetic Z's phone number for that job?", /specific own-tenant customer/],
    ['ambiguous', "What is Synthetic B's phone number for that job?", /specific own-tenant customer/],
    ['missing-phone', "What is Synthetic B's phone number for that job?", /unavailable/],
  ])('renders coherent phone lookup for %s with zero provider calls, credits or writes', async (scenario, input, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      phoneFixtures();
      if (scenario === 'ambiguous') state.opportunityWorkspace.bookings.push({ ...state.opportunityWorkspace.bookings[1], id: 'another-b', customerId: 'other-b' });
      if (scenario === 'missing-phone') state.opportunityWorkspace.bookings[1].customerSnapshot.phone = '';
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (scenario === 'coherent') { submitComposer("What is Synthetic B's phone number?"); await screen.findByText(/^Synthetic B.*Phone: 555-0111/); }
      if (scenario === 'missing-phone') { submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/); }
      submitComposer(input);
      if (scenario === 'coherent') await waitFor(() => expect(screen.getAllByText(/^Synthetic B.*Phone: 555-0111/)).toHaveLength(2));
      else { const reply = await screen.findByText(expected); if (!['same', 'context'].includes(scenario)) expect(reply).not.toHaveTextContent('555-0110'); }
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { vi.useRealTimers(); }
  });
  it('clears phone references on reset and tenant/identity switches while permitting coherent B replacement', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      phoneFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      submitComposer("What is Synthetic B's phone number?"); await screen.findByText(/^Synthetic B.*Phone: 555-0111/);
      submitComposer("What is Synthetic B's phone number for that job?");
      await waitFor(() => expect(screen.getAllByText(/^Synthetic B.*Phone: 555-0111/)).toHaveLength(2));
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      submitComposer("What is Synthetic B's phone number for that job?"); await screen.findByText(/named customer and referenced booking/);
      state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'America/Chicago' } }, user: { uid: 'synthetic-admin-b' } };
      state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b' }];
      view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's phone number for that job?"); await screen.findByText(/named customer and referenced booking/);
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic B/);
      submitComposer("What is Synthetic B's phone number for that job?"); await screen.findByText(/^Synthetic B.*Phone: 555-0111/);
      state.auth = { ...state.auth, user: { uid: 'other-admin-b' } }; view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/^Synthetic B.*Phone: 555-0111/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's phone number for that job?"); await screen.findByText(/named customer and referenced booking/);
      expectReadOnlyContext(); await expectCreditBalance(5);
    } finally { vi.useRealTimers(); }
  });
  it.each([
    ['conflict', "What is Synthetic B's service for that job?", /named customer and referenced booking/],
    ['clean', "What is Synthetic B's service?", /^Deep Cleaning$/],
    ['coherent', "What is Synthetic B's service for that job?", /^Deep Cleaning$/],
    ['same', "What is Synthetic A's service for that job?", /^Standard Cleaning$/],
    ['context', 'What is their service for that job?', /^Standard Cleaning$/],
    ['unknown', "What is Synthetic Z's service for that job?", /specific own-tenant customer/],
    ['ambiguous', "What is Synthetic B's service?", /specific own-tenant customer/],
    ['missing-service', "What is Synthetic B's service?", /unavailable/],
  ])('renders coherent booking service for %s with zero provider calls, credits or writes', async (scenario, input, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      bookingServiceFixtures();
      if (scenario === 'ambiguous') state.opportunityWorkspace.bookings.push({ ...state.opportunityWorkspace.bookings[1], id: 'another-b', customerId: 'other-b' });
      if (scenario === 'missing-service') state.opportunityWorkspace.bookings[1].serviceType = '';
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      if (scenario === 'coherent') { submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/); }
      submitComposer(input);
      if (scenario === 'coherent') await waitFor(() => expect(screen.getAllByText(/^Deep Cleaning$/)).toHaveLength(2));
      else { const reply = await screen.findByText(expected); if (!['same', 'context'].includes(scenario)) expect(reply).not.toHaveTextContent('Standard Cleaning'); }
      expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    } finally { vi.useRealTimers(); }
  });
  it('clears service references on reset and tenant/identity switches while permitting coherent B replacement', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    try {
      bookingServiceFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
      submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/);
      submitComposer("What is Synthetic B's service for that job?");
      await waitFor(() => expect(screen.getAllByText(/^Deep Cleaning$/)).toHaveLength(2));
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      submitComposer("What is Synthetic B's service for that job?"); await screen.findByText(/named customer and referenced booking/);
      state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'America/Chicago' } }, user: { uid: 'synthetic-admin-b' } };
      state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b' }];
      view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's service for that job?"); await screen.findByText(/named customer and referenced booking/);
      submitComposer("What is Synthetic B's service?"); await screen.findByText(/^Deep Cleaning$/);
      state.auth = { ...state.auth, user: { uid: 'other-admin-b' } }; view.rerender(<GrowthAIPage />);
      await waitFor(() => expect(screen.queryByText(/^Deep Cleaning$/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer("What is Synthetic B's service for that job?"); await screen.findByText(/named customer and referenced booking/);
      expectReadOnlyContext(); await expectCreditBalance(5);
    } finally { vi.useRealTimers(); }
  });
  const statusFixtures = () => {
    contextFixtures(); const base = state.opportunityWorkspace.bookings[0];
    state.opportunityWorkspace.bookings = [{ ...base, customerName: 'Synthetic A' },
      { ...base, id: 'status-b', customerId: 'customer-b', customerName: 'Synthetic B', status: 'completed', date: '2026-10-01' }];
    state.opportunityWorkspace.leads = [];
  };
  it.each([
    ['conflict', "What's Synthetic B's status for that job?", /named customer and referenced booking/],
    ['clean', "What's Synthetic B's status?", /^completed$/],
    ['coherent', "What's Synthetic B's status for that job?", /^completed$/],
    ['same', "What's Synthetic A's status for that job?", /^scheduled$/],
    ['context', "What's their status for that job?", /^scheduled$/],
    ['unknown', "What's Synthetic Z's status for that job?", /specific own-tenant customer/],
    ['ambiguous', "What's Synthetic B's status?", /specific own-tenant customer/],
  ])('renders safe explicit booking status for %s without providers, credits or writes', async (scenario, input, expected) => {
    statusFixtures();
    if (scenario === 'ambiguous') state.opportunityWorkspace.bookings.push({ ...state.opportunityWorkspace.bookings[1], id: 'another-b', customerId: 'different-b' });
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
    if (scenario === 'coherent') { submitComposer("What's Synthetic B's status?"); await screen.findByText(/^completed$/); }
    submitComposer(input);
    if (scenario === 'coherent') await waitFor(() => expect(screen.getAllByText(/^completed$/)).toHaveLength(2));
    else { const reply = await screen.findByText(expected); if (!['same', 'context'].includes(scenario)) expect(reply).not.toHaveTextContent('scheduled'); }
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('clears explicit status context on conversation reset and tenant/identity switch', async () => {
    statusFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("What's Synthetic B's status?"); await screen.findByText(/^completed$/);
    submitComposer("What's Synthetic B's status for that job?");
    await waitFor(() => expect(screen.getAllByText(/^completed$/)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    submitComposer("What's Synthetic B's status for that job?"); await screen.findByText(/named customer and referenced booking/);
    state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'UTC' } }, user: { uid: 'synthetic-admin-b' } };
    state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b' }];
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("What's Synthetic B's status for that job?"); await screen.findByText(/named customer and referenced booking/);
    submitComposer("What's Synthetic B's status?"); await screen.findByText(/^completed$/);
    state.auth = { ...state.auth, user: { uid: 'different-synthetic-admin-b' } }; view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/^completed$/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("What's Synthetic B's status for that job?"); await screen.findByText(/named customer and referenced booking/);
    expectReadOnlyContext(); await expectCreditBalance(5);
  });
  const amountFixtures = () => {
    contextFixtures(); const base = state.opportunityWorkspace.bookings[0];
    state.opportunityWorkspace.bookings = [{ ...base, customerName: 'Synthetic A' },
      { ...base, id: 'amount-b', customerId: 'customer-b', customerName: 'Synthetic B', agreedPrice: 250, date: '2099-01-02' }];
    state.opportunityWorkspace.leads = [];
  };
  it.each([
    ['conflict', 'How much are we charging Synthetic B for that job?', /named customer and referenced booking/],
    ['clean', 'How much are we charging Synthetic B?', /Saved booking amount: \$250.00/],
    ['same', 'How much are we charging Synthetic A for that job?', /Saved booking amount: \$180.00/],
    ['unknown', 'How much are we charging Synthetic Z for that job?', /specific own-tenant customer/],
    ['ambiguous', 'How much are we charging Synthetic B?', /specific own-tenant customer/],
  ])('renders safe explicit amount lookup for %s without provider calls or mutations', async (scenario, input, expected) => {
    amountFixtures();
    if (scenario === 'ambiguous') state.opportunityWorkspace.bookings.push({ ...state.opportunityWorkspace.bookings[1], id: 'another-b', customerId: 'different-b' });
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
    submitComposer(input); const reply = await screen.findByText(expected);
    if (scenario !== 'same') expect(reply).not.toHaveTextContent('$180.00');
    if (['conflict', 'unknown', 'ambiguous'].includes(scenario)) expect(reply).not.toHaveTextContent('Saved booking amount:');
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('invalidates explicit amount context on reset and tenant/identity switch', async () => {
    amountFixtures(); const view = render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
    submitComposer('How much are we charging Synthetic B?'); await screen.findByText(/Saved booking amount: \$250.00/);
    submitComposer('How much are we charging Synthetic B for that job?');
    await waitFor(() => expect(screen.getAllByText(/Saved booking amount: \$250.00/)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    submitComposer('How much are we charging Synthetic B for that job?'); await screen.findByText(/named customer and referenced booking/);
    state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'UTC' } }, user: { uid: 'synthetic-admin-b' } };
    state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[1], tenantId: 'tenant-b', agreedPrice: 300 }];
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/named customer and referenced booking/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('How much are we charging Synthetic B for that job?'); await screen.findByText(/named customer and referenced booking/);
    submitComposer('How much are we charging Synthetic B?'); await screen.findByText(/Saved booking amount: \$300.00/);
    state.auth = { ...state.auth, user: { uid: 'different-synthetic-admin-b' } };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/Saved booking amount: \$300.00/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('How much are we charging Synthetic B for that job?'); await screen.findByText(/named customer and referenced booking/);
    expectReadOnlyContext(); await expectCreditBalance(5);
  });
  it.each(['valid', 'mismatch', 'missing-booking-identity', 'missing-estimate-identity'])('renders customer-consistent contextual quote for %s without provider calls or mutations', async scenario => {
    contextFixtures();
    if (scenario === 'mismatch') {
      state.opportunityWorkspace.bookings[0].leadId = 'context-estimate-second';
      state.opportunityWorkspace.leads[1].estimate = { priceLow: 240, priceHigh: 260 };
    }
    if (scenario === 'missing-booking-identity') delete state.opportunityWorkspace.bookings[0].customerId;
    if (scenario === 'missing-estimate-identity') delete state.opportunityWorkspace.leads[0].customerId;
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer('What did we quote them for that job?');
    const reply = await screen.findByText(scenario === 'valid' ? /Saved estimate range: \$170.00 to \$190.00/ : /The linked estimate does not establish this customer relationship/);
    expect(reply).not.toHaveTextContent('$240.00');
    if (scenario !== 'valid') expect(reply).not.toHaveTextContent('Saved estimate range:');
    expectReadOnlyContext(); await expectCreditBalance(5);
    expect(state.opportunityWorkspace).toEqual(original);
  });
  it('clears contextual quote associations on conversation reset and tenant/identity switch', async () => {
    contextFixtures();
    state.opportunityWorkspace.bookings[0].leadId = 'context-estimate-second';
    state.opportunityWorkspace.leads[1].estimate = { priceLow: 240, priceHigh: 260 };
    const view = render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer('What did we quote them for that job?'); await screen.findByText(/The linked estimate does not establish this customer relationship/);
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    submitComposer('What did we quote them for that job?'); await screen.findByText(/Which booking, customer, estimate, or service do you mean/);
    state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Synthetic B', businessSettings: { timeZone: 'UTC' } }, user: { uid: 'synthetic-admin-b' } };
    state.opportunityWorkspace.bookings = [{ ...state.opportunityWorkspace.bookings[0], tenantId: 'tenant-b', customerId: 'context-second', customerName: 'Synthetic Second Customer' }];
    state.opportunityWorkspace.leads = [{ ...state.opportunityWorkspace.leads[1], tenantId: 'tenant-b' }];
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/Which booking, customer, estimate, or service do you mean/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('What did we quote them for that job?'); await screen.findByText(/Which booking, customer, estimate, or service do you mean/);
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic Second Customer/);
    submitComposer('What did we quote them for that job?'); await screen.findByText(/Saved estimate range: \$240.00 to \$260.00/);
    state.auth = { ...state.auth, user: { uid: 'different-synthetic-admin-b' } };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/Saved estimate range: \$240.00 to \$260.00/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('What did we quote them for that job?'); await screen.findByText(/Which booking, customer, estimate, or service do you mean/);
    expectReadOnlyContext(); await expectCreditBalance(5);
  });
  it.each(['explicit', 'unresolved', 'ambiguous'])('renders safe legacy quote identity for %s without provider calls or mutations', async scenario => {
    contextFixtures();
    const base = state.opportunityWorkspace.bookings[0];
    state.opportunityWorkspace.bookings = [
      { ...base, customerName: 'Synthetic A' },
      { ...base, id: 'booking-b', customerId: 'customer-b', customerName: 'Synthetic B', date: '2099-01-02', leadId: 'estimate-b' },
    ];
    state.opportunityWorkspace.leads[0].customerName = 'Synthetic A';
    state.opportunityWorkspace.leads[1] = { ...state.opportunityWorkspace.leads[1], id: 'estimate-b', customerId: 'customer-b', customerName: 'Synthetic B', estimate: { priceLow: 240, priceHigh: 260 } };
    if (scenario === 'ambiguous') {
      state.opportunityWorkspace.bookings.push({ ...base, id: 'duplicate-b', customerId: 'different-b', customerName: 'Synthetic B', date: '2099-01-03' });
    }
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic A/);
    submitComposer(`What did we quote Synthetic ${scenario === 'unresolved' ? 'Z' : 'B'}${scenario === 'explicit' ? '' : ' for that job'}?`);
    const reply = await screen.findByText(scenario === 'explicit' ? /Saved estimate range: \$240.00 to \$260.00/ : /Choose the specific own-tenant customer; that name is missing or identifies multiple customers/);
    expect(reply).not.toHaveTextContent('$170.00'); expect(reply).not.toHaveTextContent('$190.00');
    if (scenario !== 'explicit') expect(reply).not.toHaveTextContent('Saved estimate range:');
    expectReadOnlyContext(); await expectCreditBalance(5);
    expect(state.opportunityWorkspace).toEqual(original);
  });
  it.each([
    [['2026-02-30', '2026-08-15'], 'Most recent: 2026-08-15.'],
    [['2026-09-15', '2026-02-30'], 'Most recent: 2026-09-15.'],
    [['2026-02-30', '2026-09-31'], 'The most recent work date cannot be established from incomplete dates.'],
  ])('renders trustworthy legacy history for %j without provider calls or mutations', async (dates, expected) => {
    contextFixtures();
    const base = state.opportunityWorkspace.bookings[0];
    state.opportunityWorkspace.bookings = [base, ...dates.map((date, index) => ({ ...base, id: `history-${index}`, status: 'completed', date }))];
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Who is my next customer?');
    await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer('Have they worked with us before?');
    const reply = await screen.findByText(/2 completed bookings are present for this canonical customer/);
    expect(reply).toHaveTextContent(expected);
    expect(reply).not.toHaveTextContent('2026-02-30');
    expect(reply).not.toHaveTextContent('2026-09-31');
    if (!expected.startsWith('Most recent:')) expect(reply).not.toHaveTextContent('Most recent:');
    expectReadOnlyContext(); await expectCreditBalance(5);
    expect(state.opportunityWorkspace).toEqual(original);
  });
  it('renders the earliest future tenant-local start in both routes, never the past same-day booking', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T16:30:00Z'));
    try {
      contextFixtures(); state.auth.currentTenant.businessSettings = { timeZone: 'America/Chicago' };
      const base = state.opportunityWorkspace.bookings[0];
      state.opportunityWorkspace.bookings = [
        { ...base, id: 'late', customerId: 'late-person', customerName: 'Synthetic Late', date: '2026-10-04', startTime: '16:00' },
        { ...base, id: 'past', customerId: 'past-person', customerName: 'Synthetic Past', date: '2026-10-04', startTime: '10:00' },
        { ...base, id: 'next', customerId: 'next-person', customerName: 'Synthetic Next', date: '2026-10-04', startTime: '13:00', agreedPrice: 210 },
      ];
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      for (const question of ['What am I doing today?', 'What do I have today?', "Who's next?"]) {
        submitComposer(question);
        const reply = (await screen.findAllByText(/Next: Synthetic Next: Standard Cleaning, 2026-10-04 at 13:00/)).at(-1);
        expect(reply).not.toHaveTextContent('Synthetic Past');
        expect(reply).not.toHaveTextContent('Next: Synthetic Late');
      }
      expect(screen.getAllByText(/Next: Synthetic Next: Standard Cleaning, 2026-10-04 at 13:00/)).toHaveLength(3);
      submitComposer("Who's my next customer, what service are they getting, and how much are we charging them?");
      const compound = await screen.findByText(/Customer: Synthetic Next\. Service: Standard Cleaning\. Saved booking amount: \$210\.00/);
      expect(compound).not.toHaveTextContent('Synthetic Past');
      expectReadOnlyContext(); await expectCreditBalance(5);
      expect(state.opportunityWorkspace).toEqual(original);
    } finally { vi.useRealTimers(); }
  });
  it.each(['invalid', '2026-10-04T13:00:00Z'])('renders insufficient scheduling evidence for a present timestamp %s without provider guessing', async scheduledAt => {
    contextFixtures(); state.auth.currentTenant.businessSettings = { timeZone: 'America/Chicago' };
    const booking = state.opportunityWorkspace.bookings[0];
    Object.assign(booking, { date: '2026-10-04', startTime: '13:00', scheduledAt });
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    for (const question of ['What am I doing today?', 'What do I have today?']) {
      submitComposer(question);
      expect((await screen.findAllByText(/Booking scheduling evidence is missing, invalid or conflicting/)).at(-1)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/Booking scheduling evidence is missing, invalid or conflicting/)).toHaveLength(2);
    expect(screen.queryByText(/No eligible upcoming bookings/)).not.toBeInTheDocument();
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('renders canonical service comparisons and contextual differences without calls, credits or mutations', async () => {
    contextFixtures(); state.opportunityWorkspace.bookings[0].customerSnapshot = { email: 'synthetic@example.test' };
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("Who's next?"); await screen.findByText(/Next: Synthetic Context Customer/);
    for (const question of ['Compare deep clean and standard clean.', 'Which costs more?', 'Which is cheaper?',
      "What's the difference between those two?", 'How much more is one than the other?']) {
      submitComposer(question);
      const replies = screen.getAllByText(/Canonical Deep Cleaning costs \$65.00 more than Canonical Standard Cleaning/);
      expect(replies.at(-1)).toHaveTextContent('Canonical Deep Cleaning is $250.00');
      expect(replies.at(-1)).toHaveTextContent('Canonical Standard Cleaning is $185.00');
    }
    submitComposer('Go back to that customer.'); await screen.findByText(/^Synthetic Context Customer:.*Saved booking amount/);
    submitComposer("What's their email?"); await screen.findByText(/Email: synthetic@example.test/);
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    submitComposer('Which is cheaper?'); await screen.findByText(/Which canonical services do you want to compare/);
    expectReadOnlyContext();
  });
  it('renders bounded canonical calculations without routing, credits or mutations', async () => {
    contextFixtures();
    state.opportunityWorkspace.bookings.push({ id: 'context-following-booking', tenantId: 'tenant-a', customerId: 'context-following-customer', customerName: 'Following Context Customer', serviceType: 'deep', status: 'scheduled', date: '2099-01-02', startTime: '11:00', agreedPrice: 250 });
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('How much would deep clean and standard clean cost together?');
    expect(await screen.findByText(/Total: \$435\.00 across 2 canonical records/)).toBeInTheDocument();
    submitComposer('Compare deep clean and standard clean.'); await screen.findByText(/Canonical Deep Cleaning costs \$65\.00 more/);
    submitComposer("What's the total together?");
    expect((await screen.findAllByText(/Total: \$435\.00 across 2 canonical records/)).at(-1)).toBeInTheDocument();
    submitComposer("What's the total for those two services?");
    expect((await screen.findAllByText(/Total: \$435\.00 across 2 canonical records/)).at(-1)).toBeInTheDocument();
    submitComposer('What are my next 2 bookings worth?');
    expect(await screen.findByText(/Total: \$430\.00 across 2 canonical records/)).toBeInTheDocument();
    submitComposer('What is the average amount of my next 2 bookings?');
    expect(await screen.findByText(/Average: \$215\.00 across 2 canonical records/)).toBeInTheDocument();
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('renders only the intended named service calculation and refuses ambiguous classification without provider calls', async () => {
    contextFixtures();
    catalogService.listOwnerServices.mockResolvedValue([
      { id: 'standard-service', name: 'Standard', serviceType: 'standard', active: true, priceCents: 10000, durationMinutes: 90 },
      { id: 'deep-service', name: 'Canonical Deep', serviceType: 'deep', active: true, priceCents: 15000, durationMinutes: 120 },
      { id: 'other-deep', name: 'Other Deep', serviceType: 'deep', active: true, priceCents: 20000, durationMinutes: 120 },
    ]);
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('How much would Canonical Deep and Standard cost together?');
    const total = await screen.findByText(/Total: \$250\.00 across 2 canonical records/);
    expect(total).toHaveTextContent('Canonical Deep: $150.00'); expect(total).toHaveTextContent('Standard: $100.00');
    expect(total).not.toHaveTextContent('Other Deep'); expect(total).not.toHaveTextContent('$450.00');
    submitComposer('How much would deep clean and standard clean cost together?');
    await screen.findByText(/requested service is ambiguous or repeated/);
    submitComposer('How much would Canonical Deep Deluxe and Standard cost together?');
    await screen.findByText(/requested canonical service is unavailable/);
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('clarifies comparison ambiguity instead of selecting a service or inventing a price', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('Compare those two'); await screen.findByText(/Which canonical services do you want to compare/);
    submitComposer('Compare imaginary clean and standard clean'); await screen.findByText(/canonical service or its configured price is unavailable/);
    expectReadOnlyContext(); await expectCreditBalance(5);
  });
  it('renders legacy and modern tomorrow replies with the same tenant-local booking and zero credits', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T04:00:00Z'));
    try {
      contextFixtures(); state.auth.currentTenant.businessSettings = { timeZone: 'America/Chicago' };
      const canonical = state.opportunityWorkspace.bookings[0];
      canonical.date = '2026-10-04';
      state.opportunityWorkspace.bookings.push({ ...canonical, id: 'wrong-day', customerId: 'wrong-day-person', customerName: 'Synthetic Wrong Day', date: '2026-10-05' });
      const original = structuredClone(state.opportunityWorkspace);
      render(<GrowthAIPage />); await expectCreditBalance(5);
      await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
      submitComposer('What am I doing tomorrow?');
      const legacy = await screen.findByText(/Next: Synthetic Context Customer: Standard Cleaning, 2026-10-04/);
      expect(legacy).not.toHaveTextContent('Synthetic Wrong Day');
      expect(legacy).not.toHaveTextContent('2026-10-05');
      submitComposer('What do I have tomorrow?');
      await waitFor(() => expect(screen.getAllByText(/Next: Synthetic Context Customer: Standard Cleaning, 2026-10-04/)).toHaveLength(2));
      expectReadOnlyContext(); await expectCreditBalance(5);
      expect(state.opportunityWorkspace).toEqual(original);
    } finally { vi.useRealTimers(); }
  });
  it('renders temporal fact, traversal and calculation plans with canonical values and zero credits', async () => {
    contextFixtures(); state.auth.currentTenant.businessSettings = { timeZone: 'UTC' };
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    state.opportunityWorkspace.bookings[0].date = tomorrow;
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    for (const [question, expected] of [
      ['How many bookings do I have tomorrow?', /You have 1 upcoming booking/],
      ["What's my first booking tomorrow?", /Next: Synthetic Context Customer/],
      ['Who is my customer tomorrow and what service are they getting?', /Customer: Synthetic Context Customer\. Service: Standard Cleaning/],
      ['How much are my bookings tomorrow worth?', /Total: \$180\.00 across 1 canonical record/],
      ["What's the average booking amount tomorrow?", /Average: \$180\.00 across 1 canonical record/],
    ]) {
      submitComposer(question);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0));
    }
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('does not retain deterministic plan references across a same-tenant identity switch', async () => {
    contextFixtures(); state.opportunityWorkspace.bookings[0].customerSnapshot = { email: 'synthetic@example.test' };
    const view = render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("Who's next?"); await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer("What's their email?"); await screen.findByText(/Email: synthetic@example.test/);
    state.auth = { ...state.auth, user: { ...state.auth.user, uid: 'another-synthetic-admin' } };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(screen.queryByText(/Email: synthetic@example.test/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("What's their email?"); await screen.findByText(/Establish the intended record first/);
    expectReadOnlyContext(); await expectCreditBalance(5);
  });
  it('renders bounded multi-hop booking, customer, service, price and contact facts without routing', async () => {
    contextFixtures();
    state.opportunityWorkspace.bookings[0].customerSnapshot = { phone: '555-0110', email: 'synthetic@example.test' };
    state.opportunityWorkspace.bookings.push({ id: 'context-following-booking', tenantId: 'tenant-a', customerId: 'context-following-customer', customerName: 'Following Context Customer', serviceType: 'deep', status: 'scheduled', date: '2099-01-02', startTime: '11:00', agreedPrice: 250, customerSnapshot: { phone: '555-0112' } });
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("Who's my next customer, what service are they getting, and how much are we charging them?");
    expect(await screen.findByText('Customer: Synthetic Context Customer. Service: Standard Cleaning. Saved booking amount: $180.00.')).toBeInTheDocument();
    submitComposer("Who is the customer for my next booking and what's their phone number?");
    expect(await screen.findByText(/Customer: Synthetic Context Customer\. Saved booking contact phone: 555-0110/)).toBeInTheDocument();
    submitComposer('Who comes after Synthetic Context Customer and what service are they getting?');
    expect(await screen.findByText('Customer: Following Context Customer. Service: Deep Cleaning.')).toBeInTheDocument();
    submitComposer('What service is Synthetic Context Customer getting and how much is it?');
    expect(await screen.findByText('Service: Standard Cleaning. Saved booking amount: $180.00.')).toBeInTheDocument();
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('renders explicit canonical contact evidence instead of the active customer contact', async () => {
    contextFixtures();
    state.opportunityWorkspace.bookings[0].customerSnapshot = { phone: '555-0110' };
    state.opportunityWorkspace.bookings.push({ id: 'context-following-booking', tenantId: 'tenant-a', customerId: 'context-following-customer', customerName: 'Following Context Customer', serviceType: 'deep', status: 'scheduled', date: '2099-01-02', startTime: '11:00', agreedPrice: 250, customerSnapshot: { phone: '555-0112' } });
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("Who's next?"); await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer("What's Following Context Customer's phone number?");
    expect(await screen.findByText(/Phone: 555-0112/)).toBeInTheDocument();
    expect(screen.queryByText(/Phone: 555-0110/)).not.toBeInTheDocument();
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('withholds an incomplete compound answer instead of guessing the saved booking amount', async () => {
    contextFixtures(); delete state.opportunityWorkspace.bookings[0].agreedPrice;
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer("Who's my next customer, what service are they getting, and how much are we charging them?");
    expect(await screen.findByText(/canonical evidence|required canonical|saved amount.*unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Customer: Synthetic Context Customer\. Service:/)).not.toBeInTheDocument();
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
  });
  it('renders structured business questions before routing and preserves typed topic returns', async () => {
    contextFixtures();
    state.opportunityWorkspace.bookings[0].customerSnapshot = { phone: '555-0110', email: 'synthetic@example.test' };
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    for (const [question, expected] of [
      ['How many jobs are on my schedule?', /You have 1 upcoming booking/],
      ['Who is my next customer?', /Next: Synthetic Context Customer/],
      ['Show their email', /Email: synthetic@example.test/],
      ['What is their phone?', /Phone: 555-0110/],
      ['What is the cost of that booking?', /Saved booking amount: \$180.00/],
      ['List available services', /Canonical Standard Cleaning: \$185.00/],
      ['What is the first one?', /Canonical Standard Cleaning: \$185.00/],
      ['What is the price of that service?', /Canonical Standard Cleaning: \$185.00/],
      ['Go back to that customer.', /Synthetic Context Customer: Standard Cleaning/],
      ['What time is that booking?', /2099-01-01 at 10:00/],
      ['Show their email', /Email: synthetic@example.test/],
    ]) {
      submitComposer(question);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0));
    }
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    submitComposer('Show their email'); await screen.findByText(/Establish the intended record first/);
    expectReadOnlyContext();
  });
  it('renders missing structured fields honestly and still opens existing guarded workflows', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('Who is my next customer?'); await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer('Show their email'); await screen.findByText(/Email: unavailable in this loaded record/);
    submitComposer('Write a message for them.');
    expect(await screen.findByLabelText('Booking to use')).toHaveValue('context-booking');
    expectReadOnlyContext(); await expectCreditBalance(5);
  });
  it.each(['What services do we offer?', 'Create a marketing post.', 'Check my reputation.'])('returns to customer/booking after supported topic: %s', async topic => {
    contextFixtures(); state.opportunityWorkspace.bookings[0].customerSnapshot = { name: 'Synthetic Context Customer', phone: '555-0110', email: 'synthetic@example.test' };
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('What jobs do I have coming up?'); await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer(topic);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send', exact: true })).toBeDisabled());
    submitComposer('Okay, go back to that customer.');
    expect(await screen.findByText(/^Synthetic Context Customer:.*Saved booking amount/)).toBeInTheDocument();
    submitComposer('What was their email?'); await screen.findByText(/Email: synthetic@example.test/);
    submitComposer('How much were we charging them?'); await screen.findByText('Saved booking amount: $180.00.');
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    submitComposer('Go back to that customer.'); await screen.findByText(/earlier entity is not established/);
    expectReadOnlyContext();
  });
  it.each(["What's their number?", 'How do I get ahold of them?', 'Can I get their email?', 'Who do I need to talk to?'])('keeps contextual contact informational and free: %s', async question => {
    contextFixtures();
    state.opportunityWorkspace.bookings[0].customerSnapshot = { name: 'Synthetic Context Customer', phone: '555-0110', email: 'synthetic@example.test' };
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer('What jobs do I have coming up?'); await screen.findByText(/Next: Synthetic Context Customer/);
    submitComposer(question);
    expect(await screen.findByText(/(?:saved booking contact information|customer associated with the selected booking)/)).toBeInTheDocument();
    expectReadOnlyContext(); await expectCreditBalance(5); expect(state.opportunityWorkspace).toEqual(original);
    submitComposer('Write something for them.');
    expect(await screen.findByLabelText('Booking to use')).toHaveValue('context-booking');
    expectReadOnlyContext();
  });
  it.each([
    ["What's going on?", false, /Do you mean today's bookings/], ['What is happening?', false, /Do you mean today's bookings/],
    ['What should I worry about today?', false, /cannot determine urgency/], ['Is there anything urgent?', false, /cannot determine urgency/],
    ["Who's coming up?", false, /Next: Synthetic Context Customer/], ['Who is scheduled next?', false, /Next: Synthetic Context Customer/],
    ['Who am I working with?', true, /Synthetic Context Customer\. Canonical/], ['Who is this for?', true, /Synthetic Context Customer\. Canonical/],
    ['What are we charging them?', true, /Saved booking amount: \$180.00/], ['How much are we getting for this?', true, /Saved booking amount: \$180.00/],
    ['Have they worked with us before?', true, /1 completed bookings/], ['Have they hired us before?', true, /1 completed bookings/],
    ['Who should I reach back out to?', false, /estimate-review candidates/], ['Who should I contact again?', false, /estimate-review candidates/],
    ["What's the most important thing today?", false, /cannot determine urgency/], ['What should I handle first?', false, /cannot determine urgency/],
    ['What about the other one?', true, /Choose its position.*will not guess/], ['Tell me about the other one.', true, /Choose its position.*will not guess/],
    ['Go back to the first one.', true, /^Synthetic Context Customer:.*Saved booking amount/], ['Take me back to the first.', true, /^Synthetic Context Customer:.*Saved booking amount/],
    ['How much was that?', true, /Saved booking amount: \$180.00/], ["What's the price on this one?", true, /Saved booking amount: \$180.00/],
  ])('repairs natural conversation %s without generation or mutation', async (question, seed, expected) => {
    contextFixtures();
    if (/other one/.test(question)) state.opportunityWorkspace.bookings.push(
      { id: 'context-second-booking', tenantId: 'tenant-a', customerName: 'Second Booking', customerId: 'second', serviceType: 'deep', status: 'scheduled', date: '2099-01-02', startTime: '10:00' },
      { id: 'context-third-booking', tenantId: 'tenant-a', customerName: 'Third Booking', customerId: 'third', serviceType: 'deep', status: 'scheduled', date: '2099-01-03', startTime: '10:00' },
    );
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    if (seed) { submitComposer('What jobs do I have coming up?'); await screen.findByText(/Next: Synthetic Context Customer/); }
    submitComposer(question); expect(await screen.findByText(expected)).toBeInTheDocument();
    submitComposer('Open estimates'); await screen.findByText(/^2 eligible open estimates:.*Synthetic Second Customer: Deep Cleaning, quoted\.$/);
    submitComposer('Go back to the first.'); expect(await screen.findByText(/^Synthetic Context Customer:.*Saved estimate range: \$170.00 to \$190.00/)).toBeInTheDocument();
    submitComposer('Write something for them.');
    expect(await screen.findByLabelText('Estimate to use')).toHaveValue('context-estimate');
    expectReadOnlyContext(); await expectCreditBalance(5);
    expect(state.opportunityWorkspace).toEqual(original);
  });
  it.each([
    ["What's on my plate?", /Do you mean today's bookings, open estimates, or follow-up opportunities/, 'Open estimates', /2 eligible open estimates/],
    ['Who is waiting on me?', /Do you mean today's bookings, open estimates, or follow-up opportunities/, 'Open estimates', /2 eligible open estimates/],
    ["Who's coming in next?", /Next: Synthetic Context Customer/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['Who is coming next?', /Next: Synthetic Context Customer/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['Anybody I need to get back with?', /estimate-review candidates, not a finding/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['Anyone I should follow up with?', /estimate-review candidates, not a finding/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ["What's still sitting out there?", /Do you mean today's bookings, open estimates, or follow-up opportunities/, 'Open estimates', /2 eligible open estimates/],
    ['What work is outstanding?', /Do you mean today's bookings, open estimates, or follow-up opportunities/, 'Open estimates', /2 eligible open estimates/],
    ["Who's waiting on an estimate?", /2 eligible open estimates/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['Who is waiting for an estimate?', /2 eligible open estimates/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['What do I need to take care of today?', /Next: Synthetic Context Customer/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['What needs taking care of today?', /Next: Synthetic Context Customer/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['Anything falling through the cracks?', /Do you mean today's bookings, open estimates, or follow-up opportunities/, 'Open estimates', /2 eligible open estimates/],
    ['Anything slipping through the cracks?', /Do you mean today's bookings, open estimates, or follow-up opportunities/, 'Open estimates', /2 eligible open estimates/],
    ['What should I work on first?', /Next: Synthetic Context Customer/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
    ['Who needs my attention?', /Next: Synthetic Context Customer/, 'Who is the first one?', /Synthetic Context Customer\. Canonical/],
  ])('repairs %s with useful own-tenant facts and addressable follow-up', async (question, expected, followup, followupExpected) => {
    contextFixtures(); const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    submitComposer(question); expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/Foreign Context Customer/)).not.toBeInTheDocument();
    submitComposer(followup); expect(await screen.findByText(followup === 'Open estimates' ? /^2 eligible open estimates:/ : followupExpected)).toBeInTheDocument();
    if (followup === 'Open estimates') {
      submitComposer('Who is the first one?'); expect(await screen.findByText(/Synthetic Context Customer\. Canonical/)).toBeInTheDocument();
    }
    submitComposer('Tell me about that customer.');
    expect(await screen.findByText(/^Synthetic Context Customer: Standard Cleaning,.*Saved (?:booking amount: \$180.00|estimate range: \$170.00 to \$190.00)/)).toBeInTheDocument();
    expectReadOnlyContext(); await expectCreditBalance(5);
    expect(state.opportunityWorkspace).toEqual(original);
  });
  it('hands the count fast path to ordered context and preserves the booking through quote/history follow-ups', async () => {
    contextFixtures();
    state.opportunityWorkspace.bookings.push(
      { id: 'third', tenantId: 'tenant-a', customerId: 'third-customer', customerName: 'Third Synthetic', serviceType: 'deep', status: 'scheduled', date: '2099-01-03', startTime: '10:00', agreedPrice: 250 },
      { id: 'second', tenantId: 'tenant-a', customerId: 'second-customer', customerName: 'Second Synthetic', serviceType: 'deep', status: 'scheduled', date: '2099-01-02', startTime: '10:00', agreedPrice: 220 },
    );
    const original = structuredClone(state.opportunityWorkspace);
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    for (const [question, expected] of [
      ['What’s coming up?', /You have 3 upcoming bookings.*Next:/],
      ['Who’s the first one?', /Synthetic Context Customer\. Canonical/],
      ['What am I doing for them?', /^Standard Cleaning$/],
      ['How much are we charging?', /Saved booking amount: \$180.00/],
      ['Have they used us before?', /1 completed bookings/],
      ['What did we quote them?', /\$170.00 to \$190.00/],
      ['What do I need to know about this job?', /Synthetic Context Customer: Standard Cleaning, 2099-01-01/],
      ['Who do I have after that?', /Second Synthetic\. Canonical/],
      ['What about the next one?', /Third Synthetic: Deep Cleaning/],
      ['Who is the customer?', /Third Synthetic\. Canonical/],
      ['Show the one after that.', /Which booking, customer, estimate, or service/],
    ]) {
      submitComposer(question);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0));
    }
    submitComposer('Can you write something for them?');
    expect(await screen.findByRole('heading', { name: 'Customer response' })).toBeInTheDocument();
    expect(screen.getByLabelText('Booking to use')).toHaveValue('third');
    expectReadOnlyContext();
    expect(state.opportunityWorkspace).toEqual(original);
    await expectCreditBalance(5);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    catalogService.listOwnerServices.mockResolvedValue([]);
    state.auth = {
      currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
      role: 'admin',
      tenantId: 'tenant-a',
      user: { uid: 'admin-a', displayName: 'Jamie Brown' },
      userProfile: { displayName: 'Jamie Brown' },
    };
    state.drafts = [];
    state.audit = {};
    state.profile = null;
    state.opportunityWorkspace = { opportunities: [], leads: [], bookings: [], rebookingImplemented: false };
    state.version = 0;
    gatewayService.credits = 5;
    fieldPhotoService.listFieldPhotosForMarketing.mockResolvedValue([]);
    fieldPhotoService.loadFieldPhotoBlob.mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
    gatewayService.createGrowthAIIdempotencyKey.mockReturnValue('idempotency-a');
    gatewayService.routeGrowthAIConversation.mockResolvedValue({ skillId: 'marketing', confidence: 0.9 });
    gatewayService.loadGrowthAICreditBalance.mockImplementation(async () => canonicalCreditBalance(gatewayService.credits));
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

  it('uses the actual composer for booking/customer/service/quote/history and guarded message handoff', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());
    for (const [question, expected] of [
      ['What jobs do I have coming up?', /You have 1 upcoming bookings/],
      ['Who is the first one?', /Synthetic Context Customer\. Canonical customer relationship/],
      ['What service am I doing for them?', /^Standard Cleaning$/],
      ['How much did I quote them?', /Saved estimate range: \$170.00 to \$190.00/],
      ['Have they booked with me before?', /1 completed bookings/],
    ]) { submitComposer(question); expect(await screen.findByText(expected)).toBeInTheDocument(); }
    submitComposer('Write them a follow-up.');
    expect(await screen.findByRole('heading', { name: 'Customer response' })).toBeInTheDocument();
    expect(screen.getByLabelText('Booking to use')).toHaveValue('context-booking');
    expectReadOnlyContext(); await expectCreditBalance(5);
    expect(screen.queryByText(/Foreign Context Customer/)).not.toBeInTheDocument();
  });

  it('reviews open estimates rather than opportunities and preserves explicitly selected estimate context', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('Which estimates are still open?');
    expect(await screen.findByText(/2 eligible open estimates/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Growth opportunities' })).not.toBeInTheDocument();
    submitComposer('Who is that customer?'); expect(await screen.findByText(/Which booking, customer, estimate/)).toBeInTheDocument();
    submitComposer('Which one has been waiting the longest?');
    submitComposer('Who is that customer?');
    expect(await screen.findByText(/Synthetic Context Customer\. Canonical customer relationship/)).toBeInTheDocument();
    expectReadOnlyContext();
  });

  it('lifts existing estimate-selector selection into current conversation context', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('Review this estimate');
    fireEvent.click(await screen.findByRole('button', { name: /^Synthetic Context Customer/ }));
    submitComposer('Who is that customer?');
    expect(await screen.findByText(/Synthetic Context Customer\. Canonical customer relationship/)).toBeInTheDocument();
    expectReadOnlyContext();
  });

  it('uses canonical catalog pricing and requires explicit disambiguation before marketing handoff', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    await waitFor(() => expect(catalogService.listOwnerServices).toHaveBeenCalled());
    submitComposer('What services do I offer?'); expect(await screen.findByText(/Canonical Standard Cleaning: \$185.00/)).toBeInTheDocument();
    submitComposer('How much do I charge for that one?'); expect(await screen.findByText(/Which booking, customer, estimate/)).toBeInTheDocument();
    submitComposer('What is the first one?');
    submitComposer('Make me a post about it.');
    expect(await screen.findByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tenant service')).toHaveValue('standard');
    expectReadOnlyContext();
  });

  it('clears references on new conversation and rejects wrong-tenant projected records', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('What jobs do I have coming up?'); expect(await screen.findByText(/You have 1 upcoming bookings/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    submitComposer('Who is that customer?'); expect(await screen.findByText(/Which booking, customer, estimate/)).toBeInTheDocument();
    expect(screen.queryByText(/Foreign Context Customer/)).not.toBeInTheDocument(); expectReadOnlyContext();
  });

  it('opens the actual review-response form instead of estimate follow-up', async () => {
    render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('Help me respond to this review.');
    expect(await screen.findByLabelText('Communication type')).toHaveValue('review_response');
    expect(screen.getByRole('textbox', { name: /review/i })).toBeInTheDocument(); expectReadOnlyContext();
  });

  it('clears canonical message preselection when starting a new conversation', async () => {
    contextFixtures(); render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('Which one has been waiting the longest?');
    submitComposer('Write them a follow-up.');
    expect(await screen.findByLabelText('Estimate to use')).toHaveValue('context-estimate');
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft customer message' }));
    expect(await screen.findByLabelText('Estimate to use')).toHaveValue('');
    expectReadOnlyContext();
  });

  it('does not show stale catalog or references across a tenant switch with a delayed response', async () => {
    contextFixtures(); const pending = deferred(); catalogService.listOwnerServices.mockReturnValueOnce(pending.promise);
    const view = render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('What jobs do I have coming up?'); expect(await screen.findByText(/You have 1 upcoming bookings/)).toBeInTheDocument();
    state.auth = { ...state.auth, tenantId: 'tenant-b', currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning' }, user: { uid: 'admin-b' } };
    state.opportunityWorkspace = { opportunities: [], leads: [], bookings: [] };
    view.rerender(<GrowthAIPage />);
    await act(async () => { pending.resolve([{ id: 'old-service', name: 'STALE TENANT A SERVICE', active: true, serviceType: 'standard', priceCents: 10000, durationMinutes: 60 }]); });
    submitComposer('Who is that customer?'); expect(await screen.findByText(/Which booking, customer, estimate/)).toBeInTheDocument();
    submitComposer('What services do I offer?');
    expect(screen.queryByText(/STALE TENANT A SERVICE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Synthetic Context Customer/)).not.toBeInTheDocument(); expectReadOnlyContext();
  });
  it('does not turn a pending booking load into a fabricated zero-count answer', async () => {
    const pending = deferred(); opportunityService.refreshGrowthAIOpportunityFeed.mockReturnValueOnce(pending.promise);
    render(<GrowthAIPage />); await expectCreditBalance(5);
    submitComposer('do i have any upcoming jobs');
    expect(await screen.findByText(/This tenant context is currently unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("No, you don't have any upcoming bookings.")).not.toBeInTheDocument();
    expectReadOnlyContext();
    await act(async () => { pending.resolve(state.opportunityWorkspace); });
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
    expect((await screen.findAllByText('Estimate Follow-Up')).length).toBeGreaterThan(0);
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
    const result = await screen.findByLabelText('Customer communication draft result');
    expect(within(result).getByText('Saved draft')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
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
    expect(await screen.findByText(/AI-assisted draft saved/)).toBeInTheDocument();
    await expectCreditBalance(4);
    const result = screen.getByLabelText('Marketing draft result');
    expect(within(result).getByText('AI-assisted draft for human review.')).toBeInTheDocument();
    expect(within(result).getByText('Short caption')).toBeInTheDocument();
    expect(within(result).getByText('Call to action')).toBeInTheDocument();
    expect(within(result).getByText('Hashtags')).toBeInTheDocument();
    expect(within(result).queryByText('Image prompt')).not.toBeInTheDocument();
    expect(within(result).getByText('1 AI credit used.')).toBeInTheDocument();
    expect(within(result).getByRole('button', { name: 'Open in Drafts' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not flash zero while the canonical credit balance is loading', async () => {
    const creditLoad = deferred();
    gatewayService.loadGrowthAICreditBalance.mockReturnValue(creditLoad.promise);
    render(<GrowthAIPage />);

    const summary = await screen.findByLabelText('AI credit balance');
    expect(summary).toHaveTextContent('Loading balance');
    expect(summary).not.toHaveTextContent('0 remaining');

    await act(async () => creditLoad.resolve(canonicalCreditBalance(82)));
    await waitFor(() => expect(summary).toHaveTextContent('82 remaining'));
    expect(summary).toHaveTextContent('100 included each month');
    expect(summary).toHaveTextContent('Renews Sep 1');
  });

  it('shows unavailable instead of zero and leaves deterministic work usable when balance loading fails', async () => {
    gatewayService.loadGrowthAICreditBalance.mockRejectedValue(new Error('permission denied'));
    render(<GrowthAIPage />);

    const summary = await screen.findByLabelText('AI credit balance');
    await waitFor(() => expect(summary).toHaveTextContent('Balance unavailable'));
    expect(summary).not.toHaveTextContent('0 remaining');
    openHomeCapability('Create marketing');
    expect(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' })).toBeDisabled();
    expect(screen.getByText(/AI credit balance is unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    const result = await screen.findByLabelText('Marketing draft result');
    expect(within(result).getByText('Full caption')).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('does not expose raw Firestore diagnostics when opportunity data is unavailable', async () => {
    opportunityService.refreshGrowthAIOpportunityFeed.mockRejectedValueOnce(
      new Error("false for 'list' @ L1162, false for 'list' @ L1195")
    );

    render(<GrowthAIPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Some business data couldn't be loaded right now.");
    expect(alert).not.toHaveTextContent("false for 'list'");
    expect(alert).not.toHaveTextContent('L1162');
    expect(screen.getByRole('button', { name: 'Create marketing post' })).toBeEnabled();
  });

  it('keeps deterministic tools available with zero AI credits', async () => {
    gatewayService.credits = 0;
    render(<GrowthAIPage />);
    await expectCreditBalance(0);
    openHomeCapability('Create marketing');
    expect(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' })).toBeDisabled();
    openHomeCapability('Follow up');
    expect(screen.getByRole('button', { name: 'Improve with SLAI · 1 credit' })).toBeDisabled();
    openHomeCapability('Create marketing');
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    const result = await screen.findByLabelText('Marketing draft result');
    expect(within(result).getByText('Full caption')).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('auto-dismisses success notices five seconds after the newest successful action', async () => {
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Create marketing');
    const createDraft = screen.getByRole('button', { name: 'Create draft' });
    vi.useFakeTimers();

    try {
      await act(async () => {
        fireEvent.click(createDraft);
        await Promise.resolve();
      });
      expect(screen.getByRole('status')).toHaveTextContent('Marketing draft saved');

      act(() => vi.advanceTimersByTime(3000));
      await act(async () => {
        fireEvent.click(createDraft);
        await Promise.resolve();
      });
      act(() => vi.advanceTimersByTime(2500));
      expect(screen.getByRole('status')).toHaveTextContent('Marketing draft saved');

      act(() => vi.advanceTimersByTime(2600));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps errors visible until the owner dismisses them', async () => {
    gatewayService.generateGrowthAIContent.mockRejectedValueOnce(new Error('AI provider is temporarily unavailable.'));
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Create marketing');
    vi.useFakeTimers();

    try {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' }));
        await Promise.resolve();
      });
      expect(screen.getByRole('alert')).toHaveTextContent('AI provider is temporarily unavailable');
      act(() => vi.advanceTimersByTime(6000));
      expect(screen.getByRole('alert')).toHaveTextContent('AI provider is temporarily unavailable');
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

  it('keeps a successful draft truthful when the post-generation balance refresh fails', async () => {
    gatewayService.loadGrowthAICreditBalance
      .mockResolvedValueOnce(canonicalCreditBalance(5))
      .mockRejectedValueOnce(new Error('balance refresh unavailable'));
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Create marketing');
    fireEvent.click(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' }));

    expect(await screen.findByText(/AI-assisted draft saved/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('AI credit balance')).toHaveTextContent('Balance unavailable'));
    expect(screen.queryByText(/credit was restored/i)).not.toBeInTheDocument();
    expect(state.drafts).toHaveLength(1);
  });

  it('does not claim restoration when a reservation never occurred', async () => {
    gatewayService.generateGrowthAIContent.mockRejectedValueOnce(new Error('Not enough AI credits for this generation.'));
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Create marketing');
    fireEvent.click(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not enough AI credits');
    expect(alert).not.toHaveTextContent('restored');
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
    const responseAIButton = screen.getByRole('button', { name: 'Improve with SLAI · 1 credit' });
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
      title: '[Customer communication] Review request',
      sourceRefs: { bookingId: 'booking-completed' },
      content: expect.objectContaining({ fullCaption: expect.stringContaining('honest review') }),
    })));
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('hands a review-request opportunity into the existing completed-job communication draft without using AI', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'review_request__customer-a', type: 'review_request', pillar: 'reputation', status: 'open',
        sourceRefs: { bookingId: 'booking-completed', customerId: 'customer-a' },
        detectionReason: 'Job completed - consider asking for feedback or a review.',
      }],
      leads: [],
      bookings: [{
        id: 'booking-completed', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed',
        serviceType: 'Deep clean', customerName: 'Review Customer',
      }],
      rebookingImplemented: true,
    };

    render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare Review Request' }));

    await waitFor(() => expect(screen.getByLabelText('Communication type')).toHaveValue('review_request'));
    expect(screen.getByLabelText('Completed job to use')).toHaveValue('booking-completed');
    fireEvent.click(screen.getByRole('button', { name: 'Save response draft' }));

    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'reputation', actionType: 'customer_response', sourceRefs: {
        bookingId: 'booking-completed', opportunityId: 'review_request__customer-a',
      },
    })));
    expect(opportunityService.markGrowthAIOpportunityActed).toHaveBeenCalledWith('tenant-a', 'review_request__customer-a');
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('does not offer a duplicate review-request draft after the customer-level opportunity was acted on', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'review_request__customer-a', type: 'review_request', pillar: 'reputation', status: 'acted',
        sourceRefs: { bookingId: 'booking-completed', customerId: 'customer-a' },
        detectionReason: 'Job completed - consider asking for feedback or a review.',
      }],
      leads: [],
      bookings: [{
        id: 'booking-completed', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed',
        serviceType: 'Deep clean', customerName: 'Review Customer',
      }],
      rebookingImplemented: true,
    };

    render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    expect(await screen.findByRole('button', { name: 'Review Request Drafted' })).toBeDisabled();
  });

  it('creates a free owner-pasted review-response draft and sends only bounded review text for optional AI assistance', async () => {
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Follow up');
    fireEvent.change(screen.getByLabelText('Communication type'), { target: { value: 'review_response' } });
    expect(screen.getByRole('button', { name: 'Save response draft' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Review response tone'), { target: { value: 'sensitive_negative' } });
    fireEvent.change(screen.getByLabelText('Owner-pasted review text'), { target: { value: 'The service was not what I expected.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save response draft' }));
    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'reputation', actionType: 'customer_response', sourceRefs: {},
      content: expect.objectContaining({ fullCaption: expect.stringMatching(/discuss it directly/i) }),
    })));
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('passes only the owner-pasted review text and selected tone to optional review-response AI assistance', async () => {
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    openHomeCapability('Follow up');
    fireEvent.change(screen.getByLabelText('Communication type'), { target: { value: 'review_response' } });
    fireEvent.change(screen.getByLabelText('Review response tone'), { target: { value: 'sensitive_negative' } });
    fireEvent.change(screen.getByLabelText('Owner-pasted review text'), { target: { value: 'The service was not what I expected.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Improve with SLAI · 1 credit' }));
    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'customer_response', sourceRefs: {},
      input: { channelId: 'sms', communicationType: 'review_response', reviewText: 'The service was not what I expected.', reviewTone: 'sensitive_negative' },
    })));
  });

  it('hands a rebooking opportunity into the existing review-required customer communication workflow without using AI', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'rebooking_gap__customer-a__recurring-service%3Arecurring-standard', type: 'rebooking_gap', pillar: 'retain', status: 'open',
        sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-service:recurring-standard' },
        detectionReason: 'Standard clean is due with no upcoming matching booking.',
      }],
      leads: [],
      bookings: [{
        id: 'booking-deep', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed',
        serviceType: 'Deep clean', customerName: 'Retention Customer',
      }, {
        id: 'booking-completed', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed',
        serviceType: 'Standard clean', customerName: 'Retention Customer',
      }],
      rebookingCandidates: [{ customerId: 'customer-a', serviceKey: 'recurring-service:recurring-deep', bookingId: 'booking-deep' }, {
        customerId: 'customer-a', serviceKey: 'recurring-service:recurring-standard', bookingId: 'booking-completed',
      }],
      rebookingImplemented: true,
    };

    render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare Rebooking Draft' }));

    await waitFor(() => expect(screen.getByLabelText('Communication type')).toHaveValue('rebooking'));
    expect(screen.getByLabelText('Completed job to use')).toHaveValue('booking-completed');
    expect(screen.getByRole('heading', { name: 'Customer response' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save response draft' }));

    await waitFor(() => expect(service.createGrowthAIDraft).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      pillar: 'retain',
      actionType: 'customer_response',
      sourceRefs: {
        bookingId: 'booking-completed',
        opportunityId: 'rebooking_gap__customer-a__recurring-service%3Arecurring-standard',
      },
      content: expect.objectContaining({ callToAction: 'Review and send manually' }),
    })));
    expect(opportunityService.markGrowthAIOpportunityActed).toHaveBeenCalledWith(
      'tenant-a', 'rebooking_gap__customer-a__recurring-service%3Arecurring-standard'
    );
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    const result = await screen.findByLabelText('Customer communication draft result');
    expect(within(result).getByText('Draft message')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('rebooking_gap__customer-a__recurring-service%3Arecurring-standard')).not.toBeInTheDocument();
  });

  it('uses the first surfaced rebooking opportunity as bounded conversation context without creating a draft', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'rebooking_gap__customer-a__recurring-service%3Arecurring-standard', type: 'rebooking_gap', pillar: 'retain', status: 'open',
        sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-service:recurring-standard' },
        detectionReason: 'Standard clean is due with no upcoming matching booking.',
      }],
      leads: [],
      bookings: [{
        id: 'booking-completed', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed',
        serviceType: 'Standard clean', customerName: 'Retention Customer',
      }],
      rebookingCandidates: [{ customerId: 'customer-a', serviceKey: 'recurring-service:recurring-standard', bookingId: 'booking-completed' }],
      rebookingImplemented: true,
    };

    render(<GrowthAIPage />);
    submitComposer('What needs my attention today?');
    expect(await screen.findByRole('heading', { name: 'Business briefing' })).toBeInTheDocument();
    submitComposer('Help me with the first one.');

    expect(await screen.findByRole('heading', { name: 'Customer response' })).toBeInTheDocument();
    expect(screen.getByLabelText('Communication type')).toHaveValue('rebooking');
    expect(screen.getByLabelText('Completed job to use')).toHaveValue('booking-completed');
    expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
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
    expect((await screen.findAllByText('Marketing Opportunity')).length).toBeGreaterThan(0);
    expect(screen.getByText(/decide whether they are appropriate for marketing/)).toBeInTheDocument();
    expect(screen.queryByText(/approved for marketing/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review Job' }));
    await waitFor(() => expect(onReviewJob).toHaveBeenCalledWith('booking-a'));
    expect(opportunityService.markGrowthAIOpportunityActed).toHaveBeenCalledWith('tenant-a', 'marketing_photo_review__booking-a');
  });

  it('uses only owner-selected stable photo IDs for a completed-job Marketing draft', async () => {
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
    fieldPhotoService.listFieldPhotosForMarketing.mockResolvedValue([
      { id: 'photo-approved', phase: 'before', storagePath: 'private/photo-approved.jpg', marketingApproved: true },
      { id: 'photo-pending', phase: 'after', storagePath: 'private/photo-pending.jpg', marketingApproved: false },
    ]);

    render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Create marketing draft' }));
    expect(await screen.findByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();
    expect(screen.getByLabelText('Content type')).toHaveValue('before_after');
    expect(screen.getByText(/No image analysis or customer details are included/)).toBeInTheDocument();
    expect(await screen.findByText('Owner-approved field photos')).toBeInTheDocument();
    await waitFor(() => expect(fieldPhotoService.listFieldPhotosForMarketing).toHaveBeenCalledWith('tenant-a', 'booking-a'));
    await waitFor(() => expect(screen.getByLabelText('Approved field photos for marketing')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate marketing with AI · 1 credit' }));

    const generateMarketing = gatewayService.generateGrowthAIContent;
    await waitFor(() => expect(generateMarketing).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'marketing_post',
      sourceRefs: { opportunityId: 'marketing_photo_review__booking-a', photoIds: ['photo-approved'] },
      input: expect.objectContaining({ postTypeId: 'before_after' }),
    })));
    expect(JSON.stringify(gatewayService.generateGrowthAIContent.mock.calls[0][0])).not.toMatch(/customer-a|private\/photo/);
  });

  it('ignores stale approved-photo results when the active tenant changes', async () => {
    const requests = { 'tenant-a': deferred(), 'tenant-b': deferred() };
    fieldPhotoService.listFieldPhotosForMarketing.mockImplementation(tenantId => requests[tenantId].promise);
    state.opportunityWorkspace = {
      opportunities: [{ id: 'marketing-a', type: 'marketing_photo_review', pillar: 'attract', status: 'open', sourceRefs: { bookingId: 'booking-a' } }],
      leads: [], bookings: [{ id: 'booking-a', serviceType: 'deep' }], rebookingImplemented: false,
    };
    const view = render(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Create marketing draft' }));
    await waitFor(() => expect(fieldPhotoService.listFieldPhotosForMarketing).toHaveBeenCalledWith('tenant-a', 'booking-a'));

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    state.opportunityWorkspace = {
      opportunities: [{ id: 'marketing-b', type: 'marketing_photo_review', pillar: 'attract', status: 'open', sourceRefs: { bookingId: 'booking-b' } }],
      leads: [], bookings: [{ id: 'booking-b', serviceType: 'standard' }], rebookingImplemented: false,
    };
    view.rerender(<GrowthAIPage />);
    openHomeCapability('Review opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Create marketing draft' }));
    await waitFor(() => expect(fieldPhotoService.listFieldPhotosForMarketing).toHaveBeenCalledWith('tenant-b', 'booking-b'));

    await act(async () => requests['tenant-a'].resolve([{ id: 'photo-a', phase: 'before', roomLabel: 'Tenant A private room', storagePath: 'private/a.jpg', marketingApproved: true }]));
    expect(screen.queryByText('Tenant A private room')).not.toBeInTheDocument();
    await act(async () => requests['tenant-b'].resolve([{ id: 'photo-b', phase: 'after', roomLabel: 'Tenant B room', storagePath: 'private/b.jpg', marketingApproved: true }]));
    expect(await screen.findByText('Tenant B room')).toBeInTheDocument();
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
    const createDraft = screen.getByRole('button', { name: 'Create draft' });
    await waitFor(() => expect(createDraft).toBeEnabled());
    fireEvent.click(createDraft);
    const result = await screen.findByLabelText('Marketing draft result');
    expect(result).toHaveTextContent('deep');

    openWorkspaceView('Home');
    openHomeCapability('Create marketing');
    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'testimonial' } });
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
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
      writingStyle: '',
      defaultCTA: 'Request an estimate.',
      avoidTerms: '',
      platformPreferences: { general: false, facebook: false, instagram: false, linkedin: false, website: false },
      brandColors: { primary: '', secondary: '', accent: '' },
    }));
    expect(screen.getByText(/Business identity comes from Business Settings/)).toBeInTheDocument();
  });

  it('persists a tenant draft across an unmount and reload without localStorage', async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const first = render(<GrowthAIPage />);
    openWorkspaceView('Drafts');
    await screen.findByText('No drafts need your attention yet.');
    openWorkspaceView('Home');
    openHomeCapability('Create marketing');
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
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
    expect(screen.queryByLabelText('Image prompt')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy image prompt' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(screen.getAllByText('Needs Review').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText(/Draft approved in ServicesOS/)).toBeInTheDocument());
    expect(screen.getByText(/Approved .*This approval is internal only/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Full caption'), { target: { value: 'Materially changed customer-facing content.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText(/Prior approval was cleared/)).toBeInTheDocument());
    expect(service.updateGrowthAIDraftContent).toHaveBeenCalledWith('tenant-a', 'draft-a', expect.objectContaining({
      content: expect.objectContaining({
        fullCaption: 'Materially changed customer-facing content.',
        imagePrompt: 'A clean home.',
      }),
    }));
    expect(screen.queryByText(/This approval is internal only/)).not.toBeInTheDocument();
    openWorkspaceView('Activity');
    expect(screen.getByText('Approval cleared after content changed')).toBeInTheDocument();
  });

  it('renders a malformed legacy draft with safe Draft and source-unavailable fallbacks', async () => {
    state.drafts = [{ id: 'legacy-draft', title: '', sourceRefs: { leadId: 'missing-lead' } }];
    render(<GrowthAIPage />);
    openWorkspaceView('Drafts');

    fireEvent.click(await screen.findByRole('button', { name: 'Review Saved Draft: Saved Draft' }));
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Source no longer available').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Draft type')).toHaveValue('Marketing Post');
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
    expect(await screen.findByText('Draft activity recorded')).toBeInTheDocument();

    await act(async () => resolveDraftA([{
      id: 'audit-a', action: 'draft_a_selected', fromStatus: 'draft', toStatus: 'draft', timestamp: timestamp(),
    }]));
    expect(screen.getByText('Draft activity recorded')).toBeInTheDocument();
    expect(screen.queryByText('Draft a selected')).not.toBeInTheDocument();
  });

  it('restores deterministic marketing outputs and copy controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<GrowthAIPage />);
    openWorkspaceView('Drafts');
    await screen.findByText('No drafts need your attention yet.');
    openWorkspaceView('Home');
    openHomeCapability('Create marketing');

    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    const result = await screen.findByLabelText('Marketing draft result');
    const fullCaption = Array.from(result.querySelectorAll('.growth-ai-saved-result-fields section p'))
      .map(element => element.textContent)
      .find(value => value.includes('#TenantACleaning'));
    expect(fullCaption).toContain('#TenantACleaning');
    expect(within(result).getByText('Short caption')).toBeInTheDocument();
    expect(within(result).getByText('Call to action')).toBeInTheDocument();
    expect(within(result).getByText('Hashtags')).toBeInTheDocument();
    fireEvent.click(within(result).getByRole('button', { name: 'Copy full caption' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(fullCaption));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('restores deterministic customer response scenarios and persists them as tenant drafts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<GrowthAIPage />);
    openWorkspaceView('Drafts');
    await screen.findByText('No drafts need your attention yet.');
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
      title: expect.stringContaining('Tenant A Cleaning response - review request'),
      content: expect.objectContaining({
        fullCaption: expect.stringContaining('Tenant A Cleaning'),
        callToAction: 'Review and send manually',
      }),
      sourceRefs: {},
    })));
    expect(await screen.findByText(/Customer response draft saved/)).toBeInTheDocument();
    const result = screen.getByLabelText('Customer communication draft result');
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(result).getByRole('button', { name: 'Open in Drafts' }));
    expect(await screen.findByLabelText('Draft type')).toHaveValue('Review Request');
  });

  it('opens on Home and exposes truthful Drafts and selected-draft Activity views', async () => {
    state.drafts = [savedDraft()];
    render(<GrowthAIPage />);

    const homeTab = screen.getByRole('tab', { name: 'Home' });
    expect(homeTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Home');
    expect(screen.getByText(/Good (morning|afternoon|evening), Jamie\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What does your business need today?' })).toBeInTheDocument();

    openWorkspaceView('Drafts');
    expect(screen.getByRole('tab', { name: 'Drafts' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(await screen.findByRole('button', { name: /Availability Post - Test City/ }));

    openWorkspaceView('Activity');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Activity');
    expect(screen.getByText(/Activity records review decisions; it does not send or publish content/)).toBeInTheDocument();
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
    expect(gatewayService.routeGrowthAIConversation).not.toHaveBeenCalled();
    await expectCreditBalance(5);
  });

  it('uses the constrained router only for an ambiguous message and does not consume credits', async () => {
    render(<GrowthAIPage />);

    submitComposer('Help me grow the business in a new way');

    await waitFor(() => expect(gatewayService.routeGrowthAIConversation).toHaveBeenCalledWith({
      tenantId: 'tenant-a', message: 'Help me grow the business in a new way',
    }));
    expect(await screen.findByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    await expectCreditBalance(5);
  });

  it.each([
    ['How many bookings do I have coming up?', 'You have 2 upcoming bookings.'],
    ['do i have any upcoming jobs', 'Yes, you have 2 upcoming bookings.'],
    ['Are there any upcoming bookings?', 'Yes, you have 2 upcoming bookings.'],
  ])('answers %s through the actual composer without provider routing or credits', async (question, answer) => {
    state.auth.currentTenant.businessSettings = { timeZone: 'UTC' };
    state.opportunityWorkspace = {
      opportunities: [],
      leads: [],
      bookings: [
        { id: 'booking-a', tenantId: 'tenant-a', date: '2099-01-01', startTime: '10:00', status: 'scheduled' },
        { id: 'booking-b', tenantId: 'tenant-a', date: '2099-01-02', startTime: '10:00', status: 'scheduled' },
        { id: 'booking-cancelled', tenantId: 'tenant-a', date: '2099-01-03', status: 'cancelled' },
        { id: 'booking-archived', tenantId: 'tenant-a', date: '2099-01-04', status: 'scheduled', isArchived: true },
      ],
      rebookingImplemented: false,
    };
    render(<GrowthAIPage />);

    await waitFor(() => expect(screen.queryByText("Preparing today's briefing from ServicesOS records...")).not.toBeInTheDocument());

    const originalBookings = structuredClone(state.opportunityWorkspace.bookings);
    submitComposer(question);

    expect(await screen.findByText(content => content.startsWith(`${answer} Next:`))).toBeInTheDocument();
    expect(screen.getByText(content => content.includes('1. Customer:') && content.includes('2. Customer:'))).toBeInTheDocument();
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.queryByText("Do you want help with marketing, a customer reply, or today's business?")).not.toBeInTheDocument();
    expect(gatewayService.routeGrowthAIConversation).not.toHaveBeenCalled();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
    expect(state.opportunityWorkspace.bookings).toEqual(originalBookings);
    await expectCreditBalance(5);
  });

  it('falls back to a controlled clarification when the router result is malformed or low confidence', async () => {
    gatewayService.routeGrowthAIConversation.mockResolvedValueOnce({ skillId: 'publish_now', confidence: 1 });
    render(<GrowthAIPage />);

    submitComposer('Please take care of it');

    expect(await screen.findByText(/Do you want help with marketing, a customer reply, or today's business/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Marketing draft' })).not.toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it.each([
    ["What's coming up for me?", 'You have no upcoming bookings.', false],
    ["What's my business briefing?", 'Business briefing', true],
    ['What needs my attention?', 'Business briefing', true],
    ['Are there customers I should follow up with?', 'Growth opportunities', true],
    ['Who should I follow up with?', 'Growth opportunities', true],
    ['Should I follow up with Sarah?', 'Growth opportunities', true],
    ["Who hasn't booked again?", 'Growth opportunities', true],
    ['How are my reviews doing?', 'Growth opportunities', true],
    ['Write a follow-up message for Sarah.', 'Customer response', true],
    ['Can you make a Facebook post?', 'Marketing draft', true],
    ['Can you handle Sarah?', "Do you want help with marketing, a customer reply, or today's business?", false],
    ["What's coming up in my personal life?", "Do you want help with marketing, a customer reply, or today's business?", false],
    ['How many upcoming jobs do I have tomorrow?', 'You have no upcoming bookings.', false],
    ['How many AI credits do I have?', 'You have 5 AI credits remaining.', false],
  ])('routes owner vocabulary through the real composer: %s', async (question, expected, heading) => {
    if (question.includes('tomorrow')) state.auth.currentTenant.businessSettings = { timeZone: 'UTC' };
    render(<GrowthAIPage />);
    await expectCreditBalance(5);
    submitComposer(question);
    if (heading) expect(await screen.findByRole('heading', { name: expected })).toBeInTheDocument();
    else expect(await screen.findByText(expected)).toBeInTheDocument();
    if (question.includes('should')) expect(screen.queryByRole('heading', { name: 'Customer response' })).not.toBeInTheDocument();
    expect(gatewayService.routeGrowthAIConversation).not.toHaveBeenCalled();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
    expect(service.saveGrowthAIBrandProfile).not.toHaveBeenCalled();
    expect(opportunityService.markGrowthAIOpportunityActed).not.toHaveBeenCalled();
    expect(opportunityService.dismissGrowthAIOpportunity).not.toHaveBeenCalled();
    await expectCreditBalance(5);
  });

  it.each([['Show me my drafts.', 'Drafts'], ['What have I worked on?', 'Activity']])(
    'opens only the existing %s view without generation', async (question, view) => {
      render(<GrowthAIPage />);
      await expectCreditBalance(5);
      submitComposer(question);
      expect(screen.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true');
      expect(gatewayService.routeGrowthAIConversation).not.toHaveBeenCalled();
      expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
      expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
    },
  );

  it('keeps a bounded follow-up in the current marketing workflow without provider routing', async () => {
    render(<GrowthAIPage />);
    submitComposer('Create a Facebook post about deep cleaning');
    expect(await screen.findByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();

    submitComposer('Make it more professional');

    expect(await screen.findByText(/I'll keep this in your current marketing workflow/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Marketing draft' })).toBeInTheDocument();
    expect(gatewayService.routeGrowthAIConversation).not.toHaveBeenCalled();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('shows the default briefing after first-run dismissal without calling the provider', async () => {
    render(<GrowthAIPage />);
    fireEvent.click(await screen.findByRole('button', { name: "I'll explore myself" }));

    expect(await screen.findByRole('heading', { name: 'Business briefing' })).toBeInTheDocument();
    expect(screen.getByText(/No computed growth-priority signals are available/)).toBeInTheDocument();
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
    expect((await screen.findAllByText('Quoted estimate needs follow-up.')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Business briefing' })).toHaveLength(2);
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
    await expectCreditBalance(5);

    fireEvent.click(screen.getAllByRole('button', { name: 'Review estimate follow-ups' }).at(-1));
    expect(await screen.findByRole('heading', { name: 'Growth opportunities' })).toBeInTheDocument();
    expect(service.createGrowthAIDraft).not.toHaveBeenCalled();
    expect(opportunityService.markGrowthAIOpportunityActed).not.toHaveBeenCalled();
    expect(opportunityService.dismissGrowthAIOpportunity).not.toHaveBeenCalled();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('answers help and uses controlled clarification for unknown requests without opening a workflow or spending credits', async () => {
    render(<GrowthAIPage />);

    submitComposer('What can you do?');
    expect(await screen.findByText(/review growth opportunities, create marketing drafts/)).toBeInTheDocument();
    expect(screen.queryByText('Marketing draft')).not.toBeInTheDocument();

    gatewayService.routeGrowthAIConversation.mockResolvedValueOnce({ skillId: 'not-a-real-skill', confidence: 1 });
    submitComposer('Organize my filing cabinet');
    expect(await screen.findByText(/Do you want help with marketing, a customer reply, or today's business/)).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Analyze with SLAI · 1 credit' })).toBeDisabled();
    expect(screen.getByText(/No AI credits remaining. ServicesOS pricing remains available/)).toBeInTheDocument();
    expect(screen.getByText(/included credits renew Sep 1/)).toBeInTheDocument();
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
    const analyze = screen.getByRole('button', { name: 'Analyze with SLAI · 1 credit' });
    fireEvent.click(analyze);
    fireEvent.click(analyze);

    await waitFor(() => expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledTimes(1));
    expect(gatewayService.generateGrowthAIContent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', actionType: 'estimate_assistance', sourceRefs: { leadId: 'lead-estimate-a' }, input: {},
    }));
    expect(await screen.findByText('SLAI recommendation')).toBeInTheDocument();
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

    await act(async () => creditLoads['tenant-a'].resolve(canonicalCreditBalance(99)));
    expect(screen.getByLabelText('AI credit balance')).not.toHaveTextContent('99');
    await act(async () => creditLoads['tenant-b'].resolve(canonicalCreditBalance(7, {
      nextResetAt: '2026-09-01T04:00:00.000Z',
      timeZone: 'America/New_York',
    })));
    await expectCreditBalance(7);
  });

  it('reloads the correct canonical balance when switching Tenant A to B and back to A', async () => {
    const loads = { 'tenant-a': [], 'tenant-b': [] };
    gatewayService.loadGrowthAICreditBalance.mockImplementation(tenant => {
      const request = deferred();
      loads[tenant].push(request);
      return request.promise;
    });

    const view = render(<GrowthAIPage />);
    await waitFor(() => expect(loads['tenant-a']).toHaveLength(1));
    await act(async () => loads['tenant-a'][0].resolve(canonicalCreditBalance(80)));
    await expectCreditBalance(80);

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(loads['tenant-b']).toHaveLength(1));
    expect(screen.getByLabelText('AI credit balance')).not.toHaveTextContent('80 remaining');
    await act(async () => loads['tenant-b'][0].resolve(canonicalCreditBalance(12)));
    await expectCreditBalance(12);

    state.auth = {
      currentTenant: { id: 'tenant-a', businessName: 'Tenant A Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-a', userProfile: { displayName: 'Jamie Brown' },
    };
    view.rerender(<GrowthAIPage />);
    await waitFor(() => expect(loads['tenant-a']).toHaveLength(2));
    expect(screen.getByLabelText('AI credit balance')).not.toHaveTextContent('12 remaining');
    await act(async () => loads['tenant-a'][1].resolve(canonicalCreditBalance(79)));
    await expectCreditBalance(79);
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
    fireEvent.click(screen.getByRole('button', { name: 'Analyze with SLAI · 1 credit' }));
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
    expect(screen.queryByText('SLAI recommendation')).not.toBeInTheDocument();
    expect(screen.queryByText(/SLAI recommendation saved for human review/)).not.toBeInTheDocument();
    expect(screen.queryByText('Tenant A AI Customer')).not.toBeInTheDocument();
  });

  it('ignores a stale Tenant A conversation-router result after switching to Tenant B', async () => {
    const routeA = deferred();
    gatewayService.routeGrowthAIConversation.mockReturnValueOnce(routeA.promise);
    const view = render(<GrowthAIPage />);

    submitComposer('Please take care of it');
    await waitFor(() => expect(gatewayService.routeGrowthAIConversation).toHaveBeenCalledWith({
      tenantId: 'tenant-a', message: 'Please take care of it',
    }));

    state.auth = {
      currentTenant: { id: 'tenant-b', businessName: 'Tenant B Cleaning', businessSettings: {} },
      role: 'admin', tenantId: 'tenant-b', userProfile: { displayName: 'Taylor Test' },
    };
    view.rerender(<GrowthAIPage />);
    await act(async () => routeA.resolve({ skillId: 'marketing', confidence: 0.95 }));

    expect(screen.getByRole('heading', { name: 'What does your business need today?' })).toBeInTheDocument();
    expect(screen.queryByText('Please take care of it')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Marketing draft' })).not.toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'What does your business need today?' })).toBeInTheDocument();
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

  it('renders the customer-facing SLAI Assistant workspace with real navigation, credits, and free quick actions', async () => {
    render(<GrowthAIPage />);

    expect(document.querySelector('.growth-ai-header')).toHaveAttribute('data-mobile-only', 'true');
    expect(document.querySelector('button[aria-label="Open SLAI Assistant navigation"]')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'SLAI Assistant workspace views' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Drafts' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ask SLAI Assistant anything')).toBeInTheDocument();
    expect(screen.getByLabelText('Current SLAI Assistant context')).toBeInTheDocument();
    await expectCreditBalance(5);
    expect(screen.queryByLabelText('Current context credit balance')).not.toBeInTheDocument();
    expect(screen.queryByText(/Deterministic routing is free/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No AI credits used/)).not.toBeInTheDocument();
    expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    expect(screen.queryByText('Average review rating')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Find rebooking opportunities' }));
    expect(await screen.findByRole('heading', { name: 'Growth opportunities' })).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('keeps the composer outside the bounded conversation history region', async () => {
    render(<GrowthAIPage />);
    await screen.findByLabelText('Ask SLAI Assistant anything');

    const stream = document.querySelector('[data-scroll-region="conversation-history"]');
    const composer = screen.getByRole('form', { name: 'Ask SLAI Assistant' });
    expect(stream).toBeInTheDocument();
    expect(stream.parentElement).toBe(composer.parentElement);
    expect(stream.nextElementSibling).toBe(composer);
  });

  it('opens the matching customer workflow from a bounded current context', async () => {
    render(<GrowthAIPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Draft customer message' }));
    expect(await screen.findByRole('heading', { name: 'Customer response' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Customer Communication' }));
    expect(screen.getByRole('heading', { name: 'Customer response' })).toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();
  });

  it('keeps current context bounded to the selected rebooking workflow and exposes the mobile navigation control', async () => {
    state.opportunityWorkspace = {
      opportunities: [{
        id: 'rebooking-a', type: 'rebooking_gap', pillar: 'retain', status: 'open',
        sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-standard' },
        detectionReason: 'This recurring service is due for review.',
      }],
      leads: [],
      bookings: [{
        id: 'booking-a', tenantId: 'tenant-a', customerId: 'customer-a', serviceKey: 'recurring-standard',
        serviceType: 'Standard Clean', status: 'completed', completed: true,
      }],
      rebookingCandidates: [{ customerId: 'customer-a', serviceKey: 'recurring-standard', bookingId: 'booking-a' }],
      rebookingImplemented: true,
    };
    render(<GrowthAIPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Find rebooking opportunities' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare Rebooking Draft' }));

    expect((await screen.findAllByText('Rebooking message')).length).toBeGreaterThan(0);
    expect(screen.getByText('Current context stays in this browser session.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Customer Communication' })).toBeInTheDocument();
    expect(screen.queryByText('rebooking-a')).not.toBeInTheDocument();
    expect(gatewayService.generateGrowthAIContent).not.toHaveBeenCalled();

    const menu = document.querySelector('button[aria-label="Open SLAI Assistant navigation"]');
    expect(menu).not.toBeNull();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'SLAI Assistant navigation' })).toBeInTheDocument();
  });
});
