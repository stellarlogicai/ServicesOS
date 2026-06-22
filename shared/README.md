# Shared Platform Library

Reusable components and services that can be used across all SaaS products (Cleaning, Card Shop, Lawn Care, etc.).

## Overview

This shared platform library contains the core infrastructure that powers all your SaaS products. By building these components once and reusing them, you can launch new products 50-70% faster.

## Structure

```
src/shared/
├── auth/              # Authentication & authorization
├── billing/           # Stripe integration & payments
├── credits/           # AI credit system
├── crm/               # Customer records & management
├── notifications/     # Email, SMS, push notifications
├── audit/             # Audit logging
├── reporting/         # Reporting framework
├── tenants/           # Multi-tenant management
└── README.md          # This file
```

## Modules

### Authentication (auth/)

**Purpose**: User authentication, authorization, and multi-tenant management

**Features**:
- Firebase Auth integration
- Multi-tenant awareness
- Role-based access control (customer, admin, super-admin)
- Permission checking
- Google OAuth
- Password reset
- Protected routes

**Key Functions**:
- `login(email, password)` - User login
- `signup(email, password, tenantId)` - New user registration
- `loginWithGoogle(tenantId)` - Google OAuth
- `logout()` - User logout
- `resetPassword(email)` - Password reset
- `hasPermission(permission)` - Permission check
- `isAdmin()`, `isSuperAdmin()` - Role helpers

**Usage**:
```javascript
import { AuthProvider, useAuth } from '@/shared/auth';

function App() {
  return (
    <AuthProvider>
      <YourApp />
    </AuthProvider>
  );
}

function Dashboard() {
  const { user, isAdmin, hasPermission } = useAuth();
  
  if (!hasPermission('view_analytics')) {
    return <AccessDenied />;
  }
  
  return <DashboardContent />;
}
```

### Billing (billing/)

**Purpose**: Stripe integration for payments and subscriptions

**Features**:
- Payment intent creation
- Stripe Checkout sessions
- Subscription management
- Transaction fee calculation
- Payment processing

**Key Functions**:
- `createPaymentIntent(amount, currency, metadata)` - Create payment
- `processPayment(cardElement, clientSecret, billingDetails)` - Process payment
- `createCheckoutSession(amount, currency, metadata)` - Create checkout
- `redirectToCheckout(sessionId)` - Redirect to Stripe
- `createSubscription(priceId, customerEmail, tenantId)` - Create subscription
- `cancelSubscription(subscriptionId, tenantId)` - Cancel subscription

**Usage**:
```javascript
import { createPaymentIntent, processPayment } from '@/shared/billing';

async function handlePayment(amount) {
  const { clientSecret } = await createPaymentIntent(amount, 'usd', {
    orderId: '12345'
  });
  
  const result = await processPayment(cardElement, clientSecret, {
    name: 'John Doe',
    email: 'john@example.com'
  });
  
  if (result.success) {
    console.log('Payment succeeded!');
  }
}
```

### Credits (credits/)

**Purpose**: AI credit system for controlling AI costs across all platforms

**Features**:
- Credit deduction for AI operations
- Credit purchases
- Usage tracking
- Monthly credit resets
- Subscription tier management
- Credit history

**Key Functions**:
- `deductCredits(tenantId, amount, operationType, metadata)` - Deduct credits
- `purchaseCredits(tenantId, amount, paymentMethod, paymentDetails)` - Purchase credits
- `getRemainingCredits(tenantId)` - Get credit balance
- `checkCredits(tenantId, amount)` - Check if enough credits
- `getCreditCost(operationType)` - Get cost for operation
- `getCreditHistory(tenantId)` - Get usage history

