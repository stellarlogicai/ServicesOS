// src/services/pdfService.js
import { jsPDF } from 'jspdf';
import { brandingConfig } from '../config/brandingConfig';

/**
 * Generate professional PDF quote
 * @param {Object} formData - Customer form data
 * @param {Object} aiResult - AI analysis results
 * @param {Object} estimate - Price estimate
 * @returns {jsPDF} PDF document instance
 */
export function generateQuotePDF(formData, aiResult, estimate) {
  const pdf = new jsPDF();
  const config = brandingConfig;
  
  let yPos = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  // Helper function to add text
  const addText = (text, x, y, fontSize = 12, isBold = false, color = [0, 0, 0]) => {
    pdf.setFontSize(fontSize);
    if (isBold) pdf.setFont('helvetica', 'bold');
    else pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(text, x, y);
  };

  // Helper function to add section header
  const addSectionHeader = (text, y) => {
    pdf.setFillColor(59, 130, 246); // Primary color
    pdf.rect(margin, y - 5, contentWidth, 8, 'F');
    addText(text, margin + 5, y, 14, true, [255, 255, 255]);
    return y + 12;
  };

  // Helper function to check for new page
  const checkNewPage = (y) => {
    if (y > 270) {
      pdf.addPage();
      return 20;
    }
    return y;
  };

  // ==================== HEADER ====================
  // Company logo/name
  addText(config.company.name, margin, yPos, 24, true);
  yPos += 10;
  addText(config.company.tagline, margin, yPos, 12, false, [107, 114, 128]);
  yPos += 15;

  // Quote info
  addText(`Quote #${formData.quoteId || 'PENDING'}`, margin, yPos, 12, true);
  addText(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, yPos, 10, false, [107, 114, 128], { align: 'right' });
  yPos += 10;

  // Divider
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 15;

  // ==================== CUSTOMER INFORMATION ====================
  yPos = addSectionHeader('Customer Information', yPos);
  
  const customerInfo = [
    `Name: ${formData.firstName} ${formData.lastName}`,
    `Email: ${formData.email}`,
    `Phone: ${formData.phone}`,
    `Address: ${formData.address || 'N/A'}`,
  ];

  customerInfo.forEach(info => {
    addText(info, margin, yPos, 10);
    yPos += 6;
  });

  yPos += 10;

  // ==================== SERVICE DETAILS ====================
  yPos = addSectionHeader('Service Details', yPos);

  const serviceDetails = [
    `Service Type: ${formData.serviceType || 'Standard Clean'}`,
    `Frequency: ${formData.frequency || 'One-time'}`,
    `Preferred Days: ${formData.preferredDays || 'Flexible'}`,
    `Bedrooms: ${formData.bedrooms || 0}`,
    `Bathrooms: ${formData.bathrooms || 0}`,
    `Square Footage: ${formData.squareFootage || 'N/A'}`,
    `Pets: ${formData.hasPets ? `Yes (${formData.petCount || 0})` : 'No'}`,
    `Children: ${formData.hasChildren ? 'Yes' : 'No'}`,
  ];

  serviceDetails.forEach(detail => {
    addText(detail, margin, yPos, 10);
    yPos += 6;
  });

  yPos += 10;

  // ==================== AI ANALYSIS RESULTS ====================
  yPos = addSectionHeader('AI Analysis Results', yPos);
  
  addText(`AI Confidence Score: ${aiResult.confidence || 92}%`, margin, yPos, 10, true, [16, 185, 129]);
  yPos += 8;

  // Room conditions
  if (aiResult.rooms && aiResult.rooms.length > 0) {
    addText('Room Conditions:', margin, yPos, 11, true);
    yPos += 6;
    
    aiResult.rooms.forEach(room => {
      yPos = checkNewPage(yPos);
      addText(`• ${room.type}: Score ${room.score}/100 - ${room.condition}`, margin + 5, yPos, 9);
      yPos += 5;
      
      if (room.issues && room.issues.length > 0) {
        room.issues.forEach(issue => {
          yPos = checkNewPage(yPos);
          addText(`  - ${issue}`, margin + 10, yPos, 8, false, [107, 114, 128]);
          yPos += 4;
        });
      }
    });
    yPos += 8;
  }

  // ==================== AI RECOMMENDATIONS ====================
  if (aiResult.recommendations && aiResult.recommendations.length > 0) {
    yPos = addSectionHeader('AI Recommendations', yPos);
    
    aiResult.recommendations.forEach(rec => {
      yPos = checkNewPage(yPos);
      addText(`• ${rec}`, margin + 5, yPos, 10);
      yPos += 5;
    });
    yPos += 8;
  }

  // ==================== PRICING BREAKDOWN ====================
  yPos = addSectionHeader('Pricing Breakdown', yPos);

  const pricingDetails = [
    `Labor Hours: ${estimate.laborHours || 'N/A'}`,
    `Base Rate: $${config.pricing.baseRatePerHour}/hour`,
    `Service Multiplier: ${estimate.serviceMultiplier || 1.0}x`,
    `Condition Multiplier: ${estimate.conditionMultiplier || 1.0}x`,
    `Additional Factors: ${estimate.additionalFactors || 'None'}`,
  ];

  pricingDetails.forEach(detail => {
    addText(detail, margin, yPos, 10);
    yPos += 6;
  });

  yPos += 10;

  // ==================== PRICE ESTIMATE ====================
  yPos = addSectionHeader('Price Estimate', yPos);

  // Price range box
  pdf.setFillColor(243, 244, 246);
  pdf.rect(margin, yPos - 5, contentWidth, 30, 'F');
  
  addText(`Estimated Price Range:`, margin + 5, yPos + 5, 12, true);
  yPos += 10;
  addText(`$${estimate.priceLow || 0} - $${estimate.priceHigh || 0}`, margin + 5, yPos, 20, true, [16, 185, 129]);
  yPos += 10;
  addText(`Estimated Duration: ${estimate.duration || 'N/A'}`, margin + 5, yPos, 10);
  yPos += 15;

  // ==================== TERMS & CONDITIONS ====================
  yPos = addSectionHeader('Terms & Conditions', yPos);
  
  const terms = [
    'This estimate is valid for 30 days from the date of issue.',
    'Final price may vary based on actual conditions at time of service.',
    'Cancellation notice required 24 hours before scheduled service.',
    'Payment due upon completion of service.',
  ];

  terms.forEach(term => {
    yPos = checkNewPage(yPos);
    addText(`• ${term}`, margin + 5, yPos, 9, false, [107, 114, 128]);
    yPos += 5;
  });

  yPos += 10;

  // ==================== FOOTER ====================
  yPos = checkNewPage(yPos + 20);
  
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Contact information
  addText(config.company.name, margin, yPos, 12, true);
  yPos += 6;
  addText(config.company.email, margin, yPos, 10);
  yPos += 5;
  if (config.company.phone) {
    addText(config.company.phone, margin, yPos, 10);
    yPos += 5;
  }
  if (config.company.website) {
    addText(config.company.website, margin, yPos, 10);
    yPos += 5;
  }

  // Footer note
  yPos = checkNewPage(yPos + 10);
  addText('Powered by SLAI - AI-Powered Platform for Cleaning Businesses', margin, yPos, 8, false, [156, 163, 175]);

  return pdf;
}

