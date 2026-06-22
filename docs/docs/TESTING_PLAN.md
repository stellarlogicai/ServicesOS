# Testing Plan for Cleaning Intake System

## Overview
This document outlines the comprehensive testing plan for each section of the app after the shared platform library extraction.

## Test Login Setup

Before running tests, you must set up test user accounts. See [TEST_LOGIN_SETUP.md](../TEST_LOGIN_SETUP.md) for complete instructions.

**Quick Setup:**
1. Copy `.env.test.example` to `.env.test`
2. Fill in Firebase credentials and test user credentials
3. Create test users in Firebase Console or using the provided script
4. Create test tenant in Firestore

**Test Credentials:**
- Test User: `test@example.com` / `TestPassword123!`
- Test Admin: `admin@example.com` / `AdminPassword123!`
- Test Super Admin: `superadmin@example.com` / `SuperAdmin123!`

## Dev Server
- **URL**: http://localhost:5174
- **Status**: Running

## Test Sections

### 1. Authentication System (HIGH PRIORITY)

**Location**: `src/shared/auth/AuthContext.jsx`

**Test Cases**:
- [ ] Login with valid credentials
- [ ] Login with invalid credentials (verify error message)
- [ ] Login with Google OAuth
- [ ] Password reset flow
- [ ] Logout functionality
- [ ] Protected route access (try accessing protected page without login)
- [ ] Role-based access control (admin vs customer permissions)
- [ ] Multi-tenant awareness (verify tenant is loaded after login)
- [ ] Session persistence (refresh page after login)
- [ ] Suspended account handling (if applicable)

**Expected Results**:
- Valid login redirects to dashboard
- Invalid login shows friendly error message
- Google OAuth works correctly
- Password reset email is sent
- Logout clears session and redirects to login
- Protected routes redirect to login if not authenticated
- Admin users can access admin-only features
- Customer users cannot access admin features
- Tenant data is loaded correctly
- Session persists across page refreshes

---

### 2. AI Credit System (HIGH PRIORITY)

**Location**: `src/shared/credits/aiUsageEngineService.js`

**Test Cases**:
- [ ] Get remaining credits for tenant
- [ ] Check credits before operation
- [ ] Deduct credits successfully
- [ ] Deduct credits with insufficient balance (verify error)
- [ ] Purchase credits
- [ ] Get credit history
- [ ] Get credit cost for operation type
- [ ] Update subscription tier (credit changes)
- [ ] Reset monthly credits
- [ ] Track model cost

**Expected Results**:
- Credit balance displays correctly
- Credit check returns accurate hasEnough status
- Credits are deducted correctly
- Insufficient credits error is thrown
- Credit purchase adds to balance
- Credit history shows all transactions
- Credit costs are returned correctly
- Subscription tier update changes included credits
- Monthly reset works correctly
- Model cost is tracked for analytics

---

### 3. IntakeForm with Credit Integration (HIGH PRIORITY)

**Location**: `src/components/IntakeForm.jsx`

**Test Cases**:
- [ ] Submit form with sufficient credits
- [ ] Submit form with insufficient credits (verify error message)
- [ ] Photo analysis deducts 1 credit
- [ ] Credit check happens before AI analysis
- [ ] Error message shows credits needed vs credits available
- [ ] Form submission works after purchasing credits

**Expected Results**:
- Form submits successfully with sufficient credits
- Error message displays when credits are insufficient
- Exactly 1 credit is deducted per photo analysis
- Credit check prevents operation if insufficient
- Clear error message shows credit deficit
- Form works correctly after credit purchase

---

### 4. AIModelTraining with Credit Integration (HIGH PRIORITY)

**Location**: `src/components/AIModelTraining.jsx`

**Test Cases**:
- [ ] Start training with sufficient credits
- [ ] Start training with insufficient credits (verify error message)
- [ ] Training deducts 5 credits (estimate_generation proxy)
- [ ] Credit check happens before training starts
- [ ] Error message shows credits needed vs credits available
- [ ] Training works after purchasing credits

