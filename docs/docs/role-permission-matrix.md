# Role Permission Testing Matrix

## Current Role Structure (AuthContext.jsx)

### Defined Roles:
1. **customer** - End customers booking services
2. **admin** - Business owners/managers
3. **super-admin** - Platform administrators

### Missing Roles (from launch-readiness checklist):
- **Manager** - Not currently defined
- **Employee** - Not currently defined

## Permission Matrix

| Permission | Customer | Admin | Super-Admin | Manager* | Employee* |
|------------|----------|-------|-------------|----------|-----------|
| view_own_quotes | ✅ | ✅ | ✅ | ❓ | ❓ |
| create_quotes | ✅ | ✅ | ✅ | ❓ | ❓ |
| view_own_bookings | ✅ | ✅ | ✅ | ❓ | ❓ |
| upload_photos | ✅ | ✅ | ✅ | ❓ | ❓ |
| view_all_leads | ❌ | ✅ | ✅ | ❓ | ❓ |
| manage_bookings | ❌ | ✅ | ✅ | ❓ | ❓ |
| view_analytics | ❌ | ✅ | ✅ | ❓ | ❓ |
| manage_staff | ❌ | ✅ | ✅ | ❓ | ❌ |
| complete_jobs | ❌ | ✅ | ✅ | ❓ | ✅ |
| send_quotes | ❌ | ✅ | ✅ | ❓ | ❌ |
| manage_settings | ❌ | ✅ | ✅ | ❓ | ❌ |
| manage_tenants | ❌ | ❌ | ✅ | ❌ | ❌ |
| switch_tenants | ❌ | ❌ | ✅ | ❌ | ❌ |
| view_all_tenants | ❌ | ❌ | ✅ | ❌ | ❌ |
| manage_subscriptions | ❌ | ❌ | ✅ | ❌ | ❌ |
| manage_users | ❌ | ❌ | ✅ | ❓ | ❌ |
| view_all_data | ❌ | ❌ | ✅ | ❌ | ❌ |

* = Role not currently defined in AuthContext

## Entity Access Testing

### Jobs
- **Customer**: View own jobs only
- **Admin**: View all jobs, create, edit, delete
- **Super-Admin**: View all jobs across all tenants
- **Manager**: Should view jobs for their team (not defined)
- **Employee**: Should view assigned jobs only (not defined)

### Customers
- **Customer**: View own profile only
- **Admin**: View all customers, create, edit, delete
- **Super-Admin**: View all customers across all tenants
- **Manager**: Should view customers (not defined)
- **Employee**: Should view customer info for assigned jobs (not defined)

### Employees
- **Customer**: No access
- **Admin**: View all employees, create, edit, delete
- **Super-Admin**: View all employees across all tenants
- **Manager**: Should view/manage team employees (not defined)
- **Employee**: View own profile only (not defined)

### Payroll
- **Customer**: No access
- **Admin**: View all payroll data
- **Super-Admin**: View all payroll across all tenants
- **Manager**: Should view team payroll (not defined)
- **Employee**: View own payroll only (not defined)

### Payments
- **Customer**: View own payments
- **Admin**: View all payments, process refunds
- **Super-Admin**: View all payments across all tenants
- **Manager**: Should view team payments (not defined)
- **Employee**: View payments for completed jobs (not defined)

### Reports
- **Customer**: No access
- **Admin**: View all reports
- **Super-Admin**: View all reports across all tenants
- **Manager**: Should view team reports (not defined)
- **Employee**: Limited reports (not defined)

## Action Items

### High Priority
1. **Define Manager Role**: Add manager role to AuthContext with appropriate permissions
2. **Define Employee Role**: Add employee role to AuthContext with appropriate permissions
3. **Update Permission Matrix**: Add manager and employee permissions to ROLE_PERMISSIONS
4. **Test Existing Roles**: Create test cases for customer, admin, super-admin

### Medium Priority
5. **Create Permission Tests**: Add unit tests for permission checks
6. **Document Permission Changes**: Update documentation with new roles
7. **UI Role Selection**: Add role selection in user management UI

## Testing Checklist

### Manual Testing Required
- [ ] Customer can only view their own quotes
- [ ] Customer can create quotes
- [ ] Customer cannot view other customers' data
- [ ] Admin can view all leads
- [ ] Admin can manage bookings
- [ ] Admin can view analytics
- [ ] Admin can manage staff
- [ ] Super-admin can switch tenants
- [ ] Super-admin can view all tenants
- [ ] Super-admin can manage subscriptions
- [ ] Cross-tenant data isolation verified

### Automated Testing Required
- [ ] Unit tests for hasPermission() function
- [ ] Unit tests for belongsToTenant() function
- [ ] Integration tests for role-based route protection
- [ ] Integration tests for data access by role
