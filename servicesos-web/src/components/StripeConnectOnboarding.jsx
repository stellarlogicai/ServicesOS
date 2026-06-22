import { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContextValue';

const StripeConnectOnboarding = () => {
  const { tenantId } = useContext(AuthContext);
  const [accountStatus, setAccountStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [error, setError] = useState(null);
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessName, setBusinessName] = useState('');

  const fetchAccountStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_FUNCTIONS_URL || 'http://localhost:5001'}/cleaning-intake-system/us-central1/api/stripe-connect/account-status?tenantId=${tenantId}`
      );
      const data = await response.json();
      setAccountStatus(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching account status:', err);
      setError('Failed to fetch account status');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive && tenantId) {
        fetchAccountStatus();
      }
    });

    return () => {
      isActive = false;
    };
  }, [tenantId, fetchAccountStatus]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    
    if (!businessEmail) {
      setError('Business email is required');
      return;
    }

    try {
      setOnboardingLoading(true);
      setError(null);

      const response = await fetch(
        `${import.meta.env.VITE_FUNCTIONS_URL || 'http://localhost:5001'}/cleaning-intake-system/us-central1/api/stripe-connect/create-account`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            businessEmail,
            businessName
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account');
      }

      // Generate onboarding link
      await handleGenerateOnboardingLink();
    } catch (err) {
      console.error('Error creating account:', err);
      setError(err.message);
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleGenerateOnboardingLink = async () => {
    try {
      setOnboardingLoading(true);
      setError(null);

      const response = await fetch(
        `${import.meta.env.VITE_FUNCTIONS_URL || 'http://localhost:5001'}/cleaning-intake-system/us-central1/api/stripe-connect/onboarding-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            returnUrl: window.location.href,
            refreshUrl: window.location.href
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate onboarding link');
      }

      // Redirect to Stripe onboarding
      window.location.href = data.url;
    } catch (err) {
      console.error('Error generating onboarding link:', err);
      setError(err.message);
    } finally {
      setOnboardingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Stripe Connect Setup</h2>
      
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Why Connect Your Stripe Account?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Receive payments directly to your own Stripe account</li>
          <li>• You own the chargebacks and refunds</li>
          <li>• Automatic payouts to your bank account</li>
          <li>• Platform fee (5%) automatically deducted</li>
          <li>• Simplified accounting and tax compliance</li>
        </ul>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {!accountStatus?.connected ? (
        <div>
          <p className="text-gray-600 mb-4">
            Connect your Stripe account to start receiving payments directly.
          </p>
          
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Email
              </label>
              <input
                type="email"
                value={businessEmail}
                onChange={(e) => setBusinessEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your-business@example.com"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name (Optional)
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your Cleaning Business"
              />
            </div>

            <button
              type="submit"
              disabled={onboardingLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {onboardingLoading ? 'Processing...' : 'Connect Stripe Account'}
            </button>
          </form>
        </div>
      ) : (
        <div>
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold text-green-900">
                Stripe Account Connected
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className={`font-medium ${accountStatus.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>
                {accountStatus.status === 'active' ? 'Active' : 'Pending'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Charges Enabled:</span>
              <span className={`font-medium ${accountStatus.chargesEnabled ? 'text-green-600' : 'text-red-600'}`}>
                {accountStatus.chargesEnabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Payouts Enabled:</span>
              <span className={`font-medium ${accountStatus.payoutsEnabled ? 'text-green-600' : 'text-red-600'}`}>
                {accountStatus.payoutsEnabled ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {accountStatus.status === 'pending' && (
            <button
              onClick={handleGenerateOnboardingLink}
              disabled={onboardingLoading}
              className="mt-4 w-full bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {onboardingLoading ? 'Loading...' : 'Complete Onboarding'}
            </button>
          )}

          <button
            onClick={fetchAccountStatus}
            className="mt-4 w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
          >
            Refresh Status
          </button>
        </div>
      )}
    </div>
  );
};

export default StripeConnectOnboarding;
