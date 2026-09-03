import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MarketingPhotoAssetPicker } from '../../../components/FieldPhotoEvidence';
import {
  appendBoundedGrowthAIMessages,
  getGrowthAISkill,
  getGrowthAISkillForWorkflow,
  normalizeGrowthAIRouterResult,
  routeGrowthAIConversation,
} from '../growthAIConversation';
import {
  GROWTH_AI_ONBOARDING_LAST_STEP,
  loadGrowthAIOnboardingState,
  saveGrowthAIOnboardingState,
} from '../growthAIOnboarding';
import { RESPONSE_CHANNELS, RESPONSE_SCENARIOS, buildResponseTemplate } from '../responseTemplates';
import { formatEstimateCurrency } from '../growthAIEstimateAssistance';
import {
  buildCommunicationSourceRefs,
  buildDeterministicCommunicationDraft,
  communicationTypeById,
  CUSTOMER_COMMUNICATION_TYPES,
  validateCommunicationSelection,
} from '../growthAICommunicationService';
import {
  buildDeterministicReviewResponseDraft,
  REVIEW_RESPONSE_TONES,
  validateOwnerReviewText,
} from '../growthAIReputationService';
import GrowthAIOnboardingGuide from './GrowthAIOnboardingGuide';
import {
  GrowthAIButton,
  GrowthAICopyButton,
  GrowthAIField,
} from './GrowthAIPrimitives';
import { growthAIDraftTypeLabel } from '../growthAIDraftPresentation';
import {
  requiresMarketingOpportunity,
  requiresMarketingService,
  validateMarketingSelection,
} from '../growthAIMarketingService';

const CAPABILITY_ACTIONS = Object.freeze([
  { id: 'business_briefing', label: 'Today\'s briefing' },
  { id: 'estimate_assistance', label: 'Help with an estimate' },
  { id: 'marketing', label: 'Create marketing' },
  { id: 'customer_response', label: 'Follow up' },
  { id: 'opportunities', label: 'Review opportunities' },
  { id: 'help', label: 'What can you do?' },
]);

const QUICK_ACTIONS = Object.freeze([
  { id: 'business_briefing', label: 'What needs attention?' },
  { id: 'opportunities', label: 'Find rebooking opportunities', filter: 'retain' },
  { id: 'customer_response', label: 'Draft customer message' },
  { id: 'marketing', label: 'Create marketing post' },
  { id: 'opportunities', label: 'Check reputation', filter: 'reputation' },
  { id: 'marketing', label: 'Plan my posts' },
]);

const CAPABILITY_RESPONSES = Object.freeze({
  business_briefing: 'Here is a briefing based on the current ServicesOS records for this tenant.',
  estimate_assistance: 'Choose an existing estimate to review its saved ServicesOS pricing. AI analysis is optional and always requires your approval.',
  marketing: 'Let\'s create something useful. Choose a format and add any details you want included.',
  customer_response: 'I can help prepare a private response. Nothing will be sent automatically.',
  opportunities: 'Here are the current SLAI opportunities for this tenant.',
  brand: 'These preferences shape SLAI drafts. Your canonical business identity still comes from Business Settings.',
});

function formatEstimateDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : 'Date unavailable';
}

function EstimateAssistanceResult({ recommendation }) {
  if (!recommendation) return null;
  const currency = recommendation.baselinePrice?.currency || 'USD';
  return (
    <section className="growth-ai-estimate-result" role="status" aria-live="polite" aria-labelledby="growth-ai-estimate-recommendation-title">
      <span className="growth-ai-item-label">SLAI recommendation</span>
      <h4 id="growth-ai-estimate-recommendation-title">Review before using</h4>
      <p><strong>Recommended price:</strong> {formatEstimateCurrency(recommendation.recommendedPrice, currency)}</p>
      <p><strong>Reasoning:</strong> {recommendation.reasoning}</p>
      {[
        ['Assumptions', recommendation.assumptions],
        ['Suggested scope', recommendation.scopeSuggestions],
        ['Possible add-ons', recommendation.possibleAddOns],
        ['Complexity and risk flags', recommendation.complexityFlags],
      ].map(([label, values]) => Array.isArray(values) && values.length ? (
        <div key={label} className="growth-ai-estimate-result-list">
          <strong>{label}</strong>
          <ul>{values.map(value => <li key={value}>{value}</li>)}</ul>
        </div>
      ) : null)}
      <p className="growth-ai-approval-note">This advisory result is saved for human review. It did not change the estimate, booking, payment, schedule, or customer record.</p>
    </section>
  );
}

