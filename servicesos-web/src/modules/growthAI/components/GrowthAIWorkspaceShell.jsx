const WORKSPACE_VIEWS = Object.freeze([
  { id: 'home', label: 'Home' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'activity', label: 'Activity' },
]);

export default function GrowthAIWorkspaceShell({
  activeView,
  children,
  creditBalance,
  creditsLoading,
  draftCount,
  error,
  message,
  onViewChange,
}) {
  const selectAdjacentTab = (event, currentView) => {
    const currentIndex = WORKSPACE_VIEWS.findIndex(view => view.id === currentView);
    let nextIndex;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % WORKSPACE_VIEWS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + WORKSPACE_VIEWS.length) % WORKSPACE_VIEWS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = WORKSPACE_VIEWS.length - 1;
    else return;

    event.preventDefault();
    const nextView = WORKSPACE_VIEWS[nextIndex];
    onViewChange(nextView.id);
    event.currentTarget.parentElement
      ?.querySelector(`[data-growth-ai-view="${nextView.id}"]`)
      ?.focus();
  };

  return (
    <main className="growth-ai-page">
      <header className="growth-ai-header">
        <div className="growth-ai-header-copy">
          <span className="growth-ai-header-mark" aria-hidden="true">✦</span>
          <div>
            <h1>GrowthAI</h1>
            <p>Business growth assistant</p>
          </div>
        </div>
        <div className="growth-ai-credit-summary" aria-label="AI credit balance">
          <span aria-hidden="true">✦</span>
          <strong>{creditsLoading ? 'Loading...' : creditBalance.available}</strong>
          <small>AI credits{creditBalance.reserved > 0 ? ` · ${creditBalance.reserved} reserved` : ''}</small>
        </div>
      </header>

      <div className="growth-ai-shell">
        <nav className="growth-ai-section-nav" aria-label="GrowthAI workspace views">
          <div role="tablist" aria-label="GrowthAI workspace">
            {WORKSPACE_VIEWS.map(view => (
              <button
                key={view.id}
                id={`growth-ai-tab-${view.id}`}
                type="button"
                role="tab"
                data-growth-ai-view={view.id}
                aria-controls={`growth-ai-panel-${view.id}`}
                aria-selected={activeView === view.id}
                tabIndex={activeView === view.id ? 0 : -1}
                onClick={() => onViewChange(view.id)}
                onKeyDown={event => selectAdjacentTab(event, view.id)}
              >
                {view.label}
                {view.id === 'drafts' && draftCount > 0 ? <span className="growth-ai-tab-count" aria-hidden="true">{draftCount}</span> : null}
              </button>
            ))}
          </div>
        </nav>

        {error ? <div className="growth-ai-notice growth-ai-notice-error" role="alert">{error}</div> : null}
        {message ? <div className="growth-ai-notice growth-ai-notice-success" role="status">{message}</div> : null}

        <section
          id={`growth-ai-panel-${activeView}`}
          className="growth-ai-view"
          role="tabpanel"
          aria-labelledby={`growth-ai-tab-${activeView}`}
          tabIndex={0}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
