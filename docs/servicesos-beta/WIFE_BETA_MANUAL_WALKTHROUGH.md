# Wife Beta Manual Walkthrough

This document provides manual testing steps for wife beta readiness validation.

## Dashboard Null-Safety Fix (June 25, 2026)

### Issue
Dashboard could crash when leads are missing `estimate` or `formData` fields. This was identified as a beta blocker during manual wife-beta readiness review.

### Severity
**Beta Blocker** - Dashboard crashes prevent admin workflow completion.

### Files Changed
- `servicesos-web/src/pages/Dashboard.jsx` - Added null-safety for estimate, booking, and formData access
- `servicesos-web/src/services/crmService.js` - Removed duplicate `estimate` key in leadData object
- `servicesos-web/src/__tests__/DashboardPendingQuoteReview.test.jsx` - Added 4 focused null-safety tests

### Specific Fixes Applied

#### Dashboard.jsx
1. **Revenue chart null-safety (line 276-277)**: Added optional chaining for `booking?.scheduledAt` and `booking?.agreedPrice`
2. **AI analysis display (line 237)**: Changed `es.aiEnhanced` to `es?.aiEnhanced` 
3. **Service type display (line 515-516)**: Added fallback values for missing `cleaningType` and `frequency`

#### crmService.js
- Removed duplicate `estimate` key that was causing ESLint error

### Tests Added/Updated
Added 4 new tests in `DashboardPendingQuoteReview.test.jsx`:
1. `renders when a lead is missing estimate` - Verifies dashboard renders with null estimate
2. `renders when a lead is missing formData` - Verifies dashboard renders without formData
3. `search/filter does not crash when lead is missing formData` - Verifies search functionality with missing formData
4. `renders when booking is missing scheduledAt` - Verifies revenue chart handles partial booking data

### Validation Results
- **Lint**: Passed (after fixing duplicate key in crmService.js)
- **Vitest**: Passed (93 tests, 15 test files)
- **Build**: Passed

### Known Failures
- Pre-existing React act() warning in `AppOnboardingRouter.test.jsx` (not related to this fix)
- Pre-existing ineffective dynamic import warnings (not related to this fix)

### Manual Testing Steps
1. Login as admin user
2. Navigate to Dashboard
3. Verify dashboard loads without errors
4. Test search functionality with various lead data
5. Verify revenue chart displays correctly
6. Test lead detail drawer with partial data

### Safe to Merge
**Yes** - Changes are minimal, focused on null-safety, and fully tested. No changes to Stripe, Firebase rules, or unrelated systems.