function EstimateAssistanceWorkflow({ aiGenerating, creditPresentation, estimates, onAnalyze, saving }) {
  const [selectedEstimateId, setSelectedEstimateId] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedEstimate = estimates.find(item => item.id === selectedEstimateId) || null;
  const pricing = selectedEstimate?.pricing || null;
  const aiDisabled = !selectedEstimate || !pricing || aiCreditActionBlocked(creditPresentation) || aiGenerating || saving || submitting;
  const disabledReason = !selectedEstimate
    ? 'Choose an estimate before requesting SLAI analysis.'
    : !pricing
      ? 'This saved estimate needs a valid ServicesOS price range before it can be analyzed.'
      : aiCreditActionMessage(creditPresentation, 'ServicesOS pricing remains available.');

  const selectEstimate = estimate => {
    setSelectedEstimateId(estimate.id);
    setRecommendation(null);
  };

  const analyze = async () => {
    if (aiDisabled) return;
    setSubmitting(true);
    setRecommendation(null);
    try {
      const result = await onAnalyze(selectedEstimate.id);
      if (result?.estimateAssistance) setRecommendation(result.estimateAssistance);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-estimate-assistance-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-estimate-assistance-title">Estimate assistance</h3>
          <p>ServicesOS pricing is authoritative. SLAI can provide an optional advisory recommendation.</p>
        </div>
      </div>
      {estimates.length === 0 ? <p className="growth-ai-empty">No eligible unbooked estimates are available for assistance.</p> : (
        <div className="growth-ai-estimate-selector" role="group" aria-label="Eligible estimates">
          {estimates.map(estimate => (
            <button
              key={estimate.id}
              type="button"
              aria-pressed={selectedEstimateId === estimate.id}
              className="growth-ai-estimate-option"
              onClick={() => selectEstimate(estimate)}
            >
              <strong>{estimate.customerName}</strong>
              <span>{estimate.serviceType} · {estimate.status} · {formatEstimateDate(estimate.date)}</span>
              {estimate.pricing ? <span>{formatEstimateCurrency(estimate.pricing.low, estimate.pricing.currency)} - {formatEstimateCurrency(estimate.pricing.high, estimate.pricing.currency)}</span> : <span>Pricing needs review</span>}
            </button>
          ))}
        </div>
      )}
      {selectedEstimate ? (
        <div className="growth-ai-estimate-pricing" aria-live="polite">
          <span className="growth-ai-item-label">ServicesOS pricing</span>
          <h4>{selectedEstimate.customerName}</h4>
          {pricing ? (
            <dl>
              <div><dt>Low</dt><dd>{formatEstimateCurrency(pricing.low, pricing.currency)}</dd></div>
              <div><dt>Suggested</dt><dd>{pricing.suggested == null ? 'Not available' : formatEstimateCurrency(pricing.suggested, pricing.currency)}</dd></div>
              <div><dt>High</dt><dd>{formatEstimateCurrency(pricing.high, pricing.currency)}</dd></div>
            </dl>
          ) : <p className="growth-ai-credit-warning">The canonical saved price range is incomplete. ServicesOS requires owner review before AI analysis.</p>}
          <div className="growth-ai-actions">
            <GrowthAIButton disabled={aiDisabled} aria-describedby={disabledReason ? 'growth-ai-estimate-credit-note' : undefined} onClick={analyze}>
              {submitting || aiGenerating ? 'Analyzing...' : 'Analyze with SLAI · 1 credit'}
            </GrowthAIButton>
          </div>
          {disabledReason ? <p id="growth-ai-estimate-credit-note" className="growth-ai-cost-note">{disabledReason}</p> : null}
        </div>
      ) : null}
      <EstimateAssistanceResult recommendation={recommendation} />
    </section>
  );
}

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

function aiCreditActionBlocked(creditPresentation) {
  return creditPresentation?.status !== 'ready' || creditPresentation.available < 1;
}

function aiCreditActionMessage(creditPresentation, freeAlternative) {
  if (creditPresentation?.status === 'loading') {
    return `AI credit balance is loading. ${freeAlternative}`;
  }
  if (creditPresentation?.status !== 'ready') {
    return `AI credit balance is unavailable, so AI generation is paused. ${freeAlternative}`;
  }
  if (creditPresentation.available < 1) {
    return `No AI credits remaining. ${freeAlternative} AI generation will be available again when included credits renew${creditPresentation.renewalLabel ? ` ${creditPresentation.renewalLabel}` : ''}.`;
  }
  return '';
}

function opportunityTypeLabel(type) {
  if (type === 'estimate_followup') return 'Estimate Follow-Up';
  if (type === 'marketing_photo_review') return 'Marketing Opportunity';
  if (type === 'rebooking_gap') return 'Rebooking Opportunity';
  if (type === 'review_request') return 'Review Request Opportunity';
  return 'Growth Opportunity';
}

function OpportunityCard({
  aiGenerating,
  creditPresentation,
  opportunity,
  subject,
  onAIFollowUp,
  onDismiss,
  onDraftFollowUp,
  onStartMarketingFromOpportunity,
  onStartRebookingFromOpportunity,
  onStartReviewRequestFromOpportunity,
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
            <GrowthAIButton disabled={saving || aiGenerating || acted || aiCreditActionBlocked(creditPresentation)} onClick={() => onAIFollowUp(opportunity)}>
              Generate follow-up with AI · 1 credit
            </GrowthAIButton>
          </>
        ) : null}
        {opportunity.type === 'marketing_photo_review' ? (
          <>
            <GrowthAIButton disabled={saving} onClick={() => onStartMarketingFromOpportunity(opportunity)}>Create marketing draft</GrowthAIButton>
            <GrowthAIButton tone="secondary" disabled={saving} onClick={() => onReviewJob(opportunity)}>Review Job</GrowthAIButton>
          </>
        ) : null}
        {opportunity.type === 'rebooking_gap' ? (
          <GrowthAIButton disabled={saving} onClick={() => onStartRebookingFromOpportunity(opportunity)}>
            Prepare Rebooking Draft
          </GrowthAIButton>
        ) : null}
        {opportunity.type === 'review_request' ? (
          <GrowthAIButton disabled={saving || acted} onClick={() => onStartReviewRequestFromOpportunity(opportunity)}>
            {acted ? 'Review Request Drafted' : 'Prepare Review Request'}
          </GrowthAIButton>
        ) : null}
        <GrowthAIButton tone="secondary" disabled={saving} onClick={() => onDismiss(opportunity)}>Dismiss</GrowthAIButton>
      </div>
      {opportunity.type === 'estimate_followup' && aiCreditActionBlocked(creditPresentation) ? (
        <p className="growth-ai-credit-warning">{aiCreditActionMessage(creditPresentation, 'The deterministic follow-up draft remains available.')}</p>
      ) : null}
    </article>
  );
}

