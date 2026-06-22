# Framework Extraction Guide

## Overview

This document outlines the process for extracting core components from ServicesOS to create a reusable SLAI Framework that can serve as the foundation for future products (RetailOS, SLAIOS, etc.).

**See Also:** [SLAI_Framework.md](../architecture/Vision/SLAI_Framework.md) for the complete framework vision, philosophy, and 10-layer architecture.

## Goal

Transform ServicesOS from a single-product codebase into a framework-based architecture where:
- Core functionality is extracted into reusable framework modules
- Products are built as feature layers on top of the framework
- New products can be rapidly created by composing framework modules

## Product Creation Model

As defined in SLAI_Framework.md:

```
Core SLAI Framework + Industry Module = New Operating System
```

**Examples:**
- SLAI Framework + Cleaning Module = CleaningOS
- SLAI Framework + Tournament Module = TournamentOS
- SLAI Framework + Card Shop Module = CardShopOS
- SLAI Framework + Security Module = SecurityOS

Every new operating system should become easier to build than the previous one.

## Framework Architecture Reference

The SLAI Framework consists of 10 layers (from SLAI_Framework.md):

1. **Identity & Access** - Authentication, User Management, Roles, Permissions, Multi-Tenant Support
2. **Operational Engine** - Scheduling, Task Management, Assignments, Workflows, Status Tracking
3. **Data Collection Engine** - Forms, Events, Logs, Metrics, Telemetry, Media Uploads
4. **Analytics Engine** - Dashboards, KPIs, Reports, Trend Analysis, Risk Analysis
5. **AI Intelligence Layer** - Recommendations, Predictions, Risk Scoring, Pattern Recognition
6. **Training & Knowledge Layer** - Training Systems, Certification Tracking, SOP Library
7. **Quality Assurance Layer** - Inspections, Scorecards, Audits, Incident Tracking
8. **Communication Layer** - Email, SMS, Push Notifications, Internal Messaging
9. **Reporting Layer** - Executive Reports, Operational Reports, Customer Reports
10. **Automation Layer** - Workflow Automation, Trigger Systems, Smart Recommendations

## Core Components to Extract

### 1. Authentication & Authorization
**Location:** `servicesos-web/src/contexts/AuthContext.jsx`

**Extract to:** `shared/auth/`

**Components:**
- Multi-tenant authentication
- Role-based access control (RBAC)
- Permission system
- User profile management
- Tenant switching (super-admin)

**Framework Value:**
- Every SLAI product needs multi-tenant auth
- Permission system is product-agnostic
- User management patterns are consistent across products

**Dependencies to Abstract:**
- Firebase Auth → Interface for auth provider
- Firestore → Interface for user data store
- Multi-tenant service → Interface for tenant management

---

### 2. Database & Data Layer
**Location:** `servicesos-web/src/firebase.js`, `shared/tenants/`, `shared/crm/`

**Extract to:** `shared/database/`

**Components:**
- Firebase initialization wrapper
- Tenant isolation patterns
- CRUD operation helpers
- Query builders
- Data validation schemas

**Framework Value:**
- Standardized data access patterns
- Consistent tenant isolation
- Reusable query patterns
- Type-safe data operations

---

### 3. Subscription & Billing
**Location:** `servicesos-web/src/lib/subscriptionConfig.js`, `shared/billing/`, `shared/credits/`

**Extract to:** `shared/billing/`

**Components:**
- Subscription tier configuration
- Usage tracking
- Credit system
- Billing calculations
- Feature flags by tier

**Framework Value:**
- Every product needs subscription management
- Consistent billing logic
- Reusable tier configurations
- Standardized feature gating

---

### 4. Notification System
**Location:** `shared/notifications/`

**Extract to:** `shared/notifications/`

**Components:**
- Email service interface
- SMS service interface
- In-app notifications
- Notification preferences
- Template system

**Framework Value:**
- Communication patterns are product-agnostic
- Consistent notification experience
- Multi-channel support
- Template management

---

### 5. Reporting & Analytics
**Location:** `shared/reporting/`

**Extract to:** `shared/analytics/`

**Components:**
- Metrics collection
- Report generation
- Dashboard components
- Data aggregation
- Export functionality

**Framework Value:**
- Every product needs analytics
- Consistent reporting patterns
- Reusable dashboard components
- Standardized metrics

---

### 6. Audit & Logging
**Location:** `shared/audit/`

**Extract to:** `shared/audit/`

**Components:**
- Audit log system
- Change tracking
- User activity logging
- Compliance helpers

**Framework Value:**
- Critical for enterprise customers
- Compliance requirements
- Security monitoring
- Debugging support

---

### 7. UI Component Library
**Location:** `servicesos-web/src/components/` (reusable components)

**Extract to:** `shared/components/`

**Components to Extract:**
- Forms (validated, multi-step)
- Tables (sortable, filterable)
- Modals
- Loading states
- Error boundaries
- Data visualization

**Framework Value:**
- Consistent UI across products
- Faster development
- Tested components
- Design system enforcement

---

### 8. Service Integrations
**Location:** Various service files

**Extract to:** `shared/integrations/`

