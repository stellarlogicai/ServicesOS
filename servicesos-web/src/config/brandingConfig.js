// src/config/brandingConfig.js
/**
 * Company Branding Configuration
 * This file allows easy customization for different companies
 * In production, this would be loaded from a database or company settings
 */

export const brandingConfig = {
  // Company Information
  company: {
    name: "Stellar Logic AI",
    shortName: "SLAI",
    tagline: "AI-Powered Platform for Cleaning Businesses",
    website: "",
    phone: "",
    email: "stellar.logic.ai@gmail.com",
    address: ""
  },

  // Branding Colors
  colors: {
    primary: "#3b82f6",           // Main brand color
    primaryDark: "#1d4ed8",       // Darker shade for gradients
    primaryLight: "#60a5fa",      // Lighter shade
    accent: "#f59e0b",            // Accent color for highlights
    background: "#f8fafc",         // Main background
    surface: "#ffffff",           // Card/surface background
    text: "#0f172a",              // Main text color
    textSecondary: "#64748b",     // Secondary text
    border: "#e2e8f0",            // Border color
    success: "#10b981",           // Success messages
    error: "#ef4444",             // Error messages
    warning: "#f59e0b"            // Warning messages
  },

  // Logo Configuration
  logo: {
    emoji: "�",                 // SLAI AI robot emoji
    imageUrl: "",                 // URL to SLAI logo image
    alt: "SLAI Logo",
    width: 36,
    height: 36
  },

  // Brand Kit Assets (uploaded to Firebase Storage)
  assets: {
    logo: "",          // Company logo URL
    favicon: "",       // Favicon URL
    appIcon: "",       // App icon URL
    emailBanner: "",   // Email banner URL
    watermark: ""      // Watermark URL
  },

  // Theme Configuration
  theme: {
    mode: "light",                // "light" or "dark"
    borderRadius: 10,            // Border radius for cards/buttons
    spacing: "comfortable",      // "compact", "comfortable", or "spacious"
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  },

  // Service Types (customizable per company)
  services: {
    standard: {
      name: "Standard Clean",
      description: "Regular cleaning service",
      baseMultiplier: 1.0
    },
    deep: {
      name: "Deep Clean",
      description: "Thorough deep cleaning",
      baseMultiplier: 1.5
    },
    moveout: {
      name: "Move-In/Move-Out",
      description: "Cleaning for moving",
      baseMultiplier: 1.3
    },
    construction: {
      name: "Post-Construction",
      description: "After construction cleaning",
      baseMultiplier: 1.4
    }
  },

  // Pricing Configuration
  pricing: {
    currency: "USD",
    currencySymbol: "$",
    baseRatePerHour: 50,          // Base labor rate per hour
    minimumCharge: 100,           // Minimum service charge
    taxRate: 0,                   // Tax rate (0 = no tax)
    depositRequired: false,       // Require deposit for booking
    depositPercentage: 20         // Deposit percentage if required
  },

  // Email Configuration
  email: {
    fromName: "Aunt B's Cleaning Services",
    fromAddress: "quotes@auntbs-cleaning.com",
    replyTo: "info@auntbs-cleaning.com",
    supportEmail: "support@auntbs-cleaning.com"
  },

  // Features Configuration
  features: {
    aiPhotoAnalysis: true,        // Enable AI photo analysis
    emailQuotes: true,            // Send quotes via email
    smsQuotes: false,             // Send quotes via SMS
    onlineBooking: true,          // Allow online booking
    requireApproval: false,       // Require admin approval for quotes
    showPricingBreakdown: true,  // Show detailed pricing to customers
    allowCustomServices: false    // Allow custom service types
  },

  // UI Configuration
  ui: {
    showDashboard: true,          // Show admin dashboard
    showAnalytics: true,         // Show analytics section
    showBackup: true,             // Show backup/restore feature
    showSettings: true,           // Show settings panel
    maxPhotoUpload: 5,            // Maximum photos per estimate
    maxPhotoSizeMB: 5             // Maximum photo size in MB
  },

  // Business Hours
  businessHours: {
    monday: { open: "8:00 AM", close: "6:00 PM", closed: false },
    tuesday: { open: "8:00 AM", close: "6:00 PM", closed: false },
    wednesday: { open: "8:00 AM", close: "6:00 PM", closed: false },
    thursday: { open: "8:00 AM", close: "6:00 PM", closed: false },
    friday: { open: "8:00 AM", close: "6:00 PM", closed: false },
    saturday: { open: "9:00 AM", close: "4:00 PM", closed: false },
    sunday: { open: null, close: null, closed: true }
  },

  // Service Area
  serviceArea: {
    cities: ["City Name", "Surrounding Area"],
    radius: 25,                   // Service radius in miles
    unit: "miles"
  },

  // Social Media & External Links
  social: {
    facebook: "https://facebook.com/auntbs-cleaning",
    instagram: "https://instagram.com/auntbs-cleaning",
    twitter: "https://twitter.com/auntbs-cleaning",
    linkedin: "https://linkedin.com/company/auntbs-cleaning",
    googleBusiness: "https://g.page/auntbs-cleaning",
    yelp: "https://yelp.com/biz/auntbs-cleaning",
    tripadvisor: "",
    houzz: ""
  },

  // Booking & Payment Links
  booking: {
    calendly: "",              // Calendly booking link
    square: "",                 // Square payment link
    stripe: "",                 // Stripe payment link
    customBookingUrl: "",       // Custom booking page
    depositPaymentUrl: "",      // Deposit payment link
    invoicePaymentUrl: ""       // Invoice payment link
  },

  // Review & Testimonial Links
  reviews: {
    googleReviews: "https://search.google.com/local/reviews?placeid=ChIJ...",
    yelpReviews: "https://yelp.com/biz/auntbs-cleaning#reviews",
    facebookReviews: "https://facebook.com/auntbs-cleaning/reviews",
    testimonialsPage: ""         // Custom testimonials page
  },

  // Portfolio & Gallery
  portfolio: {
    websiteGallery: "",         // Link to website gallery
    instagramGallery: "",       // Link to Instagram gallery
    youtubeChannel: "",         // YouTube channel link
    beforeAfterPhotos: ""       // Before/after photos page
  },

  // Additional Contact Information
  contact: {
    emergencyPhone: "",         // Emergency contact number
    smsNumber: "",              // SMS-enabled number
    whatsapp: "",               // WhatsApp number
    liveChatEnabled: false,     // Enable live chat widget
    liveChatId: "",             // Live chat service ID
    supportHours: "9AM-5PM EST",  // Customer support hours
    responseTime: "24 hours"     // Expected response time
  },

  // Legal & Compliance
  legal: {
    termsOfServiceUrl: "",      // Terms of service page
    privacyPolicyUrl: "",        // Privacy policy page
    cancellationPolicyUrl: "",   // Cancellation policy
    insuranceInfo: "",          // Insurance information
    licenseNumber: "",          // Business license number
    taxId: ""                   // Tax ID for invoicing
  },

  // Integrations
  integrations: {
    quickbooks: false,          // QuickBooks integration
    xero: false,                // Xero integration
    stripeConnect: false,       // Stripe Connect
    squareConnect: false,       // Square Connect
    googleCalendar: false,      // Google Calendar sync
    calendly: false,            // Calendly integration
    zapier: false,              // Zapier automation
    webhookUrl: ""              // Custom webhook URL
  },

  // Custom CSS (for advanced branding)
  customCSS: `
    /* Add custom CSS here for unique branding */
    .custom-header {
      background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
    }
  `
};

// Helper function to get config value with fallback
export function getConfig(path, defaultValue) {
  const keys = path.split('.');
  let value = brandingConfig;
  
  for (const key of keys) {
    value = value?.[key];
    if (value === undefined) return defaultValue;
  }
  
  return value;
}

// Helper function to apply branding to styles
export function applyBrandingStyles(baseStyles = {}) {
  return {
    ...baseStyles,
    '--primary-color': brandingConfig.colors.primary,
    '--primary-dark': brandingConfig.colors.primaryDark,
    '--primary-light': brandingConfig.colors.primaryLight,
    '--accent-color': brandingConfig.colors.accent,
    '--background-color': brandingConfig.colors.background,
    '--surface-color': brandingConfig.colors.surface,
    '--text-color': brandingConfig.colors.text,
    '--text-secondary': brandingConfig.colors.textSecondary,
    '--border-color': brandingConfig.colors.border,
    '--success-color': brandingConfig.colors.success,
    '--error-color': brandingConfig.colors.error,
    '--warning-color': brandingConfig.colors.warning,
    '--border-radius': `${brandingConfig.theme.borderRadius}px`,
    '--font-family': brandingConfig.theme.fontFamily
  };
}
