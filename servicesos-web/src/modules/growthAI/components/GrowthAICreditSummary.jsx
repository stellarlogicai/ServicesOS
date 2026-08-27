export default function GrowthAICreditSummary({ presentation }) {
  const state = presentation || { status: 'unavailable', available: null, renewalLabel: '' };

  return (
    <section
      className="growth-ai-credit-summary"
      data-credit-state={state.status}
      aria-label="AI credit balance"
      aria-live="polite"
    >
      <span className="growth-ai-credit-mark" aria-hidden="true">✦</span>
      <div className="growth-ai-credit-copy">
        <span className="growth-ai-credit-label">AI Credits</span>
        {state.status === 'loading' ? (
          <strong>Loading balance...</strong>
        ) : state.status === 'unavailable' ? (
          <>
            <strong>Balance unavailable</strong>
            <small>AI generation is paused. Free ServicesOS intelligence remains available.</small>
          </>
        ) : (
          <>
            <strong>{state.available} remaining</strong>
            <small>{state.monthlyAllowance} included each month · Renews {state.renewalLabel}</small>
            {state.reserved > 0 ? <small>{state.reserved} currently reserved</small> : null}
            {state.available === 0 ? (
              <small className="growth-ai-credit-zero-note">No AI credits remain. Free ServicesOS intelligence still works.</small>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