**Components:**
- Stripe integration wrapper
- Email provider interface
- SMS provider interface
- Calendar integration
- Payment processing

**Framework Value:**
- Standardized integration patterns
- Easy provider switching
- Consistent error handling
- Reusable connection logic

---

## Extraction Process

### Phase 1: Interface Definition
1. Define clear interfaces for each component
2. Identify dependencies and create abstractions
3. Design configuration system for product-specific customization

### Phase 2: Component Isolation
1. Extract component from ServicesOS
2. Remove product-specific logic
3. Replace hard-coded values with configuration
4. Add dependency injection

### Phase 3: Framework Packaging
1. Organize extracted components in shared/
2. Create framework initialization system
3. Add documentation and examples
4. Write framework tests

### Phase 4: ServicesOS Refactoring
1. Update ServicesOS to use framework components
2. Remove extracted code from ServicesOS
3. Configure framework for ServicesOS needs
4. Test ServicesOS with framework

### Phase 5: Validation
1. Ensure ServicesOS works identically
2. Test framework independently
3. Validate framework extensibility
4. Document framework usage

---

## Framework Configuration

Each product will configure the framework with:

```javascript
// Example framework configuration
const frameworkConfig = {
  auth: {
    provider: 'firebase', // or 'auth0', 'custom'
    tenantIsolation: true,
    roles: ['customer', 'admin', 'super-admin']
  },
  database: {
    provider: 'firestore', // or 'postgresql', 'mongodb'
    tenantPrefix: 'tenant_'
  },
  billing: {
    provider: 'stripe',
    tiers: {
      starter: { features: [...] },
      professional: { features: [...] },
      enterprise: { features: [...] }
    }
  },
  notifications: {
    email: { provider: 'sendgrid' },
    sms: { provider: 'twilio' }
  },
  features: {
    multiTenant: true,
    whiteLabel: true,
    apiAccess: true
  }
};
```

---

## Product Layer Architecture

After extraction, each product will be:

```
Product (e.g., ServicesOS)
├── Product-Specific Features
│   ├── Cleaning industry logic
│   ├── Service types
│   ├── Industry-specific workflows
│   └── Product UI
└── Framework Layer
    ├── Auth (from framework)
    ├── Database (from framework)
    ├── Billing (from framework)
    ├── Notifications (from framework)
    ├── Analytics (from framework)
    └── UI Components (from framework)
```

---

## Benefits

### Development Speed
- New products start with 60-80% of functionality already built
- Focus on product-specific features only
- Faster time to market

### Consistency
- Same auth patterns across all products
- Consistent billing and subscription logic
- Uniform user experience
- Standardized data structures

### Maintenance
- Bug fixes in framework benefit all products
- Security updates apply universally
- Feature additions available to all products
- Reduced code duplication

### Quality
- Framework components are heavily tested
- Proven in production (ServicesOS)
- Consistent error handling
- Standardized security practices

### Strategic Advantages (from SLAI_Framework.md)
- Faster product development
- Shared code across products
- Shared architecture patterns
- Shared AI systems
- Shared analytics
- Consistent user experience

---

## Migration Path

### Step 1: Framework Foundation
Extract most critical components first:
1. Auth & Authorization
2. Database layer
3. Basic UI components

### Step 2: Core Services
Extract business-critical services:
1. Billing & Subscriptions
2. Notifications
3. Audit logging

### Step 3: Advanced Features
Extract complex features:
1. Analytics & Reporting
2. Advanced UI components
3. Service integrations

### Step 4: Product Validation
Build a simple product using framework:
1. Create minimal product
2. Use only framework components
3. Validate framework completeness
4. Document gaps

---

## Success Criteria

Framework extraction is successful when:
- ✅ ServicesOS runs 100% on framework
- ✅ Framework can be imported as standalone package
- ✅ New product can be created in < 50% of original time
- ✅ Framework has comprehensive documentation
- ✅ Framework has test coverage > 80%
- ✅ Framework is versioned and released independently
- ✅ Every new product becomes easier to build than the previous one (SLAI_Framework.md principle)
- ✅ Products save customers time, money, and complexity (SLAI_Framework.md Product Rule #1)

---

## Next Steps

1. **Prioritize Extraction Order** - Start with auth and database
2. **Define Interfaces** - Create clear contracts for each component
3. **Set Up Framework Repo** - Separate repository for framework
4. **Create Build System** - Framework packaging and distribution
5. **Write Migration Guide** - How to move ServicesOS to framework
6. **Plan Second Product** - Use framework to build RetailOS or SLAIOS

---

## Related Documents

- [SLAI Framework](../architecture/Vision/SLAI_Framework.md) - Complete framework vision, philosophy, and architecture
- [Developer Onboarding](../../Planning/ServicesOS/DeveloperOnboarding.md)
- [Integration Plan](../../Planning/ServicesOS/Build/INTEGRATION_PLAN.md)

---

## Notes

- Framework extraction should be done incrementally
- Each extraction should be tested thoroughly
- Maintain ServicesOS functionality throughout extraction
- Document all framework APIs and configurations
- Consider backward compatibility during transition
