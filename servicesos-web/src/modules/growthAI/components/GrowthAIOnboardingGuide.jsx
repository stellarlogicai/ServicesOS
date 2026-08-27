import './GrowthAIOnboardingGuide.css';

const SLAI_ASSISTANT_GUIDE_STEPS = Object.freeze([
  {
    title: 'Meet SLAI Assistant',
    body: 'SLAI Assistant is your Business Assistant for ServicesOS. Ask what needs attention or ask for help preparing business work. ServicesOS stays the source of truth, and you stay in control of important decisions.',
    note: 'SLAI notices. SLAI suggests. You approve. ServicesOS records.',
  },
  {
    title: 'Start your day',
    body: 'Ask, “What needs my attention today?” SLAI can show your business briefing, estimate follow-ups, rebooking opportunities, and review-request opportunities that ServicesOS already knows about.',
    note: 'Briefings and opportunity detection are free. SLAI does not monitor external review sites.',
  },
  {
    title: 'Act on opportunities',
    body: 'Ask, “Help me with the first one,” “Who needs to rebook?” or “Help me follow up on this estimate.” SLAI uses the work you can see to prepare the next step in a controlled workflow.',
    note: 'SLAI can prepare rebooking, review-request, estimate follow-up, and customer communication work. You decide whether anything happens next.',
  },
  {
    title: 'Create and communicate',
    body: 'Prepare customer messages, marketing posts, content plans, and review responses. SLAI uses your approved Brand settings, and management-approved photos can be selected for marketing drafts.',
    note: 'Planning and deterministic drafts can be free. AI generation is always an explicit 1-credit choice, and generated content stays a draft.',
  },
  {
    title: 'Review your work',
    body: 'Use Drafts to review prepared content and Activity to understand meaningful business history. Draft, Needs Review, and Approved show where a piece of work stands.',
    note: 'Approved means you reviewed the content. It does not mean sent, published, booked, charged, or executed.',
  },
  {
    title: 'Understand AI credits',
    body: 'Your business has 100 AI credits included each month. Your AI Credits card shows the current balance and renewal date. Opening SLAI, asking for a briefing, navigating, and reviewing drafts never spend credits.',
    note: 'Provider-backed estimate help, marketing generation, and AI message improvements use 1 credit only after you explicitly choose them.',
  },
]);

export default function GrowthAIOnboardingGuide({
  businessName,
  mode,
  onNext,
  onSkip,
  onStart,
  step,
}) {
  if (mode === 'welcome') {
    return (
      <article className="growth-ai-onboarding" aria-labelledby="growth-ai-onboarding-title">
        <div className="growth-ai-onboarding-mark" aria-hidden="true">✦</div>
        <div className="growth-ai-onboarding-content">
          <span className="growth-ai-onboarding-eyebrow">First time here?</span>
          <h3 id="growth-ai-onboarding-title">Welcome to SLAI Assistant.</h3>
          <p>
            SLAI helps you see what needs attention, prepare the next step, and stay in control of {businessName}.
          </p>
          <p>As your Business Assistant for ServicesOS, I work from the business information you have configured. Want a quick introduction?</p>
          <div className="growth-ai-onboarding-actions">
            <button type="button" className="growth-ai-onboarding-primary" onClick={onStart}>Show me around</button>
            <button type="button" className="growth-ai-onboarding-secondary" onClick={onSkip}>I'll explore myself</button>
          </div>
          <small>This guide is free and never uses AI credits.</small>
        </div>
      </article>
    );
  }

  const safeStep = Math.min(Math.max(step, 0), SLAI_ASSISTANT_GUIDE_STEPS.length - 1);
  const guideStep = SLAI_ASSISTANT_GUIDE_STEPS[safeStep];
  const finalStep = safeStep === SLAI_ASSISTANT_GUIDE_STEPS.length - 1;

  return (
    <article className="growth-ai-onboarding" aria-labelledby="growth-ai-onboarding-step-title">
      <div className="growth-ai-onboarding-mark" aria-hidden="true">✦</div>
      <div className="growth-ai-onboarding-content">
        <div className="growth-ai-onboarding-progress">
          <span>SLAI Assistant guide</span>
          <span>{safeStep + 1} of {SLAI_ASSISTANT_GUIDE_STEPS.length}</span>
        </div>
        <div className="growth-ai-onboarding-progress-track" aria-hidden="true">
          <span style={{ width: `${((safeStep + 1) / SLAI_ASSISTANT_GUIDE_STEPS.length) * 100}%` }} />
        </div>
        <h3 id="growth-ai-onboarding-step-title">{guideStep.title}</h3>
        <p>{guideStep.body}</p>
        <p className="growth-ai-onboarding-note">{guideStep.note}</p>
        <div className="growth-ai-onboarding-actions">
          <button type="button" className="growth-ai-onboarding-primary" onClick={onNext}>
            {finalStep ? 'Start using SLAI Assistant' : 'Next'}
          </button>
          <button type="button" className="growth-ai-onboarding-secondary" onClick={onSkip}>
            {finalStep ? 'Close guide' : 'Skip guide'}
          </button>
        </div>
      </div>
    </article>
  );
}