**Usage**:
```javascript
import { checkCredits, deductCredits, getCreditCost } from '@/shared/credits';

async function runAIAnalysis(tenantId) {
  const cost = getCreditCost('photo_analysis');
  const check = await checkCredits(tenantId, cost);
  
  if (!check.hasEnough) {
    throw new Error('Insufficient credits');
  }
  
  // Run AI analysis
  const result = await analyzePhoto();
  
  // Deduct credits
  await deductCredits(tenantId, cost, 'photo_analysis', {
    photoId: '12345'
  });
  
  return result;
}
```

### CRM (crm/)

**Purpose**: Customer relationship management

**Features**:
- Customer creation and management
- Status tracking (new, active, inactive, lost)
- Notes and tags
- Customer search
- Customer analytics

**Key Functions**:
- `createCustomer(tenantId, customerData)` - Create customer
- `getCustomer(tenantId, customerId)` - Get customer
- `getCustomers(tenantId, status)` - List customers
- `updateCustomer(tenantId, customerId, updates)` - Update customer
- `addCustomerNote(tenantId, customerId, note)` - Add note
- `addCustomerTag(tenantId, customerId, tag)` - Add tag
- `searchCustomers(tenantId, searchTerm)` - Search customers

**Usage**:
```javascript
import { createCustomer, getCustomers } from '@/shared/crm';

async function addNewCustomer(tenantId, data) {
  const customer = await createCustomer(tenantId, {
    customerData: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234'
    },
    status: 'new',
    tags: ['vip']
  });
  
  return customer;
}
```

### Notifications (notifications/)

**Purpose**: Email, SMS, and push notification system

**Features**:
- Multi-channel notifications (email, SMS, push, in-app)
- Notification scheduling
- Read/unread tracking
- Batch notifications
- Notification history

**Key Functions**:
- `createNotification(tenantId, notificationData)` - Create notification
- `sendNotification(tenantId, notificationData)` - Send notification
- `getUserNotifications(tenantId, userId)` - Get user notifications
- `getUnreadNotifications(tenantId, userId)` - Get unread
- `markNotificationAsRead(tenantId, notificationId)` - Mark as read
- `scheduleNotification(tenantId, notificationData, scheduledFor)` - Schedule
- `batchSendNotifications(tenantId, userIds, notificationData)` - Batch send

**Usage**:
```javascript
import { sendNotification, batchSendNotifications } from '@/shared/notifications';

// Send single notification
await sendNotification(tenantId, {
  userId: 'user123',
  type: 'email',
  category: 'booking',
  title: 'New Booking Confirmed',
  body: 'Your booking has been confirmed for tomorrow at 10am'
});

// Batch send to multiple users
await batchSendNotifications(tenantId, ['user1', 'user2'], {
  type: 'email',
  title: 'System Maintenance',
  body: 'System will be down for maintenance tonight'
});
```

### Audit (audit/)

**Purpose**: Activity logging for compliance and accountability

**Features**:
- Action logging (create, update, delete, view, etc.)
- Entity tracking
- User activity tracking
- Audit analytics
- CSV export
- Log cleanup

**Key Functions**:
- `logAuditEvent(tenantId, auditData)` - Log event
- `getAuditTrailForEntity(tenantId, entityType, entityId)` - Get entity history
- `getAuditTrailForUser(tenantId, userId)` - Get user history
- `getAuditTrailByAction(tenantId, action)` - Get by action type
- `getRecentAuditEvents(tenantId, limit)` - Get recent events
- `getAuditAnalytics(tenantId, startDate, endDate)` - Get analytics
- `exportAuditTrailCSV(tenantId, startDate, endDate)` - Export CSV

**Usage**:
```javascript
import { logAuditEvent } from '@/shared/audit';

async function updateCustomer(tenantId, customerId, updates) {
  // Log the change
  await logAuditEvent(tenantId, {
    userId: currentUser.id,
    userName: currentUser.name,
    action: 'update',
    entityType: 'customer',
    entityId: customerId,
    entityName: 'John Doe',
    changes: updates,
    description: 'Updated customer information'
  });
  
  // Perform the update
  await updateCustomerInDB(customerId, updates);
}
```

### Reporting (reporting/)

