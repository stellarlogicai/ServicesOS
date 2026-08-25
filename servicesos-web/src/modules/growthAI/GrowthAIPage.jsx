import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import GrowthAIActivityView from './components/GrowthAIActivityView';
import GrowthAIDraftsView from './components/GrowthAIDraftsView';
import GrowthAIHome from './components/GrowthAIHome';
import GrowthAIWorkspaceShell from './components/GrowthAIWorkspaceShell';
import { BRANDS, CONTENT_IDEAS, PLATFORMS } from './brandProfiles';
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
import './GrowthAIPage.css';

const emptyContent = { fullCaption: '', shortCaption: '', callToAction: '', hashtags: '', imagePrompt: '' };
const emptyInputs = {
  platform: 'facebook', tone: '', cta: '', extraNotes: '', serviceType: '', serviceArea: '',
  offer: '', dateRange: '', cleaningTopic: '',
};

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
  const [activeView, setActiveView] = useState('home');
  const [profile, setProfile] = useState({ brandVoice: '', contentTone: '', defaultCTA: '' });
  const [drafts, setDrafts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [postTypeId, setPostTypeId] = useState('availability');
  const [inputs, setInputs] = useState(emptyInputs);
  const [editor, setEditor] = useState({
    id: null,
    pillar: 'attract',
    actionType: 'marketing_post',
    title: '',
    content: emptyContent,
    sourceRefs: {},
    status: 'draft',
    approvedByUid: null,
    approvedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [opportunityWorkspace, setOpportunityWorkspace] = useState({ opportunities: [], leads: [], bookings: [] });
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(true);
  const [opportunityFilter, setOpportunityFilter] = useState('all');
  const [creditBalance, setCreditBalance] = useState({ available: 0, reserved: 0 });
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const auditRequestSequence = useRef(0);
  const aiRequestInFlight = useRef(false);

  const businessSettings = currentTenant?.businessSettings || {};
  const businessName = businessSettings.businessName || currentTenant?.businessName || 'Your business';
  const brand = useMemo(() => ({
    ...BRANDS.auntbs,
    name: businessName,
    tone: profile.contentTone || profile.brandVoice || 'friendly, trustworthy, and clear',
    defaultCTA: profile.defaultCTA || 'Contact us to learn more.',
  }), [businessName, profile]);
  const postType = brand.postTypes.find(item => item.id === postTypeId) || brand.postTypes[0];
  const authorized = role === 'admin' || role === 'super-admin';

  const reloadOpportunities = useCallback(async () => {
    if (!tenantId) return null;
    setOpportunitiesLoading(true);
    try {
      const workspace = await refreshGrowthAIOpportunityFeed(tenantId);
      setOpportunityWorkspace(workspace);
      return workspace;
    } finally {
      setOpportunitiesLoading(false);
    }
  }, [tenantId]);

  const reloadWorkspace = useCallback(async selectedDraftId => {
    if (!tenantId) return;
    const [savedProfile, savedDrafts] = await Promise.all([
      loadGrowthAIBrandProfile(tenantId),
      listGrowthAIDrafts(tenantId),
    ]);
    setProfile({
      brandVoice: savedProfile?.brandVoice || '',
      contentTone: savedProfile?.contentTone || '',
      defaultCTA: savedProfile?.defaultCTA || '',
    });
    setDrafts(savedDrafts);
    const selected = savedDrafts.find(item => item.id === selectedDraftId);
    if (selected) setEditor(draftToEditor(selected));
  }, [tenantId]);

  const reloadCredits = useCallback(async () => {
    if (!tenantId) return;
    setCreditsLoading(true);
    try {
      setCreditBalance(await loadGrowthAICreditBalance(tenantId));
    } finally {
      setCreditsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    if (!authorized || !tenantId) return () => { active = false; };
    Promise.all([loadGrowthAIBrandProfile(tenantId), listGrowthAIDrafts(tenantId)])
      .then(([savedProfile, savedDrafts]) => {
        if (!active) return;
        setProfile({
          brandVoice: savedProfile?.brandVoice || '',
          contentTone: savedProfile?.contentTone || '',
          defaultCTA: savedProfile?.defaultCTA || '',
        });
        setDrafts(savedDrafts);
      })
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [authorized, tenantId]);

  useEffect(() => {
    let active = true;
    if (!authorized || !tenantId) return () => { active = false; };
    Promise.resolve()
      .then(() => active && reloadOpportunities())
      .catch(err => active && setError(err.message));
    return () => { active = false; };
  }, [authorized, reloadOpportunities, tenantId]);

  useEffect(() => {
    let active = true;
    if (!authorized || !tenantId) return () => { active = false; };
    loadGrowthAICreditBalance(tenantId)
      .then(balance => active && setCreditBalance(balance))
      .catch(err => active && setError(err.message))
      .finally(() => active && setCreditsLoading(false));
    return () => { active = false; };
  }, [authorized, tenantId]);

  const loadAudit = useCallback(async draftId => {
    const requestSequence = ++auditRequestSequence.current;
    if (!draftId) {
      setAudit([]);
      return;
    }
    try {
      const nextAudit = await listGrowthAIDraftAudit(tenantId, draftId);
      if (requestSequence === auditRequestSequence.current) setAudit(nextAudit);
    } catch (err) {
      if (requestSequence === auditRequestSequence.current) throw err;
    }
  }, [tenantId]);

  const runAction = useCallback(async (action, successMessage) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      const selectedId = result?.id || editor.id;
      await reloadWorkspace(selectedId);
      await loadAudit(selectedId);
      setMessage(successMessage);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [editor.id, loadAudit, reloadWorkspace]);

  const generate = () => {
    const { generated } = generateDraft(brand, postType, inputs);
    setEditor(previous => ({
      ...previous,
      id: null,
      pillar: 'attract',
      actionType: 'marketing_post',
      title: generated.title,
      content: { ...emptyContent, ...generated },
      sourceRefs: {},
      status: 'draft',
      approvedByUid: null,
      approvedAt: null,
    }));
    void loadAudit(null);
    setActiveView('drafts');
    setMessage('Deterministic draft created locally. Save it to persist it for this tenant.');
    setError('');
  };

  const generateWithAI = useCallback(async ({ actionType, input, sourceRefs = {} }) => {
    if (aiRequestInFlight.current) return null;
    aiRequestInFlight.current = true;
    setAiGenerating(true);
    setError('');
    setMessage('');
    try {
      const result = await requestGrowthAIGeneration({
        tenantId,
        actionType,
        input,
        sourceRefs,
        idempotencyKey: createGrowthAIIdempotencyKey(),
      });
      await reloadWorkspace(result.draftId);
      await loadAudit(result.draftId);
      await reloadCredits();
      if (actionType === 'estimate_followup') await reloadOpportunities();
      setActiveView('drafts');
      setMessage(`AI-assisted draft saved for human review. ${result.creditsCharged} AI credit used. Nothing was sent or published.`);
      return result;
    } catch (err) {
      await reloadCredits().catch(() => {});
      setError(err.message);
      return null;
    } finally {
      aiRequestInFlight.current = false;
      setAiGenerating(false);
    }
  }, [loadAudit, reloadCredits, reloadOpportunities, reloadWorkspace, tenantId]);

  const saveResponseDraft = async responseTemplate => {
    const result = await runAction(
      () => createGrowthAIDraft(tenantId, {
        pillar: 'convert',
        actionType: 'customer_response',
        title: `[Customer response] ${responseTemplate.title}`,
        content: {
          ...emptyContent,
          fullCaption: responseTemplate.messageTemplate,
          shortCaption: responseTemplate.subjectLine || responseTemplate.messageTemplate.slice(0, 140),
          callToAction: 'Review and send manually',
        },
        sourceRefs: {},
      }),
      'Customer response draft saved for this tenant. Nothing was sent.',
    );
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
      setError('Add draft content before saving.');
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
    setMessage('');
    setError('');
    try {
      await loadAudit(draft.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const transition = async (operation, successMessage) => {
    await runAction(() => operation(tenantId, editor.id), successMessage);
  };

  const saveProfile = () => runAction(async () => {
    await saveGrowthAIBrandProfile(tenantId, profile);
    return { id: editor.id };
  }, 'GrowthAI brand preferences saved.');

  const activeOpportunities = opportunityWorkspace.opportunities.filter(item =>
    item.status === 'open' || item.status === 'acted'
  );
  const visibleOpportunities = activeOpportunities.filter(item =>
    opportunityFilter === 'all' || item.pillar === opportunityFilter
  );
  const leadsById = new Map(opportunityWorkspace.leads.map(item => [item.id, item]));
  const bookingsById = new Map(opportunityWorkspace.bookings.map(item => [item.id, item]));

  const opportunitySubject = opportunity => {
    if (opportunity.type === 'estimate_followup') {
      return canonicalDisplayName(leadsById.get(opportunity.sourceRefs?.leadId), 'Estimate customer');
    }
    return canonicalDisplayName(bookingsById.get(opportunity.sourceRefs?.bookingId), 'Completed job');
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
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (opportunity.status === 'open') await markGrowthAIOpportunityActed(tenantId, opportunity.id);
      await reloadOpportunities();
      if (onReviewJob) onReviewJob(opportunity.sourceRefs?.bookingId);
      else setMessage('Open Bookings to review this completed job and its photos.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const dismissOpportunity = async opportunity => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await dismissGrowthAIOpportunity(tenantId, opportunity.id);
      await reloadOpportunities();
      setMessage('Opportunity dismissed. It will not reappear for the same detection identity.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!authorized) return <div className="v1-page">GrowthAI is available only to tenant owners and administrators.</div>;
  if (!tenantId) return <div className="v1-page">Select a tenant to use GrowthAI.</div>;

  return (
    <GrowthAIWorkspaceShell
      activeView={activeView}
      creditBalance={creditBalance}
      creditsLoading={creditsLoading}
      draftCount={drafts.length}
      error={error}
      message={message}
      onViewChange={setActiveView}
    >
      {loading ? <p className="growth-ai-empty" role="status">Loading tenant GrowthAI workspace...</p> : null}
      {activeView === 'home' ? (
        <GrowthAIHome
          key={tenantId}
          activeOpportunities={activeOpportunities}
          aiCredits={creditBalance.available}
          aiGenerating={aiGenerating}
          brand={brand}
          businessName={businessName}
          contentIdeas={CONTENT_IDEAS.auntbs}
          inputs={inputs}
          onAIEstimateFollowUp={aiEstimateFollowUp}
          onDismissOpportunity={dismissOpportunity}
          onDraftEstimateFollowUp={draftEstimateFollowUp}
          onGenerateDeterministic={generate}
          onGenerateMarketingAI={() => generateWithAI({
            actionType: 'marketing_post',
            input: {
              postTypeId,
              platform: inputs.platform,
              serviceType: inputs.serviceType,
              serviceArea: inputs.serviceArea,
              offer: inputs.offer,
              cleaningTopic: inputs.cleaningTopic,
              extraNotes: inputs.extraNotes,
            },
          })}
          onGenerateResponseAI={input => generateWithAI({ actionType: 'customer_response', input })}
          onInputChange={patch => setInputs(value => ({ ...value, ...patch }))}
          onOpportunityFilterChange={setOpportunityFilter}
          onPostTypeChange={setPostTypeId}
          onPrefillIdea={idea => {
            setPostTypeId(idea.prefill.postTypeId);
            setInputs(value => ({ ...value, ...idea.prefill.inputs }));
          }}
          onProfileChange={patch => setProfile(value => ({ ...value, ...patch }))}
          onRefreshOpportunities={() => reloadOpportunities().catch(err => setError(err.message))}
          onReviewOpportunityJob={reviewOpportunityJob}
          onSaveProfile={saveProfile}
          onSaveResponseDraft={saveResponseDraft}
          opportunitiesLoading={opportunitiesLoading}
          opportunityFilter={opportunityFilter}
          opportunitySubject={opportunitySubject}
          platforms={PLATFORMS}
          postTypeId={postTypeId}
          profile={profile}
          saving={saving}
          tenantId={tenantId}
          userDisplayName={userProfile?.displayName || user?.displayName || ''}
          userId={userProfile?.uid || user?.uid || ''}
          visibleOpportunities={visibleOpportunities}
        />
      ) : null}
      {activeView === 'drafts' ? (
        <GrowthAIDraftsView
          drafts={drafts}
          editor={editor}
          onApprove={() => transition(approveGrowthAIDraft, 'Approved inside ServicesOS. Nothing was sent or published.')}
          onEditorChange={patch => setEditor(value => ({ ...value, ...patch }))}
          onReturnToDraft={() => transition(returnGrowthAIDraftToDraft, 'Content returned to draft status.')}
          onSaveDraft={saveDraft}
          onSelectDraft={selectDraft}
          onSubmitForReview={() => transition(submitGrowthAIDraftForReview, 'Draft submitted for review.')}
          pillars={GROWTH_AI_PILLARS}
          saving={saving}
        />
      ) : null}
      {activeView === 'activity' ? <GrowthAIActivityView audit={audit} editor={editor} /> : null}
    </GrowthAIWorkspaceShell>
  );
}