**Expected Results**:
- Training starts successfully with sufficient credits
- Error message displays when credits are insufficient
- Exactly 5 credits are deducted per training job
- Credit check prevents operation if insufficient
- Clear error message shows credit deficit
- Training works correctly after credit purchase

---

### 5. AICreditWallet Component (HIGH PRIORITY)

**Location**: `src/components/AICreditWallet.jsx`

**Test Cases**:
- [ ] Display current credit balance
- [ ] Display monthly included credits
- [ ] Display purchased credits
- [ ] Display total credits used
- [ ] Display credit history
- [ ] Display credit costs for operations
- [ ] Display subscription tier information
- [ ] Refresh data on mount

**Expected Results**:
- Credit balance displays accurately
- Monthly included credits show correctly
- Purchased credits show correctly
- Total used credits calculate correctly
- Credit history shows recent transactions
- Credit costs are listed for all operations
- Subscription tier displays correctly
- Data refreshes on component mount

---

### 6. AICreditPurchase Component (HIGH PRIORITY)

**Location**: `src/components/AICreditPurchase.jsx`

**Test Cases**:
- [ ] Display available credit packs
- [ ] Display pricing for each pack
- [ ] Select a credit pack
- [ ] Initiate purchase flow
- [ ] Handle successful purchase
- [ ] Handle failed purchase
- [ ] Update credit balance after purchase

**Expected Results**:
- All credit packs display with correct pricing
- Pack selection works correctly
- Purchase flow initiates correctly
- Successful purchase adds credits to balance
- Failed purchase shows error message
- Credit balance updates immediately after purchase

---

### 7. Dashboard Credit Display (HIGH PRIORITY)

**Location**: `src/pages/Dashboard.jsx`

**Test Cases**:
- [ ] Display AI credit balance in stats row
- [ ] Show credits used this month
- [ ] Highlight balance if low (< 10 credits)
- [ ] Load credits on dashboard mount
- [ ] Update credits in real-time

**Expected Results**:
- Credit balance displays in stats row
- Credits used shows correctly
- Low balance is highlighted/accented
- Credits load when dashboard mounts
- Credits update when changed

---

### 8. Audit Logging System (MEDIUM PRIORITY)

**Location**: `src/shared/audit/auditTrailService.js`

**Test Cases**:
- [ ] Log audit event
- [ ] Get audit trail for entity
- [ ] Get audit trail for user
- [ ] Get audit trail by action type
- [ ] Get all audit trail
- [ ] Get recent audit events
- [ ] Get audit analytics
- [ ] Export audit trail as CSV
- [ ] Delete old audit logs

**Expected Results**:
- Audit events are logged correctly
- Entity audit trail shows all changes
- User audit trail shows all actions
- Action filtering works correctly
- All audit trail retrieves correctly
- Recent events limit works
- Analytics calculate correctly
- CSV export generates valid file
- Old logs are marked for deletion

---

### 9. Notification System (MEDIUM PRIORITY)

**Location**: `src/shared/notifications/notificationService.js`

**Test Cases**:
- [ ] Create notification
- [ ] Send notification
- [ ] Get user notifications
- [ ] Get unread notifications
- [ ] Mark notification as read
- [ ] Mark all notifications as read
- [ ] Delete notification
- [ ] Get notification stats
- [ ] Schedule notification
- [ ] Batch send notifications

**Expected Results**:
- Notifications are created correctly
- Notifications are sent successfully
- User notifications retrieve correctly
- Unread filter works correctly
- Read status updates correctly
- Bulk mark as read works
- Deletion works correctly
- Stats calculate correctly
- Scheduled notifications work
- Batch sending works correctly

---

### 10. CRM System (MEDIUM PRIORITY)

**Location**: `src/shared/crm/crmService.js`

**Test Cases**:
- [ ] Create customer
- [ ] Get customer
- [ ] Get customers (with status filter)
- [ ] Update customer
- [ ] Update customer status
- [ ] Add customer note
- [ ] Add customer tag
- [ ] Remove customer tag
- [ ] Search customers
- [ ] Get customer stats
- [ ] Delete customer

