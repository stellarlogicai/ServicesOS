# Data Integrity Verification Checklist

## Data Flow Overview

```
Booking Created
    ↓
Job Created
    ↓
Employee Assigned
    ↓
Payment Recorded
    ↓
Invoice Generated
    ↓
Revenue Dashboard Updated
```

## Verification Steps

### Step 1: Booking Created
- [ ] Customer submits booking through CustomerBookingPortal
- [ ] Verify booking data saved to Firestore: `tenants/{tenantId}/bookings/{bookingId}`
- [ ] Verify booking contains:
  - customerName, customerEmail, customerPhone
  - serviceType, propertyType, propertySize
  - address, city, state, zip
  - preferredDate, preferredTime
  - frequency (for recurring bookings)
  - estimatedPrice
  - status: 'pending'
  - createdAt timestamp
  - tenantId

### Step 2: Job Created
- [ ] Admin converts booking to job
- [ ] Verify job data saved to Firestore: `tenants/{tenantId}/jobs/{jobId}`
- [ ] Verify job contains:
  - bookingId (reference to original booking)
  - customerName, customerEmail, customerPhone
  - serviceType, propertyType, propertySize
  - address, city, state, zip
  - scheduledDate, scheduledTime
  - frequency (from booking)
  - estimatedPrice
  - status: 'scheduled'
  - createdAt timestamp
  - tenantId
- [ ] Verify booking status updated to 'confirmed'
- [ ] Verify booking jobId field populated

### Step 3: Employee Assigned
- [ ] Admin assigns employee to job
- [ ] Verify job updated with:
  - assignedEmployeeId
  - assignedEmployeeName
  - assignedAt timestamp
- [ ] Verify employee can view assigned job (test with employee role)
- [ ] Verify job appears in employee's job list via mobile API

### Step 4: Payment Recorded
- [ ] Customer makes payment via Stripe
- [ ] Verify payment intent created successfully
- [ ] Verify payment data saved to Firestore: `tenants/{tenantId}/payments/{paymentId}`
- [ ] Verify payment contains:
  - jobId (reference to job)
  - amount
  - tipAmount (if applicable)
  - paymentMethod
  - paymentIntentId (from Stripe)
  - status: 'completed'
  - collectedAt timestamp
  - tenantId
- [ ] Verify job paymentStatus updated to 'paid'
- [ ] Verify job paymentId field populated
- [ ] Verify booking payment status updated (if applicable)

### Step 5: Invoice Generated
- [ ] System generates invoice after payment
- [ ] Verify invoice data saved to Firestore: `tenants/{tenantId}/invoices/{invoiceId}`
- [ ] Verify invoice contains:
  - jobId (reference to job)
  - paymentId (reference to payment)
  - customerName, customerEmail
  - lineItems (services rendered)
  - subtotal
  - tax (if applicable)
  - total
  - status: 'paid'
  - generatedAt timestamp
  - tenantId
- [ ] Verify invoice PDF generated (if applicable)
- [ ] Verify invoice sent to customer email (if applicable)

### Step 6: Revenue Dashboard Updated
- [ ] Verify revenue dashboard reflects new payment
- [ ] Check revenue metrics:
  - Total revenue
  - Revenue by service type
  - Revenue by date
  - Revenue by employee
- [ ] Verify dashboard data matches payment amount
- [ ] Verify dashboard filters by tenantId correctly
- [ ] Verify dashboard updates in real-time or near real-time

## Cross-Verification Checks

### Data Consistency
- [ ] Booking total matches job estimated price
- [ ] Job estimated price matches payment amount
- [ ] Payment amount matches invoice total
- [ ] Invoice total matches revenue dashboard total
- [ ] All timestamps are chronological and logical
- [ ] All tenantId fields match across collections

### Reference Integrity
- [ ] All bookingId references point to valid bookings
- [ ] All jobId references point to valid jobs
- [ ] All paymentId references point to valid payments
- [ ] All employeeId references point to valid employees
- [ ] All customerId references point to valid customers

### Status Transitions
- [ ] Booking: pending → confirmed
- [ ] Job: scheduled → in-progress → completed
- [ ] Payment: pending → completed
- [ ] Invoice: pending → paid

## Edge Cases to Test

### Partial Payments
- [ ] Create booking with deposit payment
- [ ] Verify partial payment recorded
- [ ] Verify remaining balance tracked
- [ ] Verify final payment completes the flow

### Refunds
- [ ] Process refund for completed job
- [ ] Verify payment status updated to 'refunded'
- [ ] Verify invoice status updated
- [ ] Verify revenue dashboard adjusted
- [ ] Verify refund amount tracked separately

### Cancellations
- [ ] Cancel booking before job creation
- [ ] Cancel job before payment
- [ ] Cancel job after payment
- [ ] Verify status updates at each stage
- [ ] Verify refund processed if payment made

### Recurring Bookings
- [ ] Create recurring booking (weekly/biweekly/monthly)
- [ ] Verify frequency field saved correctly
- [ ] Verify recurring jobs generated for future dates
- [ ] Verify each recurring job follows same data flow
- [ ] Verify revenue dashboard aggregates recurring revenue

## Data Quality Checks

### Required Fields
- [ ] All required fields are present in each collection
- [ ] No null or undefined values in required fields
- [ ] Email addresses are valid format
- [ ] Phone numbers are valid format
- [ ] Dates are valid ISO strings

### Data Types
- [ ] Amounts are numbers (not strings)
- [ ] Timestamps are Firestore timestamps
- [ ] Boolean fields are true/false
- [ ] Arrays are arrays
- [ ] Objects are objects

### Data Validation
- [ ] Prices are positive numbers
- [ ] Dates are not in the past (for scheduled events)
- [ ] Email addresses are unique per customer
- [ ] Phone numbers are unique per customer (if required)

## Performance Verification

### Query Performance
- [ ] Booking queries complete within acceptable time
- [ ] Job queries complete within acceptable time
- [ ] Payment queries complete within acceptable time
- [ ] Revenue dashboard loads within acceptable time
- [ ] No N+1 query problems

### Index Verification
- [ ] Verify Firestore indexes exist for:
  - bookings by date
  - jobs by scheduledDate and assignedEmployeeId
  - payments by date and status
  - invoices by date and status
- [ ] Verify composite indexes for common query patterns

## Security Verification

### Tenant Isolation
- [ ] Verify users can only access their tenant's data
- [ ] Verify cross-tenant data leaks don't exist
- [ ] Verify tenantId is properly indexed

### Permission Checks
- [ ] Verify customers can only view their own bookings
- [ ] Verify employees can only view assigned jobs
- [ ] Verify admins can view all data for their tenant
- [ ] Verify super-admins can view all data across tenants

## Automation Opportunities

- Create automated tests for data flow
- Set up data integrity monitoring
- Create alerts for data inconsistencies
- Implement data validation at write time
- Create scheduled data integrity checks
