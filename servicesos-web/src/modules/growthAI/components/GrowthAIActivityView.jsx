import { formatGrowthAITimestamp, growthAIStatusLabel } from '../growthAIViewFormatters';
import { describeGrowthAIAuditEntry, describeGrowthAIDraft } from '../growthAIDraftPresentation';
import { GrowthAISurface } from './GrowthAIPrimitives';

export default function GrowthAIActivityView({ audit, editor, currentUserUid, presentationContext }) {
  const draftPresentation = describeGrowthAIDraft(editor, presentationContext);
  return (
    <div className="growth-ai-activity-layout">
      <section className="growth-ai-activity-intro" aria-labelledby="growth-ai-activity-title">
        <span className="growth-ai-eyebrow">Selected draft history</span>
        <h2 id="growth-ai-activity-title">Draft activity</h2>
        <p>A clear history of the current draft. Activity records review decisions; it does not send or publish content.</p>
      </section>

      <GrowthAISurface className="growth-ai-activity" as="section">
        <div className="growth-ai-section-heading">
          <div>
            <span className="growth-ai-section-kicker">Current selection</span>
            <h2>{editor.id ? editor.title || 'Untitled draft' : 'No draft selected'}</h2>
            {editor.id ? <p>{draftPresentation.typeLabel} · {draftPresentation.source.label} · {growthAIStatusLabel(editor.status)}</p> : null}
          </div>
        </div>

        {!editor.id ? <p className="growth-ai-empty">Open Drafts and select a draft to view its activity.</p> : null}
        {editor.id && audit.length === 0 ? <p className="growth-ai-empty">Activity will appear here as this draft is reviewed and updated.</p> : null}
        <ol className="growth-ai-activity-list">
          {audit.map(entry => {
            const presentation = describeGrowthAIAuditEntry(entry, { currentUserUid });
            return <li key={entry.id}>
              <span className="growth-ai-activity-marker" aria-hidden="true" />
              <div>
                <span className="growth-ai-activity-actor">{presentation.actor}</span>
                <strong>{presentation.headline}</strong>
                <p>
                  Status: {entry.fromStatus ? growthAIStatusLabel(entry.fromStatus) : 'New'} to {growthAIStatusLabel(entry.toStatus)}
                </p>
                <time>{formatGrowthAITimestamp(entry.timestamp)}</time>
              </div>
            </li>
          })}
        </ol>
      </GrowthAISurface>
    </div>
  );
}
