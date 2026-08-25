import './GrowthAIOnboardingGuide.css';

const GUIDE_STEPS = Object.freeze([
  {
    title: 'Understand your business',
    body: 'GrowthAI works with the business context you already configure in ServicesOS, so you do not have to explain the basics every time you need help.',
    note: 'Business context is tenant-scoped and important actions still require your approval.',
  },
  {
    title: 'Spot useful opportunities',
    body: 'GrowthAI can already surface deterministic signals such as estimates that may need follow-up and completed jobs that may be worth reviewing for marketing.',
    note: 'Reviewing these ServicesOS signals is free and does not use AI credits.',
  },
  {
    title: 'Get help with estimates',
    body: 'ServicesOS keeps your approved pricing rules and deterministic estimate range authoritative. AI Estimate Assistance is being integrated into this workspace as an advisory recommendation for human review.',
    note: 'ServicesOS calculates. GrowthAI assists. You approve the final price.',
  },
  {
    title: 'Create marketing',
    body: 'You can prepare marketing drafts from this conversation. Deterministic drafts are free, and you can explicitly choose AI-assisted generation when you want it.',
    note: 'Nothing is published automatically.',
  },
  {
    title: 'Communicate with customers',
    body: 'GrowthAI can prepare customer response templates and optional AI-assisted drafts while keeping the message private until you review it.',
    note: 'Nothing is sent automatically.',
  },
  {
    title: 'Know when AI credits are used',
    body: 'Opening GrowthAI, using the conversation router, reviewing opportunities, and using deterministic templates are free. Credits are used only when you explicitly choose a paid AI generation or analysis action.',
    note: 'ServicesOS shows the credit cost before a paid AI action runs.',
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
          <h3 id="growth-ai-onboarding-title">Welcome to GrowthAI.</h3>
          <p>
            I can help you understand what is happening in {businessName}, spot opportunities, and prepare the next step while keeping important decisions in your hands.
          </p>
          <p>I already work with the business information you have configured in ServicesOS. Want a quick introduction?</p>
          <div className="growth-ai-onboarding-actions">
            <button type="button" className="growth-ai-onboarding-primary" onClick={onStart}>Show me around</button>
            <button type="button" className="growth-ai-onboarding-secondary" onClick={onSkip}>I'll explore myself</button>
          </div>
          <small>This guide is deterministic and uses no AI credits.</small>
        </div>
      </article>
    );
  }

  const safeStep = Math.min(Math.max(step, 0), GUIDE_STEPS.length - 1);
  const guideStep = GUIDE_STEPS[safeStep];
  const finalStep = safeStep === GUIDE_STEPS.length - 1;

  return (
    <article className="growth-ai-onboarding" aria-labelledby="growth-ai-onboarding-step-title">
      <div className="growth-ai-onboarding-mark" aria-hidden="true">✦</div>
      <div className="growth-ai-onboarding-content">
        <div className="growth-ai-onboarding-progress">
          <span>GrowthAI guide</span>
          <span>{safeStep + 1} of {GUIDE_STEPS.length}</span>
        </div>
        <div className="growth-ai-onboarding-progress-track" aria-hidden="true">
          <span style={{ width: `${((safeStep + 1) / GUIDE_STEPS.length) * 100}%` }} />
        </div>
        <h3 id="growth-ai-onboarding-step-title">{guideStep.title}</h3>
        <p>{guideStep.body}</p>
        <p className="growth-ai-onboarding-note">{guideStep.note}</p>
        <div className="growth-ai-onboarding-actions">
          <button type="button" className="growth-ai-onboarding-primary" onClick={onNext}>
            {finalStep ? 'Start using GrowthAI' : 'Next'}
          </button>
          <button type="button" className="growth-ai-onboarding-secondary" onClick={onSkip}>
            {finalStep ? 'Close guide' : 'Skip guide'}
          </button>
        </div>
      </div>
    </article>
  );
}
