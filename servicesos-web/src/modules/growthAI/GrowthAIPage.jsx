import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { listFieldPhotosForMarketing } from '../../services/fieldPhotoService';
import GrowthAIActivityView from './components/GrowthAIActivityView';
import GrowthAIDraftsView from './components/GrowthAIDraftsView';
import GrowthAIHome from './components/GrowthAIHome';
import GrowthAIWorkspaceShell from './components/GrowthAIWorkspaceShell';
import { BRANDS, CONTENT_IDEAS, PLATFORMS } from './brandProfiles';
import { getApprovedGrowthAIBrandContext, normalizeGrowthAIBrandProfile } from './growthAIBrandContext';
import {
  buildMarketingSourceRefs,
  buildMarketingContentPlan,
  deriveTenantMarketingServices,
  validateMarketingSelection,
} from './growthAIMarketingService';
import { generateDraft } from './growthAIService';
import {
  createGrowthAIIdempotencyKey,
  generateGrowthAIContent as requestGrowthAIGeneration,
  loadGrowthAICreditBalance,
} from './growthAIGatewayService';
import {
  approveGrowthAIDraft,
  createGrowthAIDraft,
  GROWTH_AI_PILLARS,
  listGrowthAIDraftAudit,
  listGrowthAIDrafts,
  loadGrowthAIBrandProfile,
  returnGrowthAIDraftToDraft,
  saveGrowthAIBrandProfile,
  submitGrowthAIDraftForReview,
  updateGrowthAIDraftContent,
} from './growthAIFoundationService';
import {
  dismissGrowthAIOpportunity,
  markGrowthAIOpportunityActed,
  refreshGrowthAIOpportunityFeed,
} from './growthAIOpportunityService';
import { listEligibleEstimateAssistanceLeads } from './growthAIEstimateAssistance';
import {
  listCommunicationBookings,
  listCommunicationLeads,
} from './growthAICommunicationService';
import { buildGrowthAIBusinessBriefing } from './growthAIBusinessBriefing';
import './GrowthAIPage.css';

const emptyContent = { fullCaption: '', shortCaption: '', callToAction: '', hashtags: '', imagePrompt: '' };
const emptyProfile = normalizeGrowthAIBrandProfile();
const emptyEditor = {
  id: null,
  pillar: 'attract',
  actionType: 'marketing_post',
  title: '',
  content: emptyContent,
  sourceRefs: {},
  status: 'draft',
  approvedByUid: null,
  approvedAt: null,
};
const emptyInputs = {
  platform: 'general', tone: '', cta: '', extraNotes: '', serviceType: '', serviceArea: '',
  offer: '', dateRange: '', cleaningTopic: '',
};
const emptyOpportunityWorkspace = { tenantId: null, opportunities: [], leads: [], bookings: [] };
const emptyMarketingAssets = { tenantId: null, bookingId: null, items: [], loading: false, error: '' };

function draftToEditor(draft) {
  return {
    id: draft.id,
    pillar: draft.pillar,
    actionType: draft.actionType,
    title: draft.title,
    content: { ...emptyContent, ...draft.content },
    sourceRefs: draft.sourceRefs || {},
    status: draft.status,
    approvedByUid: draft.approvedByUid,
    approvedAt: draft.approvedAt,
  };
}