**Expected Results**:
- Customer creation works
- Customer retrieval works
- Customer listing with filters works
- Customer updates work
- Status changes work
- Notes are added correctly
- Tags are added/removed correctly
- Search returns matching results
- Stats calculate correctly
- Soft delete works correctly

---

### 11. Tenant Management (MEDIUM PRIORITY)

**Location**: `src/shared/tenants/tenantService.js`

**Test Cases**:
- [ ] Create tenant
- [ ] Get tenant
- [ ] Get tenant by email
- [ ] Update tenant subscription
- [ ] Cancel tenant subscription
- [ ] Update tenant settings
- [ ] Get tenant subscription
- [ ] Check tenant feature access

**Expected Results**:
- Tenant creation works
- Tenant retrieval works
- Email lookup works
- Subscription updates work
- Cancellation works
- Settings updates work
- Subscription info retrieves correctly
- Feature checks work correctly

---

### 12. Stripe/Billing Integration (MEDIUM PRIORITY)

**Location**: `src/shared/billing/stripeService.js`

**Test Cases**:
- [ ] Calculate deposit amount
- [ ] Format amount for display
- [ ] Validate card details
- [ ] Create payment intent
- [ ] Process payment
- [ ] Create checkout session
- [ ] Redirect to checkout
- [ ] Create subscription
- [ ] Cancel subscription

**Expected Results**:
- Deposit calculation is correct
- Amount formatting is correct
- Card validation works
- Payment intent creates successfully
- Payment processes correctly
- Checkout session creates successfully
- Redirect works correctly
- Subscription creates successfully
- Cancellation works correctly

---

### 13. Reporting Framework (MEDIUM PRIORITY)

**Location**: `src/shared/reporting/reportingService.js`

**Test Cases**:
- [ ] Create date range filter
- [ ] Group data by field
- [ ] Sum field
- [ ] Average field
- [ ] Generate time series
- [ ] Generate report summary
- [ ] Export to CSV
- [ ] Export to JSON
- [ ] Filter by date range
- [ ] Calculate growth rate
- [ ] Generate comparison report
- [ ] Get top items
- [ ] Calculate percentile

**Expected Results**:
- Date range filter works
- Grouping works correctly
- Sum calculates correctly
- Average calculates correctly
- Time series generates correctly
- Summary generates correctly
- CSV export works
- JSON export works
- Date filtering works
- Growth rate calculates correctly
- Comparison works correctly
- Top items sort correctly
- Percentile calculates correctly

---

## Testing Instructions

1. **Set up test login** - Follow [TEST_LOGIN_SETUP.md](../TEST_LOGIN_SETUP.md)
2. **Start the dev server** - `npm run dev` (runs on http://localhost:5174)
3. **Open the browser** to http://localhost:5174
4. **Login with test credentials** - Use test user or test admin account
5. **Test each section** in order of priority (HIGH → MEDIUM)
6. **Document results** in this file
7. **Report any issues** found

## Notes

- The shared platform library has been extracted to `src/shared/`
- All lint errors in shared modules have been fixed
- Pre-existing lint errors in original components remain (React hooks patterns)
- Firebase configuration must be set up in `.env` file
- Test credentials must be configured before running tests (see TEST_LOGIN_SETUP.md)
- Stripe keys must be configured for payment testing
- Test users should be created in Firebase Console or using the provided script

## Test Results

### Authentication System
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### AI Credit System
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### IntakeForm with Credit Integration
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### AIModelTraining with Credit Integration
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### AICreditWallet Component
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### AICreditPurchase Component
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### Dashboard Credit Display
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### Audit Logging System
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### Notification System
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### CRM System
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### Tenant Management
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### Stripe/Billing Integration
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]

### Reporting Framework
- Status: [PENDING]
- Issues Found: [NONE]
- Notes: [NONE]
