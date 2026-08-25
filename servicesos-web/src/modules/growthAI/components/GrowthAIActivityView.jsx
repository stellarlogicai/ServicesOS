import { formatGrowthAITimestamp, growthAIStatusLabel } from '../growthAIViewFormatters';
import { GrowthAISurface } from './GrowthAIPrimitives';

const ACTION_LABELS = Object.freeze({
  draft_created: 'Draft created',
  draft_edited: 'Draft edited',
  submitted_for_review: 'Submitted for review',
  approved: 'Approved for internal use',
  approval_invalidated: 'Approval cleared after content changed',
  returned_to_draft: 'Returned to draft',
});

function humanizeAction(action) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const normalized = typeof action === 'string' ? action.replaceAll('_', ' ').trim() : '';
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : 'Draft activity';
}

export default function GrowthAIActivityView({ audit, editor }) {
  return (
    <div className="growth-ai-activity-layout">
      <section className="growth-ai-activity-intro" aria-labelledby="growth-ai-activity-title">
        <span className="growth-ai-eyebrow">Selected draft history</span>
        <h2 id="growth-ai-activity-title">Activity you can read and verify</h2>
        <p>This view contains the immutable audit history for the selected draft only. It is not a tenant-wide GrowthAI activity feed.</p>
      </section>

      <GrowthAISurface className="growth-ai-activity" as="section">
        <div className="growth-ai-section-heading">
          <div>
            <span className="growth-ai-section-kicker">Current selection</span>
            <h2>{editor.id ? editor.title || 'Untitled draft' : 'No draft selected'}</h2>
            {editor.id ? <p>{growthAIStatusLabel(editor.status)} · {editor.actionType}</p> : null}
          </div>
        </div>

        {!editor.id ? <p className="growth-ai-empty">Open Drafts and select a draft to view its activity.</p> : null}
        {editor.id && audit.length === 0 ? <p className="growth-ai-empty">No audit entries loaded for this draft.</p> : null}
        <ol className="growth-ai-activity-list">
          {audit.map(entry => (
            <li key={entry.id}>
              <span className="growth-ai-activity-marker" aria-hidden="true" />
              <div>
                <strong>{humanizeAction(entry.action)}</strong>
                <p>
                  {entry.fromStatus ? growthAIStatusLabel(entry.fromStatus) : 'No prior status'} to {growthAIStatusLabel(entry.toStatus)}
                </p>
                <time>{formatGrowthAITimestamp(entry.timestamp)}</time>
              </div>
            </li>
          ))}
        </ol>
      </GrowthAISurface>
    </div>
  );
}