function canonicalDisplayName(record, fallback) {
  const formData = record?.formData || {};
  const customer = record?.customerSnapshot || {};
  return customer.fullName || customer.displayName || customer.name || record?.customerName || formData.fullName ||
    [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim() || fallback;
}

export default function GrowthAIPage({ onReviewJob }) {
  const { currentTenant, role, tenantId, user, userProfile } = useAuth();
  const authorized = role === 'admin' || role === 'super-admin';
  const [activeView, setActiveView] = useState('home');
  const [profile, setProfile] = useState(emptyProfile);
  const [drafts, setDrafts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [postTypeId, setPostTypeId] = useState('availability');
  const [inputs, setInputs] = useState(emptyInputs);
  const [marketingOpportunity, setMarketingOpportunity] = useState(null);
  const [marketingAssets, setMarketingAssets] = useState(emptyMarketingAssets);
  const [customerCommunicationIntent, setCustomerCommunicationIntent] = useState(null);
  const [editor, setEditor] = useState(emptyEditor);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [opportunityWorkspace, setOpportunityWorkspace] = useState(emptyOpportunityWorkspace);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(true);
  const [opportunityFilter, setOpportunityFilter] = useState('all');
  const [creditBalance, setCreditBalance] = useState({ available: 0, reserved: 0 });
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [workspaceTenantId, setWorkspaceTenantId] = useState(null);
  const [auditTenantId, setAuditTenantId] = useState(null);
  const [creditsTenantId, setCreditsTenantId] = useState(null);
  const [editorTenantId, setEditorTenantId] = useState(null);
  const [messageTenantId, setMessageTenantId] = useState(null);
  const [errorTenantId, setErrorTenantId] = useState(null);
  const [aiGeneratingTenantId, setAiGeneratingTenantId] = useState(null);
  const [savingTenantId, setSavingTenantId] = useState(null);
  const auditRequestSequence = useRef(0);
  const opportunityRequestSequence = useRef(0);
  const marketingAssetRequestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const tenantRequestVersion = useRef(0);
  const aiRequestInFlight = useRef(false);
  const aiGeneratingTenantIdRef = useRef(null);
  const savingTenantIdRef = useRef(null);

  useLayoutEffect(() => {
    if (activeTenantId.current !== tenantId) {
      activeTenantId.current = tenantId;
      tenantRequestVersion.current += 1;
      setInputs(emptyInputs);
      setPostTypeId('availability');
      setMarketingOpportunity(null);
      setMarketingAssets(emptyMarketingAssets);
      setCustomerCommunicationIntent(null);
    }
  }, [tenantId]);

  const requestContext = useCallback(() => ({
    tenantId,
    version: tenantRequestVersion.current,
  }), [tenantId]);

  const isCurrentTenantRequest = useCallback((requestedTenantId, requestVersion) => (
    requestedTenantId === activeTenantId.current && requestVersion === tenantRequestVersion.current
  ), []);

  const loadMarketingAssets = useCallback(async opportunity => {
    const requestedTenantId = tenantId;
    const bookingId = opportunity?.bookingId;
    const { version: requestVersion } = requestContext();
    const requestSequence = ++marketingAssetRequestSequence.current;
    if (!requestedTenantId || !bookingId) {
      setMarketingAssets(emptyMarketingAssets);
      return;
    }
    setMarketingAssets({ tenantId: requestedTenantId, bookingId, items: [], loading: true, error: '' });
    try {
      const photos = await listFieldPhotosForMarketing(requestedTenantId, bookingId);
      if (!isCurrentTenantRequest(requestedTenantId, requestVersion) || requestSequence !== marketingAssetRequestSequence.current) return;
      setMarketingAssets({
        tenantId: requestedTenantId,
        bookingId,
        items: photos.filter(photo => photo.marketingApproved === true),
        loading: false,
        error: '',
      });
    } catch {
      if (!isCurrentTenantRequest(requestedTenantId, requestVersion) || requestSequence !== marketingAssetRequestSequence.current) return;
      setMarketingAssets({ tenantId: requestedTenantId, bookingId, items: [], loading: false, error: 'Approved field photos could not be loaded.' });
    }
  }, [isCurrentTenantRequest, requestContext, tenantId]);

  const setScopedMessage = useCallback(value => {
    setMessage(value);
    setMessageTenantId(tenantId);
  }, [tenantId]);

  const setScopedError = useCallback(value => {
    setError(value);
    setErrorTenantId(tenantId);
  }, [tenantId]);

  const tenantWorkspaceReady = workspaceTenantId === tenantId;
  const profileForTenant = tenantWorkspaceReady ? profile : emptyProfile;
  const brandContext = useMemo(() => getApprovedGrowthAIBrandContext({ tenant: currentTenant, profile: profileForTenant }), [currentTenant, profileForTenant]);
  const businessName = brandContext.businessName || 'Your business';
  const draftsForTenant = tenantWorkspaceReady ? drafts : [];
  const auditForTenant = auditTenantId === tenantId ? audit : [];
  const creditBalanceForTenant = creditsTenantId === tenantId ? creditBalance : { available: 0, reserved: 0 };
  const editorForTenant = editorTenantId === tenantId ? editor : emptyEditor;
  const loadingForTenant = loading || workspaceTenantId !== tenantId;
  const messageForTenant = messageTenantId === tenantId ? message : '';
  const errorForTenant = errorTenantId === tenantId ? error : '';
  const aiGeneratingForTenant = aiGenerating && aiGeneratingTenantId === tenantId;
  const savingForTenant = saving && savingTenantId === tenantId;
  const brand = useMemo(() => ({
    ...BRANDS.auntbs,
    name: businessName,
    tone: [brandContext.tone, brandContext.writingStyle].filter(Boolean).join(', ') || 'friendly, trustworthy, and clear',
    defaultCTA: brandContext.defaultCTA || 'Contact us to learn more.',
  }), [brandContext, businessName]);
  const postType = brand.postTypes.find(item => item.id === postTypeId) || brand.postTypes[0];

  const reloadOpportunities = useCallback(async () => {
    if (!tenantId) return null;
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    const requestSequence = ++opportunityRequestSequence.current;
    setOpportunitiesLoading(true);
    try {
      const workspace = await refreshGrowthAIOpportunityFeed(tenantId);
      if (requestSequence === opportunityRequestSequence.current && isCurrentTenantRequest(requestedTenantId, requestVersion)) {
        setOpportunityWorkspace({ ...workspace, tenantId: requestedTenantId });
      }
      return workspace;
    } finally {
      if (requestSequence === opportunityRequestSequence.current && isCurrentTenantRequest(requestedTenantId, requestVersion)) {
        setOpportunitiesLoading(false);
      }
    }
  }, [isCurrentTenantRequest, requestContext, tenantId]);

  const reloadWorkspace = useCallback(async selectedDraftId => {
    if (!tenantId) return;
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    const [savedProfile, savedDrafts] = await Promise.all([
      loadGrowthAIBrandProfile(requestedTenantId),
      listGrowthAIDrafts(requestedTenantId),
    ]);
    if (!isCurrentTenantRequest(requestedTenantId, requestVersion)) return null;
    setProfile(normalizeGrowthAIBrandProfile(savedProfile));
    setDrafts(savedDrafts);
    setWorkspaceTenantId(requestedTenantId);
    const selected = savedDrafts.find(item => item.id === selectedDraftId);
    if (selected) {
      setEditor(draftToEditor(selected));
      setEditorTenantId(requestedTenantId);
    }
    return savedDrafts;
  }, [isCurrentTenantRequest, requestContext, tenantId]);

  const reloadCredits = useCallback(async () => {
    if (!tenantId) return;
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    setCreditsLoading(true);
    try {
      const balance = await loadGrowthAICreditBalance(requestedTenantId);
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) {
        setCreditBalance(balance);
        setCreditsTenantId(requestedTenantId);
      }
    } finally {
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setCreditsLoading(false);
    }
  }, [isCurrentTenantRequest, requestContext, tenantId]);

  useEffect(() => {
    if (!authorized || !tenantId) return;
    const { tenantId: requestedTenantId, version: requestVersion } = requestContext();
    Promise.resolve().then(() => reloadWorkspace(null))
      .catch(err => {
        if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setScopedError(err.message);
      })
      .finally(() => {
        if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setLoading(false);
      });
  }, [authorized, isCurrentTenantRequest, reloadWorkspace, requestContext, setScopedError, tenantId]);

  useEffect(() => {
    if (!authorized || !tenantId) return;
    const { tenantId: requestedTenantId, version: requestVersion } = requestContext();
    Promise.resolve().then(() => reloadOpportunities()).catch(err => {
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setScopedError(err.message);
    });
  }, [authorized, isCurrentTenantRequest, reloadOpportunities, requestContext, setScopedError, tenantId]);

  useEffect(() => {
    if (!authorized || !tenantId) return;
    const { tenantId: requestedTenantId, version: requestVersion } = requestContext();
    Promise.resolve().then(() => reloadCredits()).catch(err => {
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setScopedError(err.message);
    });
  }, [authorized, isCurrentTenantRequest, reloadCredits, requestContext, setScopedError, tenantId]);

  const loadAudit = useCallback(async draftId => {
    const requestSequence = ++auditRequestSequence.current;
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    if (!draftId) {
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) {
        setAudit([]);
        setAuditTenantId(requestedTenantId);
      }
      return;
    }
    try {
      const nextAudit = await listGrowthAIDraftAudit(requestedTenantId, draftId);
      if (requestSequence === auditRequestSequence.current && isCurrentTenantRequest(requestedTenantId, requestVersion)) {
        setAudit(nextAudit);
        setAuditTenantId(requestedTenantId);
      }
    } catch (err) {
      if (requestSequence === auditRequestSequence.current && isCurrentTenantRequest(requestedTenantId, requestVersion)) throw err;
    }
  }, [isCurrentTenantRequest, requestContext, tenantId]);

  const runAction = useCallback(async (action, successMessage) => {
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    savingTenantIdRef.current = requestedTenantId;
    setSavingTenantId(requestedTenantId);
    setSaving(true);
    setScopedError('');
    setScopedMessage('');
    try {
      const result = await action();
      if (!isCurrentTenantRequest(requestedTenantId, requestVersion)) return null;
      const selectedId = result?.id || editor.id;
      await reloadWorkspace(selectedId);
      await loadAudit(selectedId);
      if (!isCurrentTenantRequest(requestedTenantId, requestVersion)) return null;
      setScopedMessage(successMessage);
      return result;
    } catch (err) {
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setScopedError(err.message);
      return null;
    } finally {
      if (savingTenantIdRef.current === requestedTenantId) {
        setSaving(false);
        savingTenantIdRef.current = null;
        setSavingTenantId(null);
      }
    }
  }, [editor.id, isCurrentTenantRequest, loadAudit, reloadWorkspace, requestContext, setScopedError, setScopedMessage, tenantId]);

  const generate = () => {
    const validationError = validateMarketingSelection({
      contentTypeId: postTypeId,
      serviceType: inputs.serviceType,
      sourceOpportunity: marketingOpportunity,
    });
    if (validationError) {
      setScopedError(validationError);
      return;
    }
    const { generated } = generateDraft(brand, postType, inputs);
    setEditor(previous => ({
      ...previous,
      id: null,
      pillar: 'attract',
      actionType: 'marketing_post',
      title: generated.title,
      content: { ...emptyContent, ...generated },
      sourceRefs: buildMarketingSourceRefs(marketingOpportunity, marketingOpportunity?.selectedPhotoIds),
      status: 'draft',
      approvedByUid: null,
      approvedAt: null,
    }));
    setEditorTenantId(tenantId);
    void loadAudit(null);
    setActiveView('drafts');
    setScopedMessage('Deterministic draft created locally. Save it to persist it for this tenant.');
    setScopedError('');
  };

  const generateWithAI = useCallback(async ({ actionType, input, sourceRefs = {}, stayOnHome = false }) => {
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    if (aiRequestInFlight.current) return null;
    aiRequestInFlight.current = true;
    aiGeneratingTenantIdRef.current = requestedTenantId;
    setAiGeneratingTenantId(requestedTenantId);
    setAiGenerating(true);
    setScopedError('');
    setScopedMessage('');
    try {
      const result = await requestGrowthAIGeneration({
        tenantId: requestedTenantId,
        actionType,
        input,
        sourceRefs,
        idempotencyKey: createGrowthAIIdempotencyKey(),
      });
      await reloadWorkspace(result.draftId);
      await loadAudit(result.draftId);
      await reloadCredits();
      if (actionType === 'estimate_followup') await reloadOpportunities();
      if (!isCurrentTenantRequest(requestedTenantId, requestVersion)) return result;
      if (!stayOnHome) setActiveView('drafts');
      setScopedMessage(actionType === 'estimate_assistance'
        ? `GrowthAI recommendation saved for human review. ${result.creditsCharged} AI credit used. ServicesOS pricing was not changed.`
        : `AI-assisted draft saved for human review. ${result.creditsCharged} AI credit used. Nothing was sent or published.`);
      return result;
    } catch (err) {
      await reloadCredits().catch(() => {});
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setScopedError(err.message);
      return null;
    } finally {
      aiRequestInFlight.current = false;
      if (aiGeneratingTenantIdRef.current === requestedTenantId) {
        setAiGenerating(false);
        aiGeneratingTenantIdRef.current = null;
        setAiGeneratingTenantId(null);
      }
    }
  }, [isCurrentTenantRequest, loadAudit, reloadCredits, reloadOpportunities, reloadWorkspace, requestContext, setScopedError, setScopedMessage, tenantId]);

  const generateMarketingWithAI = () => {
    const validationError = validateMarketingSelection({
      contentTypeId: postTypeId,
      serviceType: inputs.serviceType,
      sourceOpportunity: marketingOpportunity,
    });
    if (validationError) {
      setScopedError(validationError);
      return null;
    }
    return generateWithAI({
      actionType: 'marketing_post',
      input: {
        postTypeId,
        platform: inputs.platform,
        serviceType: inputs.serviceType,
        serviceArea: inputs.serviceArea,
        offer: inputs.offer,
        dateRange: inputs.dateRange,
        cleaningTopic: inputs.cleaningTopic,
        extraNotes: inputs.extraNotes,
      },
      sourceRefs: buildMarketingSourceRefs(marketingOpportunity, marketingOpportunity?.selectedPhotoIds),
    });
  };

  const saveResponseDraft = async responseTemplate => {
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    const result = await runAction(
      () => createGrowthAIDraft(tenantId, {
        pillar: responseTemplate.pillar || 'convert',
        actionType: 'customer_response',
        title: `[Deterministic customer communication] ${responseTemplate.title}`,
        content: {
          ...emptyContent,
          fullCaption: responseTemplate.messageTemplate,
          shortCaption: responseTemplate.subjectLine || responseTemplate.messageTemplate.slice(0, 140),
          callToAction: 'Review and send manually',
        },
        sourceRefs: responseTemplate.sourceRefs || {},
      }),
      'Customer response draft saved for this tenant. Nothing was sent.',
    );
    if (result && ['rebooking', 'review_request'].includes(responseTemplate.communicationType) &&
      customerCommunicationIntent?.bookingId === responseTemplate.sourceRefs?.bookingId &&
      isCurrentTenantRequest(requestedTenantId, requestVersion)) {
      await markGrowthAIOpportunityActed(requestedTenantId, customerCommunicationIntent.opportunityId);
      await reloadOpportunities();
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setCustomerCommunicationIntent(null);
    }
    if (result) setActiveView('drafts');
    return result;
  };

  const draftInput = () => ({
    pillar: editor.pillar,
    actionType: editor.actionType,
    title: editor.title,
    content: editor.content,
    sourceRefs: editor.sourceRefs,
  });

  const saveDraft = async () => {
    if (!editor.content.fullCaption.trim()) {
      setScopedError('Add draft content before saving.');
      return;
    }
    if (!editor.id) {
      await runAction(() => createGrowthAIDraft(tenantId, draftInput()), 'Draft saved for this tenant.');
      return;
    }
    const wasApproved = editor.status === 'approved';
    await runAction(
      () => updateGrowthAIDraftContent(tenantId, editor.id, draftInput()),
      wasApproved ? 'Material content changed. Prior approval was cleared and review is required again.' : 'Draft changes saved.',
    );
  };

  const selectDraft = async draft => {
    setEditor(draftToEditor(draft));
    setEditorTenantId(tenantId);
    setScopedMessage('');
    setScopedError('');
    try {
      await loadAudit(draft.id);
    } catch (err) {
      setScopedError(err.message);
    }
  };

  const transition = async (operation, successMessage) => {
    await runAction(() => operation(tenantId, editor.id), successMessage);
  };

  const saveProfile = () => runAction(async () => {
    await saveGrowthAIBrandProfile(tenantId, profile);
    return { id: editor.id };
  }, 'GrowthAI brand preferences saved.');

  const tenantOpportunityWorkspace = opportunityWorkspace.tenantId === tenantId
    ? opportunityWorkspace
    : emptyOpportunityWorkspace;
  const activeOpportunities = tenantOpportunityWorkspace.opportunities.filter(item =>
    item.status === 'open' || item.status === 'acted'
  );
  const businessBriefing = useMemo(() => buildGrowthAIBusinessBriefing({
    bookings: tenantOpportunityWorkspace.bookings,
    opportunities: activeOpportunities,
  }), [activeOpportunities, tenantOpportunityWorkspace.bookings]);
  const visibleOpportunities = activeOpportunities.filter(item =>
    opportunityFilter === 'all' || item.pillar === opportunityFilter
  );
  const leadsById = new Map(tenantOpportunityWorkspace.leads.map(item => [item.id, item]));
  const bookingsById = new Map(tenantOpportunityWorkspace.bookings.map(item => [item.id, item]));
  const eligibleEstimateLeads = listEligibleEstimateAssistanceLeads(tenantOpportunityWorkspace.leads, tenantId);
  const communicationLeads = listCommunicationLeads(tenantOpportunityWorkspace.leads, tenantId);
  const communicationBookings = listCommunicationBookings(tenantOpportunityWorkspace.bookings, tenantId);
  const marketingServices = deriveTenantMarketingServices(tenantOpportunityWorkspace.bookings);

  const opportunitySubject = opportunity => {
    if (opportunity.type === 'estimate_followup') {
      return canonicalDisplayName(leadsById.get(opportunity.sourceRefs?.leadId), 'Estimate customer');
    }
    if (opportunity.type === 'rebooking_gap') {
      const candidate = tenantOpportunityWorkspace.rebookingCandidates?.find(item =>
        item.customerId === opportunity.sourceRefs?.customerId && item.serviceKey === opportunity.sourceRefs?.serviceKey
      );
      return canonicalDisplayName(bookingsById.get(candidate?.bookingId), 'Recurring customer');
    }
    return canonicalDisplayName(bookingsById.get(opportunity.sourceRefs?.bookingId), 'Completed job');
  };

  const startRebookingFromOpportunity = opportunity => {
    const candidate = tenantOpportunityWorkspace.rebookingCandidates?.find(item =>
      item.customerId === opportunity.sourceRefs?.customerId && item.serviceKey === opportunity.sourceRefs?.serviceKey
    );
    const booking = communicationBookings.find(item => item.id === candidate?.bookingId && item.completed);
    if (!booking) {
      setScopedError('The completed job for this rebooking opportunity is no longer eligible. Refresh opportunities before preparing a draft.');
      return false;
    }
    setCustomerCommunicationIntent({ opportunityId: opportunity.id, bookingId: booking.id, type: 'rebooking' });
    setScopedError('');
    setScopedMessage('Rebooking draft prepared from a verified completed job. Nothing will be sent automatically.');
    return true;
  };

  const startReviewRequestFromOpportunity = opportunity => {
    const booking = communicationBookings.find(item => item.id === opportunity.sourceRefs?.bookingId && item.completed);
    if (!booking) {
      setScopedError('The completed job for this review-request opportunity is no longer eligible. Refresh opportunities before preparing a draft.');
      return false;
    }
    setCustomerCommunicationIntent({ opportunityId: opportunity.id, bookingId: booking.id, type: 'review_request' });
    setScopedError('');
    setScopedMessage('Review-request draft prepared from a verified completed job. Nothing will be sent automatically.');
    return true;
  };

  const draftEstimateFollowUp = async opportunity => {
    const lead = leadsById.get(opportunity.sourceRefs?.leadId);
    const customerName = canonicalDisplayName(lead, 'Customer');
    const result = await runAction(async () => {
      const draft = await createGrowthAIDraft(tenantId, {
        pillar: 'convert',
        actionType: 'estimate_followup',
        title: `[Estimate follow-up] ${customerName}`,
        content: {
          ...emptyContent,
          fullCaption: `Hi ${customerName}, I wanted to follow up on your cleaning estimate. Please let us know if you have any questions or would like to schedule.`,
          shortCaption: 'Following up on your cleaning estimate. Let us know if you would like to schedule.',
          callToAction: 'Review and send manually',
        },
        sourceRefs: opportunity.sourceRefs,
      });
      await markGrowthAIOpportunityActed(tenantId, opportunity.id);
      await reloadOpportunities();
      return draft;
    }, 'Follow-up draft saved for human review. Nothing was sent.');
    if (result) setActiveView('drafts');
    return result;
  };

  const aiEstimateFollowUp = opportunity => generateWithAI({
    actionType: 'estimate_followup',
    sourceRefs: { opportunityId: opportunity.id, leadId: opportunity.sourceRefs?.leadId },
    input: { channelId: 'general' },
  });

  const reviewOpportunityJob = async opportunity => {
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    setSaving(true);
    savingTenantIdRef.current = requestedTenantId;
    setSavingTenantId(requestedTenantId);
    setScopedError('');
    setScopedMessage('');
    try {
      if (opportunity.status === 'open') await markGrowthAIOpportunityActed(tenantId, opportunity.id);
      await reloadOpportunities();
      if (!isCurrentTenantRequest(requestedTenantId, requestVersion)) return;
      if (onReviewJob) onReviewJob(opportunity.sourceRefs?.bookingId);
      else setScopedMessage('Open Bookings to review this completed job and its photos.');
    } catch (err) {
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setScopedError(err.message);
    } finally {
      if (savingTenantIdRef.current === requestedTenantId) {
        setSaving(false);
        savingTenantIdRef.current = null;
        setSavingTenantId(null);
      }
    }
  };

  const startMarketingFromOpportunity = opportunity => {
    const booking = bookingsById.get(opportunity.sourceRefs?.bookingId);
    const matchingService = marketingServices.find(item => item.id === booking?.serviceType);
    const selection = {
      id: opportunity.id,
      type: opportunity.type,
      bookingId: opportunity.sourceRefs?.bookingId || '',
      selectedPhotoIds: [],
    };
    setMarketingOpportunity(selection);
    void loadMarketingAssets(selection);
    setPostTypeId('before_after');
    setInputs(value => ({ ...value, serviceType: matchingService?.id || value.serviceType }));
    setScopedError('');
    setScopedMessage('Marketing content will remain a draft for human review. No photo details will be sent to AI.');
  };

  const marketingContentPlan = useMemo(() => buildMarketingContentPlan({
    marketingServices,
    opportunities: activeOpportunities,
  }), [activeOpportunities, marketingServices]);

  const startMarketingPlan = plan => {
    const opportunity = plan.opportunityId
      ? activeOpportunities.find(item => item.id === plan.opportunityId)
      : null;
    if (opportunity) {
      startMarketingFromOpportunity(opportunity);
      return;
    }
    setPostTypeId(plan.postTypeId);
    setMarketingOpportunity(null);
    setMarketingAssets(emptyMarketingAssets);
    setInputs(value => ({ ...value, serviceType: plan.serviceType || value.serviceType }));
  };

  const dismissOpportunity = async opportunity => {
    const requestedTenantId = tenantId;
    const { version: requestVersion } = requestContext();
    setSaving(true);
    savingTenantIdRef.current = requestedTenantId;
    setSavingTenantId(requestedTenantId);
    setScopedError('');
    setScopedMessage('');
    try {
      await dismissGrowthAIOpportunity(tenantId, opportunity.id);
      await reloadOpportunities();
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) {
        setScopedMessage('Opportunity dismissed. It will not reappear for the same detection identity.');
      }
    } catch (err) {
      if (isCurrentTenantRequest(requestedTenantId, requestVersion)) setScopedError(err.message);
    } finally {
      if (savingTenantIdRef.current === requestedTenantId) {
        setSaving(false);
        savingTenantIdRef.current = null;
        setSavingTenantId(null);
      }
    }
  };

  if (!authorized) return <div className="v1-page">GrowthAI is available only to tenant owners and administrators.</div>;
  if (!tenantId) return <div className="v1-page">Select a tenant to use GrowthAI.</div>;

  return (
    <GrowthAIWorkspaceShell
      activeView={activeView}
      creditBalance={creditBalanceForTenant}
      creditsLoading={creditsTenantId !== tenantId || creditsLoading}
      draftCount={draftsForTenant.length}
      error={errorForTenant}
      message={messageForTenant}
      onViewChange={setActiveView}
    >
      {loadingForTenant ? <p className="growth-ai-empty" role="status">Loading tenant GrowthAI workspace...</p> : null}
      {activeView === 'home' ? (
        <GrowthAIHome
          key={tenantId}
          activeOpportunities={activeOpportunities}
          aiCredits={creditBalanceForTenant.available}
          aiGenerating={aiGeneratingForTenant}
          brand={brand}
          briefing={businessBriefing}
          briefingLoading={opportunitiesLoading}
          brandContext={brandContext}
          businessName={businessName}
          contentPlan={marketingContentPlan}
          communicationBookings={communicationBookings}
          communicationLeads={communicationLeads}
          customerCommunicationIntent={customerCommunicationIntent}
          contentIdeas={CONTENT_IDEAS.auntbs}
          eligibleEstimateLeads={eligibleEstimateLeads}
          inputs={inputs}
          onAIEstimateAssistance={leadId => generateWithAI({
            actionType: 'estimate_assistance',
            input: {},
            sourceRefs: { leadId },
            stayOnHome: true,
          })}
          onAIEstimateFollowUp={aiEstimateFollowUp}
          onDismissOpportunity={dismissOpportunity}
          onDraftEstimateFollowUp={draftEstimateFollowUp}
          onGenerateDeterministic={generate}
          onGenerateMarketingAI={generateMarketingWithAI}
          onGenerateResponseAI={({ input, sourceRefs }) => generateWithAI({ actionType: 'customer_response', input, sourceRefs })}
          onInputChange={patch => setInputs(value => ({ ...value, ...patch }))}
          onOpportunityFilterChange={setOpportunityFilter}
          onPostTypeChange={setPostTypeId}
          onMarketingOpportunityChange={value => {
            setMarketingOpportunity(value);
            if (!value) setMarketingAssets(emptyMarketingAssets);
          }}
          onPrefillIdea={idea => {
            setPostTypeId(idea.prefill.postTypeId);
            setInputs(value => ({ ...value, ...idea.prefill.inputs }));
            setMarketingOpportunity(null);
            setMarketingAssets(emptyMarketingAssets);
          }}
          onProfileChange={patch => setProfile(value => ({ ...value, ...patch }))}
          onRefreshOpportunities={() => reloadOpportunities().catch(err => setScopedError(err.message))}
          onReviewOpportunityJob={reviewOpportunityJob}
          onStartRebookingFromOpportunity={startRebookingFromOpportunity}
          onStartReviewRequestFromOpportunity={startReviewRequestFromOpportunity}
          onStartMarketingFromOpportunity={startMarketingFromOpportunity}
          onStartMarketingPlan={startMarketingPlan}
          onToggleMarketingAsset={photoId => {
            setMarketingOpportunity(current => {
              if (!current) return current;
              const selected = new Set(current.selectedPhotoIds || []);
              if (selected.has(photoId)) selected.delete(photoId);
              else selected.add(photoId);
              return { ...current, selectedPhotoIds: [...selected] };
            });
          }}
          onSaveProfile={saveProfile}
          onSaveResponseDraft={saveResponseDraft}
          opportunitiesLoading={opportunitiesLoading}
          opportunityFilter={opportunityFilter}
          opportunitySubject={opportunitySubject}
          platforms={PLATFORMS}
          postTypeId={postTypeId}
          marketingOpportunity={marketingOpportunity}
          marketingAssets={marketingAssets.tenantId === tenantId && marketingAssets.bookingId === marketingOpportunity?.bookingId
            ? marketingAssets
            : emptyMarketingAssets}
          marketingServices={marketingServices}
          profile={profileForTenant}
          saving={savingForTenant}
          tenantId={tenantId}
          userDisplayName={userProfile?.displayName || user?.displayName || ''}
          userId={userProfile?.uid || user?.uid || ''}
          visibleOpportunities={visibleOpportunities}
        />
      ) : null}
      {activeView === 'drafts' ? (
        <GrowthAIDraftsView
          drafts={draftsForTenant}
          editor={editorForTenant}
          onApprove={() => transition(approveGrowthAIDraft, 'Approved inside ServicesOS. Nothing was sent or published.')}
          onEditorChange={patch => setEditor(value => ({ ...value, ...patch }))}
          onReturnToDraft={() => transition(returnGrowthAIDraftToDraft, 'Content returned to draft status.')}
          onSaveDraft={saveDraft}
          onSelectDraft={selectDraft}
          onSubmitForReview={() => transition(submitGrowthAIDraftForReview, 'Draft submitted for review.')}
          pillars={GROWTH_AI_PILLARS}
          saving={savingForTenant}
        />
      ) : null}
      {activeView === 'activity' ? <GrowthAIActivityView audit={auditForTenant} editor={editorForTenant} /> : null}
    </GrowthAIWorkspaceShell>
  );
}