**Purpose**: Generic reporting framework for analytics and exports

**Features**:
- Data aggregation
- Time series generation
- Grouping and filtering
- Growth rate calculation
- CSV/JSON export
- Comparison reports

**Key Functions**:
- `groupByField(data, field)` - Group data by field
- `sumField(data, field)` - Calculate sum
- `averageField(data, field)` - Calculate average
- `generateTimeSeries(data, dateField, valueField, granularity)` - Time series
- `generateReportSummary(data, config)` - Generate summary
- `exportToCSV(data, columns)` - Export to CSV
- `exportToJSON(data)` - Export to JSON
- `filterByDateRange(data, dateField, startDate, endDate)` - Filter by date
- `calculateGrowthRate(current, previous)` - Calculate growth
- `generateComparisonReport(currentData, previousData)` - Compare periods

**Usage**:
```javascript
import { generateTimeSeries, exportToCSV } from '@/shared/reporting';

// Generate revenue time series
const revenueData = await getRevenueData(tenantId);
const timeSeries = generateTimeSeries(
  revenueData,
  'date',
  'revenue',
  'day'
);

// Export to CSV
const csv = exportToCSV(customers, [
  { field: 'name', label: 'Name' },
  { field: 'email', label: 'Email' },
  { field: 'revenue', label: 'Revenue' }
]);
```

### Tenants (tenants/)

**Purpose**: Multi-tenant management and configuration

**Features**:
- Tenant creation
- Subscription management
- Settings management
- Feature gating
- Usage tracking initialization

**Key Functions**:
- `createTenant(tenantData)` - Create tenant
- `getTenant(tenantId)` - Get tenant
- `getTenantByEmail(email)` - Get by email
- `updateTenantSubscription(tenantId, subscriptionData)` - Update subscription
- `cancelTenantSubscription(tenantId)` - Cancel subscription
- `updateTenantSettings(tenantId, settings)` - Update settings
- `getTenantSubscription(tenantId)` - Get subscription info
- `tenantHasFeature(tenantId, feature)` - Check feature access

**Usage**:
```javascript
import { createTenant, tenantHasFeature } from '@/shared/tenants';

// Create new tenant
const tenant = await createTenant({
  businessName: 'Acme Cleaning',
  businessEmail: 'contact@acme.com',
  subscriptionTier: 'pro'
});

// Check feature access
if (await tenantHasFeature(tenantId, 'ai_analysis')) {
  // Enable AI features
}
```

## Industry-Specific Modules

Industry-specific code lives in separate modules:

```
src/modules/
├── cleaning/          # Cleaning-specific features
│   ├── scheduling/
│   ├── routing/
│   ├── estimates/
│   └── quality-control/
├── cardshop/           # Card shop-specific features
│   ├── inventory/
│   ├── pos/
│   ├── grading/
│   └── collections/
└── [future modules]/
```

Each module uses the shared platform for common functionality.

## Migration Guide

To migrate existing code to use the shared platform:

1. **Update imports**:
```javascript
// Old
import { checkCredits } from '../services/aiUsageEngineService';
import { AuthProvider } from '../contexts/AuthContext';

// New
import { checkCredits } from '@/shared/credits';
import { AuthProvider } from '@/shared/auth';
```

2. **Update Firebase imports**:
The shared modules use `../../firebase` for Firebase imports. Ensure your firebase config is at the root level.

3. **Test thoroughly**:
Since these are core infrastructure components, test thoroughly after migration.

## Benefits

- **Faster Development**: New products reuse 50-70% of infrastructure
- **Consistency**: Same authentication, billing, and patterns across all products
- **Maintainability**: Bug fixes and improvements benefit all products
- **Scalability**: Multi-tenant architecture built-in from the start
- **Cost Control**: AI credit system prevents runaway API costs

## Future Enhancements

- Role management module
- Shared UI components library
- API rate limiting
- Caching layer
- Analytics dashboard
- Webhook system
