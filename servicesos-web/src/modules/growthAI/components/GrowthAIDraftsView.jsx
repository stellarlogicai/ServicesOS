import {
  GrowthAIButton,
  GrowthAICopyButton,
  GrowthAIField,
  GrowthAISurface,
} from './GrowthAIPrimitives';
import { formatGrowthAITimestamp, growthAIStatusLabel } from '../growthAIViewFormatters';
import { describeGrowthAIDraft } from '../growthAIDraftPresentation';

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
  presentationContext,
  saving,
}) {
  const updateContent = patch => onEditorChange({ content: { ...editor.content, ...patch } });
  const editorPresentation = describeGrowthAIDraft(editor, presentationContext);
  const hasEditorContent = Boolean(editor.id || editor.title || editor.content.fullCaption);
  const marketingDraft = editor.actionType === 'marketing_post';

  return (
    <div className="growth-ai-drafts-layout">
      <GrowthAISurface className="growth-ai-draft-library" as="section">
        <div className="growth-ai-section-heading">
          <div>
            <span className="growth-ai-section-kicker">Human review queue</span>
            <h2>Drafts to review</h2>
            <p>Saved content stays here until an owner reviews and approves it.</p>
          </div>
          <strong className="growth-ai-count">{drafts.length}</strong>
        </div>
        {drafts.length === 0 ? <p className="growth-ai-empty">No drafts need your attention yet.</p> : null}
        <div className="growth-ai-draft-list">
          {drafts.map(draft => {
            const presentation = describeGrowthAIDraft(draft, presentationContext);
            const draftTitle = draft.title || presentation.typeLabel;
            const draftStatus = ['draft', 'needs_review', 'approved'].includes(draft.status) ? draft.status : 'draft';
            return <button
              type="button"
              key={draft.id || draftTitle}
              className="growth-ai-draft-item"
              aria-current={editor.id === draft.id ? 'true' : undefined}
              aria-label={`Review ${presentation.typeLabel}: ${draftTitle}`}
              onClick={() => onSelectDraft(draft)}
            >
              <strong>{draftTitle}</strong>
              <span className={`growth-ai-state growth-ai-state-${draftStatus}`}>{presentation.statusLabel}</span>
              <span>{presentation.typeLabel} · {presentation.source.label}{presentation.source.detail ? ` · ${presentation.source.detail}` : ''}</span>
              <span>Updated {formatGrowthAITimestamp(draft.updatedAt)}</span>
            </button>
          })}
        </div>
      </GrowthAISurface>

      <GrowthAISurface className="growth-ai-draft-editor" as="section">
        <div className="growth-ai-section-heading">
          <div>
            <span className="growth-ai-section-kicker">Draft workspace</span>
            <h2>{hasEditorContent ? 'Review draft' : 'Choose a draft to review'}</h2>
            <p>{hasEditorContent ? 'Material edits to approved content clear approval and require review again.' : 'Select a saved draft to review its content and current status.'}</p>
          </div>
          {hasEditorContent ? <span className={`growth-ai-state growth-ai-state-${editor.status}`}>{growthAIStatusLabel(editor.status)}</span> : null}
        </div>
        {!hasEditorContent ? <p className="growth-ai-empty">Draft details will appear here after you choose one from the review queue.</p> : null}
        {hasEditorContent ? <><div className="growth-ai-draft-context" aria-label="Draft context">
          <span>Source</span>
          <strong>{editorPresentation.source.label}</strong>
          {editorPresentation.source.detail ? <p>{editorPresentation.source.detail}</p> : null}
          {editorPresentation.source.unavailable ? <p>The linked record is unavailable. This draft remains unchanged.</p> : null}
        </div>
        <div className="growth-ai-form-stack">
          <div className="growth-ai-form-grid">
            <GrowthAIField label="Pillar">
              <select aria-label="Pillar" value={editor.pillar} onChange={event => onEditorChange({ pillar: event.target.value })}>
                {pillars.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </GrowthAIField>
            <GrowthAIField label="Draft type"><input aria-label="Draft type" value={editorPresentation.typeLabel} readOnly /></GrowthAIField>
          </div>
          <GrowthAIField label="Title"><input aria-label="Draft title" value={editor.title} onChange={event => onEditorChange({ title: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Full caption"><textarea aria-label="Full caption" rows="9" value={editor.content.fullCaption} onChange={event => updateContent({ fullCaption: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Short caption"><textarea aria-label="Short caption" rows="3" value={editor.content.shortCaption} onChange={event => updateContent({ shortCaption: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Call to action"><input aria-label="Call to action" value={editor.content.callToAction} onChange={event => updateContent({ callToAction: event.target.value })} /></GrowthAIField>
          <GrowthAIField label="Hashtags"><input aria-label="Hashtags" value={editor.content.hashtags} onChange={event => updateContent({ hashtags: event.target.value })} /></GrowthAIField>
          {!marketingDraft ? <GrowthAIField label="Image prompt"><textarea aria-label="Image prompt" rows="3" value={editor.content.imagePrompt} onChange={event => updateContent({ imagePrompt: event.target.value })} /></GrowthAIField> : null}
        </div>
        <div className="growth-ai-actions growth-ai-copy-actions">
          <GrowthAICopyButton label="Copy full caption" text={editor.content.fullCaption} />
          <GrowthAICopyButton label="Copy short caption" text={editor.content.shortCaption} />
          <GrowthAICopyButton label="Copy call to action" text={editor.content.callToAction} />
          <GrowthAICopyButton label="Copy hashtags" text={editor.content.hashtags} />
          {!marketingDraft ? <GrowthAICopyButton label="Copy image prompt" text={editor.content.imagePrompt} /> : null}
        </div>
        <div className="growth-ai-actions growth-ai-review-actions">
          <GrowthAIButton onClick={onSaveDraft} disabled={saving || !editor.content.fullCaption}>Save {editor.id ? 'changes' : 'as new draft'}</GrowthAIButton>
          {editor.id && editor.status === 'draft' ? <GrowthAIButton tone="secondary" disabled={saving} onClick={onSubmitForReview}>Submit for review</GrowthAIButton> : null}
          {editor.id && editor.status === 'needs_review' ? <GrowthAIButton tone="success" disabled={saving} onClick={onApprove}>Approve</GrowthAIButton> : null}
          {editor.id && ['needs_review', 'approved'].includes(editor.status) ? <GrowthAIButton tone="secondary" disabled={saving} onClick={onReturnToDraft}>Return to draft</GrowthAIButton> : null}
        </div>
        {editor.status === 'approved' ? (
          <p className="growth-ai-approval-note">Approved {formatGrowthAITimestamp(editor.approvedAt)}. This approval is internal only; nothing was sent or published.</p>
        ) : null}
        </> : null}
      </GrowthAISurface>
    </div>
  );
}
