import { formatLocalDateInputValue } from '../../utils/dateOnly';

const ACTIVE_OPPORTUNITY_STATUSES = new Set(['open', 'acted']);

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isCompletedBooking(booking) {
  if (!booking || booking.isArchived === true || booking.isDeleted === true || booking.status === 'cancelled') return false;
  return booking.status === 'completed' || booking.fieldStatus === 'completed';
}

function action(id, label) {
  return { id, capabilityType: id, label };
}

export function buildGrowthAIBusinessBriefing({ bookings = [], opportunities = [], now = new Date() } = {}) {
  const today = formatLocalDateInputValue(now);
  const completedToday = bookings.filter(booking => booking?.date === today && isCompletedBooking(booking));
  const activeOpportunities = opportunities.filter(item => item && ACTIVE_OPPORTUNITY_STATUSES.has(item.status));
  const estimateFollowUps = activeOpportunities.filter(item => item.type === 'estimate_followup');
  const otherOpportunities = activeOpportunities.filter(item => item.type !== 'estimate_followup');
  const wins = completedToday.length
    ? [{ id: 'completed-work', text: `${pluralize(completedToday.length, 'job')} completed today.` }]
    : [];
  const needsAttention = estimateFollowUps.map(item => ({
    id: item.id,
    text: item.detectionReason || 'A quoted estimate needs follow-up.',
  }));
  const noticed = otherOpportunities.map(item => ({
    id: item.id,
    text: item.detectionReason || 'GrowthAI found an opportunity worth reviewing.',
  }));
  const actions = [];

  if (estimateFollowUps.length) actions.push(action('opportunities', 'Review estimate follow-ups'));
  if (otherOpportunities.length && !actions.some(item => item.id === 'opportunities')) {
    actions.push(action('opportunities', 'Review opportunities'));
  }
  if (!actions.length) {
    actions.push(action('marketing', 'Create marketing'));
    actions.push(action('customer_response', 'Prepare a response'));
  }

  return {
    today,
    wins,
    needsAttention,
    noticed,
    actions,
    isEmpty: wins.length === 0 && needsAttention.length === 0 && noticed.length === 0,
  };
}
