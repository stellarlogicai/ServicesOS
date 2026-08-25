import { useMemo, useState } from 'react';
import { RESPONSE_CHANNELS, RESPONSE_SCENARIOS, buildResponseTemplate } from '../responseTemplates';
import {
  GrowthAIButton,
  GrowthAICopyButton,
  GrowthAIField,
  GrowthAISurface,
} from './GrowthAIPrimitives';

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
      <p><strong>Why GrowthAI surfaced this:</strong> {opportunity.detectionReason}</p>
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

function CustomerResponseHelper({ aiCredits, aiGenerating, businessName, onGenerateAI, onSave, saving }) {
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
    <GrowthAISurface className="growth-ai-tool">
      <div className="growth-ai-section-heading">
        <div>
          <span className="growth-ai-section-kicker">Follow up</span>
          <h2>Customer response helper</h2>
        </div>
        <span className="growth-ai-free-label">Free template</span>
      </div>
      <p className="growth-ai-section-description">
        Private deterministic templates. Nothing is sent automatically; review and edit before sending manually.
      </p>
      <div className="growth-ai-form-stack">
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
        {aiCredits < 1 ? <p className="growth-ai-credit-warning">Not enough AI credits. Deterministic response templates remain available.</p> : null}
      </div>
    </GrowthAISurface>
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
  visibleOpportunities,
}) {
  return (
    <div className="growth-ai-home">
      <section className="growth-ai-welcome" aria-labelledby="growth-ai-home-title">
        <span className="growth-ai-eyebrow">Your business growth workspace</span>
        <h2 id="growth-ai-home-title">Here's what GrowthAI can help you review today.</h2>
        <p>Review deterministic opportunities, prepare private drafts, and keep every consequential action under human control.</p>
        <div className="growth-ai-quick-actions" aria-label="Available GrowthAI tools">
          <a href="#growth-ai-opportunities">Review opportunities</a>
          <a href="#growth-ai-marketing">Create marketing</a>
          <a href="#growth-ai-responses">Follow up</a>
          <a href="#growth-ai-brand">Brand preferences</a>
        </div>
      </section>

      <GrowthAISurface className="growth-ai-opportunities" as="section">
        <div className="growth-ai-section-heading" id="growth-ai-opportunities">
          <div>
            <span className="growth-ai-section-kicker">GrowthAI noticed</span>
            <h2>Opportunities worth reviewing</h2>
            <p>Deterministic ServicesOS signals only. GrowthAI does not contact customers or publish content.</p>
          </div>
          <strong className="growth-ai-count">{activeOpportunities.length} {activeOpportunities.length === 1 ? 'opportunity' : 'opportunities'}</strong>
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
        {opportunitiesLoading && activeOpportunities.length === 0 ? <p className="growth-ai-empty">Checking tenant records for deterministic opportunities...</p> : null}
        {!opportunitiesLoading && activeOpportunities.length === 0 ? (
          <p className="growth-ai-empty">
            No growth opportunities need attention right now. Estimate follow-ups and completed-job marketing review candidates will appear here. Rebooking detection remains unavailable until ServicesOS has a canonical approved cadence source.
          </p>
        ) : null}
        {!opportunitiesLoading && activeOpportunities.length > 0 && visibleOpportunities.length === 0 ? (
          <p className="growth-ai-empty">No opportunities match this filter.</p>
        ) : null}
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
      </GrowthAISurface>

      <div className="growth-ai-tools-grid">
        <GrowthAISurface className="growth-ai-tool" as="section">
          <div className="growth-ai-section-heading" id="growth-ai-marketing">
            <div>
              <span className="growth-ai-section-kicker">Create marketing</span>
              <h2>Marketing draft helper</h2>
            </div>
            <span className="growth-ai-free-label">Free draft option</span>
          </div>
          <p className="growth-ai-section-description">Start with a deterministic draft or explicitly use one AI credit for AI-assisted generation.</p>
          <div className="growth-ai-form-stack">
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
            <div className="growth-ai-form-grid">
              <GrowthAIField label="Service type"><input aria-label="Service type" value={inputs.serviceType} onChange={event => onInputChange({ serviceType: event.target.value })} /></GrowthAIField>
              <GrowthAIField label="Service area"><input aria-label="Service area" value={inputs.serviceArea} onChange={event => onInputChange({ serviceArea: event.target.value })} /></GrowthAIField>
            </div>
            <GrowthAIField label="Offer"><input aria-label="Offer" value={inputs.offer} onChange={event => onInputChange({ offer: event.target.value })} /></GrowthAIField>
            <GrowthAIField label="Cleaning topic"><input aria-label="Cleaning topic" value={inputs.cleaningTopic} onChange={event => onInputChange({ cleaningTopic: event.target.value })} /></GrowthAIField>
            <GrowthAIField label="Extra notes"><textarea aria-label="Extra notes" rows="2" value={inputs.extraNotes} onChange={event => onInputChange({ extraNotes: event.target.value })} /></GrowthAIField>
            <div className="growth-ai-actions">
              <GrowthAIButton onClick={onGenerateDeterministic}>Create deterministic draft</GrowthAIButton>
              <GrowthAIButton disabled={saving || aiGenerating || aiCredits < 1} onClick={onGenerateMarketingAI}>Generate marketing with AI · 1 credit</GrowthAIButton>
            </div>
            {aiCredits < 1 ? <p className="growth-ai-credit-warning">Not enough AI credits. The deterministic draft builder remains available.</p> : null}
          </div>
          <div className="growth-ai-idea-list" aria-label="Marketing draft ideas">
            {contentIdeas.slice(0, 4).map(idea => <GrowthAIButton key={idea.label} tone="secondary" onClick={() => onPrefillIdea(idea)}>{idea.label}</GrowthAIButton>)}
          </div>
        </GrowthAISurface>

        <div id="growth-ai-responses">
          <CustomerResponseHelper
            aiCredits={aiCredits}
            aiGenerating={aiGenerating}
            businessName={businessName}
            onGenerateAI={onGenerateResponseAI}
            onSave={onSaveResponseDraft}
            saving={saving}
          />
        </div>
      </div>

      <GrowthAISurface className="growth-ai-brand" as="section">
        <div className="growth-ai-section-heading" id="growth-ai-brand">
          <div>
            <span className="growth-ai-section-kicker">Business context</span>
            <h2>Tenant brand preferences</h2>
            <p>Business identity comes from Business Settings. Only GrowthAI-specific preferences are stored here.</p>
          </div>
        </div>
        <div className="growth-ai-brand-grid">
          <GrowthAIField label="Business name"><input aria-label="Business name" value={businessName} readOnly /></GrowthAIField>
          <GrowthAIField label="Brand voice"><input aria-label="Brand voice" value={profile.brandVoice} onChange={event => onProfileChange({ brandVoice: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Content tone"><input aria-label="Content tone" value={profile.contentTone} onChange={event => onProfileChange({ contentTone: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Default call to action"><input aria-label="Default call to action" value={profile.defaultCTA} onChange={event => onProfileChange({ defaultCTA: event.target.value })} /></GrowthAIField>
        </div>
        <div className="growth-ai-actions"><GrowthAIButton onClick={onSaveProfile} disabled={saving}>Save brand preferences</GrowthAIButton></div>
      </GrowthAISurface>
    </div>
  );
}
