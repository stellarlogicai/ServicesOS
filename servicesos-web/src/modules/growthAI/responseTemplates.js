// src/modules/growthAI/responseTemplates.js
/**
 * GrowthAI Phase 0.3 — Customer Response Draft Templates
 *
 * Static local templates only. No AI calls, no customer lookup, no sending,
 * no backend calls, no Firestore persistence.
 */

export const RESPONSE_CHANNELS = [
  { id: 'sms', label: 'SMS' },
  { id: 'facebook', label: 'Facebook message' },
  { id: 'email', label: 'Email' },
  { id: 'general', label: 'General' },
];

export const RESPONSE_SCENARIOS = {
  auntbs: [
    {
      id: 'new-quote-request',
      scenario: 'New quote request reply',
      tone: 'friendly, local, helpful, clear, not pushy',
      title: 'Aunt B response - new quote request',
      subjectLine: 'Thanks for reaching out to Aunt B\'s Cleaning Services',
      messageTemplate:
        'Hi! Thanks so much for reaching out to Aunt B\'s Cleaning Services. I would be happy to help with your cleaning request. Could you send the service address, home size, and what type of clean you are looking for so I can review the details?',
      notes: 'Use when a new cleaning quote request comes in and more context is needed before pricing.',
    },
    {
      id: 'ask-for-more-details',
      scenario: 'Ask for more details',
      tone: 'friendly, clear, helpful',
      title: 'Aunt B response - more details needed',
      subjectLine: 'A few details for your cleaning estimate',
      messageTemplate:
        'Hi! I can definitely take a look. To give you the most accurate estimate, could you send the number of bedrooms and bathrooms, the service address, and any areas you want extra attention on?',
      notes: 'Use when the request is missing enough detail for a useful estimate.',
    },
    {
      id: 'pricing-explanation',
      scenario: 'Pricing explanation',
      tone: 'clear, respectful, not defensive',
      title: 'Aunt B response - pricing explanation',
      subjectLine: 'About your cleaning estimate',
      messageTemplate:
        'Hi! The price is based on the size of the home, the type of clean, and the amount of detail needed. Deep cleans and move-out cleans usually take longer than standard recurring cleans, so the price can be higher. I am happy to review the scope with you.',
      notes: 'Use when a customer asks why a clean costs what it costs.',
    },
    {
      id: 'availability-reply',
      scenario: 'Availability reply',
      tone: 'friendly, practical, local',
      title: 'Aunt B response - availability',
      subjectLine: 'Cleaning availability',
      messageTemplate:
        'Hi! I have a few openings coming up. Send me the days or times that work best for you, and I will check what fits the schedule before confirming.',
      notes: 'Use when a customer asks when the business can come out.',
    },
    {
      id: 'booking-confirmation',
      scenario: 'Booking confirmation',
      tone: 'clear, reassuring, friendly',
      title: 'Aunt B response - booking confirmation',
      subjectLine: 'Your cleaning is booked',
      messageTemplate:
        'Hi! You are booked for your cleaning. Please make sure the address and access details are correct before the appointment. If anything changes, let me know as soon as you can.',
      notes: 'Use after the owner confirms a booking manually in ServicesOS.',
    },
    {
      id: 'reschedule-reply',
      scenario: 'Reschedule reply',
      tone: 'calm, helpful, flexible',
      title: 'Aunt B response - reschedule',
      subjectLine: 'Rescheduling your cleaning',
      messageTemplate:
        'Hi! No problem, we can look at rescheduling. Send me a couple of days or times that work better for you, and I will check the schedule.',
      notes: 'Use when a customer needs to move an appointment.',
    },
    {
      id: 'payment-reminder',
      scenario: 'Payment reminder',
      tone: 'polite, direct, professional',
      title: 'Aunt B response - payment reminder',
      subjectLine: 'Cleaning payment reminder',
      messageTemplate:
        'Hi! Just a quick reminder that payment is still due for your cleaning. Please send payment when you have a chance, or let me know if you have any questions.',
      notes: 'Use for owner-reviewed payment reminders only. This does not verify payment status.',
    },
    {
      id: 'review-request',
      scenario: 'Review request',
      tone: 'grateful, warm, not pushy',
      title: 'Aunt B response - review request',
      subjectLine: 'Thank you for choosing Aunt B\'s Cleaning Services',
      messageTemplate:
        'Thank you for choosing Aunt B\'s Cleaning Services! If you were happy with your clean, a review would mean a lot to our family business.',
      notes: 'Use after a completed job when the owner chooses to ask for a review.',
    },
    {
      id: 'thank-you-after-service',
      scenario: 'Thank-you after service',
      tone: 'warm, friendly, local',
      title: 'Aunt B response - thank you',
      subjectLine: 'Thank you for your business',
      messageTemplate:
        'Hi! Thank you again for choosing Aunt B\'s Cleaning Services. We appreciate your business and hope the clean helped make your day easier.',
      notes: 'Use after service is completed.',
    },
    {
      id: 'polite-decline',
      scenario: 'Polite decline / not a good fit',
      tone: 'kind, clear, respectful',
      title: 'Aunt B response - polite decline',
      subjectLine: 'About your cleaning request',
      messageTemplate:
        'Hi! Thank you for reaching out. After reviewing the request, I do not think we are the best fit for this job right now. I appreciate you considering Aunt B\'s Cleaning Services.',
      notes: 'Use when the owner decides a job is not a good fit. Human decision only.',
    },
    {
      id: 'follow-up-no-response',
      scenario: 'Follow-up after no response',
      tone: 'friendly, light, not pushy',
      title: 'Aunt B response - follow-up',
      subjectLine: 'Checking in on your cleaning request',
      messageTemplate:
        'Hi! Just checking in to see if you still need help with your cleaning request. No pressure at all, but I am happy to answer questions if you are still interested.',
      notes: 'Use for a light manual follow-up after no response.',
    },
  ],
  slai: [
    {
      id: 'founder-access-inquiry',
      scenario: 'Founder Access inquiry reply',
      tone: 'founder-led, practical, honest',
      title: 'SLAI response - Founder Access inquiry',
      subjectLine: 'ServicesOS Founder Access',
      messageTemplate:
        'Thanks for reaching out about ServicesOS Founder Access. ServicesOS is being built first for cleaning companies that need simpler customer, booking, field visibility, and payment workflows. I would be happy to learn more about your business and whether the current beta is a good fit.',
      notes: 'Use for inbound Founder Access interest.',
    },
    {
      id: 'servicesos-demo-follow-up',
      scenario: 'ServicesOS demo follow-up',
      tone: 'helpful, concise, practical',
      title: 'SLAI response - demo follow-up',
      subjectLine: 'Following up on the ServicesOS demo',
      messageTemplate:
        'Thanks for taking a look at ServicesOS. The current focus is a simple owner workflow: requests, customers, bookings, field visibility, and payments. If you have questions, I can walk through what is live now and what is still beta.',
      notes: 'Use after someone views or asks about the demo.',
    },
    {
      id: 'pricing-question',
      scenario: 'Pricing question reply',
      tone: 'honest, simple, no hype',
      title: 'SLAI response - pricing question',
      subjectLine: 'ServicesOS pricing',
      messageTemplate:
        'ServicesOS pricing is still being shaped during Founder Access. The goal is practical pricing for small cleaning businesses while the product matures. I would rather discuss fit and workflow honestly before quoting a plan.',
      notes: 'Use when someone asks about pricing before public pricing is finalized.',
    },
    {
      id: 'beta-expectations',
      scenario: 'Beta expectation explanation',
      tone: 'transparent, grounded, founder-led',
      title: 'SLAI response - beta expectations',
      subjectLine: 'What to expect from ServicesOS beta',
      messageTemplate:
        'ServicesOS is useful now, but it is still beta-aware. Founder Access users should expect improvements over time, some workflow changes, and hands-on support while the product matures.',
      notes: 'Use to set honest early-user expectations.',
    },
    {
      id: 'technical-question',
      scenario: 'Technical question acknowledgment',
      tone: 'practical, technical when needed, clear',
      title: 'SLAI response - technical question',
      subjectLine: 'Your ServicesOS technical question',
      messageTemplate:
        'Thanks for the technical question. I want to answer it carefully instead of guessing. I will review the current ServicesOS setup and follow up with what is supported now, what is planned, and what should wait.',
      notes: 'Use when a technical question needs a careful response.',
    },
    {
      id: 'thank-you-interest',
      scenario: 'Thank-you for interest',
      tone: 'warm, founder-led, appreciative',
      title: 'SLAI response - thank you',
      subjectLine: 'Thank you for your interest in ServicesOS',
      messageTemplate:
        'Thank you for your interest in ServicesOS. I am building it carefully around real cleaning-business workflows, and feedback from early users matters a lot.',
      notes: 'Use as a short appreciation response.',
    },
    {
      id: 'follow-up-no-response',
      scenario: 'Follow-up after no response',
      tone: 'simple, respectful, not pushy',
      title: 'SLAI response - follow-up',
      subjectLine: 'Checking in on ServicesOS',
      messageTemplate:
        'Hi, just checking in to see if ServicesOS is still something you want to explore. No pressure either way. I am happy to answer questions or point you to the demo if helpful.',
      notes: 'Use for a light manual follow-up after no response.',
    },
  ],
};

