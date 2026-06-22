import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export const CUSTOMER_PORTAL_IDENTITY_STATUS = Object.freeze({
  FOUND: 'found',
  MISSING_TENANT: 'missing-tenant',
  MISSING_USER: 'missing-user',
  CUSTOMER_NOT_FOUND: 'customer-not-found',
  ERROR: 'error'
});

const missingTenantMessage =
  'Your customer account is not linked to a business yet, so saved quote requests are not enabled.';

const missingCustomerMessage =
  'Your customer profile needs to be linked before saved quote requests can be enabled.';

const findCustomerByField = async (tenantId, fieldName, value) => {
  if (!value) {
    return null;
  }

  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customerQuery = query(customersRef, where(fieldName, '==', value), limit(1));
  const snapshot = await getDocs(customerQuery);

  if (snapshot.empty) {
    return null;
  }

  const customerDocument = snapshot.docs[0];
  return {
    id: customerDocument.id,
    ...customerDocument.data()
  };
};

export async function resolveCustomerPortalCustomer({ tenantId, user } = {}) {
  if (!tenantId) {
    return {
      status: CUSTOMER_PORTAL_IDENTITY_STATUS.MISSING_TENANT,
      customer: null,
      matchMethod: null,
      message: missingTenantMessage
    };
  }

  if (!user?.uid) {
    return {
      status: CUSTOMER_PORTAL_IDENTITY_STATUS.MISSING_USER,
      customer: null,
      matchMethod: null,
      message: 'Sign in before saved quote requests can be enabled.'
    };
  }

  try {
    const customerByAuthUid = await findCustomerByField(tenantId, 'authUid', user.uid);

    if (customerByAuthUid) {
      return {
        status: CUSTOMER_PORTAL_IDENTITY_STATUS.FOUND,
        customer: customerByAuthUid,
        matchMethod: 'authUid',
        message: 'Customer profile linked. Saved quote request persistence is still disabled.'
      };
    }

    const customerByEmail = await findCustomerByField(tenantId, 'email', user.email);

    if (customerByEmail) {
      return {
        status: CUSTOMER_PORTAL_IDENTITY_STATUS.FOUND,
        customer: customerByEmail,
        matchMethod: 'email',
        message: 'Customer profile linked by email. Saved quote request persistence is still disabled.'
      };
    }

    return {
      status: CUSTOMER_PORTAL_IDENTITY_STATUS.CUSTOMER_NOT_FOUND,
      customer: null,
      matchMethod: null,
      message: missingCustomerMessage
    };
  } catch (error) {
    return {
      status: CUSTOMER_PORTAL_IDENTITY_STATUS.ERROR,
      customer: null,
      matchMethod: null,
      message: 'Customer profile lookup could not be completed. Saved quote requests are not enabled.',
      error
    };
  }
}

