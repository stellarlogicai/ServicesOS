import { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContextValue';

const STEPS = [
  { id: 1, title: 'Create Company', subtitle: 'Welcome to CleanOps' },
  { id: 2, title: 'Connect Payments', subtitle: 'Get Paid Faster' },
  { id: 3, title: 'Company Settings', subtitle: 'Business Information' },
  { id: 4, title: 'Branding', subtitle: 'Make It Yours' },
  { id: 5, title: 'Services & Pricing', subtitle: 'Setup Your Services' },
  { id: 6, title: 'Add Employees', subtitle: 'Invite Your Team' },
  { id: 7, title: 'Import Data', subtitle: 'Moving From Another Platform?' },
];

const SERVICE_TEMPLATES = [
  {
    id: 'residential',
    name: 'Residential Cleaning',
    icon: '🏠',
    description: 'Standard home cleaning services',
    services: [
      { name: 'Standard Clean', basePrice: 100, duration: 120 },
      { name: 'Deep Clean', basePrice: 200, duration: 240 },
      { name: 'Move Out Clean', basePrice: 250, duration: 300 },
    ]
  },
  {
    id: 'commercial',
    name: 'Commercial Cleaning',
    icon: '🏢',
    description: 'Office and business cleaning',
    services: [
      { name: 'Office Cleaning', basePrice: 150, duration: 180 },
      { name: 'Retail Cleaning', basePrice: 175, duration: 180 },
      { name: 'Warehouse Cleaning', basePrice: 300, duration: 360 },
    ]
  },
  {
    id: 'moveout',
    name: 'Move Out Cleaning',
    icon: '📦',
    description: 'Move-in/move-out specialty',
    services: [
      { name: 'Move Out Clean', basePrice: 250, duration: 300 },
      { name: 'Move In Clean', basePrice: 250, duration: 300 },
      { name: 'Full Service Move', basePrice: 400, duration: 420 },
    ]
  },
  {
    id: 'mixed',
    name: 'Mixed Services',
    icon: '🧹',
    description: 'Combination of services',
    services: [
      { name: 'Standard Clean', basePrice: 100, duration: 120 },
      { name: 'Office Cleaning', basePrice: 150, duration: 180 },
      { name: 'Move Out Clean', basePrice: 250, duration: 300 },
    ]
  },
];

const IMPORT_OPTIONS = [
  { id: 'jobber', name: 'Jobber', icon: '📋' },
  { id: 'housecall', name: 'Housecall Pro', icon: '🏠' },
  { id: 'zenmaid', name: 'ZenMaid', icon: '🧘' },
  { id: 'quickbooks', name: 'QuickBooks', icon: '💰' },
  { id: 'csv', name: 'CSV Import', icon: '📄' },
];

export default function ImprovedOnboarding({ onComplete }) {
  const { completeOnboarding } = useContext(AuthContext);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Step 1: Company Info
  const [companyInfo, setCompanyInfo] = useState({
    businessName: '',
    businessType: '',
    businessPhone: '',
    businessEmail: '',
    timezone: 'America/New_York',
  });
  
  // Step 2: Payment Connection
  const [paymentChoice, setPaymentChoice] = useState(''); // 'existing', 'new', 'skip'
  
  // Step 3: Company Settings
  const [companySettings, setCompanySettings] = useState({
    address: '',
    serviceRadius: 25,
    businessHours: {
      monday: { open: '08:00', close: '18:00', closed: false },
      tuesday: { open: '08:00', close: '18:00', closed: false },
      wednesday: { open: '08:00', close: '18:00', closed: false },
      thursday: { open: '08:00', close: '18:00', closed: false },
      friday: { open: '08:00', close: '18:00', closed: false },
      saturday: { open: '09:00', close: '14:00', closed: false },
      sunday: { open: '', close: '', closed: true },
    },
  });
  
  // Step 4: Branding
  const [branding, setBranding] = useState({
    logo: null,
    primaryColor: '#1d4ed8',
    emailFooter: '',
  });
  
  // Step 5: Services
  const [selectedTemplate, setSelectedTemplate] = useState('');
  
  // Step 6: Employees
  const [employees, setEmployees] = useState([]);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', role: 'cleaner' });
  
  // Step 7: Import
  const [selectedImport, setSelectedImport] = useState('');
  const [importOptions, setImportOptions] = useState({
    customers: false,
    jobs: false,
    invoices: false,
    employees: false,
  });
  
  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(step => step + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(step => step - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(step => step + 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    
    try {
      await completeOnboarding();
      onComplete?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addEmployee = () => {
    if (newEmployee.name && newEmployee.email) {
      setEmployees([...employees, { ...newEmployee, id: Date.now() }]);
      setNewEmployee({ name: '', email: '', role: 'cleaner' });
    }
  };

  const removeEmployee = (id) => {
    setEmployees(employees.filter(e => e.id !== id));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return renderCompanyInfo();
      case 2:
        return renderPaymentConnection();
      case 3:
        return renderCompanySettings();
      case 4:
        return renderBranding();
      case 5:
        return renderServices();
      case 6:
        return renderEmployees();
      case 7:
        return renderImport();
      default:
        return null;
    }
  };

  const renderCompanyInfo = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Welcome to CleanOps</h2>
        <p className="text-gray-600 mt-1">Let's get your cleaning business set up in under 30 minutes</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
          <input
            type="text"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Sparkle Clean KC"
            value={companyInfo.businessName}
            onChange={(e) => setCompanyInfo({ ...companyInfo, businessName: e.target.value })}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Type *</label>
          <select
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={companyInfo.businessType}
            onChange={(e) => setCompanyInfo({ ...companyInfo, businessType: e.target.value })}
          >
            <option value="">Select type...</option>
            <option value="residential">Residential Cleaning</option>
            <option value="commercial">Commercial Cleaning</option>
            <option value="both">Both Residential & Commercial</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Phone *</label>
          <input
            type="tel"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="(555) 123-4567"
            value={companyInfo.businessPhone}
            onChange={(e) => setCompanyInfo({ ...companyInfo, businessPhone: e.target.value })}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Email *</label>
          <input
            type="email"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="hello@yourcompany.com"
            value={companyInfo.businessEmail}
            onChange={(e) => setCompanyInfo({ ...companyInfo, businessEmail: e.target.value })}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={companyInfo.timezone}
            onChange={(e) => setCompanyInfo({ ...companyInfo, timezone: e.target.value })}
          >
            <option value="America/New_York">Eastern Time</option>
            <option value="America/Chicago">Central Time</option>
            <option value="America/Denver">Mountain Time</option>
            <option value="America/Los_Angeles">Pacific Time</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderPaymentConnection = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Get Paid Faster</h2>
        <p className="text-gray-600 mt-1">Connect your Stripe account to receive payments directly</p>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Why Connect Stripe?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Receive payments directly to your account</li>
          <li>• Automatic deposits to your bank</li>
          <li>• Professional payment processing</li>
          <li>• Platform fee (5%) automatically deducted</li>
        </ul>
      </div>
      
      <div className="space-y-3">
        <button
          onClick={() => setPaymentChoice('existing')}
          className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
            paymentChoice === 'existing' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <div className="flex items-center">
            <span className="text-2xl mr-3">🔗</span>
            <div>
              <div className="font-semibold">Connect Existing Stripe Account</div>
              <div className="text-sm text-gray-600">Use your current Stripe account</div>
            </div>
          </div>
        </button>
        
        <button
          onClick={() => setPaymentChoice('new')}
          className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
            paymentChoice === 'new' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <div className="flex items-center">
            <span className="text-2xl mr-3">➕</span>
            <div>
              <div className="font-semibold">Create New Stripe Account</div>
              <div className="text-sm text-gray-600">Set up a new account in minutes</div>
            </div>
          </div>
        </button>
        
        <button
          onClick={() => setPaymentChoice('skip')}
          className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
            paymentChoice === 'skip' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <div className="flex items-center">
            <span className="text-2xl mr-3">⏭️</span>
            <div>
              <div className="font-semibold">Skip For Now</div>
              <div className="text-sm text-gray-600">Connect later in settings</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  const renderCompanySettings = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Business Information</h2>
        <p className="text-gray-600 mt-1">Configure your service area and hours</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Address</label>
          <input
            type="text"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="123 Main St, Kansas City, MO"
            value={companySettings.address}
            onChange={(e) => setCompanySettings({ ...companySettings, address: e.target.value })}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Service Radius (miles)</label>
          <input
            type="number"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="25"
            value={companySettings.serviceRadius}
            onChange={(e) => setCompanySettings({ ...companySettings, serviceRadius: parseInt(e.target.value) })}
          />
          <p className="text-sm text-gray-500 mt-1">This powers your scheduling and quoting</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Business Hours</label>
          <div className="space-y-2">
            {Object.entries(companySettings.businessHours).map(([day, hours]) => (
              <div key={day} className="flex items-center gap-2">
                <span className="w-24 capitalize text-sm">{day}</span>
                {!hours.closed ? (
                  <>
                    <input
                      type="time"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                      value={hours.open}
                      onChange={(e) => setCompanySettings({
                        ...companySettings,
                        businessHours: {
                          ...companySettings.businessHours,
                          [day]: { ...hours, open: e.target.value }
                        }
                      })}
                    />
                    <span>-</span>
                    <input
                      type="time"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                      value={hours.close}
                      onChange={(e) => setCompanySettings({
                        ...companySettings,
                        businessHours: {
                          ...companySettings.businessHours,
                          [day]: { ...hours, close: e.target.value }
                        }
                      })}
                    />
                  </>
                ) : (
                  <span className="text-sm text-gray-500">Closed</span>
                )}
                <button
                  onClick={() => setCompanySettings({
                    ...companySettings,
                    businessHours: {
                      ...companySettings.businessHours,
                      [day]: { ...hours, closed: !hours.closed }
                    }
                  })}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {hours.closed ? 'Open' : 'Close'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderBranding = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Make It Yours</h2>
        <p className="text-gray-600 mt-1">Customize your brand appearance</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Upload Logo</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setBranding({ ...branding, logo: e.target.files[0] })}
              className="hidden"
              id="logo-upload"
            />
            <label htmlFor="logo-upload" className="cursor-pointer">
              <div className="text-4xl mb-2">📷</div>
              <p className="text-gray-600">Click to upload logo</p>
              <p className="text-sm text-gray-500">PNG, JPG up to 2MB</p>
            </label>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={branding.primaryColor}
              onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              className="w-12 h-12 rounded border border-gray-300"
            />
            <input
              type="text"
              value={branding.primaryColor}
              onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Footer</label>
          <textarea
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows="3"
            placeholder="Thank you for choosing Sparkle Clean KC!"
            value={branding.emailFooter}
            onChange={(e) => setBranding({ ...branding, emailFooter: e.target.value })}
          />
        </div>
        
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Live Preview</h3>
          <div className="space-y-2">
            <div className="bg-white p-4 rounded border" style={{ borderColor: branding.primaryColor }}>
              <div className="font-semibold" style={{ color: branding.primaryColor }}>Estimate Preview</div>
              <div className="text-sm text-gray-600">Your estimate from {companyInfo.businessName}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderServices = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Services & Pricing</h2>
        <p className="text-gray-600 mt-1">Choose a starting template or create custom services</p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Choose Starting Template</label>
        <div className="grid grid-cols-2 gap-3">
          {SERVICE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template.id)}
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                selectedTemplate === template.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-2xl mb-2">{template.icon}</div>
              <div className="font-semibold">{template.name}</div>
              <div className="text-sm text-gray-600">{template.description}</div>
            </button>
          ))}
        </div>
      </div>
      
      {selectedTemplate && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-900 mb-2">AI Recommended Pricing</h3>
          <p className="text-sm text-green-800">Pre-populated with common values for your area. You can edit later.</p>
          <div className="mt-3 space-y-2">
            {SERVICE_TEMPLATES.find(t => t.id === selectedTemplate).services.map((service) => (
              <div key={service.name} className="flex justify-between text-sm">
                <span>{service.name}</span>
                <span className="font-semibold">${service.basePrice}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderEmployees = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Invite Your Team</h2>
        <p className="text-gray-600 mt-1">Add employees to get started (skip for now if needed)</p>
      </div>
      
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Name"
            value={newEmployee.name}
            onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <input
            type="email"
            placeholder="Email"
            value={newEmployee.email}
            onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            value={newEmployee.role}
            onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="cleaner">Cleaner</option>
            <option value="dispatcher">Dispatcher</option>
          </select>
          <button
            onClick={addEmployee}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add
          </button>
        </div>
        
        {employees.length > 0 && (
          <div className="space-y-2">
            {employees.map((employee) => (
              <div key={employee.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-semibold">{employee.name}</div>
                  <div className="text-sm text-gray-600">{employee.email} • {employee.role}</div>
                </div>
                <button
                  onClick={() => removeEmployee(employee.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderImport = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Import Existing Data</h2>
        <p className="text-gray-600 mt-1">Moving from another platform? Import your data (optional)</p>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {IMPORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => setSelectedImport(option.id)}
            className={`p-4 border-2 rounded-lg text-center transition-colors ${
              selectedImport === option.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="text-2xl mb-2">{option.icon}</div>
            <div className="font-semibold text-sm">{option.name}</div>
          </button>
        ))}
      </div>
      
      {selectedImport && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">What to import?</label>
          {['customers', 'jobs', 'invoices', 'employees'].map((item) => (
            <label key={item} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={importOptions[item]}
                onChange={(e) => setImportOptions({ ...importOptions, [item]: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="capitalize">{item}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const safeCurrentStep = Math.min(Math.max(currentStep, 1), STEPS.length);
  const progressPercent = Math.round((safeCurrentStep / STEPS.length) * 100);
  const currentStepData = STEPS[safeCurrentStep - 1];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="mb-2">
            <span className="text-sm font-medium text-gray-600">
              Step {safeCurrentStep} of {STEPS.length} • {progressPercent}% Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Step header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {currentStepData.title}
            </h2>
            <p className="text-gray-600">{currentStepData.subtitle}</p>
          </div>

          {/* Step content */}
          {renderStep()}

          {/* Navigation buttons */}
          <div className="flex gap-3 mt-8">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Back
              </button>
              
              {currentStep < STEPS.length && (
                <>
                  <button
                    onClick={handleSkip}
                    className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Continue →
                  </button>
                </>
              )}
              
              {currentStep === STEPS.length && (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {loading ? 'Completing Setup...' : 'Complete Setup →'}
                </button>
              )}
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
