// src/components/RecurringServices.jsx
/**
 * Recurring Services UI Component
 * Manages recurring service schedules
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { calculateNextServiceDate, SCHEDULE_TYPES } from '../services/recurringService';

const RecurringServices = ({ tenantId }) => {
  const [recurringServices, setRecurringServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    propertyId: '',
    propertyAddress: '',
    scheduleType: SCHEDULE_TYPES.WEEKLY,
    dayOfWeek: 1, // Monday
    intervalWeeks: 1,
    startDate: new Date().toISOString().split('T')[0],
    estimatedHours: 2,
    basePrice: 100,
    notes: '',
    status: 'active'
  });

  const loadRecurringServices = useCallback(async () => {
    setLoading(true);
    try {
      const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
      const q = query(recurringRef, orderBy('startDate', 'desc'));
      const snapshot = await getDocs(q);
      const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecurringServices(services);
    } catch (error) {
      console.error('Error loading recurring services:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadRecurringServices();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadRecurringServices]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
      
      const nextServiceDate = calculateNextServiceDate(
        formData.scheduleType,
        parseInt(formData.dayOfWeek),
        parseInt(formData.intervalWeeks),
        formData.startDate
      );

      const data = {
        customerId: formData.customerId,
        customerName: formData.customerName,
        propertyId: formData.propertyId,
        propertyAddress: formData.propertyAddress,
        scheduleType: formData.scheduleType,
        dayOfWeek: parseInt(formData.dayOfWeek),
        intervalWeeks: parseInt(formData.intervalWeeks),
        startDate: formData.startDate,
        nextServiceDate,
        estimatedHours: parseFloat(formData.estimatedHours),
        basePrice: parseFloat(formData.basePrice),
        notes: formData.notes,
        status: formData.status,
        generatedJobs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (editingService) {
        await updateDoc(doc(recurringRef, editingService.id), data);
      } else {
        await addDoc(recurringRef, data);
      }

      setShowModal(false);
      setEditingService(null);
      resetForm();
      loadRecurringServices();
    } catch (error) {
      console.error('Error saving recurring service:', error);
    }
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({
      customerId: service.customerId,
      customerName: service.customerName,
      propertyId: service.propertyId,
      propertyAddress: service.propertyAddress,
      scheduleType: service.scheduleType,
      dayOfWeek: service.dayOfWeek,
      intervalWeeks: service.intervalWeeks,
      startDate: service.startDate,
      estimatedHours: service.estimatedHours,
      basePrice: service.basePrice,
      notes: service.notes,
      status: service.status
    });
    setShowModal(true);
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm('Are you sure you want to delete this recurring service?')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'tenants', tenantId, 'recurring_services', serviceId));
      loadRecurringServices();
    } catch (error) {
      console.error('Error deleting recurring service:', error);
    }
  };

  const handleToggleStatus = async (service) => {
    try {
      const newStatus = service.status === 'active' ? 'paused' : 'active';
      await updateDoc(doc(db, 'tenants', tenantId, 'recurring_services', service.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      loadRecurringServices();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      customerName: '',
      propertyId: '',
      propertyAddress: '',
      scheduleType: SCHEDULE_TYPES.WEEKLY,
      dayOfWeek: 1,
      intervalWeeks: 1,
      startDate: new Date().toISOString().split('T')[0],
      estimatedHours: 2,
      basePrice: 100,
      notes: '',
      status: 'active'
    });
  };

  const getScheduleTypeLabel = (type) => {
    const labels = {
      [SCHEDULE_TYPES.WEEKLY]: 'Weekly',
      [SCHEDULE_TYPES.BIWEEKLY]: 'Biweekly',
      [SCHEDULE_TYPES.MONTHLY]: 'Monthly',
      [SCHEDULE_TYPES.CUSTOM]: 'Custom'
    };
    return labels[type] || type;
  };

  const getDayOfWeekLabel = (day) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || day;
  };

  if (loading) {
    return <div className="p-6">Loading recurring services...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Recurring Services</h1>
        <button
          onClick={() => {
            resetForm();
            setEditingService(null);
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add Recurring Service
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Property
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Schedule
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Next Service
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {recurringServices.map((service) => (
              <tr key={service.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{service.customerName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{service.propertyAddress}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {getScheduleTypeLabel(service.scheduleType)}
                    {service.scheduleType !== SCHEDULE_TYPES.MONTHLY && (
                      <span className="text-gray-500"> on {getDayOfWeekLabel(service.dayOfWeek)}</span>
                    )}
                    {service.scheduleType === SCHEDULE_TYPES.CUSTOM && (
                      <span className="text-gray-500"> every {service.intervalWeeks} weeks</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{service.nextServiceDate}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">${service.basePrice}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    service.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {service.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleEdit(service)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(service)}
                    className="text-gray-600 hover:text-gray-900 mr-3"
                  >
                    {service.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(service.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {recurringServices.length === 0 && (
              <tr>
                <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                  No recurring services found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingService ? 'Edit Recurring Service' : 'Add Recurring Service'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={formData.customerName}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Property Address
                  </label>
                  <input
                    type="text"
                    name="propertyAddress"
                    value={formData.propertyAddress}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Schedule Type
                  </label>
                  <select
                    name="scheduleType"
                    value={formData.scheduleType}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    <option value={SCHEDULE_TYPES.WEEKLY}>Weekly</option>
                    <option value={SCHEDULE_TYPES.BIWEEKLY}>Biweekly</option>
                    <option value={SCHEDULE_TYPES.MONTHLY}>Monthly</option>
                    <option value={SCHEDULE_TYPES.CUSTOM}>Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Week
                  </label>
                  <select
                    name="dayOfWeek"
                    value={formData.dayOfWeek}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interval (Weeks)
                  </label>
                  <input
                    type="number"
                    name="intervalWeeks"
                    value={formData.intervalWeeks}
                    onChange={handleInputChange}
                    min="1"
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estimated Hours
                  </label>
                  <input
                    type="number"
                    name="estimatedHours"
                    value={formData.estimatedHours}
                    onChange={handleInputChange}
                    min="0.5"
                    step="0.5"
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Price ($)
                  </label>
                  <input
                    type="number"
                    name="basePrice"
                    value={formData.basePrice}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingService(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingService ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringServices;
