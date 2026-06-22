// src/components/CustomerBookingPortal.jsx
/**
 * Customer Booking Portal
 * Allows customers to self-book appointments
 */

import { useState } from 'react';

const CustomerBookingPortal = ({ tenantId }) => { // eslint-disable-line no-unused-vars
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Service Selection
    serviceType: '',
    propertyType: '',
    propertySize: '',
    
    // Step 2: Property Details
    address: '',
    city: '',
    state: '',
    zip: '',
    unit: '',
    
    // Step 3: Date & Time
    preferredDate: '',
    preferredTime: '',
    flexible: false,
    frequency: 'one-time',
    
    // Step 4: Contact Info
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    
    // Step 5: Review
    notes: ''
  });

  const availableTimes = [
    '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'
  ];

  const serviceTypes = [
    { id: 'standard', name: 'Standard Cleaning', description: 'Regular cleaning service', basePrice: 100 },
    { id: 'deep', name: 'Deep Cleaning', description: 'Thorough cleaning including baseboards and appliances', basePrice: 200 },
    { id: 'move', name: 'Move In/Out', description: 'Complete cleaning for moving', basePrice: 250 },
    { id: 'post-construction', name: 'Post Construction', description: 'Cleaning after renovation work', basePrice: 300 }
  ];

  const propertyTypes = [
    { id: 'apartment', name: 'Apartment' },
    { id: 'house', name: 'House' },
    { id: 'condo', name: 'Condo' },
    { id: 'townhouse', name: 'Townhouse' },
    { id: 'office', name: 'Office' }
  ];

  const propertySizes = [
    { id: 'small', name: 'Small (under 1000 sq ft)', multiplier: 1 },
    { id: 'medium', name: 'Medium (1000-2000 sq ft)', multiplier: 1.5 },
    { id: 'large', name: 'Large (2000-3000 sq ft)', multiplier: 2 },
    { id: 'extra-large', name: 'Extra Large (3000+ sq ft)', multiplier: 2.5 }
  ];

  const frequencyOptions = [
    { id: 'one-time', name: 'One-time', description: 'Single cleaning service' },
    { id: 'weekly', name: 'Weekly', description: 'Every week' },
    { id: 'biweekly', name: 'Bi-weekly', description: 'Every 2 weeks' },
    { id: 'monthly', name: 'Monthly', description: 'Once a month' }
  ];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const calculateEstimatedPrice = () => {
    const service = serviceTypes.find(s => s.id === formData.serviceType);
    const size = propertySizes.find(s => s.id === formData.propertySize);
    if (!service || !size) return 0;
    return service.basePrice * size.multiplier;
  };

  const handleNext = () => {
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Submit booking logic here
    console.log('Booking submitted:', formData);
    alert('Booking request submitted! We will contact you shortly to confirm.');
  };

  const renderStep1 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Select Service Type</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {serviceTypes.map((service) => (
          <div
            key={service.id}
            onClick={() => setFormData(prev => ({ ...prev, serviceType: service.id }))}
            className={`p-4 border rounded-lg cursor-pointer ${
              formData.serviceType === service.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
          >
            <h3 className="font-semibold">{service.name}</h3>
            <p className="text-sm text-gray-600 mb-2">{service.description}</p>
            <p className="font-bold text-blue-600">Starting at ${service.basePrice}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold mb-4">Property Type</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {propertyTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => setFormData(prev => ({ ...prev, propertyType: type.id }))}
            className={`p-3 border rounded-lg ${
              formData.propertyType === type.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
          >
            {type.name}
          </button>
        ))}
      </div>

      <h2 className="text-xl font-bold mb-4">Property Size</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {propertySizes.map((size) => (
          <button
            key={size.id}
            onClick={() => setFormData(prev => ({ ...prev, propertySize: size.id }))}
            className={`p-3 border rounded-lg ${
              formData.propertySize === size.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
          >
            {size.name}
          </button>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={!formData.serviceType || !formData.propertyType || !formData.propertySize}
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300"
      >
        Continue
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Property Details</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit/Apt (optional)</label>
          <input
            type="text"
            name="unit"
            value={formData.unit}
            onChange={handleInputChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input
            type="text"
            name="state"
            value={formData.state}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
          <input
            type="text"
            name="zip"
            value={formData.zip}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleBack} className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400">
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!formData.address || !formData.city || !formData.state || !formData.zip}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Select Date & Time</h2>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Date</label>
        <input
          type="date"
          name="preferredDate"
          value={formData.preferredDate}
          onChange={handleInputChange}
          min={new Date().toISOString().split('T')[0]}
          required
          className="w-full md:w-auto border border-gray-300 rounded px-3 py-2"
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Time</label>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {availableTimes.map((time) => (
            <button
              key={time}
              onClick={() => setFormData(prev => ({ ...prev, preferredTime: time }))}
              className={`p-2 border rounded ${
                formData.preferredTime === time ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              {time}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            name="flexible"
            checked={formData.flexible}
            onChange={handleInputChange}
            className="mr-2"
          />
          <span className="text-sm text-gray-700">I'm flexible with the date and time</span>
        </label>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Service Frequency</label>
        <div className="grid grid-cols-2 gap-3">
          {frequencyOptions.map((freq) => (
            <button
              key={freq.id}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, frequency: freq.id }))}
              className={`p-3 border rounded text-left ${
                formData.frequency === freq.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <div className="font-semibold text-sm">{freq.name}</div>
              <div className="text-xs text-gray-600">{freq.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleBack} className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400">
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!formData.preferredDate || !formData.preferredTime}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Contact Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
          <input
            type="text"
            name="firstName"
            value={formData.firstName}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
          <input
            type="text"
            name="lastName"
            value={formData.lastName}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleBack} className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400">
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!formData.firstName || !formData.lastName || !formData.email || !formData.phone}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Review & Submit</h2>
      
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="font-semibold mb-3">Booking Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Service:</span>
            <span>{serviceTypes.find(s => s.id === formData.serviceType)?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>Property Type:</span>
            <span>{propertyTypes.find(t => t.id === formData.propertyType)?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>Property Size:</span>
            <span>{propertySizes.find(s => s.id === formData.propertySize)?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>Address:</span>
            <span>{formData.address}, {formData.city}, {formData.state} {formData.zip}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{formData.preferredDate}</span>
          </div>
          <div className="flex justify-between">
            <span>Time:</span>
            <span>{formData.preferredTime}</span>
          </div>
          <div className="flex justify-between">
            <span>Frequency:</span>
            <span>{frequencyOptions.find(f => f.id === formData.frequency)?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>Contact:</span>
            <span>{formData.firstName} {formData.lastName} - {formData.email}</span>
          </div>
          <div className="border-t pt-2 mt-2 flex justify-between font-bold">
            <span>Estimated Price:</span>
            <span className="text-blue-600">${calculateEstimatedPrice()}</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes (optional)</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleInputChange}
          rows="3"
          className="w-full border border-gray-300 rounded px-3 py-2"
          placeholder="Any special instructions or requests..."
        />
      </div>

      <div className="mb-6">
        <label className="flex items-start">
          <input type="checkbox" required className="mr-2 mt-1" />
          <span className="text-sm text-gray-700">
            I agree to the terms of service and cancellation policy. I understand that this is a booking request and will be confirmed by the service provider.
          </span>
        </label>
      </div>

      <div className="flex gap-3">
        <button onClick={handleBack} className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400">
          Back
        </button>
        <button
          onClick={handleSubmit}
          className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
        >
          Submit Booking Request
        </button>
      </div>
    </div>
  );

  const renderProgress = () => (
    <div className="mb-6">
      <div className="flex justify-between mb-2">
        {[1, 2, 3, 4, 5].map((num) => (
          <div
            key={num}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              num <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {num}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>Service</span>
        <span>Property</span>
        <span>Date</span>
        <span>Contact</span>
        <span>Review</span>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Book Your Cleaning</h1>
      
      {renderProgress()}
      
      <div className="bg-white p-6 rounded-lg shadow">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </div>
    </div>
  );
};

export default CustomerBookingPortal;
