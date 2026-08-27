import { useState } from 'react';
import GrowthAICreditSummary from './GrowthAICreditSummary';

const WORKSPACE_VIEWS = Object.freeze([
  { id: 'home', label: 'Home' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'activity', label: 'Activity' },
]);

export default function GrowthAIWorkspaceShell({
  activeView,
  children,
  creditPresentation,
  draftCount,
  error,
  message,
  onNewConversation,
  onViewChange,
  workingOn,
}) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
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
    setMobileNavigationOpen(false);
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
            <h1>SLAI Assistant</h1>
            <p>Business Assistant for ServicesOS</p>
          </div>
        </div>
        <button
          type="button"
          className="growth-ai-mobile-rail-toggle"
          aria-label="Open SLAI Assistant navigation"
          aria-controls="slai-assistant-navigation"
          aria-expanded={mobileNavigationOpen}
          onClick={() => setMobileNavigationOpen(open => !open)}
        >
          Menu
        </button>
      </header>

      <div className="growth-ai-shell">
        {mobileNavigationOpen ? <button type="button" className="growth-ai-mobile-rail-scrim" aria-label="Close SLAI Assistant navigation" onClick={() => setMobileNavigationOpen(false)} /> : null}
        <aside id="slai-assistant-navigation" className={`growth-ai-left-rail${mobileNavigationOpen ? ' is-open' : ''}`} aria-label="SLAI Assistant navigation">
          <div className="growth-ai-left-rail-brand">
            <span>ServicesOS</span>
            <strong>SLAI Assistant</strong>
            <small>Business Assistant for ServicesOS</small>
          </div>
          <button
            type="button"
            className="growth-ai-new-conversation"
            onClick={() => {
              onNewConversation?.();
              setMobileNavigationOpen(false);
            }}
          >
            New conversation
          </button>
          <nav className="growth-ai-section-nav" aria-label="SLAI Assistant workspace views">
            <div role="tablist" aria-label="SLAI Assistant workspace">
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
                  onClick={() => {
                    onViewChange(view.id);
                    setMobileNavigationOpen(false);
                  }}
                  onKeyDown={event => selectAdjacentTab(event, view.id)}
                >
                  {view.label}
                  {view.id === 'drafts' && draftCount > 0 ? <span className="growth-ai-tab-count" aria-hidden="true">{draftCount}</span> : null}
                </button>
              ))}
            </div>
          </nav>
          <section className="growth-ai-working-on" aria-labelledby="growth-ai-working-on-title">
            <span id="growth-ai-working-on-title">Working on</span>
            <strong>{workingOn || 'Nothing selected'}</strong>
            <small>{workingOn ? 'Current context stays in this browser session.' : 'Choose an opportunity or ask SLAI for help.'}</small>
          </section>
          <GrowthAICreditSummary presentation={creditPresentation} />
        </aside>

        <div className="growth-ai-workspace-content">
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
      </div>
    </main>
  );
}
