function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function displayName(lead) {
  const formData = lead?.formData || {};
  const customer = lead?.customerSnapshot || {};
  return cleanText(customer.fullName) || cleanText(customer.displayName) || cleanText(customer.name) ||
    cleanText(lead?.customerName) || cleanText(formData.fullName) ||
    [cleanText(formData.firstName), cleanText(formData.lastName)].filter(Boolean).join(' ') ||
    'Estimate customer';
}

function serviceType(lead) {
  const formData = lead?.formData || {};
  const requestSnapshot = lead?.requestSnapshot || {};
  return cleanText(requestSnapshot.cleaningType) || cleanText(formData.cleaningType) ||
    cleanText(formData.serviceType) || 'Cleaning service';
}

export function readSavedEstimatePricing(estimate = {}) {
  const low = Number(estimate.priceLow);
  const suggested = Number(estimate.priceSuggested);
  const high = Number(estimate.priceHigh);
  if (!Number.isFinite(low) || low <= 0 || !Number.isFinite(high) || high < low) return null;
  return {
    low,
    suggested: Number.isFinite(suggested) && suggested >= low && suggested <= high ? suggested : null,
    high,
    currency: cleanText(estimate.currency) || 'USD',
  };
}

export function formatEstimateCurrency(value, currency = 'USD') {
  if (!Number.isFinite(value)) return 'Not available';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function listEligibleEstimateAssistanceLeads(leads = [], tenantId) {
  if (!Array.isArray(leads) || !cleanText(tenantId)) return [];
  return leads.flatMap(lead => {
    const estimate = lead?.estimate;
    if (!lead?.id || lead.tenantId !== tenantId || !estimate ||
        !['new', 'quoted'].includes(lead.status) || lead.booking != null || estimate.status === 'approved') {
      return [];
    }
    return [{
      id: lead.id,
      customerName: displayName(lead),
      serviceType: serviceType(lead),
      status: lead.status,
      pricing: readSavedEstimatePricing(estimate),
      date: lead.updatedAt || lead.createdAt || null,
    }];
  });
}
