// src/components/MigrationCenter.jsx
/**
 * Migration Center Dashboard
 * Central hub for data migration from various sources
 */

import { useState } from 'react';

const MigrationCenter = ({ tenantId }) => { // eslint-disable-line no-unused-vars
  const [activeTab, setActiveTab] = useState('overview');

  const migrationSources = [
    {
      id: 'quickbooks',
      name: 'QuickBooks',
      icon: '📊',
      description: 'Import customers, invoices, payments, and recurring services',
      status: 'available',
      features: ['CSV Import', 'API Migration']
    },
    {
      id: 'calendly',
      name: 'Calendly',
      icon: '📅',
      description: 'Import appointments and customer data',
      status: 'available',
      features: ['CSV Import', 'Calendar Sync']
    },
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      icon: '🗓️',
      description: 'Import events, appointments, and recurring jobs',
      status: 'available',
      features: ['ICS Import', 'API Migration', 'CSV Import']
    },
    {
      id: 'jobber',
      name: 'Jobber',
      icon: '🔧',
      description: 'Import customers, jobs, invoices, and payments',
      status: 'coming-soon',
      features: ['Full Migration']
    },
    {
      id: 'housecall-pro',
      name: 'Housecall Pro',
      icon: '🏠',
      description: 'Import customers, appointments, invoices, and recurring services',
      status: 'coming-soon',
      features: ['Full Migration']
    },
    {
      id: 'zenmaid',
      name: 'ZenMaid',
      icon: '✨',
      description: 'Import clients, schedules, and employees',
      status: 'coming-soon',
      features: ['Full Migration']
    }
  ];

  const otherImports = [
    {
      id: 'csv',
      name: 'Generic CSV',
      icon: '📄',
      description: 'Import data from any CSV file with column mapping',
      status: 'available'
    },
    {
      id: 'documents',
      name: 'Documents',
      icon: '📁',
      description: 'Import contracts, insurance certificates (PDF/DOCX)',
      status: 'available'
    },
    {
      id: 'marketing',
      name: 'Marketing Lists',
      icon: '📧',
      description: 'Import Google reviews and contact lists (Mailchimp, Constant Contact)',
      status: 'available'
    },
    {
      id: 'route-optimization',
      name: 'Route Optimization',
      icon: '🗺️',
      description: 'Import employee home locations and service areas',
      status: 'available'
    },
    {
      id: 'ai-training',
      name: 'AI Training History',
      icon: '🤖',
      description: 'Import historical jobs without photos for estimate engine',
      status: 'available'
    },
    {
      id: 'checklist-templates',
      name: 'Checklist Templates',
      icon: '✅',
      description: 'Import company-specific cleaning workflow templates',
      status: 'available'
    }
  ];

  const recentMigrations = [
    { id: 1, source: 'CSV', type: 'Customers', date: '2024-01-15', status: 'completed', records: 150 },
    { id: 2, source: 'QuickBooks', type: 'Invoices', date: '2024-01-14', status: 'completed', records: 89 },
    { id: 3, source: 'Calendly', type: 'Appointments', date: '2024-01-13', status: 'failed', records: 0 }
  ];

  const renderOverview = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Migration Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-3xl font-bold text-green-600">2</div>
          <div className="text-gray-600">Completed Migrations</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-3xl font-bold text-yellow-600">1</div>
          <div className="text-gray-600">Failed Migrations</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-3xl font-bold text-blue-600">239</div>
          <div className="text-gray-600">Total Records Imported</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-3">Recent Migrations</h3>
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {recentMigrations.map((migration) => (
              <tr key={migration.id}>
                <td className="px-4 py-2 text-sm">{migration.source}</td>
                <td className="px-4 py-2 text-sm">{migration.type}</td>
                <td className="px-4 py-2 text-sm">{migration.date}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    migration.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {migration.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm">{migration.records}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button className="bg-blue-600 text-white p-4 rounded-lg hover:bg-blue-700">
          <div className="text-2xl mb-1">📄</div>
          <div className="text-sm">CSV Import</div>
        </button>
        <button className="bg-green-600 text-white p-4 rounded-lg hover:bg-green-700">
          <div className="text-2xl mb-1">📊</div>
          <div className="text-sm">QuickBooks</div>
        </button>
        <button className="bg-purple-600 text-white p-4 rounded-lg hover:bg-purple-700">
          <div className="text-2xl mb-1">📅</div>
          <div className="text-sm">Calendly</div>
        </button>
        <button className="bg-orange-600 text-white p-4 rounded-lg hover:bg-orange-700">
          <div className="text-2xl mb-1">🗓️</div>
          <div className="text-sm">Google Calendar</div>
        </button>
      </div>
    </div>
  );

  const renderCompetitors = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Competitor Migrations</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {migrationSources.map((source) => (
          <div key={source.id} className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center mb-3">
              <div className="text-3xl mr-3">{source.icon}</div>
              <div>
                <h3 className="font-semibold">{source.name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  source.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {source.status === 'available' ? 'Available' : 'Coming Soon'}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-3">{source.description}</p>
            <div className="flex flex-wrap gap-1">
              {source.features.map((feature, idx) => (
                <span key={idx} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  {feature}
                </span>
              ))}
            </div>
            {source.status === 'available' && (
              <button className="mt-3 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                Start Migration
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderOtherImports = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Other Imports</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {otherImports.map((source) => (
          <div key={source.id} className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center mb-3">
              <div className="text-3xl mr-3">{source.icon}</div>
              <div>
                <h3 className="font-semibold">{source.name}</h3>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                  Available
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-3">{source.description}</p>
            <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              Start Import
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHistory = () => (
    <div>
      <h2 className="text-xl font-bold mb-4">Migration History</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {recentMigrations.map((migration) => (
              <tr key={migration.id}>
                <td className="px-4 py-2 text-sm">#{migration.id}</td>
                <td className="px-4 py-2 text-sm">{migration.source}</td>
                <td className="px-4 py-2 text-sm">{migration.type}</td>
                <td className="px-4 py-2 text-sm">{migration.date}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    migration.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {migration.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm">{migration.records}</td>
                <td className="px-4 py-2 text-sm">
                  <button className="text-blue-600 hover:text-blue-900 mr-2">View</button>
                  <button className="text-gray-600 hover:text-gray-900">Export</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Migration Center</h1>
      
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 ${activeTab === 'overview' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('competitors')}
          className={`px-4 py-2 ${activeTab === 'competitors' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Competitors
        </button>
        <button
          onClick={() => setActiveTab('other')}
          className={`px-4 py-2 ${activeTab === 'other' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Other Imports
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 ${activeTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          History
        </button>
      </div>

      <div className="bg-gray-50 p-6 rounded-lg">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'competitors' && renderCompetitors()}
        {activeTab === 'other' && renderOtherImports()}
        {activeTab === 'history' && renderHistory()}
      </div>
    </div>
  );
};

export default MigrationCenter;