function MarketingWorkflow({
  aiGenerating,
  brand,
  contentPlan = [],
  contentIdeas,
  creditPresentation,
  inputs,
  marketingAssets = { items: [], loading: false, error: '' },
  marketingOpportunity,
  marketingServices,
  onGenerateDeterministic,
  onGenerateMarketingAI,
  onInputChange,
  onMarketingOpportunityChange,
  onPostTypeChange,
  onPrefillIdea,
  onStartMarketingPlan = () => {},
  onToggleMarketingAsset = () => {},
  platforms,
  postTypeId,
  saving,
}) {
  const contentType = brand.postTypes.find(item => item.id === postTypeId) || brand.postTypes[0];
  const selectionError = validateMarketingSelection({
    contentTypeId: contentType.id,
    serviceType: inputs.serviceType,
    sourceOpportunity: marketingOpportunity,
  });
  const showService = requiresMarketingService(contentType.id) || ['promotional', 'availability', 'completed_job', 'before_after'].includes(contentType.id);

  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-marketing-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-marketing-title">Marketing draft</h3>
          <p>Configure a draft or choose SLAI assistance.</p>
        </div>
      </div>
      <div className="growth-ai-form-stack">
        <div className="growth-ai-form-grid">
          <GrowthAIField label="Content type">
            <select
              aria-label="Content type"
              value={postTypeId}
              onChange={event => {
                const nextType = event.target.value;
                onPostTypeChange(nextType);
                if (!requiresMarketingOpportunity(nextType)) onMarketingOpportunityChange(null);
              }}
            >
              {brand.postTypes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
          <GrowthAIField label="Platform">
            <select aria-label="Platform" value={inputs.platform} onChange={event => onInputChange({ platform: event.target.value })}>
              {platforms.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
        </div>
        {showService ? (
          <GrowthAIField label="Tenant service">
            <select aria-label="Tenant service" value={inputs.serviceType} onChange={event => onInputChange({ serviceType: event.target.value })}>
              <option value="">{marketingServices.length ? 'Choose a service' : 'No known tenant services available'}</option>
              {marketingServices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
        ) : null}
        {showService && marketingServices.length === 0 ? <p className="growth-ai-credit-warning">No canonical tenant service is available in this workspace yet. Service spotlight content remains unavailable.</p> : null}
        {contentType.id === 'promotional' ? <GrowthAIField label="Owner-supplied offer"><input aria-label="Owner-supplied offer" value={inputs.offer} onChange={event => onInputChange({ offer: event.target.value })} /></GrowthAIField> : null}
        {contentType.id === 'seasonal' ? <GrowthAIField label="Seasonal context"><select aria-label="Seasonal context" value={inputs.dateRange} onChange={event => onInputChange({ dateRange: event.target.value })}><option value="">Choose a season</option><option value="Spring">Spring</option><option value="Summer">Summer</option><option value="Back-to-school season">Back-to-school season</option><option value="Holiday season">Holiday season</option><option value="Winter">Winter</option></select></GrowthAIField> : null}
        {['educational_tip', 'humor_engagement'].includes(contentType.id) ? <GrowthAIField label="Topic"><input aria-label="Topic" value={inputs.cleaningTopic} onChange={event => onInputChange({ cleaningTopic: event.target.value })} /></GrowthAIField> : null}
        {requiresMarketingOpportunity(contentType.id) ? (
          <>
            <p className="growth-ai-cost-note">{marketingOpportunity ? 'Using the selected eligible completed-job opportunity. No image analysis or customer details are included.' : 'Choose an eligible completed-job opportunity from SLAI opportunities first.'}</p>
            {marketingOpportunity ? (
              <section className="growth-ai-marketing-assets" aria-labelledby="growth-ai-marketing-assets-title">
                <h4 id="growth-ai-marketing-assets-title">Owner-approved field photos</h4>
                <p>Choose approved evidence for private draft context. The provider receives no image, URL, storage path, room label, or note.</p>
                {marketingAssets.loading ? <p role="status">Loading approved field photos...</p> : null}
                {marketingAssets.error ? <p className="growth-ai-credit-warning" role="alert">{marketingAssets.error}</p> : null}
                {!marketingAssets.loading && !marketingAssets.error ? (
                  <MarketingPhotoAssetPicker
                    photos={marketingAssets.items}
                    selectedPhotoIds={marketingOpportunity.selectedPhotoIds}
                    onToggle={onToggleMarketingAsset}
                  />
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
        {contentType.id === 'testimonial' ? <p className="growth-ai-credit-warning">A safe approved testimonial source is not available in ServicesOS yet, so this content type cannot generate a draft.</p> : null}
        <GrowthAIField label="Extra notes"><textarea aria-label="Extra notes" rows="2" value={inputs.extraNotes} onChange={event => onInputChange({ extraNotes: event.target.value })} /></GrowthAIField>
        <div className="growth-ai-actions">
          <GrowthAIButton disabled={Boolean(selectionError)} onClick={onGenerateDeterministic}>Create draft</GrowthAIButton>
          <GrowthAIButton disabled={Boolean(selectionError) || saving || aiGenerating || aiCreditActionBlocked(creditPresentation)} onClick={onGenerateMarketingAI}>
            Generate marketing with AI · 1 credit
          </GrowthAIButton>
        </div>
        {aiCreditActionBlocked(creditPresentation) ? <p className="growth-ai-credit-warning">
          {aiCreditActionMessage(creditPresentation, 'You can still create a standard draft.')}
        </p> : null}
      </div>
      <section className="growth-ai-marketing-plan" aria-labelledby="growth-ai-marketing-plan-title">
        <h4 id="growth-ai-marketing-plan-title">Content plan</h4>
        <p>Suggested topics for upcoming content.</p>
        <div className="growth-ai-marketing-plan-list">
          {contentPlan.map(plan => (
            <button key={plan.id} type="button" onClick={() => onStartMarketingPlan(plan)}>
              <strong>{plan.label}</strong>
              <span>{plan.description}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="growth-ai-idea-list" aria-label="Marketing draft ideas">
        {contentIdeas.slice(0, 4).map(idea => <GrowthAIButton key={idea.label} tone="secondary" onClick={() => onPrefillIdea(idea)}>{idea.label}</GrowthAIButton>)}
      </div>
    </section>
  );
}

function CustomerResponseWorkflow({
  aiGenerating,
  bookings,
  businessName,
  creditPresentation,
  leads,
  onGenerateAI,
  onSave,
  customerCommunicationIntent,
  saving,
}) {
  const scenarios = RESPONSE_SCENARIOS.auntbs;
  const prefilledBookingId = bookings.some(booking => booking.id === customerCommunicationIntent?.bookingId && booking.completed)
    ? customerCommunicationIntent.bookingId
    : '';
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [channelId, setChannelId] = useState('sms');
  const [customerMessage, setCustomerMessage] = useState('');
  const [communicationTypeId, setCommunicationTypeId] = useState(customerCommunicationIntent?.type || (prefilledBookingId ? 'rebooking' : 'estimate_followup'));
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState(prefilledBookingId);
  const [reviewText, setReviewText] = useState('');
  const [reviewTone, setReviewTone] = useState('positive');
  const communicationType = communicationTypeById(communicationTypeId);
  const isReviewResponse = communicationType.id === 'review_response';
  const sourceOptions = communicationType.source === 'lead'
    ? leads
    : communicationType.source === 'completed_booking'
      ? bookings.filter(booking => booking.completed)
      : communicationType.source === 'booking'
        ? bookings
        : [];
  const selectedSource = communicationType.source === 'lead'
    ? leads.find(item => item.id === selectedLeadId)
    : sourceOptions.find(item => item.id === selectedBookingId);
  const selectedContext = selectedSource
    ? {
      ...selectedSource,
      ...(communicationType.source === 'lead' ? { leadId: selectedSource.id } : { bookingId: selectedSource.id }),
    }
    : null;
  const selectionError = validateCommunicationSelection({
    typeId: communicationTypeId,
    selectedLeadId,
    selectedBookingId,
  });
  const reviewTextError = isReviewResponse ? validateOwnerReviewText(reviewText) : '';
  const workflowError = selectionError || reviewTextError;
  const deterministicDraft = isReviewResponse
    ? buildDeterministicReviewResponseDraft({ businessName, toneId: reviewTone })
    : buildDeterministicCommunicationDraft({
      businessName,
      channelId,
      typeId: communicationTypeId,
      source: selectedContext,
    });
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

  const generateAI = () => {
    if (workflowError || (!isReviewResponse && !customerMessage.trim())) return;
    onGenerateAI({
      sourceRefs: isReviewResponse ? {} : buildCommunicationSourceRefs({
        typeId: communicationTypeId, selectedLeadId, selectedBookingId,
      }),
      input: isReviewResponse
        ? { channelId, communicationType: communicationTypeId, reviewText, reviewTone }
        : { channelId, communicationType: communicationTypeId, customerMessage, scenarioId },
    });
  };

  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-response-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-response-title">Customer response</h3>
          <p>Prepare a customer communication draft.</p>
        </div>
      </div>
      <div className="growth-ai-form-stack">
        <div className="growth-ai-form-grid">
          <GrowthAIField label="Communication type">
            <select aria-label="Communication type" value={communicationTypeId} onChange={event => {
              setCommunicationTypeId(event.target.value);
              setSelectedLeadId('');
              setSelectedBookingId('');
            }}>
              {CUSTOMER_COMMUNICATION_TYPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
          <GrowthAIField label="Response channel">
            <select aria-label="Response channel" value={channelId} onChange={event => setChannelId(event.target.value)}>
              {RESPONSE_CHANNELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </GrowthAIField>
        </div>
        {!isReviewResponse ? (
          <GrowthAIField label={communicationType.source === 'lead' ? 'Estimate to use' : communicationType.source === 'completed_booking' ? 'Completed job to use' : 'Booking to use'}>
            <select
              aria-label={communicationType.source === 'lead' ? 'Estimate to use' : communicationType.source === 'completed_booking' ? 'Completed job to use' : 'Booking to use'}
              value={communicationType.source === 'lead' ? selectedLeadId : selectedBookingId}
              onChange={event => {
                if (communicationType.source === 'lead') setSelectedLeadId(event.target.value);
                else setSelectedBookingId(event.target.value);
              }}
            >
              <option value="">Choose a canonical record</option>
              {sourceOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </GrowthAIField>
        ) : null}
        {isReviewResponse ? (
          <>
            <GrowthAIField label="Response tone">
              <select aria-label="Review response tone" value={reviewTone} onChange={event => setReviewTone(event.target.value)}>
                {REVIEW_RESPONSE_TONES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </GrowthAIField>
            <GrowthAIField label="Owner-pasted review text">
              <textarea aria-label="Owner-pasted review text" rows="4" maxLength="1200" value={reviewText} onChange={event => setReviewText(event.target.value)} />
            </GrowthAIField>
          </>
        ) : (
          <GrowthAIField label="Customer message for optional AI assistance">
            <textarea aria-label="Customer message for AI" rows="3" value={customerMessage} onChange={event => setCustomerMessage(event.target.value)} />
          </GrowthAIField>
        )}
        <div className="growth-ai-preview">
          <strong>{deterministicDraft.title}</strong>
          {deterministicDraft.subjectLine ? <p><strong>Subject:</strong> {deterministicDraft.subjectLine}</p> : null}
          <p>{deterministicDraft.messageTemplate}</p>
        </div>
        <p className="growth-ai-supporting-copy">{deterministicDraft.notes}</p>
        {workflowError ? <p className="growth-ai-credit-warning">{workflowError}</p> : null}
        <div className="growth-ai-actions">
          <GrowthAICopyButton label="Copy response" text={deterministicDraft.messageTemplate} />
          <GrowthAIButton tone="secondary" disabled={saving || Boolean(workflowError)} onClick={() => onSave(deterministicDraft)}>Save response draft</GrowthAIButton>
          <GrowthAIButton disabled={saving || aiGenerating || aiCreditActionBlocked(creditPresentation) || Boolean(workflowError) || (!isReviewResponse && !customerMessage.trim())} onClick={generateAI}>Improve with SLAI · 1 credit</GrowthAIButton>
        </div>
        {aiCreditActionBlocked(creditPresentation) ? <p className="growth-ai-credit-warning">
          {aiCreditActionMessage(creditPresentation, 'You can still prepare and save a standard response.')}
        </p> : null}
        {!isReviewResponse ? <details className="growth-ai-preview">
          <summary>Existing quick response templates</summary>
          <div className="growth-ai-form-grid">
            <GrowthAIField label="Response scenario">
              <select aria-label="Response scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>
                {scenarios.map(item => <option key={item.id} value={item.id}>{item.scenario}</option>)}
              </select>
            </GrowthAIField>
          </div>
          {responseTemplate.subjectLine ? <p><strong>Subject:</strong> {responseTemplate.subjectLine}</p> : null}
          <p>{responseTemplate.messageTemplate}</p>
          <div className="growth-ai-actions">
            <GrowthAICopyButton label="Copy quick response" text={responseTemplate.messageTemplate} />
            <GrowthAIButton tone="secondary" disabled={saving} onClick={() => onSave({ ...responseTemplate, pillar: 'convert', sourceRefs: {} })}>Save quick response draft</GrowthAIButton>
          </div>
        </details> : null}
      </div>
    </section>
  );
}

function OpportunitiesWorkflow({
  activeOpportunities,
  aiGenerating,
  creditPresentation,
  onAIEstimateFollowUp,
  onDismissOpportunity,
  onDraftEstimateFollowUp,
  onOpportunityFilterChange,
  onRefreshOpportunities,
  onReviewOpportunityJob,
  onStartMarketingFromOpportunity,
  onStartRebookingFromOpportunity,
  onStartReviewRequestFromOpportunity,
  opportunitiesLoading,
  opportunityFilter,
  opportunitySubject,
  focusedOpportunityId,
  saving,
  visibleOpportunities,
}) {
  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-opportunities-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-opportunities-title">Growth opportunities</h3>
          <p>Current ServicesOS signals for this tenant.</p>
        </div>
        <span className="growth-ai-count">{activeOpportunities.length}</span>
      </div>
      <div className="growth-ai-filter-row" aria-label="Filter growth opportunities">
        {[
          ['all', 'All'], ['attract', 'Marketing'], ['convert', 'Estimates'], ['retain', 'Rebooking'], ['reputation', 'Reputation'],
        ].map(([value, label]) => (
          <GrowthAIButton key={value} tone={opportunityFilter === value ? 'primary' : 'secondary'} onClick={() => onOpportunityFilterChange(value)}>{label}</GrowthAIButton>
        ))}
        <GrowthAIButton tone="secondary" disabled={opportunitiesLoading || saving} onClick={onRefreshOpportunities}>
          {opportunitiesLoading ? 'Checking...' : 'Refresh'}
        </GrowthAIButton>
      </div>
      {opportunitiesLoading && activeOpportunities.length === 0 ? <p className="growth-ai-empty">Checking tenant records for opportunities...</p> : null}
      {!opportunitiesLoading && activeOpportunities.length === 0 ? <p className="growth-ai-empty">You\'re caught up. No SLAI opportunities need attention right now.</p> : null}
      {!opportunitiesLoading && activeOpportunities.length > 0 && visibleOpportunities.length === 0 ? <p className="growth-ai-empty">No opportunities match this filter.</p> : null}
      <div className="growth-ai-opportunity-list">
        {visibleOpportunities.map(opportunity => (
          <div key={opportunity.id} className="growth-ai-opportunity-item" data-focused={focusedOpportunityId === opportunity.id || undefined}>
            {focusedOpportunityId === opportunity.id ? <p className="growth-ai-cost-note" role="status">This is the opportunity you asked to review.</p> : null}
            <OpportunityCard
              opportunity={opportunity}
              subject={opportunitySubject(opportunity)}
              onDraftFollowUp={onDraftEstimateFollowUp}
              onAIFollowUp={onAIEstimateFollowUp}
              onReviewJob={onReviewOpportunityJob}
              onStartMarketingFromOpportunity={onStartMarketingFromOpportunity}
              onStartRebookingFromOpportunity={onStartRebookingFromOpportunity}
              onStartReviewRequestFromOpportunity={onStartReviewRequestFromOpportunity}
              onDismiss={onDismissOpportunity}
              saving={saving}
              aiGenerating={aiGenerating}
              creditPresentation={creditPresentation}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function BrandPreferencesWorkflow({ brandContext, onProfileChange, onSaveProfile, profile, saving }) {
  return (
    <section className="growth-ai-workflow" aria-labelledby="growth-ai-brand-title">
      <div className="growth-ai-workflow-heading">
        <div>
          <h3 id="growth-ai-brand-title">Brand settings</h3>
          <p>Business identity comes from Business Settings. These owner-approved preferences guide SLAI drafts.</p>
        </div>
      </div>
      <div className="growth-ai-brand-grid">
        <GrowthAIField label="Business name"><input aria-label="Business name" value={brandContext.businessName} readOnly /></GrowthAIField>
        <GrowthAIField label="Service area"><input aria-label="Service area" value={brandContext.serviceArea} readOnly /></GrowthAIField>
        <GrowthAIField label="Brand voice"><input aria-label="Brand voice" value={profile.brandVoice} onChange={event => onProfileChange({ brandVoice: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Content tone"><input aria-label="Content tone" value={profile.contentTone} onChange={event => onProfileChange({ contentTone: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Writing style"><input aria-label="Writing style" value={profile.writingStyle} onChange={event => onProfileChange({ writingStyle: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Default call to action"><input aria-label="Default call to action" value={profile.defaultCTA} onChange={event => onProfileChange({ defaultCTA: event.target.value })} /></GrowthAIField>
        <GrowthAIField label="Words or topics to avoid"><textarea aria-label="Words or topics to avoid" value={profile.avoidTerms} onChange={event => onProfileChange({ avoidTerms: event.target.value })} rows={3} /></GrowthAIField>
        <GrowthAIField label="Brand colors">
          <div className="growth-ai-color-row">
            {['primary', 'secondary', 'accent'].map(key => <label key={key}>{key}<input aria-label={`${key} brand color`} placeholder="#RRGGBB" value={profile.brandColors[key]} onChange={event => onProfileChange({ brandColors: { ...profile.brandColors, [key]: event.target.value } })} /></label>)}
          </div>
        </GrowthAIField>
        <GrowthAIField label="Preferred platforms">
          <div className="growth-ai-platform-preferences">
            {['general', 'facebook', 'instagram', 'linkedin', 'website'].map(platform => <label key={platform}><input type="checkbox" checked={profile.platformPreferences[platform]} onChange={event => onProfileChange({ platformPreferences: { ...profile.platformPreferences, [platform]: event.target.checked } })} />{platform}</label>)}
          </div>
        </GrowthAIField>
      </div>
      {brandContext.logoRef ? <p className="growth-ai-cost-note">An existing tenant logo reference is available and remains managed outside SLAI.</p> : null}
      <div className="growth-ai-actions"><GrowthAIButton onClick={onSaveProfile} disabled={saving}>Save brand preferences</GrowthAIButton></div>
    </section>
  );
}

function ConversationMessage({ children, message }) {
  return (
    <article className={`growth-ai-message growth-ai-message-${message.role}`} data-message-type={message.type}>
      <div className="growth-ai-message-identity">{message.role === 'user' ? 'You' : message.role === 'system' ? 'ServicesOS' : 'SLAI'}</div>
      <div className="growth-ai-message-content">
        <p>{message.content}</p>
        {children}
      </div>
    </article>
  );
}

function SavedDraftResultCard({ creditsCharged = 0, draft, onOpenDraft }) {
  if (!draft?.id) return null;
  const content = draft.content || {};
  const marketing = draft.actionType === 'marketing_post';
  const statusLabel = draft.status === 'approved' ? 'Approved' : draft.status === 'needs_review' ? 'Needs Review' : 'Draft';
  return (
    <section className="growth-ai-saved-result" aria-label={`${marketing ? 'Marketing' : 'Customer communication'} draft result`}>
      <div className="growth-ai-saved-result-heading">
        <div>
          <span className="growth-ai-item-label">Saved draft</span>
          <h4>{draft.title || (marketing ? 'Marketing draft' : 'Customer communication draft')}</h4>
        </div>
        <span className={`growth-ai-state growth-ai-state-${draft.status || 'draft'}`}>{statusLabel}</span>
      </div>
      <div className="growth-ai-saved-result-fields">
        <section><strong>{marketing ? 'Full caption' : 'Draft message'}</strong><p>{content.fullCaption}</p></section>
        {marketing ? <section><strong>Short caption</strong><p>{content.shortCaption}</p></section> : null}
        {content.callToAction ? <section><strong>Call to action</strong><p>{content.callToAction}</p></section> : null}
        {marketing ? <section><strong>Hashtags</strong><p>{content.hashtags || 'Not used for this platform.'}</p></section> : null}
      </div>
      {creditsCharged === 1 ? <p className="growth-ai-approval-note">1 AI credit used.</p> : null}
      <div className="growth-ai-inline-actions">
        <GrowthAICopyButton label={marketing ? 'Copy full caption' : 'Copy draft message'} text={content.fullCaption || ''} />
        <button type="button" onClick={() => onOpenDraft(draft)}>Open in Drafts</button>
      </div>
    </section>
  );
}

function BusinessBriefing({ briefing, headingId, loading, onOpenCapability }) {
  if (loading) {
    return <section className="growth-ai-briefing" aria-live="polite"><p className="growth-ai-empty">Preparing today\'s briefing from ServicesOS records...</p></section>;
  }

  const sections = [
    ['Wins', briefing.wins],
    ['Needs attention', briefing.needsAttention],
    ['SLAI Noticed', briefing.noticed],
  ].filter(([, items]) => items.length > 0);

  return (
    <section className="growth-ai-briefing" aria-labelledby={headingId}>
      <div className="growth-ai-briefing-heading">
        <div>
          <h3 id={headingId}>Business briefing</h3>
        </div>
      </div>
      {briefing.isEmpty ? (
        <p className="growth-ai-empty">There\'s not much to report yet. As estimates and bookings come in, I\'ll highlight what deserves attention.</p>
      ) : (
        <div className="growth-ai-briefing-sections">
          {sections.map(([title, items]) => (
            <section key={title} className="growth-ai-briefing-section" aria-label={title}>
              <h4>{title}</h4>
              <ul>{items.map(item => <li key={item.id}>{item.text}</li>)}</ul>
            </section>
          ))}
        </div>
      )}
      <div className="growth-ai-inline-actions" aria-label="Briefing actions">
        {briefing.actions.map(item => (
          <button key={item.id} type="button" onClick={() => onOpenCapability(item.capabilityType, item.label)}>{item.label}</button>
        ))}
      </div>
      <p className="growth-ai-briefing-note">Review suggested actions before any draft, approval, or business change is made.</p>
    </section>
  );
}

function currentContextFor({ activeOpportunities, activeWorkflow, customerCommunicationIntent, marketingOpportunity, opportunitySubject }) {
  const focusedOpportunity = activeOpportunities.find(item => item.id === activeWorkflow?.context?.focusedOpportunityId)
    || activeOpportunities.find(item => item.id === marketingOpportunity?.id)
    || null;

  if (focusedOpportunity) {
    return {
      label: opportunityTypeLabel(focusedOpportunity.type),
      detail: opportunitySubject(focusedOpportunity),
      opportunity: focusedOpportunity,
    };
  }

  if (customerCommunicationIntent?.type === 'rebooking') {
    return { label: 'Rebooking message', detail: 'Preparing a review-required customer message.' };
  }
  if (customerCommunicationIntent?.type === 'review_request') {
    return { label: 'Review request', detail: 'Preparing a review-required customer message.' };
  }

  const labels = {
    business_briefing: 'Today\'s business briefing',
    customer_response: 'Customer message',
    estimate_assistance: 'Estimate assistance',
    marketing: 'Marketing draft',
    opportunities: 'Growth opportunities',
  };
  const label = labels[activeWorkflow?.capabilityType];
  return label ? { label, detail: 'This context is limited to the current browser session.' } : null;
}

function SLAIContextRail({
  activeOpportunities,
  context,
  drafts,
  onOpenCapability,
  onOpenDrafts,
  onStartMarketingFromOpportunity,
  onStartRebookingFromOpportunity,
  onStartReviewRequestFromOpportunity,
}) {
  const customerCommunicationContext = ['Customer message', 'Rebooking message', 'Review request'].includes(context?.label);

  const startContextAction = () => {
    const opportunity = context?.opportunity;
    if (!opportunity) {
      if (customerCommunicationContext) {
        onOpenCapability('customer_response', 'Continue customer message');
        return;
      }
      if (context?.label === 'Marketing draft') {
        onOpenCapability('marketing', 'Continue marketing draft');
        return;
      }
      onOpenCapability('opportunities', 'Review current opportunities');
      return;
    }
    if (opportunity.type === 'rebooking_gap') {
      if (onStartRebookingFromOpportunity(opportunity) !== false) {
        onOpenCapability('customer_response', 'Prepare a rebooking draft');
      }
      return;
    }
    if (opportunity.type === 'review_request') {
      if (onStartReviewRequestFromOpportunity(opportunity) !== false) {
        onOpenCapability('customer_response', 'Prepare a review request');
      }
      return;
    }
    if (opportunity.type === 'marketing_photo_review') {
      onStartMarketingFromOpportunity(opportunity);
      onOpenCapability('marketing', 'Create marketing from completed job');
      return;
    }
    onOpenCapability('opportunities', 'Review estimate follow-up');
  };

  const actionLabel = context?.opportunity?.type === 'rebooking_gap'
    ? 'Prepare customer message'
    : context?.opportunity?.type === 'review_request'
      ? 'Prepare review request'
      : context?.opportunity?.type === 'marketing_photo_review'
        ? 'Create marketing draft'
        : customerCommunicationContext
          ? 'Open Customer Communication'
          : context?.label === 'Marketing draft'
            ? 'Continue marketing draft'
            : 'View opportunities';

  return (
    <aside className="growth-ai-context-rail" aria-label="Current SLAI Assistant context">
      <details open>
        <summary>Current context</summary>
        <div className="growth-ai-context-rail-content">
          <section className="growth-ai-context-section" aria-labelledby="growth-ai-current-context-title">
            <span className="growth-ai-rail-label" id="growth-ai-current-context-title">Current Context</span>
            {context ? (
              <>
                <strong>{context.label}</strong>
                <p>{context.detail}</p>
                <span className="growth-ai-rail-label">Suggested Next Steps</span>
                <div className="growth-ai-context-actions">
                  <button type="button" onClick={startContextAction}>{actionLabel}</button>
                  <button type="button" onClick={() => onOpenCapability('opportunities', 'View all opportunities')}>View all</button>
                </div>
              </>
            ) : <p>Select an opportunity or ask SLAI for help.</p>}
          </section>

          <section className="growth-ai-context-section" aria-labelledby="growth-ai-noticed-title">
            <span className="growth-ai-rail-label" id="growth-ai-noticed-title">SLAI Noticed</span>
            {activeOpportunities.length ? (
              <ul className="growth-ai-noticed-list">
                {activeOpportunities.slice(0, 3).map(opportunity => <li key={opportunity.id}>{opportunityTypeLabel(opportunity.type)}</li>)}
              </ul>
            ) : <p>No current opportunities need attention.</p>}
            {activeOpportunities.length ? <button type="button" className="growth-ai-rail-link" onClick={() => onOpenCapability('opportunities', 'View all opportunities')}>View all opportunities</button> : null}
          </section>

          <section className="growth-ai-context-section" aria-labelledby="growth-ai-recent-drafts-title">
            <span className="growth-ai-rail-label" id="growth-ai-recent-drafts-title">Recent Drafts</span>
            {drafts.length ? (
              <div className="growth-ai-recent-drafts">
                {drafts.map(draft => (
                  <button key={draft.id || draft.title} type="button" onClick={onOpenDrafts}>
                    <strong>{growthAIDraftTypeLabel(draft)}</strong>
                    <span>{draft.status === 'approved' ? 'Approved' : draft.status === 'needs_review' ? 'Needs Review' : 'Draft'}</span>
                  </button>
                ))}
              </div>
            ) : <p>No saved drafts yet.</p>}
            <button type="button" className="growth-ai-rail-link" onClick={onOpenDrafts}>Open Drafts</button>
          </section>

        </div>
      </details>
    </aside>
  );
}

export default function GrowthAIHome({
  activeOpportunities,
  aiGenerating,
  brand,
  brandContext,
  briefing,
  briefingLoading,
  businessName,
  contentPlan = [],
  contentIdeas,
  creditPresentation,
  eligibleEstimateLeads,
  communicationBookings,
  communicationLeads,
  customerCommunicationIntent,
  onAIEstimateAssistance,
  inputs,
  onAIEstimateFollowUp,
  onDismissOpportunity,
  onDraftEstimateFollowUp,
  onGenerateDeterministic,
  onGenerateMarketingAI,
  onGenerateResponseAI,
  onInputChange,
  onMarketingOpportunityChange,
  onStartMarketingPlan = () => {},
  onToggleMarketingAsset = () => {},
  onOpportunityFilterChange,
  onPostTypeChange,
  onPrefillIdea,
  onProfileChange,
  onRefreshOpportunities,
  onResolveAmbiguousIntent,
  onReviewOpportunityJob,
  onStartMarketingFromOpportunity,
  onStartFirstOpportunity,
  onStartRebookingFromOpportunity,
  onStartReviewRequestFromOpportunity,
  onSaveProfile,
  onSaveResponseDraft,
  opportunitiesLoading,
  opportunityFilter,
  opportunitySubject,
  platforms,
  postTypeId,
  marketingOpportunity,
  marketingAssets = { items: [], loading: false, error: '' },
  marketingServices,
  profile,
  recentDrafts = [],
  saving,
  tenantId,
  userDisplayName,
  userId,
  visibleOpportunities,
  onOpenDraft,
  onOpenDrafts,
  onWorkingOnChange,
}) {
  const [composerValue, setComposerValue] = useState('');
  const [conversation, setConversation] = useState([]);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [routing, setRouting] = useState(false);
  const [onboardingState, setOnboardingState] = useState(() => loadGrowthAIOnboardingState({ tenantId, userId }));
  const [guideOpen, setGuideOpen] = useState(() => onboardingState.status === 'not_started' || onboardingState.status === 'in_progress');
  const [guideMode, setGuideMode] = useState(() => onboardingState.status === 'not_started' ? 'welcome' : 'tour');
  const [guideStep, setGuideStep] = useState(() => onboardingState.step || 0);
  const messageSequence = useRef(0);
  const routerRequestSequence = useRef(0);
  const mountedRef = useRef(true);
  const conversationStreamRef = useRef(null);
  const conversationNearBottomRef = useRef(true);
  const firstName = safeFirstName(userDisplayName);
  const greeting = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;
  const currentContext = useMemo(() => currentContextFor({
    activeOpportunities,
    activeWorkflow,
    customerCommunicationIntent,
    marketingOpportunity,
    opportunitySubject,
  }), [activeOpportunities, activeWorkflow, customerCommunicationIntent, marketingOpportunity, opportunitySubject]);

  useEffect(() => {
    onWorkingOnChange?.(currentContext?.label || '');
  }, [currentContext?.label, onWorkingOnChange]);

  const nextMessageId = prefix => `${prefix}-${++messageSequence.current}`;
  const appendMessages = additions => {
    setConversation(current => appendBoundedGrowthAIMessages(current, additions));
  };

  const appendSavedDraftResult = (result, fallbackLabel) => {
    const draft = result?.draft || (result?.id ? result : null);
    if (!mountedRef.current || !draft?.id) return result;
    appendMessages([{
      id: nextMessageId('assistant'),
      role: 'assistant',
      type: 'saved_draft',
      content: fallbackLabel,
      draft,
      creditsCharged: result?.creditsCharged || 0,
      resultRef: { type: 'growthai_draft', id: draft.id },
    }]);
    return result;
  };

  const runDraftActionInline = async (action, fallbackLabel) => {
    const result = await action();
    return appendSavedDraftResult(result, fallbackLabel);
  };

  const persistOnboarding = nextState => {
    const saved = saveGrowthAIOnboardingState({ tenantId, userId, state: nextState });
    setOnboardingState(saved);
    return saved;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      routerRequestSequence.current += 1;
    };
  }, []);

  useLayoutEffect(() => {
    const stream = conversationStreamRef.current;
    if (!stream || !conversationNearBottomRef.current) return;
    stream.scrollTop = stream.scrollHeight;
  }, [activeWorkflow?.messageId, conversation, guideOpen]);

  useEffect(() => {
    const stream = conversationStreamRef.current;
    if (!stream || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => {
      if (conversationNearBottomRef.current) stream.scrollTop = stream.scrollHeight;
    });
    observer.observe(stream, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const appendClarification = userText => {
    const messages = [
      {
        id: nextMessageId('assistant'),
        role: 'assistant',
        type: 'result',
        content: 'Do you want help with marketing, a customer reply, or today\'s business?',
        actions: ['marketing', 'customer_response', 'business_briefing'],
      },
    ];
    if (userText) messages.unshift({ id: nextMessageId('user'), role: 'user', type: 'text', content: userText });
    appendMessages(messages);
    setActiveWorkflow(null);
  };

  const openCapability = (requestedCapabilityType, userText, context = {}) => {
    const skill = getGrowthAISkill(requestedCapabilityType) || getGrowthAISkillForWorkflow(requestedCapabilityType);
    const capabilityType = skill?.workflowId || requestedCapabilityType;
    if (capabilityType === 'help' || capabilityType === 'unknown') {
      appendMessages([
        { id: nextMessageId('user'), role: 'user', type: 'text', content: userText },
        {
          id: nextMessageId('assistant'),
          role: 'assistant',
          type: 'result',
          content: capabilityType === 'help'
            ? 'I can help with an estimate, review growth opportunities, create marketing drafts, prepare customer responses, or update SLAI brand preferences.'
            : 'I can currently help with an estimate, review growth opportunities, create marketing, or prepare customer responses. Choose an option below or tell me which one you\'d like to work on.',
          actions: ['estimate_assistance', 'marketing', 'customer_response', 'opportunities'],
        },
      ]);
      setActiveWorkflow(null);
      return;
    }

    if (!skill || !CAPABILITY_RESPONSES[capabilityType]) {
      appendClarification(userText);
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
    setActiveWorkflow({ messageId: capabilityMessage.id, capabilityType, skillId: skill.id, context });
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
      content: 'No problem. You can reopen the SLAI Assistant guide anytime. I am ready when you are.',
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

  const submitComposer = async event => {
    event.preventDefault();
    const input = composerValue.trim();
    if (!input) return;
    setComposerValue('');
    const route = routeGrowthAIConversation(input, {
      activeSkillId: activeWorkflow?.skillId || '',
      hasVisibleOpportunity: visibleOpportunities.length > 0,
    });
    if (route.kind === 'route') {
      openCapability(route.skillId, input);
      return;
    }
    if (route.kind === 'help') {
      openCapability('help', input);
      return;
    }
    if (route.kind === 'contextual') {
      if (route.context === 'first_opportunity') {
        const firstOpportunity = visibleOpportunities[0];
        const handoff = firstOpportunity && onStartFirstOpportunity?.(firstOpportunity);
        if (handoff?.workflowId) {
          openCapability(handoff.workflowId, input, { focusedOpportunityId: handoff.focusedOpportunityId || null });
        } else {
          appendMessages([
            { id: nextMessageId('user'), role: 'user', type: 'text', content: input },
            { id: nextMessageId('assistant'), role: 'assistant', type: 'result', content: 'That opportunity is no longer available. Refresh opportunities and choose one to review.' },
          ]);
        }
        return;
      }
      appendMessages([
        { id: nextMessageId('user'), role: 'user', type: 'text', content: input },
        {
          id: nextMessageId('assistant'),
          role: 'assistant',
          type: 'result',
          content: route.context === 'writing_refinement'
            ? 'I\'ll keep this in your current marketing workflow. Review the draft controls before creating or saving anything.'
            : 'I\'ll keep the current tenant opportunities in view. Choose the first item you want to review before preparing a draft.',
        },
      ]);
      return;
    }

    if (typeof onResolveAmbiguousIntent !== 'function') {
      appendClarification(input);
      return;
    }
    const requestId = ++routerRequestSequence.current;
    setRouting(true);
    appendMessages([{ id: nextMessageId('user'), role: 'user', type: 'text', content: input }]);
    try {
      const result = await onResolveAmbiguousIntent({ message: input });
      if (!mountedRef.current || requestId !== routerRequestSequence.current) return;
      const resolvedRoute = normalizeGrowthAIRouterResult(result);
      if (resolvedRoute) {
        const capabilityMessage = {
          id: nextMessageId('assistant'),
          role: 'assistant',
          type: 'capability',
          content: CAPABILITY_RESPONSES[resolvedRoute.workflowId],
          capabilityType: resolvedRoute.workflowId,
          resultRef: { type: 'growthai_capability', id: resolvedRoute.skillId },
        };
        appendMessages([capabilityMessage]);
        setActiveWorkflow({ messageId: capabilityMessage.id, capabilityType: resolvedRoute.workflowId, skillId: resolvedRoute.skillId });
      } else {
        appendClarification('');
      }
    } catch {
      if (mountedRef.current && requestId === routerRequestSequence.current) appendClarification('');
    } finally {
      if (mountedRef.current && requestId === routerRequestSequence.current) setRouting(false);
    }
  };

  const renderWorkflow = capabilityType => {
    if (capabilityType === 'business_briefing') {
      return <BusinessBriefing briefing={briefing} headingId="growth-ai-business-briefing-workflow" loading={briefingLoading} onOpenCapability={openCapability} />;
    }
    if (capabilityType === 'estimate_assistance') {
      return <EstimateAssistanceWorkflow creditPresentation={creditPresentation} aiGenerating={aiGenerating} estimates={eligibleEstimateLeads} onAnalyze={onAIEstimateAssistance} saving={saving} />;
    }
    if (capabilityType === 'marketing') {
      return <MarketingWorkflow {...{
        aiGenerating, brand, contentIdeas, contentPlan, creditPresentation, inputs,
        marketingAssets, marketingOpportunity, marketingServices, onInputChange, onMarketingOpportunityChange, onPostTypeChange,
        onPrefillIdea, onStartMarketingPlan, onToggleMarketingAsset, platforms, postTypeId, saving,
      }}
        onGenerateDeterministic={() => runDraftActionInline(onGenerateDeterministic, 'Your Marketing draft is saved and ready for review.')}
        onGenerateMarketingAI={() => runDraftActionInline(onGenerateMarketingAI, 'Your AI-assisted Marketing draft is saved and ready for review.')}
      />;
    }
    if (capabilityType === 'customer_response') {
      return <CustomerResponseWorkflow
        creditPresentation={creditPresentation}
        aiGenerating={aiGenerating}
        bookings={communicationBookings}
        businessName={businessName}
        leads={communicationLeads}
        onGenerateAI={payload => runDraftActionInline(() => onGenerateResponseAI(payload), 'Your AI-assisted customer message is saved and ready for review.')}
        onSave={draft => runDraftActionInline(() => onSaveResponseDraft(draft), 'Your customer message is saved and ready for review.')}
        customerCommunicationIntent={customerCommunicationIntent}
        saving={saving}
      />;
    }
    if (capabilityType === 'opportunities') {
      return <OpportunitiesWorkflow {...{
        activeOpportunities, creditPresentation, aiGenerating, onDismissOpportunity,
        onOpportunityFilterChange, onRefreshOpportunities, onReviewOpportunityJob,
        onStartRebookingFromOpportunity: opportunity => {
          if (onStartRebookingFromOpportunity(opportunity) !== false) {
            openCapability('customer_response', 'Prepare a rebooking draft');
          }
        },
        onStartReviewRequestFromOpportunity: opportunity => {
          if (onStartReviewRequestFromOpportunity(opportunity) !== false) {
            openCapability('customer_response', 'Prepare a review request');
          }
        },
        onStartMarketingFromOpportunity: opportunity => {
          onStartMarketingFromOpportunity(opportunity);
          openCapability('marketing', 'Create marketing from completed job');
        }, focusedOpportunityId: activeWorkflow?.context?.focusedOpportunityId || null, opportunitiesLoading, opportunityFilter, opportunitySubject, saving,
        visibleOpportunities,
      }}
        onAIEstimateFollowUp={opportunity => runDraftActionInline(() => onAIEstimateFollowUp(opportunity), 'Your AI-assisted estimate follow-up is saved and ready for review.')}
        onDraftEstimateFollowUp={opportunity => runDraftActionInline(() => onDraftEstimateFollowUp(opportunity), 'Your estimate follow-up is saved and ready for review.')}
      />;
    }
    if (capabilityType === 'brand') {
      return <BrandPreferencesWorkflow brandContext={brandContext} onProfileChange={onProfileChange} onSaveProfile={onSaveProfile} profile={profile} saving={saving} />;
    }
    return null;
  };

  const opportunityMessage = opportunitiesLoading
    ? 'I\'m checking ServicesOS for current growth opportunities.'
    : activeOpportunities.length > 0
      ? `I found ${activeOpportunities.length} ${activeOpportunities.length === 1 ? 'thing' : 'things'} worth reviewing.`
      : 'You\'re caught up right now. I don\'t see any SLAI opportunities that need attention.';

  const summaryChips = [
    briefing.wins.length ? { label: 'Completed today', value: briefing.wins.length } : null,
    { label: 'Needs attention', value: briefing.needsAttention.length },
    { label: 'Open opportunities', value: activeOpportunities.length },
    { label: 'Drafts needing review', value: recentDrafts.filter(draft => draft.status === 'needs_review').length },
  ].filter(Boolean);

  const openQuickAction = action => {
    if (action.filter) onOpportunityFilterChange(action.filter);
    openCapability(action.id, action.label);
  };

  return (
    <div className="growth-ai-home">
      <div className="growth-ai-home-main">
        <section className="growth-ai-welcome" aria-labelledby="growth-ai-home-title">
          <p className="growth-ai-greeting">{greeting}</p>
          <h2 id="growth-ai-home-title">What does your business need today?</h2>
          <div className="growth-ai-summary-chips" aria-label="Business summary">
            {summaryChips.map(chip => <span key={chip.label}><strong>{chip.value}</strong>{chip.label}</span>)}
          </div>
          <div className="growth-ai-suggested-actions" aria-label="SLAI Assistant quick actions">
            {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              type="button"
              aria-pressed={activeWorkflow?.capabilityType === action.id && (!action.filter || opportunityFilter === action.filter)}
              onClick={() => openQuickAction(action)}
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
              SLAI Assistant guide
            </button>
          </div>
        </section>

        <section className="growth-ai-conversation" aria-labelledby="growth-ai-conversation-title">
          <h2 id="growth-ai-conversation-title" className="growth-ai-visually-hidden">SLAI Assistant conversation</h2>
          <div
            ref={conversationStreamRef}
            className="growth-ai-conversation-stream"
            data-scroll-region="conversation-history"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            onScroll={event => {
              const stream = event.currentTarget;
              conversationNearBottomRef.current = stream.scrollHeight - stream.scrollTop - stream.clientHeight <= 48;
            }}
          >
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
              <ConversationMessage message={{ id: 'business-briefing', role: 'assistant', type: 'result', content: 'Here is your current business briefing from ServicesOS.' }}>
                <BusinessBriefing briefing={briefing} headingId="growth-ai-business-briefing-home" loading={briefingLoading} onOpenCapability={openCapability} />
              </ConversationMessage>
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
                    const skill = getGrowthAISkill(actionId);
                    const label = action?.label || skill?.label;
                    return label ? <button key={actionId} type="button" onClick={() => openCapability(actionId, label)}>{label}</button> : null;
                  })}
                </div>
              ) : null}
              {activeWorkflow?.messageId === message.id ? renderWorkflow(activeWorkflow.capabilityType) : null}
              {message.type === 'saved_draft' ? (
                <SavedDraftResultCard
                  creditsCharged={message.creditsCharged}
                  draft={message.draft}
                  onOpenDraft={onOpenDraft}
                />
              ) : null}
            </ConversationMessage>
          ))}
        </div>

          <form className="growth-ai-composer" aria-label="Ask SLAI Assistant" onSubmit={submitComposer}>
            <label htmlFor="growth-ai-composer-input" className="growth-ai-visually-hidden">Ask SLAI Assistant anything</label>
          <textarea
            id="growth-ai-composer-input"
            aria-label="Ask SLAI Assistant anything"
            rows="1"
            value={composerValue}
            onChange={event => setComposerValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask SLAI Assistant anything..."
          />
          <button type="submit" disabled={!composerValue.trim() || routing}>{routing ? 'Choosing...' : 'Send'}</button>
          </form>
        </section>
      </div>
      <SLAIContextRail
        activeOpportunities={activeOpportunities}
        context={currentContext}
        drafts={recentDrafts}
        onOpenCapability={openCapability}
        onOpenDrafts={onOpenDrafts}
        onStartMarketingFromOpportunity={onStartMarketingFromOpportunity}
        onStartRebookingFromOpportunity={onStartRebookingFromOpportunity}
        onStartReviewRequestFromOpportunity={onStartReviewRequestFromOpportunity}
      />
    </div>
  );
}
