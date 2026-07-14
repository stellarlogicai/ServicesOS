import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { successResponse, errorResponse } from '../shared/api/apiResponseStandard';

export async function getActiveTenantEmployeeProfiles(tenantId) {
  if (!tenantId) {
    return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
  }

  try {
    const profilesQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', tenantId),
      where('role', '==', 'employee'),
      where('status', '==', 'active')
    );
    const snapshot = await getDocs(profilesQuery);
    const employees = snapshot.docs
      .map(profileDocument => ({ uid: profileDocument.id, ...profileDocument.data() }))
      .sort((left, right) => employeeAssignmentLabel(left).localeCompare(employeeAssignmentLabel(right)));
    return successResponse(employees);
  } catch {
    return errorResponse('Active employees could not be loaded', 'FIRESTORE_ERROR');
  }
}

export function employeeAssignmentLabel(employee) {
  return employee?.displayName || employee?.name || employee?.email || employee?.uid || 'Employee';
}
