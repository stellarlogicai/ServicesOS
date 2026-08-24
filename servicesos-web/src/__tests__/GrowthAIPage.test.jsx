// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.auth }));

vi.mock('../modules/growthAI/growthAIFoundationService', () => ({
  GROWTH_AI_PILLARS: ['find', 'attract', 'convert', 'retain', 'reputation'],
  ...service,
}));

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

  it('blocks ordinary employees before loading tenant GrowthAI records', () => {
    state.auth = { ...state.auth, role: 'employee' };
    render(<GrowthAIPage />);
    expect(screen.getByText(/available only to tenant owners and administrators/)).toBeInTheDocument();
    expect(service.listGrowthAIDrafts).not.toHaveBeenCalled();
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