export function buildResponseTemplate({ brandKey, scenarioId, channelId }) {
  const brandScenarios = RESPONSE_SCENARIOS[brandKey] || RESPONSE_SCENARIOS.auntbs;
  const scenario = brandScenarios.find(item => item.id === scenarioId) || brandScenarios[0];
  const channel = RESPONSE_CHANNELS.find(item => item.id === channelId) || RESPONSE_CHANNELS[0];
  const isEmail = channel.id === 'email';

  return {
    id: `${brandKey}-${scenario.id}-${channel.id}`,
    brand: brandKey,
    scenario: scenario.scenario,
    channel: channel.id,
    tone: scenario.tone,
    title: `${scenario.title} (${channel.label})`,
    subjectLine: isEmail ? scenario.subjectLine : '',
    messageTemplate: formatForChannel(scenario.messageTemplate, channel.id),
    estimatedCredits: 1,
    notes: `${scenario.notes} Response drafts are local templates only and are not sent automatically.`,
  };
}

function formatForChannel(message, channelId) {
  if (channelId === 'sms') {
    return message
      .replace(/\s+/g, ' ')
      .replace('I would be happy to', 'I can')
      .trim();
  }

  if (channelId === 'email') {
    return `Hi,\n\n${message}\n\nThanks,`;
  }

  return message;
}
