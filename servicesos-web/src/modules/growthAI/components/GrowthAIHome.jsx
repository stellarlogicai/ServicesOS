import { useMemo, useRef, useState } from 'react';
import {
  appendBoundedGrowthAIMessages,
  routeGrowthAIIntent,
} from '../growthAIConversation';
import {
  GROWTH_AI_ONBOARDING_LAST_STEP,
  loadGrowthAIOnboardingState,
  saveGrowthAIOnboardingState,
} from '../growthAIOnboarding';
import { RESPONSE_CHANNELS, RESPONSE_SCENARIOS, buildResponseTemplate } from '../responseTemplates';
import GrowthAIOnboardingGuide from './GrowthAIOnboardingGuide';
import {
  GrowthAIButton,
  GrowthAICopyButton,
  GrowthAIField,
} from './GrowthAIPrimitives';

const CAPABILITY_ACTIONS = Object.freeze([
  { id: 'marketing', label: 'Create marketing' },
  { id: 'customer_response', label: 'Follow up' },
  { id: 'opportunities', label: 'Review opportunities' },
  { id: 'help', label: 'What can you do?' },
]);

const CAPABILITY_RESPONSES = Object.freeze({
  marketing: 'Let\'s create something useful. Choose a format and add any details you want included.',
  customer_response: 'I can help prepare a private response. Nothing will be sent automatically.',
  opportunities: 'Here are the current deterministic GrowthAI opportunities for this tenant.',
  brand: 'These preferences shape GrowthAI drafts. Your canonical business identity still comes from Business Settings.',
});

function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function safeFirstName(displayName) {
  const value = typeof displayName === 'string' ? displayName.trim() : '';
  if (!value || value.includes('@')) return '';
  return value.split(/\s+/)[0];
}

function opportunityTypeLabel(type) {
  if (type === 'estimate_followup') return 'Estimate Follow-Up';
  if (type === 'marketing_photo_review') return 'Marketing Opportunity';
  if (type === 'rebooking_gap') return 'Rebooking Opportunity';
  return 'Growth Opportunity';
}

function OpportunityCard({
  aiCredits,
  aiGenerating,
  opportunity,
  subject,
  onAIFollowUp,
  onDismiss,
  onDraftFollowUp,
  onReviewJob,
  saving,
}) {
  const acted = opportunity.status === 'acted';

  return (
    <article className="growth-ai-opportunity">
      <div className="growth-ai-opportunity-heading">
        <div>
          <span className="growth-ai-item-label">{opportunityTypeLabel(opportunity.type)}</span>
          <strong>{subject}</strong>
        </div>
        {acted ? <span className="growth-ai-state growth-ai-state-success">Action started</span> : null}
      </div>
      <p><strong>Why this appeared:</strong> {opportunity.detectionReason}</p>
      <div className="growth-ai-actions">
        {opportunity.type === 'estimate_followup' ? (
          <>
            <GrowthAIButton disabled={saving || acted} onClick={() => onDraftFollowUp(opportunity)}>
              {acted ? 'Follow-up drafted' : 'Draft Follow-Up'}
            </GrowthAIButton>
            <GrowthAIButton disabled={saving || aiGenerating || acted || aiCredits < 1} onClick={() => onAIFollowUp(opportunity)}>
              Generate follow-up with AI · 1 credit
            </GrowthAIButton>
          </>
        ) : null}
        {opportunity.type === 'marketing_photo_review' ? (
          <GrowthAIButton disabled={saving} onClick={() => onReviewJob(opportunity)}>Review Job</GrowthAIButton>
        ) : null}
        <GrowthAIButton tone="secondary" disabled={saving} onClick={() => onDismiss(opportunity)}>Dismiss</GrowthAIButton>
      </div>
    </article>
  );
}