/**
 * Download PDF quote
 * @param {Object} formData - Customer form data
 * @param {Object} aiResult - AI analysis results
 * @param {Object} estimate - Price estimate
 */
export function downloadQuotePDF(formData, aiResult, estimate) {
  try {
    const pdf = generateQuotePDF(formData, aiResult, estimate);
    const fileName = `quote-${formData.lastName || 'customer'}-${Date.now()}.pdf`;
    pdf.save(fileName);
    return { success: true, fileName };
  } catch (error) {
    console.error('PDF generation error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate PDF as blob (for email attachment)
 * @param {Object} formData - Customer form data
 * @param {Object} aiResult - AI analysis results
 * @param {Object} estimate - Price estimate
 * @returns {Promise<Blob>} PDF blob
 */
export async function generatePDFBlob(formData, aiResult, estimate) {
  try {
    const pdf = generateQuotePDF(formData, aiResult, estimate);
    const blob = pdf.output('blob');
    return blob;
  } catch (error) {
    console.error('PDF blob generation error:', error);
    throw error;
  }
}

/**
 * Generate Service Agreement PDF
 * @param {Object} lead - Lead/customer data
 * @param {Object} estimate - Estimate data
 * @param {Object} contract - Contract data with signature URL
 * @returns {jsPDF} PDF document instance
 */
export function generateServiceAgreementPDF(lead, estimate, contract) {
  const pdf = new jsPDF();
  const config = brandingConfig;
  
  let yPos = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  // Helper function to add text
  const addText = (text, x, y, fontSize = 12, isBold = false, color = [0, 0, 0]) => {
    pdf.setFontSize(fontSize);
    if (isBold) pdf.setFont('helvetica', 'bold');
    else pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(text, x, y);
  };

  // Helper function to add section header
  const addSectionHeader = (text, y) => {
    pdf.setFillColor(59, 130, 246);
    pdf.rect(margin, y - 5, contentWidth, 8, 'F');
    addText(text, margin + 5, y, 14, true, [255, 255, 255]);
    return y + 12;
  };

  // Helper function to check for new page
  const checkNewPage = (y) => {
    if (y > 270) {
      pdf.addPage();
      return 20;
    }
    return y;
  };

  // ==================== HEADER ====================
  addText(config.company.name, margin, yPos, 24, true);
  yPos += 10;
  addText('Service Agreement', margin, yPos, 18, true);
  yPos += 10;
  addText(`Date: ${new Date().toLocaleDateString()}`, margin, yPos, 10, false, [107, 114, 128]);
  yPos += 15;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 15;

  // ==================== CUSTOMER INFORMATION ====================
  yPos = addSectionHeader('Customer Information', yPos);
  
  const customerInfo = [
    `Name: ${lead.firstName} ${lead.lastName}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || 'N/A'}`,
    `Address: ${lead.address}`,
  ];

  customerInfo.forEach(info => {
    addText(info, margin, yPos, 10);
    yPos += 6;
  });
  yPos += 10;

  // ==================== SERVICE DETAILS ====================
  yPos = addSectionHeader('Service Details', yPos);
  
  addText(`Estimated Price: $${estimate.priceLow} - $${estimate.priceHigh}`, margin, yPos, 12, true);
  yPos += 8;
  addText(`Deposit Required: $${contract.agreementTerms?.depositAmount || 'N/A'}`, margin, yPos, 12, true, [16, 185, 129]);
  yPos += 10;

  addText('Scope of Work:', margin, yPos, 11, true);
  yPos += 6;
  
  estimate.rooms.forEach((room) => {
    yPos = checkNewPage(yPos);
    addText(`• ${room.type} x ${room.quantity}`, margin + 5, yPos, 10);
    yPos += 5;
  });
  
  if (estimate.extras && estimate.extras.length > 0) {
    yPos += 5;
    addText('Additional Services:', margin, yPos, 11, true);
    yPos += 6;
    estimate.extras.forEach((extra) => {
      yPos = checkNewPage(yPos);
      addText(`• ${extra.name} - $${extra.price}`, margin + 5, yPos, 10);
      yPos += 5;
    });
  }
  yPos += 10;

  // ==================== TERMS AND CONDITIONS ====================
  yPos = addSectionHeader('Terms and Conditions', yPos);
  
  const terms = [
    'Estimate Accuracy: Estimates are based on information provided and photos submitted. Prices may be adjusted if property conditions differ significantly from what was represented.',
    `Deposit: A ${contract.agreementTerms?.depositPercentage || 25}% deposit ($${contract.agreementTerms?.depositAmount || 'N/A'}) is required to secure the booking. This deposit is non-refundable if cancelled less than 24 hours before the scheduled service.`,
    'Cancellation Policy: Cancellations must be made at least 24 hours before the scheduled service time. Late cancellations will forfeit the deposit.',
    'Access: Customer must provide safe access to the property. If access is not available at the scheduled time, the full service fee may be charged.',
    'Liability: Company is not responsible for pre-existing damage to property or belongings. Customer should secure valuables prior to service.',
    'Payment: Remaining balance is due upon completion of service. Payment can be made via credit card, cash, or check.',
    'Satisfaction: Customer satisfaction is our priority. Any concerns should be reported within 24 hours of service completion.',
  ];

  terms.forEach(term => {
    yPos = checkNewPage(yPos);
    const lines = pdf.splitTextToSize(term, contentWidth - 10);
    lines.forEach((line) => {
      addText(line, margin + 5, yPos, 9, false, [107, 114, 128]);
      yPos += 4;
    });
    yPos += 3;
  });
  yPos += 10;

  // ==================== SIGNATURE ====================
  yPos = addSectionHeader('Customer Agreement', yPos);
  
  addText('By signing below, I acknowledge that I have read, understood, and agree to the terms and conditions outlined above.', margin, yPos, 10);
  yPos += 10;
  
  addText('Customer Signature:', margin, yPos, 11, true);
  yPos += 20;
  
  // Add signature placeholder or actual signature image if available
  if (contract.signatureUrl) {
    // In production, you would load and embed the signature image
    addText('[Signature on file]', margin, yPos, 10, false, [107, 114, 128]);
  } else {
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, yPos, margin + 100, yPos);
  }
  yPos += 10;
  
  addText(`Signed: ${contract.signedAt ? new Date(contract.signedAt).toLocaleString() : 'N/A'}`, margin, yPos, 10);
  yPos += 15;

  // ==================== FOOTER ====================
  yPos = checkNewPage(yPos + 20);
  
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  addText(config.company.name, margin, yPos, 12, true);
  yPos += 6;
  addText(config.company.email, margin, yPos, 10);
  yPos += 5;
  if (config.company.phone) {
    addText(config.company.phone, margin, yPos, 10);
    yPos += 5;
  }

  return pdf;
}

/**
 * Generate Service Agreement PDF blob
 * @param {Object} lead - Lead/customer data
 * @param {Object} estimate - Estimate data
 * @param {Object} contract - Contract data with signature URL
 * @returns {Promise<Blob>} PDF blob
 */
export async function generateServiceAgreementBlob(lead, estimate, contract) {
  try {
    const pdf = generateServiceAgreementPDF(lead, estimate, contract);
    const blob = pdf.output('blob');
    return blob;
  } catch (error) {
    console.error('Service Agreement PDF generation error:', error);
    throw error;
  }
}
