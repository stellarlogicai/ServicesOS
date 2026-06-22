// src/components/CompanySettings.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getBranding, saveBranding, THEME_PRESETS, applyThemeToDOM } from '../services/brandingService';
import { brandingConfig } from '../config/brandingConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import StripeConnectOnboarding from './StripeConnectOnboarding';

export default function CompanySettings() {
  const { currentTenant } = useAuth();
  const [settings, setSettings] = useState(brandingConfig);
  const [activeTab, setActiveTab] = useState('branding');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');

  const loadBranding = useCallback(async () => {
    if (!currentTenant?.id) return;
    
    try {
      const branding = await getBranding(currentTenant.id);
      if (branding) {
        setSettings(branding);
        applyThemeToDOM(branding);
      } else {
        // Use default config if no branding exists
        setSettings(brandingConfig);
        applyThemeToDOM(brandingConfig);
      }
    } catch (error) {
      console.error('Error loading branding:', error);
      setSettings(brandingConfig);
    }
  }, [currentTenant]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadBranding();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadBranding]);

  const tabs = [
    { id: 'branding', label: 'Branding', icon: '🎨' },
    { id: 'company', label: 'Company Info', icon: '🏢' },
    { id: 'services', label: 'Services', icon: '🧹' },
    { id: 'pricing', label: 'Pricing', icon: '💰' },
    { id: 'features', label: 'Features', icon: '⚡' },
    { id: 'email', label: 'Email', icon: '📧' },
    { id: 'social', label: 'Social Media', icon: '📱' },
    { id: 'booking', label: 'Booking & Payment', icon: '📅' },
    { id: 'reviews', label: 'Reviews', icon: '⭐' },
    { id: 'legal', label: 'Legal', icon: '⚖️' },
    { id: 'integrations', label: 'Integrations', icon: '🔗' }
  ];

  const handleSave = async () => {
    if (!currentTenant?.id) {
      setMessage({ type: 'error', text: 'No tenant selected' });
      return;
    }

    try {
      await saveBranding(currentTenant.id, settings);
      applyThemeToDOM(settings);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving branding:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    }
  };

  const handlePresetSelect = (presetKey) => {
    const preset = THEME_PRESETS[presetKey];
    if (preset) {
      setSettings(prev => ({
        ...prev,
        colors: preset.colors
      }));
      setSelectedPreset(presetKey);
      applyThemeToDOM({ ...settings, colors: preset.colors });
    }
  };

  const handleFileUpload = async (e, assetType) => {
    const file = e.target.files[0];
    if (!file || !currentTenant?.id) return;

    try {
      const fileName = `${assetType}_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `tenants/${currentTenant.id}/branding/${fileName}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setSettings(prev => ({
        ...prev,
        assets: {
          ...prev.assets,
          [assetType]: downloadURL
        }
      }));
      
      setMessage({ type: 'success', text: `${assetType} uploaded successfully!` });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error uploading file:', error);
      setMessage({ type: 'error', text: 'Failed to upload file' });
    }
  };

  const handleReset = () => {
    setSettings(brandingConfig);
    setMessage({ type: 'success', text: 'Settings reset to defaults' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'company-branding-config.json';
    link.click();
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedSettings = JSON.parse(event.target.result);
        setSettings(importedSettings);
        setMessage({ type: 'success', text: 'Configuration imported successfully!' });
      } catch {
        setMessage({ type: 'error', text: 'Invalid configuration file' });
      }
    };
    reader.readAsText(file);
  };

  const updateSetting = (section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Company Settings
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Customize your branding, services, and features
        </p>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: message.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
          color: message.type === 'success' ? '#166534' : '#991b1b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{message.text}</span>
          <button
            onClick={() => setMessage({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          💾 Save Settings
        </button>

        <button
          onClick={handleReset}
          style={{
            padding: '10px 20px',
            background: 'white',
            color: '#0f172a',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🔄 Reset to Default
        </button>

        <button
          onClick={handleExport}
          style={{
            padding: '10px 20px',
            background: 'white',
            color: '#0f172a',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          📤 Export Config
        </button>

        <label style={{
          padding: '10px 20px',
          background: 'white',
          color: '#0f172a',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-block'
        }}>
          📥 Import Config
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>

        <button
          onClick={() => setPreviewMode(!previewMode)}
          style={{
            padding: '10px 20px',
            background: previewMode ? '#fef3c7' : 'white',
            color: '#0f172a',
            border: previewMode ? '1px solid #fcd34d' : '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          👁️ {previewMode ? 'Exit Preview' : 'Live Preview'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          overflowX: 'auto'
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 24px',
                background: activeTab === tab.id ? settings.colors.primary : 'transparent',
                color: activeTab === tab.id ? 'white' : '#64748b',
                border: 'none',
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                borderBottom: activeTab === tab.id ? `2px solid ${settings.colors.primaryDark}` : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 18 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px' }}>
          {activeTab === 'branding' && <BrandingSettings settings={settings} updateSetting={updateSetting} onPresetSelect={handlePresetSelect} selectedPreset={selectedPreset} themePresets={THEME_PRESETS} onFileUpload={handleFileUpload} />}
          {activeTab === 'company' && <CompanyInfoSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'services' && <ServicesSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'pricing' && <PricingSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'features' && <FeaturesSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'email' && <EmailSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'social' && <SocialMediaSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'booking' && <BookingSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'reviews' && <ReviewsSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'legal' && <LegalSettings settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'integrations' && <IntegrationsSettings settings={settings} updateSetting={updateSetting} />}
        </div>
      </div>

      {/* Preview Mode */}
      {previewMode && (
        <div style={{
          marginTop: 24,
          padding: '24px',
          background: 'white',
          borderRadius: 12,
          border: '2px solid #3b82f6',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>🎨 Live Preview</h3>
          <div style={{
            padding: '20px',
            background: settings.colors.background,
            borderRadius: 8,
            border: `1px solid ${settings.colors.border}`
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16
            }}>
              <div style={{
                width: 40,
                height: 40,
                background: `linear-gradient(135deg, ${settings.colors.primary} 0%, ${settings.colors.primaryDark} 100%)`,
                borderRadius: settings.theme.borderRadius,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20
              }}>
                {settings.logo.emoji}
              </div>
              <div>
                <div style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: settings.colors.text
                }}>
                  {settings.company.name}
                </div>
                <div style={{ fontSize: 12, color: settings.colors.textSecondary }}>
                  {settings.company.tagline}
                </div>
              </div>
            </div>
            <button style={{
              padding: '12px 24px',
              background: `linear-gradient(135deg, ${settings.colors.primary} 0%, ${settings.colors.primaryDark} 100%)`,
              color: 'white',
              border: 'none',
              borderRadius: settings.theme.borderRadius,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Get Quote
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components for each settings section
function BrandingSettings({ settings, updateSetting, onPresetSelect, selectedPreset, themePresets, onFileUpload }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>🎨 Branding & Colors</h3>

      {/* Theme Presets */}
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
          Quick Theme Presets
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(themePresets).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => onPresetSelect(key)}
              style={{
                padding: '8px 16px',
                background: selectedPreset === key ? preset.colors.primary : '#f9fafb',
                color: selectedPreset === key ? 'white' : '#374151',
                border: selectedPreset === key ? 'none' : '1px solid #e5e7eb',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Brand Kit Uploads */}
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
          Brand Kit Assets
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { key: 'logo', label: 'Logo', accept: 'image/*' },
            { key: 'favicon', label: 'Favicon', accept: 'image/x-icon,image/png' },
            { key: 'appIcon', label: 'App Icon', accept: 'image/png' },
            { key: 'emailBanner', label: 'Email Banner', accept: 'image/*' },
            { key: 'watermark', label: 'Watermark', accept: 'image/*' }
          ].map(asset => (
            <div key={asset.key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}>
                {settings.assets?.[asset.key] ? (
                  <img 
                    src={settings.assets[asset.key]} 
                    alt={asset.label}
                    style={{ maxWidth: '100%', maxHeight: 60, objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ width: 60, height: 60, background: '#f3f4f6', borderRadius: 8, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                    📷
                  </div>
                )}
              </div>
              <label style={{ 
                display: 'block', 
                padding: '8px 12px', 
                background: '#f9fafb', 
                border: '1px dashed #d1d5db', 
                borderRadius: 6, 
                fontSize: 12, 
                fontWeight: 500, 
                color: '#6b7280', 
                cursor: 'pointer',
                textAlign: 'center'
              }}>
                {settings.assets?.[asset.key] ? 'Change' : 'Upload'} {asset.label}
                <input
                  type="file"
                  accept={asset.accept}
                  onChange={(e) => onFileUpload(e, asset.key)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Primary Color
          </label>
          <input
            type="color"
            value={settings.colors.primary}
            onChange={(e) => updateSetting('colors', 'primary', e.target.value)}
            style={{ width: '100%', height: 40, borderRadius: 4, border: '1px solid #d1d5db' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Primary Dark
          </label>
          <input
            type="color"
            value={settings.colors.primaryDark}
            onChange={(e) => updateSetting('colors', 'primaryDark', e.target.value)}
            style={{ width: '100%', height: 40, borderRadius: 4, border: '1px solid #d1d5db' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Accent Color
          </label>
          <input
            type="color"
            value={settings.colors.accent}
            onChange={(e) => updateSetting('colors', 'accent', e.target.value)}
            style={{ width: '100%', height: 40, borderRadius: 4, border: '1px solid #d1d5db' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Background
          </label>
          <input
            type="color"
            value={settings.colors.background}
            onChange={(e) => updateSetting('colors', 'background', e.target.value)}
            style={{ width: '100%', height: 40, borderRadius: 4, border: '1px solid #d1d5db' }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Logo Emoji
        </label>
        <input
          type="text"
          value={settings.logo.emoji}
          onChange={(e) => updateSetting('logo', 'emoji', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 24 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Border Radius ({settings.theme.borderRadius}px)
        </label>
        <input
          type="range"
          min="4"
          max="20"
          value={settings.theme.borderRadius}
          onChange={(e) => updateSetting('theme', 'borderRadius', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}

function CompanyInfoSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>🏢 Company Information</h3>
      
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Company Name
        </label>
        <input
          type="text"
          value={settings.company.name}
          onChange={(e) => updateSetting('company', 'name', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Tagline
        </label>
        <input
          type="text"
          value={settings.company.tagline}
          onChange={(e) => updateSetting('company', 'tagline', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Phone
        </label>
        <input
          type="text"
          value={settings.company.phone}
          onChange={(e) => updateSetting('company', 'phone', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Email
        </label>
        <input
          type="email"
          value={settings.company.email}
          onChange={(e) => updateSetting('company', 'email', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Website
        </label>
        <input
          type="url"
          value={settings.company.website}
          onChange={(e) => updateSetting('company', 'website', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>
    </div>
  );
}

function ServicesSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>🧹 Service Types</h3>
      
      {Object.entries(settings.services).map(([key, service]) => (
        <div key={key} style={{
          padding: '16px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Service Name
            </label>
            <input
              type="text"
              value={service.name}
              onChange={(e) => updateSetting('services', key, { ...service, name: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Price Multiplier (x{service.baseMultiplier})
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={service.baseMultiplier}
              onChange={(e) => updateSetting('services', key, { ...service, baseMultiplier: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PricingSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>💰 Pricing Configuration</h3>
      
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Currency Symbol
        </label>
        <input
          type="text"
          value={settings.pricing.currencySymbol}
          onChange={(e) => updateSetting('pricing', 'currencySymbol', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Base Rate Per Hour ({settings.pricing.currencySymbol}{settings.pricing.baseRatePerHour})
        </label>
        <input
          type="range"
          min="25"
          max="150"
          step="5"
          value={settings.pricing.baseRatePerHour}
          onChange={(e) => updateSetting('pricing', 'baseRatePerHour', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Minimum Charge ({settings.pricing.currencySymbol}{settings.pricing.minimumCharge})
        </label>
        <input
          type="range"
          min="50"
          max="300"
          step="10"
          value={settings.pricing.minimumCharge}
          onChange={(e) => updateSetting('pricing', 'minimumCharge', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.pricing.depositRequired}
          onChange={(e) => updateSetting('pricing', 'depositRequired', e.target.checked)}
        />
        <label style={{ fontSize: 14, color: '#374151' }}>Require Deposit</label>
      </div>

      {settings.pricing.depositRequired && (
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Deposit Percentage ({settings.pricing.depositPercentage}%)
          </label>
          <input
            type="range"
            min="10"
            max="50"
            step="5"
            value={settings.pricing.depositPercentage}
            onChange={(e) => updateSetting('pricing', 'depositPercentage', parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      )}
    </div>
  );
}

function FeaturesSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>⚡ Feature Toggles</h3>
      
      {Object.entries(settings.features).map(([key, value]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px', background: '#f8fafc', borderRadius: 8 }}>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => updateSetting('features', key, e.target.checked)}
          />
          <label style={{ fontSize: 14, color: '#374151', textTransform: 'capitalize' }}>
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </label>
        </div>
      ))}
    </div>
  );
}

function EmailSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>📧 Email Configuration</h3>
      
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          From Name
        </label>
        <input
          type="text"
          value={settings.email.fromName}
          onChange={(e) => updateSetting('email', 'fromName', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          From Address
        </label>
        <input
          type="email"
          value={settings.email.fromAddress}
          onChange={(e) => updateSetting('email', 'fromAddress', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Support Email
        </label>
        <input
          type="email"
          value={settings.email.supportEmail}
          onChange={(e) => updateSetting('email', 'supportEmail', e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>
    </div>
  );
}

function SocialMediaSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>📱 Social Media & Links</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {Object.entries(settings.social).map(([platform, url]) => (
          <div key={platform}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => updateSetting('social', platform, e.target.value)}
              placeholder={`https://${platform}.com/yourbusiness`}
              style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>📅 Booking & Payment Links</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {Object.entries(settings.booking).map(([service, url]) => (
          <div key={service}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              {service.charAt(0).toUpperCase() + service.slice(1).replace(/([A-Z])/g, ' $1')}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => updateSetting('booking', service, e.target.value)}
              placeholder="https://..."
              style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewsSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>⭐ Review & Testimonial Links</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {Object.entries(settings.reviews).map(([platform, url]) => (
          <div key={platform}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              {platform.charAt(0).toUpperCase() + platform.slice(1).replace(/([A-Z])/g, ' $1')}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => updateSetting('reviews', platform, e.target.value)}
              placeholder="https://..."
              style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function LegalSettings({ settings, updateSetting }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>⚖️ Legal & Compliance</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {Object.entries(settings.legal).map(([doc, url]) => (
          <div key={doc}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              {doc.charAt(0).toUpperCase() + doc.slice(1).replace(/([A-Z])/g, ' $1')}
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => updateSetting('legal', doc, e.target.value)}
              placeholder="https://yourdomain.com/..."
              style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationsSettings({ settings, updateSetting }) {
  const { currentTenant } = useAuth();
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>🔗 Integrations</h3>
      
      {/* Stripe Connect Onboarding */}
      {currentTenant?.id && (
        <div style={{
          padding: '20px',
          background: '#f8fafc',
          borderRadius: 12,
          border: '2px solid #e2e8f0'
        }}>
          <StripeConnectOnboarding tenantId={currentTenant.id} />
        </div>
      )}
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {Object.entries(settings.integrations).map(([integration, enabled]) => (
          <div key={integration} style={{
            padding: '12px',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => updateSetting('integrations', integration, e.target.checked)}
              />
              <label style={{ fontSize: 14, color: '#374151', textTransform: 'capitalize' }}>
                {integration.replace(/([A-Z])/g, ' $1')}
              </label>
            </div>
          </div>
        ))}
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
          Webhook URL
        </label>
        <input
          type="url"
          value={settings.integrations.webhookUrl}
          onChange={(e) => updateSetting('integrations', 'webhookUrl', e.target.value)}
          placeholder="https://your-webhook-endpoint.com"
          style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>
    </div>
  );
}