function MarketingWorkflow({
  aiCredits,
  aiGenerating,
  brand,
  contentIdeas,
  inputs,
  onGenerateDeterministic,
  onGenerateMarketingAI,
  onInputChange,
  onPostTypeChange,
  onPrefillIdea,
  platforms,
  postTypeId,
  saving,
}) {
  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-marketing-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-marketing-title">Marketing draft</h3>
          <p>Configure a free deterministic draft or explicitly choose AI assistance.</p>
        </div>
        <span className="growth-ai-free-label">Free to configure</span>
      </div>
      <div className="growth-ai-form-stack">
        <div className="growth-ai-form-grid">
          <GrowthAIField label="Post type">
            <select aria-label="Post type" value={postTypeId} onChange={event => onPostTypeChange(event.target.value)}>
              {brand.postTypes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
          <GrowthAIField label="Platform">
            <select aria-label="Platform" value={inputs.platform} onChange={event => onInputChange({ platform: event.target.value })}>
              {platforms.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
        </div>
        <div className="growth-ai-form-grid">
          <GrowthAIField label="Service type"><input aria-label="Service type" value={inputs.serviceType} onChange={event => onInputChange({ serviceType: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Service area"><input aria-label="Service area" value={inputs.serviceArea} onChange={event => onInputChange({ serviceArea: event.target.value })} /></GrowthAIField>
        </div>
        <GrowthAIField label="Offer"><input aria-label="Offer" value={inputs.offer} onChange={event => onInputChange({ offer: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Cleaning topic"><input aria-label="Cleaning topic" value={inputs.cleaningTopic} onChange={event => onInputChange({ cleaningTopic: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Extra notes"><textarea aria-label="Extra notes" rows="2" value={inputs.extraNotes} onChange={event => onInputChange({ extraNotes: event.target.value })} /></GrowthAIField>
        <div className="growth-ai-actions">
          <GrowthAIButton onClick={onGenerateDeterministic}>Create deterministic draft</GrowthAIButton>
          <GrowthAIButton disabled={saving || aiGenerating || aiCredits < 1} onClick={onGenerateMarketingAI}>
            Generate marketing with AI · 1 credit
          </GrowthAIButton>
        </div>
        <p className="growth-ai-cost-note">AI generation uses 1 AI credit. Opening and configuring this workflow is free.</p>
        {aiCredits < 1 ? <p className="growth-ai-credit-warning">Not enough AI credits. The deterministic draft option remains available.</p> : null}
      </div>
      <div className="growth-ai-idea-list" aria-label="Marketing draft ideas">
        {contentIdeas.slice(0, 4).map(idea => <GrowthAIButton key={idea.label} tone="secondary" onClick={() => onPrefillIdea(idea)}>{idea.label}</GrowthAIButton>)}
      </div>
    </section>
  );
}

function CustomerResponseWorkflow({ aiCredits, aiGenerating, businessName, onGenerateAI, onSave, saving }) {
  const scenarios = RESPONSE_SCENARIOS.auntbs;
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [channelId, setChannelId] = useState('sms');
  const [customerMessage, setCustomerMessage] = useState('');
  const responseTemplate = useMemo(() => {
    const template = buildResponseTemplate({ brandKey: 'auntbs', scenarioId, channelId });
    const replaceBusinessName = value => value
      .replaceAll("Aunt B's Cleaning Services", businessName)
      .replace(/^Aunt B response/, `${businessName} response`);
    return {
      ...template,
      title: replaceBusinessName(template.title),
      subjectLine: replaceBusinessName(template.subjectLine),
      messageTemplate: replaceBusinessName(template.messageTemplate),
    };
  }, [businessName, channelId, scenarioId]);

  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-response-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-response-title">Customer response</h3>
          <p>Prepare a private template. Nothing is sent automatically.</p>
        </div>
        <span className="growth-ai-free-label">Free template</span>
      </div>
      <div className="growth-ai-form-stack">
        <div className="growth-ai-form-grid">
          <GrowthAIField label="Response scenario">
            <select aria-label="Response scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>
              {scenarios.map(item => <option key={item.id} value={item.id}>{item.scenario}</option>)}
            </select>
          </GrowthAIField>
          <GrowthAIField label="Response channel">
            <select aria-label="Response channel" value={channelId} onChange={event => setChannelId(event.target.value)}>
              {RESPONSE_CHANNELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
        </div>
        <GrowthAIField label="Customer message for optional AI assistance">
          <textarea aria-label="Customer message for AI" rows="3" value={customerMessage} onChange={event => setCustomerMessage(event.target.value)} />
        </GrowthAIField>
        <div className="growth-ai-preview">
          <strong>{responseTemplate.title}</strong>
          {responseTemplate.subjectLine ? <p><strong>Subject:</strong> {responseTemplate.subjectLine}</p> : null}
          <p>{responseTemplate.messageTemplate}</p>
        </div>
        <p className="growth-ai-supporting-copy">{responseTemplate.notes}</p>
        <div className="growth-ai-actions">
          <GrowthAICopyButton label="Copy response" text={responseTemplate.messageTemplate} />
          <GrowthAIButton tone="secondary" disabled={saving} onClick={() => onSave(responseTemplate)}>Save response draft</GrowthAIButton>
          <GrowthAIButton disabled={saving || aiGenerating || aiCredits < 1 || !customerMessage.trim()} onClick={() => onGenerateAI({
            customerMessage,
            scenarioId,
            channelId,
          })}>Generate response with AI · 1 credit</GrowthAIButton>
        </div>
        <p className="growth-ai-cost-note">AI generation uses 1 AI credit. Templates, editing, and copying are free.</p>
        {aiCredits < 1 ? <p className="growth-ai-credit-warning">Not enough AI credits. Deterministic response templates remain available.</p> : null}
      </div>
    </section>
  );
}

function OpportunitiesWorkflow({
  activeOpportunities,
  aiCredits,
  aiGenerating,
  onAIEstimateFollowUp,
  onDismissOpportunity,
  onDraftEstimateFollowUp,
  onOpportunityFilterChange,
  onRefreshOpportunities,
  onReviewOpportunityJob,
  opportunitiesLoading,
  opportunityFilter,
  opportunitySubject,
  saving,
  visibleOpportunities,
}) {
  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-opportunities-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-opportunities-title">Growth opportunities</h3>
          <p>Deterministic ServicesOS signals only. Reviewing them uses no AI credits.</p>
        </div>
        <span className="growth-ai-count">{activeOpportunities.length}</span>
      </div>
      <div className="growth-ai-filter-row" aria-label="Filter growth opportunities">
        {[
          ['all', 'All'], ['attract', 'Marketing'], ['convert', 'Estimates'], ['retain', 'Rebooking'],
        ].map(([value, label]) => (
          <GrowthAIButton key={value} tone={opportunityFilter === value ? 'primary' : 'secondary'} onClick={() => onOpportunityFilterChange(value)}>{label}</GrowthAIButton>
        ))}
        <GrowthAIButton tone="secondary" disabled={opportunitiesLoading || saving} onClick={onRefreshOpportunities}>
          {opportunitiesLoading ? 'Checking...' : 'Refresh'}
        </GrowthAIButton>
      </div>
      {opportunitiesLoading && activeOpportunities.length === 0 ? <p className="growth-ai-empty">Checking tenant records for opportunities...</p> : null}
      {!opportunitiesLoading && activeOpportunities.length === 0 ? <p className="growth-ai-empty">You\'re caught up. No GrowthAI opportunities need attention right now.</p> : null}
      {!opportunitiesLoading && activeOpportunities.length > 0 && visibleOpportunities.length === 0 ? <p className="growth-ai-empty">No opportunities match this filter.</p> : null}
      <div className="growth-ai-opportunity-list">
        {visibleOpportunities.map(opportunity => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            subject={opportunitySubject(opportunity)}
            onDraftFollowUp={onDraftEstimateFollowUp}
            onAIFollowUp={onAIEstimateFollowUp}
            onReviewJob={onReviewOpportunityJob}
            onDismiss={onDismissOpportunity}
            saving={saving}
            aiGenerating={aiGenerating}
            aiCredits={aiCredits}
          />
        ))}
      </div>
    </section>
  );
}

function BrandPreferencesWorkflow({ businessName, onProfileChange, onSaveProfile, profile, saving }) {
  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-brand-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-brand-title">Brand settings</h3>
          <p>Business identity comes from Business Settings. These are GrowthAI-specific preferences.</p>
        </div>
      </div>
      <div className="growth-ai-brand-grid">
        <GrowthAIField label="Business name"><input aria-label="Business name" value={businessName} readOnly /></GrowthAIField>
        <GrowthAIField label="Brand voice"><input aria-label="Brand voice" value={profile.brandVoice} onChange={event => onProfileChange({ brandVoice: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Content tone"><input aria-label="Content tone" value={profile.contentTone} onChange={event => onProfileChange({ contentTone: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Default call to action"><input aria-label="Default call to action" value={profile.defaultCTA} onChange={event => onProfileChange({ defaultCTA: event.target.value })} /></GrowthAIField>
      </div>
      <div className="growth-ai-actions"><GrowthAIButton onClick={onSaveProfile} disabled={saving}>Save brand preferences</GrowthAIButton></div>
    </section>
  );
}

function ConversationMessage({ children, message }) {
  return (
    <article className={`growth-ai-message growth-ai-message-${message.role}`} data-message-type={message.type}>
      <div className="growth-ai-message-identity">{message.role === 'user' ? 'You' : message.role === 'system' ? 'ServicesOS' : 'GrowthAI'}</div>
      <div className="growth-ai-message-content">
        <p>{message.content}</p>
        {children}
      </div>
    </article>
  );
}

export default function GrowthAIHome({
  activeOpportunities,
  aiCredits,
  aiGenerating,
  brand,
  businessName,
  contentIdeas,
  inputs,
  onAIEstimateFollowUp,
  onDismissOpportunity,
  onDraftEstimateFollowUp,
  onGenerateDeterministic,
  onGenerateMarketingAI,
  onGenerateResponseAI,
  onInputChange,
  onOpportunityFilterChange,
  onPostTypeChange,
  onPrefillIdea,
  onProfileChange,
  onRefreshOpportunities,
  onReviewOpportunityJob,
  onSaveProfile,
  onSaveResponseDraft,
  opportunitiesLoading,
  opportunityFilter,
  opportunitySubject,
  platforms,
  postTypeId,
  profile,
  saving,
  tenantId,
  userDisplayName,
  userId,
  visibleOpportunities,
}) {
  const [composerValue, setComposerValue] = useState('');
  const [conversation, setConversation] = useState([]);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [onboardingState, setOnboardingState] = useState(() => loadGrowthAIOnboardingState({ tenantId, userId }));
  const [guideOpen, setGuideOpen] = useState(() => onboardingState.status === 'not_started' || onboardingState.status === 'in_progress');
  const [guideMode, setGuideMode] = useState(() => onboardingState.status === 'not_started' ? 'welcome' : 'tour');
  const [guideStep, setGuideStep] = useState(() => onboardingState.step || 0);
  const messageSequence = useRef(0);
  const firstName = safeFirstName(userDisplayName);
  const greeting = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;

  const nextMessageId = prefix => `${prefix}-${++messageSequence.current}`;
  const appendMessages = additions => {
    setConversation(current => appendBoundedGrowthAIMessages(current, additions));
  };

  const persistOnboarding = nextState => {
    const saved = saveGrowthAIOnboardingState({ tenantId, userId, state: nextState });
    setOnboardingState(saved);
    return saved;
  };

  const openCapability = (capabilityType, userText) => {
    if (capabilityType === 'help' || capabilityType === 'unknown') {
      appendMessages([
        { id: nextMessageId('user'), role: 'user', type: 'text', content: userText },
        {
          id: nextMessageId('assistant'),
          role: 'assistant',
          type: 'result',
          content: capabilityType === 'help'
            ? 'I can review growth opportunities, create marketing drafts, prepare customer responses, or update GrowthAI brand preferences.'
            : 'I can currently help you review growth opportunities, create marketing, or prepare customer responses. Choose an option below or tell me which one you\'d like to work on.',
          actions: ['marketing', 'customer_response', 'opportunities'],
        },
      ]);
      setActiveWorkflow(null);
      return;
    }

    const capabilityMessage = {
      id: nextMessageId('assistant'),
      role: 'assistant',
      type: 'capability',
      content: CAPABILITY_RESPONSES[capabilityType],
      capabilityType,
      resultRef: { type: 'growthai_capability', id: capabilityType },
    };
    appendMessages([
      { id: nextMessageId('user'), role: 'user', type: 'text', content: userText },
      capabilityMessage,
    ]);
    setActiveWorkflow({ messageId: capabilityMessage.id, capabilityType });
  };

  const firstRunGuidePending = onboardingState.status === 'not_started' || onboardingState.status === 'in_progress';

  const startGuide = () => {
    setGuideMode('tour');
    setGuideStep(onboardingState.status === 'in_progress' ? onboardingState.step : 0);
    setGuideOpen(true);
    if (firstRunGuidePending) {
      persistOnboarding({ status: 'in_progress', step: onboardingState.status === 'in_progress' ? onboardingState.step : 0 });
    }
  };

  const closeGuide = () => {
    if (firstRunGuidePending) persistOnboarding({ status: 'skipped', step: guideStep });
    setGuideOpen(false);
    appendMessages([{
      id: nextMessageId('assistant'),
      role: 'assistant',
      type: 'result',
      content: 'No problem. You can reopen the GrowthAI guide anytime. I am ready when you are.',
      actions: ['marketing', 'customer_response', 'opportunities'],
    }]);
  };

  const advanceGuide = () => {
    if (guideStep >= GROWTH_AI_ONBOARDING_LAST_STEP) {
      if (firstRunGuidePending) persistOnboarding({ status: 'completed', step: GROWTH_AI_ONBOARDING_LAST_STEP });
      setGuideOpen(false);
      appendMessages([{
        id: nextMessageId('assistant'),
        role: 'assistant',
        type: 'result',
        content: 'You\'re ready. Talk to me normally—no special prompts required. Pick something useful to start with.',
        actions: ['marketing', 'customer_response', 'opportunities'],
      }]);
      return;
    }

    const nextStep = guideStep + 1;
    setGuideStep(nextStep);
    if (firstRunGuidePending) persistOnboarding({ status: 'in_progress', step: nextStep });
  };

  const reopenGuide = () => {
    setGuideMode('tour');
    setGuideStep(0);
    setGuideOpen(true);
  };

  const submitComposer = event => {
    event.preventDefault();
    const input = composerValue.trim();
    if (!input) return;
    openCapability(routeGrowthAIIntent(input), input);
    setComposerValue('');
  };

  const renderWorkflow = capabilityType => {
    if (capabilityType === 'marketing') {
      return <MarketingWorkflow {...{
        aiCredits, aiGenerating, brand, contentIdeas, inputs, onGenerateDeterministic, onGenerateMarketingAI,
        onInputChange, onPostTypeChange, onPrefillIdea, platforms, postTypeId, saving,
      }} />;
    }
    if (capabilityType === 'customer_response') {
      return <CustomerResponseWorkflow aiCredits={aiCredits} aiGenerating={aiGenerating} businessName={businessName} onGenerateAI={onGenerateResponseAI} onSave={onSaveResponseDraft} saving={saving} />;
    }
    if (capabilityType === 'opportunities') {
      return <OpportunitiesWorkflow {...{
        activeOpportunities, aiCredits, aiGenerating, onAIEstimateFollowUp, onDismissOpportunity,
        onDraftEstimateFollowUp, onOpportunityFilterChange, onRefreshOpportunities, onReviewOpportunityJob,
        opportunitiesLoading, opportunityFilter, opportunitySubject, saving, visibleOpportunities,
      }} />;
    }
    if (capabilityType === 'brand') {
      return <BrandPreferencesWorkflow businessName={businessName} onProfileChange={onProfileChange} onSaveProfile={onSaveProfile} profile={profile} saving={saving} />;
    }
    return null;
  };

  const opportunityMessage = opportunitiesLoading
    ? 'I\'m checking ServicesOS for current growth opportunities.'
    : activeOpportunities.length > 0
      ? `I found ${activeOpportunities.length} ${activeOpportunities.length === 1 ? 'thing' : 'things'} worth reviewing.`
      : 'You\'re caught up right now. I don\'t see any GrowthAI opportunities that need attention.';

  return (
    <div className="growth-ai-home">
      <section className="growth-ai-welcome" aria-labelledby="growth-ai-home-title">
        <p className="growth-ai-greeting">{greeting}</p>
        <h2 id="growth-ai-home-title">How can I help grow {businessName} today?</h2>
        <div className="growth-ai-suggested-actions" aria-label="Suggested GrowthAI actions">
          {CAPABILITY_ACTIONS.map(action => (
            <button
              key={action.id}
              type="button"
              aria-pressed={activeWorkflow?.capabilityType === action.id}
              onClick={() => openCapability(action.id, action.label)}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="growth-ai-secondary-actions">
          <button type="button" className="growth-ai-brand-link" onClick={() => openCapability('brand', 'Edit brand settings')}>
            Using {businessName} brand profile · Edit
          </button>
          <button type="button" className="growth-ai-guide-link" onClick={reopenGuide}>
            GrowthAI guide
          </button>
        </div>
      </section>

      <section className="growth-ai-conversation" aria-labelledby="growth-ai-conversation-title">
        <h2 id="growth-ai-conversation-title" className="growth-ai-visually-hidden">GrowthAI conversation</h2>
        <div className="growth-ai-conversation-stream" role="log" aria-live="polite" aria-relevant="additions">
          {guideOpen ? (
            <GrowthAIOnboardingGuide
              businessName={businessName}
              mode={guideMode}
              onNext={advanceGuide}
              onSkip={closeGuide}
              onStart={startGuide}
              step={guideStep}
            />
          ) : (
            <>
              <ConversationMessage message={{ id: 'welcome', role: 'assistant', type: 'text', content: `I'm ready to help you work on growth for ${businessName}. I can review opportunities, create marketing, or prepare customer responses.` }} />
              <ConversationMessage message={{ id: 'opportunity-status', role: 'system', type: 'result', content: opportunityMessage }}>
                {!opportunitiesLoading && activeOpportunities.length > 0 ? (
                  <button type="button" className="growth-ai-inline-action" onClick={() => openCapability('opportunities', 'Show opportunities')}>Show opportunities</button>
                ) : null}
              </ConversationMessage>
            </>
          )}

          {conversation.map(message => (
            <ConversationMessage key={message.id} message={message}>
              {message.actions?.length ? (
                <div className="growth-ai-inline-actions">
                  {message.actions.map(actionId => {
                    const action = CAPABILITY_ACTIONS.find(item => item.id === actionId);
                    return action ? <button key={actionId} type="button" onClick={() => openCapability(actionId, action.label)}>{action.label}</button> : null;
                  })}
                </div>
              ) : null}
              {activeWorkflow?.messageId === message.id ? renderWorkflow(activeWorkflow.capabilityType) : null}
            </ConversationMessage>
          ))}
        </div>

        <form className="growth-ai-composer" aria-label="Ask GrowthAI" onSubmit={submitComposer}>
          <label htmlFor="growth-ai-composer-input" className="growth-ai-visually-hidden">Ask GrowthAI anything</label>
          <textarea
            id="growth-ai-composer-input"
            aria-label="Ask GrowthAI anything"
            rows="1"
            value={composerValue}
            onChange={event => setComposerValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask GrowthAI anything..."
          />
          <button type="submit" disabled={!composerValue.trim()}>Send</button>
          <p>Deterministic routing is free. AI credits are used only when you explicitly choose an AI generation action.</p>
        </form>
      </section>
    </div>
  );
}
