# White-Label / Multi-Tenant Setup Guide

This guide explains how to customize the Cleaning Intake System for different companies, making it sellable as a SaaS platform.

## 🎨 Branding Customization

### Quick Setup (Single Company)

1. **Edit Configuration File:**
   - Open `src/config/brandingConfig.js`
   - Update all the company-specific settings
   - Change colors, logo, company name, etc.

2. **Test Your Changes:**
   - Restart dev server: `npm run dev`
   - Go to Settings → Live Preview to see changes

### Advanced Setup (Multiple Companies)

#### Option 1: Configuration Files

Create separate config files for each company:

```
src/config/
├── brandingConfig.js          # Default config
├── companyA-branding.js       # Company A config
├── companyB-branding.js       # Company B config
└── companyC-branding.js       # Company C config
```

Load the appropriate config based on domain/subdomain:

```javascript
// In App.jsx or main entry point
const getCompanyConfig = () => {
  const hostname = window.location.hostname;
  
  if (hostname.includes('company-a')) {
    return import('./config/companyA-branding.js');
  } else if (hostname.includes('company-b')) {
    return import('./config/companyB-branding.js');
  }
  return import('./config/brandingConfig.js');
};
```

#### Option 2: Database Storage (Recommended for SaaS)

Store company settings in your database:

```javascript
// Example Firebase Firestore structure
companies/{companyId}/settings {
  company: { name, phone, email, ... },
  colors: { primary, secondary, ... },
  services: { ... },
  pricing: { ... },
  features: { ... }
}
```

Load settings when user logs in:

```javascript
// In AuthContext or similar
useEffect(() => {
  if (user) {
    loadCompanySettings(user.companyId);
  }
}, [user]);
```

## 🏢 Company Settings Features

The Settings panel (⚙️ Settings) allows companies to customize:

### 🎨 Branding Tab
- **Colors**: Primary, secondary, accent, background colors
- **Logo**: Emoji or image URL
- **Border Radius**: Roundness of UI elements
- **Theme**: Light/dark mode preference

### 🏢 Company Info Tab
- **Company Name**: Full business name
- **Tagline**: Marketing slogan
- **Contact Info**: Phone, email, website
- **Address**: Business location

### 🧹 Services Tab
- **Service Types**: Custom names for cleaning services
- **Pricing Multipliers**: Adjust base rates per service type
- **Service Descriptions**: Custom descriptions

### 💰 Pricing Tab
- **Currency**: Symbol and formatting
- **Base Rate**: Hourly labor rate
- **Minimum Charge**: Minimum service cost
- **Deposit Settings**: Require deposits for bookings

### ⚡ Features Tab
- **AI Photo Analysis**: Enable/disable AI features
- **Email Quotes**: Automatic quote emails
- **SMS Quotes**: Text message quotes
- **Online Booking**: Allow customer self-booking
- **And more...**

### 📧 Email Tab
- **From Name**: Email sender name
- **From Address**: Reply-to email
- **Support Email**: Customer support email

## 📦 Export/Import Configuration

Companies can:

1. **Export Their Configuration:**
   - Go to Settings → Export Config
   - Saves as JSON file
   - Can be backed up or shared

2. **Import Configuration:**
   - Go to Settings → Import Config
   - Upload previously exported JSON
   - Instantly apply branding

## 🎯 SaaS Business Model

### Tier Structure

**Starter Tier ($29/mo)**
- Basic branding customization
- Email quotes
- Up to 100 quotes/month
- Standard support

**Professional Tier ($99/mo)**
- Full branding customization
- AI photo analysis
- Unlimited quotes
- Priority support
- Custom domain

**Enterprise Tier ($199/mo)**
- White-label solution
- Custom integrations
- Dedicated support
- Multi-location support
- API access

### Onboarding Process

1. **Sign Up Company:**
   - Company creates account
   - Receives unique subdomain: `company.cleaningsaas.com`

2. **Customize Branding:**
   - Access Settings panel
   - Upload logo, set colors
   - Configure services and pricing
   - Set up email templates

3. **Launch:**
   - Custom branded site ready
   - Start taking quotes immediately
   - All data isolated per company

## 🔧 Technical Implementation

### Domain-Based Routing

```javascript
// vite.config.js or server config
export default {
  server: {
    proxy: {
      '/api': {
        target: 'https://api.cleaningsaas.com',
        changeOrigin: true
      }
    }
  }
}
```

### Company Isolation

```javascript
// All database queries include company ID
const quotes = await db.collection('quotes')
  .where('companyId', '==', user.companyId)
  .get();
```

### Custom CSS Injection

```javascript
// In branding config
customCSS: `
  .custom-header {
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
  }
`

// Apply to document
const style = document.createElement('style');
style.textContent = settings.customCSS;
document.head.appendChild(style);
```

## 📋 Setup Checklist

For each new company:

- [ ] Create company account
- [ ] Set up subdomain
- [ ] Configure branding (colors, logo)
- [ ] Set up company info
- [ ] Customize service types
- [ ] Configure pricing
- [ ] Set up email templates
- [ ] Test quote flow
- [ ] Test email delivery
- [ ] Train staff on dashboard

## 🚀 Quick Start for New Company

1. **Clone this repository**
2. **Install dependencies:** `npm install`
3. **Copy branding template:** `cp src/config/brandingConfig.js src/config/my-company-branding.js`
4. **Edit the new config file** with company details
5. **Update import in App.jsx** to use new config
6. **Run:** `npm run dev`
7. **Customize further** in Settings panel
8. **Export final config** for backup

## 💡 Tips for Selling

1. **Showcase Customization:** Demonstrate live preview in Settings
2. **Highlight AI Features:** Emphasize photo analysis capabilities
3. **Emphasize Speed:** "Instant quotes in minutes"
4. **Professional Emails:** Show email templates
5. **Mobile-First:** Show mobile responsiveness
6. **Backup System:** Highlight data safety features

This system is designed to be easily customizable for any cleaning business, making it perfect for a multi-tenant SaaS platform.
