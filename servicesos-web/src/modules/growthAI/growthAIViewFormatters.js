export function growthAIStatusLabel(status) {
  if (status === 'needs_review') return 'Needs review';
  if (status === 'approved') return 'Approved';
  return 'Draft';
}

export function formatGrowthAITimestamp(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Pending server timestamp';
}
