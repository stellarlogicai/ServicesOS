import {
  GrowthAIButton,
  GrowthAICopyButton,
  GrowthAIField,
  GrowthAISurface,
} from './GrowthAIPrimitives';
import { formatGrowthAITimestamp, growthAIStatusLabel } from '../growthAIViewFormatters';

export default function GrowthAIDraftsView({
  drafts,
  editor,
  onApprove,
  onEditorChange,
  onReturnToDraft,
  onSaveDraft,
  onSelectDraft,
  onSubmitForReview,
  pillars,
  saving,
}) {
  const updateContent = patch => onEditorChange({ content: { ...editor.content, ...patch } });

  return (
    <div className="growth-ai-drafts-layout">
      <GrowthAISurface className="growth-ai-draft-library" as="section">
        <div className="growth-ai-section-heading">
          <div>
            <span className="growth-ai-section-kicker">Human review queue</span>
            <h2>Tenant drafts</h2>
            <p>AI-assisted and deterministic content saved for this tenant.</p>
          </div>
          <strong className="growth-ai-count">{drafts.length}</strong>
        </div>
        {drafts.length === 0 ? <p className="growth-ai-empty">No tenant drafts saved yet.</p> : null}
        <div className="growth-ai-draft-list">
          {drafts.map(draft => (
            <button
              type="button"
              key={draft.id}
              className="growth-ai-draft-item"
              aria-current={editor.id === draft.id ? 'true' : undefined}
              onClick={() => onSelectDraft(draft)}
            >
              <strong>{draft.title}</strong>
              <span>{growthAIStatusLabel(draft.status)} · {draft.pillar} · v{draft.version}</span>
            </button>
          ))}
        </div>
      </GrowthAISurface>

      <GrowthAISurface className="growth-ai-draft-editor" as="section">
        <div className="growth-ai-section-heading">
          <div>
            <span className="growth-ai-section-kicker">Draft workspace</span>
            <h2>Draft editor</h2>
            <p>Material edits to approved content clear approval and require review again.</p>
          </div>
          <span className={`growth-ai-state growth-ai-state-${editor.status}`}>{growthAIStatusLabel(editor.status)}</span>
        </div>
        <div className="growth-ai-form-stack">
          <div className="growth-ai-form-grid">
            <GrowthAIField label="Pillar">
              <select aria-label="Pillar" value={editor.pillar} onChange={event => onEditorChange({ pillar: event.target.value })}>
                {pillars.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </GrowthAIField>
            <GrowthAIField label="Action type"><input aria-label="Action type" value={editor.actionType} readOnly /></GrowthAIField>
          </div>
          <GrowthAIField label="Title"><input aria-label="Draft title" value={editor.title} onChange={event => onEditorChange({ title: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Full caption"><textarea aria-label="Full caption" rows="9" value={editor.content.fullCaption} onChange={event => updateContent({ fullCaption: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Short caption"><textarea aria-label="Short caption" rows="3" value={editor.content.shortCaption} onChange={event => updateContent({ shortCaption: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Call to action"><input aria-label="Call to action" value={editor.content.callToAction} onChange={event => updateContent({ callToAction: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Hashtags"><input aria-label="Hashtags" value={editor.content.hashtags} onChange={event => updateContent({ hashtags: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Image prompt"><textarea aria-label="Image prompt" rows="3" value={editor.content.imagePrompt} onChange={event => updateContent({ imagePrompt: event.target.value })} /></GrowthAIField>
        </div>
        <div className="growth-ai-actions growth-ai-copy-actions">
          <GrowthAICopyButton label="Copy full caption" text={editor.content.fullCaption} />
          <GrowthAICopyButton label="Copy short caption" text={editor.content.shortCaption} />
          <GrowthAICopyButton label="Copy call to action" text={editor.content.callToAction} />
          <GrowthAICopyButton label="Copy hashtags" text={editor.content.hashtags} />
          <GrowthAICopyButton label="Copy image prompt" text={editor.content.imagePrompt} />
        </div>
        <div className="growth-ai-actions growth-ai-review-actions">
          <GrowthAIButton onClick={onSaveDraft} disabled={saving || !editor.content.fullCaption}>Save {editor.id ? 'changes' : 'as new draft'}</GrowthAIButton>
          {editor.id && editor.status === 'draft' ? <GrowthAIButton tone="secondary" disabled={saving} onClick={onSubmitForReview}>Submit for review</GrowthAIButton> : null}
          {editor.id && editor.status === 'needs_review' ? <GrowthAIButton tone="success" disabled={saving} onClick={onApprove}>Approve</GrowthAIButton> : null}
          {editor.id && ['needs_review', 'approved'].includes(editor.status) ? <GrowthAIButton tone="secondary" disabled={saving} onClick={onReturnToDraft}>Return to draft</GrowthAIButton> : null}
        </div>
        {editor.status === 'approved' ? (
          <p className="growth-ai-approval-note">Approved by {editor.approvedByUid} at {formatGrowthAITimestamp(editor.approvedAt)}. This approval is internal only.</p>
        ) : null}
      </GrowthAISurface>
    </div>
  );
}
