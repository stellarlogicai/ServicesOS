function intent(id, category, patterns, examples, options = {}) {
  return Object.freeze({ id, category, patterns: Object.freeze(patterns), examples: Object.freeze(examples), ...options });
}

export function normalizeOwnerUtterance(input) {
  return typeof input === 'string' ? input.trim().replace(/[\u2018\u2019]/g, "'").toLowerCase()
    .replace(/\bwhat's\b/g, 'what is').replace(/\bwho's\b/g, 'who is')
    .replace(/\bhasn't\b/g, 'has not').replace(/\bhaven't\b/g, 'have not') : '';
}

// Context requests describe reads or guarded handoffs, never business mutations.
export function resolveOwnerContextRequest(input) {
  const value = normalizeOwnerUtterance(input);
  if (!value || /\b(?:do not|don't|never|delete|refund|cancel|pay|payment|personal|medical)\b/.test(value) ||
      /\band (?:write|draft|create|send|delete|cancel|show|open)\b/.test(value)) return null;
  const reference = /\b(?:it|them|they|her|him|she|he|their|that|those|this|first|second|next one|last one|previous|other one|the customer|this job|this booking|one we were talking about)\b/.test(value);
  let domain;
  const conversationalAliases = {
    'morning, what are we doing today': 'what am i doing today',
    'is that a deep clean': 'what service are they getting',
    'what do we charge': 'what services do we offer',
    'how long do our services take': 'what services do we offer',
    'who needs attention': 'who needs my attention',
    'what should i take care of': 'what should i handle first',
    'who am i dealing with': 'who am i working with',
    'what is that one worth': 'how much was that',
    'who else is on the schedule': 'who else is coming',
    'who was that for again': 'who is this for',
    'what was their email again': 'what was their email',
    'who needs me': 'who needs my attention',
    'what is still hanging out there': 'what is still open',
    'who should i probably talk to': 'who should i talk to',
    'can you pull that back up': 'go back to that',
    'go back to the first customer': 'tell me about the first customer',
    'no, the second one': 'second one',
    'actually, go back to the first': 'go back to the first',
    'not that customer, the other one': 'what about the other one',
    'forget that and tell me what is coming up': 'what jobs do i have coming up',
  };
  const alias = conversationalAliases[value.replace(/[?.!]+$/, '')];
  if (alias) return resolveOwnerContextRequest(alias);
  if (/^go back to the one before that[?.!]*$/.test(value)) return { domain: 'detail', input: 'previous one' };
  if (/^what about their service[?.!]*$/.test(value)) return { domain: 'service', input: value };
  if (/^which one should i contact[?.!]*$/.test(value)) return { domain: 'context_review', input: value };
  if (/^how much are they paying[?.!]*$/.test(value)) return { domain: 'price', input: value };
  if (/^should i (?:contact them|reach back out)[?.!]*$/.test(value)) return { domain: 'followup', input: value };
  if (/^what about the next customer[?.!]*$/.test(value)) return { domain: 'detail', input: 'next one' };
  const returnTarget = value.match(/^(?:okay[, ]+)?(?:go|take me) back to (?:the |that )?(customer|booking|job|estimate|service)[?.!]*$/)?.[1];
  if (returnTarget) return { domain: 'detail', input: value, returnType: returnTarget === 'job' ? 'booking' : returnTarget };
  if (/^who was (?:that |the )?first customer again[?.!]*$/.test(value)) return { domain: 'customer', input: 'first customer', returnType: 'customer' };
  if (/^go back to that[?.!]*$/.test(value)) return { domain: 'detail', input: value, returnType: 'recent' };
  if (/^what about (?:them|that customer)[?.!]*$/.test(value)) return { domain: 'detail', input: value, returnType: /customer/.test(value) ? 'customer' : null };
  if (/^how much (?:were they paying|were we charging them)[?.!]*$/.test(value)) return { domain: 'price', input: value };
  const pastContact = value.match(/^what was their (email(?: address)?|(?:phone )?number)[?.!]*$/);
  if (pastContact) return { domain: 'contact', input: value, contactField: /email/.test(pastContact[1]) ? 'email' : 'phone' };
  // Separate explicit identity from a booking-dependent reference before generic context routing.
  const contextualBooking = / for (?:this|that|their|the) (?:job|booking|appointment)[?.!]*$/.test(value);
  const subjectQuestion = value.replace(/ for (?:this|that|their|the) (?:job|booking|appointment)[?.!]*$/, '').replace(/[?.!]+$/, '');
  const namedReads = [
    ['detail', /^tell me (?:more )?about (.+)$/],
    ['history', /^(?:has|have) (.+?) (?:booked|used us|been with us|worked with us|hired us) before$/],
    ['history', /^how many times has (.+?) booked$/],
    ['history', /^when did we last work with (.+)$/],
    ['date', /^when was (.+)'s estimate created$/, 'estimate_creation'],
    ['date', /^when was (?:this|that|the) estimate created for (.+)$/, 'estimate_creation'],
    ['price', /^how much (?:is|are) (.+?) paying$/],
    ['price', /^what is (.+)'s price$/],
    ['service', /^what service is (.+?) getting$/],
    ['customer', /^who is (.+)$/],
    ['quote', /^(?:what did (?:we|i) quote|how much did (?:we|i) quote|how much did (?:we|i) tell) (.+)$/],
  ];
  for (const [readDomain, pattern, field] of namedReads) {
    const explicitName = subjectQuestion.match(pattern)?.[1];
    if (!explicitName || /^(?:it|them|they|her|him|she|he|their|this|that|next|(?:my |the |this |that )?(?:first |second |next |last |previous |other )?(?:customer|job|booking|appointment|estimate|one))$/.test(explicitName)) continue;
    if (readDomain === 'customer' && !contextualBooking) continue;
    return { domain: readDomain, input: value, explicitName,
      reference: { kind: contextualBooking || field === 'estimate_creation' && /\b(?:this|that|the) estimate\b/.test(value) ? 'current' : 'none' }, ...(field ? { field } : {}) };
  }
  if (/^(?:when|what date)\b.*\bestimate\b.*\bcreated\b/.test(value) && reference) return { domain: 'date', input: value, field: 'estimate_creation' };
  const chargeTarget = value.match(/^(?:how much|what) are we charging (.+?)(?: for ((?:this|that|their|the) (?:job|booking|appointment)))?[?.!]*$/);
  if (chargeTarget && !/^(?:them|him|her|they|it|this|that|(?:the|this|that) customer|for .+|(?:standard|deep|move[ -]?out|construction)(?: clean(?:ing)?)?(?: service)?)$/.test(chargeTarget[1])) {
    return { domain: 'price', input: value, explicitName: chargeTarget[1],
      reference: { kind: chargeTarget[2] ? 'current' : 'none' } };
  }
  const statusTarget = value.match(/^what is (.+)'s status(?: for ((?:this|that|their|the) (?:job|booking|appointment)))?[?.!]*$/);
  if (statusTarget && !/^(?:it|them|her|him|they|(?:the|this|that) (?:customer|job|booking|appointment|estimate))$/.test(statusTarget[1])) {
    return { domain: 'status', input: value, explicitName: statusTarget[1],
      reference: { kind: statusTarget[2] ? 'current' : 'none' } };
  }
  const serviceTarget = value.match(/^what is (.+)'s service(?: for ((?:this|that|their|the) (?:job|booking|appointment)))?[?.!]*$/);
  if (serviceTarget && !/^(?:it|them|her|him|they|(?:the|this|that) (?:customer|job|booking|appointment|estimate)|(?:(?:my|the) )?(?:first|second|next|last|previous|other) customer)$/.test(serviceTarget[1])) {
    return { domain: 'service', input: value, explicitName: serviceTarget[1],
      reference: { kind: serviceTarget[2] ? 'current' : 'none' } };
  }
  const contactTarget = value.match(/^what is (.+)'s ((?:phone )?number|email(?: address)?|contact info) for ((?:this|that|their|the) (?:job|booking|appointment))[?.!]*$/);
  if (contactTarget && !/^(?:it|them|her|him|they|(?:the|this|that) (?:customer|job|booking|appointment|estimate)|(?:(?:my|the) )?(?:first|second|next|last|previous|other) customer)$/.test(contactTarget[1])) {
    return { domain: 'contact', input: value, explicitName: contactTarget[1],
      contactField: /email/.test(contactTarget[2]) ? 'email' : 'phone', reference: { kind: 'current' } };
  }
  const appointmentTarget = value.match(/^(?:when|what(?: time)?) is (.+)'s appointment(?: for ((?:this|that|their|the) (?:job|booking|appointment)))?[?.!]*$/);
  if (appointmentTarget && !/^(?:it|them|her|him|they|(?:the|this|that) (?:customer|job|booking|appointment|estimate)|(?:(?:my|the) )?(?:first|second|next|last|previous|other) customer)$/.test(appointmentTarget[1])) {
    return { domain: 'date', input: value, explicitName: appointmentTarget[1],
      reference: { kind: appointmentTarget[2] ? 'current' : 'none' } };
  }
  // Unrecognized named suffixes must not fall through to an implicit selected record.
  // Established named reads above retain their existing resolution behavior.
  if (/\b(?:this|that|the) (?:job|booking|appointment|estimate) for .+/.test(value)) {
    return { domain: 'detail', input: value, ambiguous: true, unrecognizedNamedReference: true };
  }
  if (/^tell me about .+[?.!]*$/.test(value) && !reference) return { domain: 'detail', input: value, explicitName: value.replace(/^tell me about /, '').replace(/[?.!]+$/, '') };
  if (/^which one makes more sense for my business[?.!]*$/.test(value)) return { domain: 'promote', input: value };
  if (/^who needs my attention[?.!]*$/.test(value)) return { domain: 'context_review', input: value };
  if (/^who (?:do i need to|am i supposed to|should i|can i) (?:talk to|call|reach out to)(?: about .+)?[?.!]*$/.test(value) ||
      /^who am i talking to[?.!]*$/.test(value)) return { domain: 'talk_to', input: value };
  if (/^(?:what is .+ (?:number|email(?: address)?|contact info)|how (?:do i (?:get ahold of|contact)|can i reach) .+|can (?:i get|you give me) .+ (?:email|info))[?.!]*$/.test(value)) {
    const named = value.match(/^what is (.+)'s (?:phone )?(?:number|email(?: address)?|contact info)[?.!]*$/)?.[1];
    if (!named && !/\b(?:their|them|this customer|that customer|the customer)\b/.test(value)) return { domain: 'contact', input: value, ambiguous: true };
    return { domain: 'contact', input: value, contactField: /\bemail\b/.test(value) ? 'email' : /\bnumber\b/.test(value) ? 'phone' : null, explicitName: named && !/^(?:the |this |that )?(?:other )?customer$/.test(named) ? named : null };
  }
  if (/^how much are they[?.!]*$/.test(value)) return { domain: 'price', input: value };
  if (/^what did we tell them[?.!]*$/.test(value)) return { domain: 'quote', input: value };
  if (/^who else is coming[?.!]*$/.test(value)) return { domain: 'bookings', input: value };
  if (/^(?:what is going on|what is happening|what is on my plate|what is (?:still sitting out there|still open|waiting on me)|who is waiting on me|anything (?:falling|slipping) through the cracks|what (?:work|things) (?:are|is) outstanding)[?.!]*$/.test(value)) domain = 'review_choices';
  else if (/^(?:what should i worry about(?: today)?|what is (?:the most important thing|most important|the important stuff|the biggest thing i need to deal with)(?: today)?|what should i (?:handle|take care of) first|is there anything urgent|who is the one i need to worry about first)[?.!]*$/.test(value)) domain = 'priority_review';
  else if (/^(?:anybody|anyone) i (?:need|should) (?:to )?(?:get back (?:with|to)|follow up with)[?.!]*$/.test(value) || /^(?:follow[ -]?up opportunities|who should i (?:reach back out to|follow up with|contact again))[?.!]*$/.test(value)) domain = 'followup_review';
  else if (/^(?:what jobs? do i have coming up|what is on (?:my |the )?(?:schedule|books)(?: this week)?|what am i doing (?:today|tomorrow)|who am i working with tomorrow|what is my schedule tomorrow|what is my next job|who is (?:my first customer|next|coming (?:in )?next|coming up|scheduled next)|when is my next appointment|what service is my next customer getting|today's bookings)[?.!]*$/.test(value)) domain = 'bookings';
  else if (/^(?:(?:which|what) estimates? (?:are )?still open|do i have any open estimates|which customers have not accepted their estimate|who has not accepted their estimate|who is waiting (?:on|for) an estimate|which (?:one|estimate) has been waiting the longest|open estimates)[?.!]*$/.test(value)) domain = 'estimates';
  else if (/^(?:what services do (?:i|we) (?:offer|have)|what do we offer)[?.!]*$/.test(value)) domain = 'services';
  else if (/\b(?:write|draft|prepare)\b.*\b(?:message|follow[ -]?up|reply|something)\b/.test(value) && reference) domain = 'message';
  else if (/\b(?:make|create)\b.*\bpost\b/.test(value) && reference) domain = 'marketing';
  else if (/\b(?:which (?:one|service) should i promote)\b/.test(value)) domain = 'promote';
  else if (/\bshould i follow up\b/.test(value) && reference) domain = 'followup';
  else if (/\b(?:booked.*before|(?:used us|been with us|worked with us|hired us).*before|how many times.*booked|last work with)\b/.test(value) && reference) domain = 'history';
  else if (/\b(?:how much.*quote|what did we quote|quoted)\b/.test(value) && reference || /^(?:what did we quote|how much did we tell (?:them|that customer))[?.!]*$/.test(value)) domain = 'quote';
  else if (/^(?:what are we charging(?: them)?|how much are we getting for (?:this|that)|what is the price on (?:this|that) one|how much (?:was|is) (?:that|this|it))[?.!]*$/.test(value)) domain = 'price';
  else if (/\b(?:how much.*(?:charg(?:e|ing)|job|estimate)|price of)\b/.test(value)) domain = 'price';
  else if (/\b(?:what.*include)\b/.test(value) && reference) domain = 'scope';
  else if (/\b(?:what service|what am i doing for)\b/.test(value) && reference) domain = 'service';
  else if (/\b(?:when|what time)\b/.test(value) && reference) domain = 'date';
  else if (/\bstatus\b/.test(value) && reference) domain = 'status';
  else if (/^what do i need to know about (?:this|that) (?:job|booking)[?.!]*$/.test(value)) domain = 'detail';
  else if (/^(?:who am i working with|who is this for)[?.!]*$/.test(value)) domain = 'customer';
  else if (/^(?:(?:go|take me) back to (?:the )?(?:first|second|last|previous|that)(?: one)?|(?:show|tell me about) (?:the )?(?:previous|other)(?: one)?|(?:what about )?(?:the )?(?:first|second|next|last|previous|other)(?: one)?)[?.!]*$/.test(value)) domain = 'detail';
  else if (/\btell me (?:more )?about\b/.test(value) && reference) domain = 'detail';
  else if (/\bwho\b/.test(value) && reference) domain = 'customer';
  else if (/^(?:what(?: is| about)?|show|tell me about)\b/.test(value) && /\b(?:first one|second one|next one|last one|one after that|that estimate|that job|that booking|that customer|that one|one we were talking about)\b/.test(value)) domain = 'detail';
  else if (/^(?:who|what|when|how|tell me|show me|have|has)\b/.test(value) && /\b(?:customer|booking|estimate|service)\b/.test(value)) {
    return { domain: 'detail', input: value, ambiguous: true };
  }
  if (!domain) return null;
  if (domain === 'quote') {
    const target = value.match(/^(?:what did (?:we|i) quote|how much did (?:we|i) quote|how much did (?:we|i) tell) (.+?)(?: for (?:this|that|the) (?:job|booking|estimate))?[?.!]*$/)?.[1];
    if (target && !/^(?:them|him|her|they|it|this|that|(?:the|this|that) (?:customer|job|booking|estimate|one))$/.test(target)) {
      return { domain, input: value, explicitName: target };
    }
    // Opaque quote wording must not silently substitute the active customer.
    if (!target && !/^what did (?:we|i) quote[?.!]*$/.test(value)) return { domain, input: value, ambiguous: true };
  }
  const serviceType = domain === 'price' ? value.match(/\b(standard|deep|move[ -]?out|construction)\b/)?.[1]?.replace(/[ -]/g, '') : null;
  return { domain, input: value, serviceType: serviceType || null };
}

// Routes describe existing surfaces, not permission to generate, save, or send.
export const OWNER_VOCABULARY = Object.freeze([
  intent('upcoming_bookings', 'information', [
    /^(?:how many|count)(?: .*)?\b(?:upcoming|scheduled|coming up|future)\b(?: .*)?\b(?:bookings?|jobs?)\b[^.!]*[?.!]?$/,
    /^how many\b.*\b(?:bookings?|jobs?)\b.*\b(?:upcoming|scheduled|coming up|future)\b[^.!]*[?.!]?$/,
    /^(?:do i have|are there) (?:any |anything )?(?:(?:upcoming|scheduled|future) (?:bookings?|jobs?)|(?:anything )?(?:scheduled|coming up))\??$/,
    /^what is (?:coming up(?: for me)?|on (?:my |the )?(?:schedule|books))\??$/,
  ], ['do i have any upcoming jobs', 'How many bookings do I have coming up?', 'Are there any upcoming bookings?', "What's coming up for me?", "What's coming up?", "What's on the books?", 'Do I have anything scheduled?', 'Do I have anything coming up?']),
  intent('followup_review', 'review', [
    /^(?:are there |any |which |who |should i |show me ).*\b(?:follow[ -]?up|reach back out|heard from|ghosted|ghost me)\b/,
    /^who needs (?:a )?follow[ -]?up\??$/,
  ], ['Are there customers I should follow up with?', 'Who should I follow up with?', 'Should I follow up with Sarah?', 'Who needs a follow-up?', 'Who should I reach back out to?'], { skillId: 'opportunities', filter: 'all' }),
  intent('estimate_review', 'information', [
    /^(?:(?:which|what) estimates? (?:are )?still open|do i have any open estimates|which customers have not accepted their estimate|who has not accepted their estimate)[?.!]*$/,
  ], ['Which estimates are still open?', "Who hasn't accepted their estimate?"], { skillId: 'estimate_assistance' }),
  intent('business_briefing', 'review', [
    /^(?:what do i need to take care of(?: today)?|what needs taking care of today)[?.!]*$/,
    /\b(?:what should i work on(?: today)?|how is (?:the )?business looking today|what needs (?:my )?attention|give me (?:my |the )?business briefing|anything i should know about today)\b/,
    /^(?:what is (?:my business briefing|going on with the business)|how are things looking|anything i need to worry about|who needs my attention|does anyone need my attention)\??$/,
  ], ["What's my business briefing?", 'What needs my attention?', 'What should I work on today?', 'Anything I need to worry about?', "What's going on with the business?", 'How are things looking?', 'Who needs my attention?', 'Does anyone need my attention?'], { skillId: 'business_briefing' }),
  intent('retention', 'review', [
    /\b(?:who should i (?:try to )?(?:rebook|ask to book again)|who is due for another cleaning|who (?:has not|hasn'?t) booked again|(?:show me|find) rebooking opportunities)\b/,
    /^which customers (?:have not|haven'?t) booked again\??$/,
  ], ['Who should I try to rebook?', 'Who is due for another cleaning?', "Who hasn't booked again?", "Which customers haven't booked again?", 'Show me rebooking opportunities.', 'Find rebooking opportunities.'], { skillId: 'retention', filter: 'retain' }),
  intent('opportunities', 'review', [
    /\b(?:show (?:me )?(?:the )?opportunities|growth opportunities|anything i should review|review opportunities|who should i ask for a review|any customers i should request a review from)\b/,
    /^(?:how are my reviews doing|do i have anything i need to respond to|do i have any opportunities|check (?:my )?reputation)[?.!]?$/,
  ], ['Show me opportunities', 'Anything I should review?', 'Who should I ask for a review?', 'How are my reviews doing?', 'Do I have anything I need to respond to?', 'Do I have any opportunities?', 'Check my reputation.'], { skillId: 'opportunities', filter: 'all' }),
  intent('estimate_assistance', 'action', [
    /\b(?:help me with (?:an |this )?estimate|follow[ -]?up on (?:this |an )?(?:estimate|quote)|review (?:an |this )?estimate|analy[sz]e (?:an |this )?estimate|estimate assistance|help price (?:this |a )?job)\b/,
    /^show me my estimates[?.!]?$/,
  ], ['Help me with an estimate', 'Review this estimate', 'Analyze an estimate', 'Help price this job', 'Follow up on this estimate.', 'Show me my estimates.'], { skillId: 'estimate_assistance' }),
  intent('marketing', 'action', [
    /\b(?:marketing|make (?:me )?(?:a )?post|create (?:me )?(?:a )?post|facebook post|instagram post|social post|promote|promotion|availability|spring cleaning|cleaning tip|funny(?: (?:cleaning|to))? post|completed job|before(?:\s|\/)after|move[ -]?out cleaning|plan (?:my )?posts?(?: for (?:this )?week)?|what should i post(?: this week)?)\b/,
  ], ['Create a marketing post.', 'Can you make a Facebook post?', 'What should I post?', 'Plan my posts this week.', 'Make me a post about deep cleaning.', 'Give me something funny to post.', 'Post that I have availability.', 'Make something from this completed job.'], { skillId: 'marketing' }),
  intent('reputation', 'action', [
    /\b(?:help me (?:respond|reply) to (?:this |a )?(?:review|feedback)|write a (?:response|reply) to (?:this |a )?(?:bad )?review|review response|reply to (?:this |a )?review)\b/,
  ], ['Help me reply to this review.', 'Write a response to this bad review.', 'Review response'], { skillId: 'reputation' }),
  intent('customer_response', 'action', [
    /\b(?:respond to (?:a |the )?customer|customer response|help me (?:respond|reply)|reply to (?:a |the )?customer|(?:write|draft) (?:an? )?(?:scheduling|rebooking|review(?:[ -]?request)?|apology) message|help explain (?:this |the )?(?:quote|estimate)|answer a question about|help me word (?:this |a )?response|ask this customer (?:if they want to book again|for a review))\b/,
    /^(?:write|draft|prepare|send|help me write)\b.*\b(?:text|message|follow[ -]?up|reply|response)\b/,
  ], ['Write a follow-up message for Sarah.', 'Draft a message for Sarah.', 'Help me write a text.', 'Write a message to this customer.', 'Send Sarah a message.', 'Write a scheduling message.', 'Write an apology message.', 'Help explain this quote.'], { skillId: 'customer_response' }),
  intent('brand', 'navigation', [/\b(?:brand preferences|brand settings|edit (?:my |the )?brand)\b/], ['Brand preferences', 'Edit my brand settings', 'Brand settings'], { skillId: 'brand' }),
  intent('help', 'help', [/^(?:what can you do|what can you help me with|show me what (?:growthai|slai) can do|capabilities|help)\??$/], ['What can you do?', 'What can you help me with?', 'Help', 'Show me what SLAI can do']),
  intent('drafts', 'navigation', [/^(?:show me|open|review) (?:my |the )?(?:saved )?drafts[?.!]?$/], ['Show me my drafts.', 'Open drafts', 'Review saved drafts']),
  intent('activity', 'navigation', [/^(?:show me (?:my )?activity|open activity|what have i worked on)\??$/], ['Show me my activity', 'Open activity', 'What have I worked on?']),
  intent('credits', 'information', [/^(?:how many (?:ai )?credits (?:do i have|are left)|what is my (?:ai )?credit balance|show me my credits)\??$/], ['How many AI credits do I have?', "What's my credit balance?", 'Show me my credits']),
]);

export function resolveOwnerVocabulary(input) {
  const normalized = normalizeOwnerUtterance(input);
  if (!normalized) return { kind: 'empty' };
  if (/\b(?:do not|don't|dont|never)\b/.test(normalized)) return { kind: 'clarify', reason: 'negated_request' };
  if (/\band (?:write|draft|create|show|send|delete|cancel|review|open)\b/.test(normalized)) {
    return { kind: 'clarify', reason: 'multiple_requests' };
  }
  if (/\b(?:personal life|vacation|medical|doctor|delete|refund|cancel|charge|take a payment)\b/.test(normalized)) {
    return { kind: 'clarify', reason: 'unsupported' };
  }
  if (/^(?:can you handle .+|take care of .+|help (?:me )?with my bookings|did anyone pay yet|(?:show me|what) (?:my |recent )?customers.*)[?.!]?$/i.test(normalized)) {
    return { kind: 'clarify', reason: 'unsupported_or_ambiguous' };
  }
  const timeContext = normalized.match(/\b(?:today|tomorrow|(?:this|next|last) (?:week|month)|recently|overdue|past due)\b/)?.[0] || null;
  const matches = OWNER_VOCABULARY.filter(item => item.patterns.some(pattern => pattern.test(normalized)));
  const review = matches.find(item => item.id === 'followup_review');
  if (review && !/\b(?:write|draft|prepare|send|reply|respond)\b/.test(normalized)) {
    if (timeContext && timeContext !== 'today') return { kind: 'clarify', reason: 'unsupported_time_window' };
    return { kind: 'match', intent: review, timeContext };
  }
  // Review-response wording shares the generic reply pattern; explicit review wins.
  const candidates = matches.filter(item => !(item.id === 'customer_response' && matches.some(match => match.id === 'reputation')));
  if (candidates.length > 1) return { kind: 'clarify', reason: 'collision' };
  const selected = candidates[0];
  if (selected?.id === 'upcoming_bookings' && timeContext) return { kind: 'clarify', reason: 'unsupported_time_window' };
  if (selected?.category === 'review' && timeContext && timeContext !== 'today') return { kind: 'clarify', reason: 'unsupported_time_window' };
  return selected ? { kind: 'match', intent: selected, timeContext } : { kind: 'unmatched' };
}
