import { useState } from "react";
import { calculateEstimate } from "./lib/estimateEngine";
import { saveQuote } from "./services/crmService";
import { sendQuoteEmail } from "./services/emailService";
import { sendSMS } from "./services/notificationService";
import { PhotoGrid } from "./components/PhotoGrid";
import { downloadQuotePDF } from "./services/pdfService";
import { compressImages } from "./services/imageCompressionService";
import { useAuth } from "./contexts/AuthContext";
import { getPricingProfileForTenant } from "./core/estimates/pricingProfiles";
import { formatLocalDateInputValue } from "./utils/dateOnly";

const OWNER_EXTRA_KEYS = [
  "oven", "fridge", "windows", "baseboards", "cabinetsInside", "garageCleaning",
  "closetOrganization", "pantryOrganization", "laundryRoomCleaning", "basementCleaning",
  "petWasteRemoval", "blindCleaning", "ceilingFanCleaning", "wallSpotCleaning"
];

function initialEstimateFormData(prefill = {}) {
  return {
    firstName: prefill.firstName || "",
    lastName: prefill.lastName || "",
    email: prefill.email || "",
    phone: prefill.phone || "",
    address: prefill.address || "",
    city: prefill.city || "",
    state: prefill.state || "",
    zip: prefill.zip || "",
    bedroomCount: 3,
    bathroomCount: 2,
    kitchenCount: 1,
    livingRoomCount: 1,
    diningRoomCount: 0,
    officeCount: 0,
    basementCount: 0,
    stairs: false,
    stairsCount: 0,
    petHairLevel: "none",
    clutterLevel: "normal",
    lastCleaned: "monthly",
    cleaningType: "standard",
    frequency: "one-time",
    marketType: "rural", // Default to rural for Bolivar, Missouri
    preferredDate: "",
    preferredTime: "",
    extras: {
      oven: false,
      fridge: false,
      windows: false,
      baseboards: false,
      cabinetsInside: false,
      garageCleaning: false,
      closetOrganization: false,
      pantryOrganization: false,
      laundryRoomCleaning: false,
      basementCleaning: false,
      petWasteRemoval: false,
      blindCleaning: false,
      ceilingFanCleaning: false,
      wallSpotCleaning: false
    },
    levels: {
      garageLevel: "none",
      closetLevel: "none",
      organizationLevel: "none"
    },
    specialRequests: ""
  };
}

export default function AIPhotoEstimateSystem({
  onLeadSaved = null,
  initialCustomerPrefill = null,
  existingCustomerContext = null,
}) {
  const { currentTenant } = useAuth();
  const [step, setStep] = useState("intake");
  const [formData, setFormData] = useState(() => initialEstimateFormData(initialCustomerPrefill || {}));
  const [, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notificationStatus, setNotificationStatus] = useState(null);
  const [compressing, setCompressing] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('extras.')) {
      const extraName = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        extras: {
          ...prev.extras,
          [extraName]: type === 'checkbox' ? checked : value
        }
      }));
    } else if (name.startsWith('levels.')) {
      const levelName = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        levels: {
          ...prev.levels,
          [levelName]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
  };

  const allExtrasSelected = OWNER_EXTRA_KEYS.every((key) => formData.extras[key]);
  const handleSelectAllExtras = (checked) => {
    setFormData((current) => ({
      ...current,
      extras: Object.fromEntries(OWNER_EXTRA_KEYS.map((key) => [key, checked]))
    }));
  };

  const handleUpload = async e => {
    const files = Array.from(e.target.files).slice(0, 5);
    if (files.length === 0) return;

    setCompressing(true);
    try {
      const compressedFiles = await compressImages(files, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.8,
        maxSizeKB: 500
      });
      setPhotoFiles(compressedFiles);

      setPhotoPreviews(
        compressedFiles.map(f => ({
          name: f.name,
          url: URL.createObjectURL(f)
        }))
      );
    } catch (error) {
      console.error('Compression error:', error);
      setPhotoFiles(files);
      setPhotoPreviews(
        files.map(f => ({
          name: f.name,
          url: URL.createObjectURL(f)
        }))
      );
    } finally {
      setCompressing(false);
    }
  };

  const generate = async () => {
    setSaving(true);
    setSaveError("");
    setNotificationStatus(null);

    try {
      const pricingProfile = getPricingProfileForTenant(currentTenant);
      const result = calculateEstimate(formData, aiAnalysis, pricingProfile);
      const tenantId = typeof currentTenant === "string" ? currentTenant : currentTenant?.id;
      let savedLead;

      if (onLeadSaved) {
        if (existingCustomerContext?.customerId) {
          savedLead = await onLeadSaved(formData, result, aiAnalysis, existingCustomerContext);
        } else {
          savedLead = await onLeadSaved(formData, result, aiAnalysis);
        }
      } else {
        savedLead = await saveQuote(tenantId, formData, result, aiAnalysis);
      }
      setEstimate(result);
      setStep("results");

      setNotificationStatus({
        type: "unknown",
        message: "Estimate saved successfully. Customer notification status could not be confirmed. Please contact the customer manually if needed."
      });

      void Promise.resolve(sendQuoteEmail(tenantId, { ...formData, id: savedLead?.id }, result))
        .then(emailResult => {
          if (emailResult?.success === true) {
            setNotificationStatus({
              type: "success",
              message: "Estimate saved successfully. Customer notification sent."
            });
          } else if (emailResult?.success === false) {
            setNotificationStatus({
              type: "warning",
              message: "Estimate saved successfully. Customer notification could not be sent. Please contact the customer manually for now."
            });
          } else {
            setNotificationStatus({
              type: "unknown",
              message: "Estimate saved successfully. Customer notification status could not be confirmed. Please contact the customer manually if needed."
            });
          }
        })
        .catch(notificationError => {
          console.error("Estimate email notification failed:", notificationError);
          setNotificationStatus({
            type: "warning",
            message: "Estimate saved successfully. Customer notification could not be sent. Please contact the customer manually for now."
          });
        });

      try {
        sendSMS({
          to: formData.phone,
          message: `Your estimate is $${result.priceLow} - $${result.priceHigh}`
        });
      } catch (notificationError) {
        console.error("Estimate SMS notification failed:", notificationError);
      }
    } catch (error) {
      console.error("Estimate save failed:", error);
      setSaveError("We couldn't save this estimate. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const downloadPDF = () => {
    downloadQuotePDF(formData, aiAnalysis, estimate);
  };

  if (step === "intake") {
    return (
      <section className="create-estimate-page" aria-labelledby="create-estimate-title">
        <header className="v1-page-header create-estimate-page-header">
          <h1 className="v1-page-title" id="create-estimate-title">Create Estimate</h1>
          <p className="v1-page-subtitle">Create an estimate for a customer and their property, then review the details before saving.</p>
        </header>

        <div className="create-estimate-form-layout">
          <section className="v1-card create-estimate-section" aria-labelledby="create-estimate-contact-title">
            <h2 className="create-estimate-section-title" id="create-estimate-contact-title">Customer Information</h2>
            <div className="create-estimate-field-grid create-estimate-field-grid-two">
              <div className="create-estimate-field">
                <label htmlFor="estimate-first-name">First Name <span aria-hidden="true">*</span></label>
                <input id="estimate-first-name" className="create-estimate-control" type="text" name="firstName" required value={formData.firstName} onChange={handleInputChange} />
              </div>
              <div className="create-estimate-field">
                <label htmlFor="estimate-last-name">Last Name <span aria-hidden="true">*</span></label>
                <input id="estimate-last-name" className="create-estimate-control" type="text" name="lastName" required value={formData.lastName} onChange={handleInputChange} />
              </div>
              <div className="create-estimate-field">
                <label htmlFor="estimate-email">Email <span aria-hidden="true">*</span></label>
                <input id="estimate-email" className="create-estimate-control" type="email" name="email" required value={formData.email} onChange={handleInputChange} />
              </div>
              <div className="create-estimate-field">
                <label htmlFor="estimate-phone">Phone <span aria-hidden="true">*</span></label>
                <input id="estimate-phone" className="create-estimate-control" type="tel" name="phone" required value={formData.phone} onChange={handleInputChange} />
              </div>
            </div>
          </section>

          <section className="v1-card create-estimate-section" aria-labelledby="create-estimate-address-title">
            <h2 className="create-estimate-section-title" id="create-estimate-address-title">Property Address</h2>
            <div className="create-estimate-address-fields">
              <div className="create-estimate-field">
                <label htmlFor="estimate-address">Street Address</label>
                <input id="estimate-address" className="create-estimate-control" type="text" name="address" placeholder="Street Address" value={formData.address} onChange={handleInputChange} />
              </div>
              <div className="create-estimate-address-grid">
                <div className="create-estimate-field">
                  <label htmlFor="estimate-city">City</label>
                  <input id="estimate-city" className="create-estimate-control" type="text" name="city" placeholder="City" value={formData.city} onChange={handleInputChange} />
                </div>
                <div className="create-estimate-field">
                  <label htmlFor="estimate-state">State</label>
                  <input id="estimate-state" className="create-estimate-control" type="text" name="state" placeholder="State" value={formData.state} onChange={handleInputChange} />
                </div>
                <div className="create-estimate-field">
                  <label htmlFor="estimate-zip">ZIP</label>
                  <input id="estimate-zip" className="create-estimate-control" type="text" name="zip" placeholder="ZIP" value={formData.zip} onChange={handleInputChange} />
                </div>
              </div>
            </div>
          </section>

          <section className="v1-card create-estimate-section" aria-labelledby="create-estimate-appointment-title">
            <h2 className="create-estimate-section-title" id="create-estimate-appointment-title">Appointment Preference</h2>
            <div className="create-estimate-schedule-grid">
              <div className="create-estimate-field">
                <label htmlFor="create-estimate-preferred-date">Preferred Date</label>
                <input id="create-estimate-preferred-date" className="create-estimate-control create-estimate-date-field" type="date" name="preferredDate" value={formData.preferredDate} onChange={handleInputChange} min={formatLocalDateInputValue()} />
              </div>
              <div className="create-estimate-field">
                <label htmlFor="create-estimate-preferred-time">Preferred Time</label>
                <select id="create-estimate-preferred-time" className="create-estimate-control" name="preferredTime" value={formData.preferredTime} onChange={handleInputChange}>
                  <option value="">Select a time</option>
                  <option value="morning">Morning (8AM - 12PM)</option>
                  <option value="afternoon">Afternoon (12PM - 5PM)</option>
                  <option value="evening">Evening (5PM - 8PM)</option>
                </select>
              </div>
            </div>
            <p className="create-estimate-help-text">We&apos;ll confirm the exact time after reviewing the request.</p>
          </section>

          <section className="v1-card create-estimate-section" aria-labelledby="create-estimate-service-title">
            <h2 className="create-estimate-section-title" id="create-estimate-service-title">Service Details</h2>
            <div className="create-estimate-field-grid create-estimate-field-grid-two">
              <div className="create-estimate-field">
                <label htmlFor="estimate-cleaning-type">Service Type</label>
                <select id="estimate-cleaning-type" className="create-estimate-control" name="cleaningType" value={formData.cleaningType} onChange={handleInputChange}>
                  <option value="standard">Standard Clean</option>
                  <option value="deep">Deep Clean</option>
                  <option value="moveout">Move-In / Move-Out</option>
                  <option value="construction">Post-Construction</option>
                </select>
              </div>
              <div className="create-estimate-field">
                <label htmlFor="estimate-frequency">Frequency</label>
                <select id="estimate-frequency" className="create-estimate-control" name="frequency" value={formData.frequency} onChange={handleInputChange}>
                  <option value="one-time">One-Time</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Every 2 Weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="create-estimate-field create-estimate-field-span-two">
                <label htmlFor="estimate-market-type">Market Type</label>
                <select id="estimate-market-type" className="create-estimate-control" name="marketType" value={formData.marketType} onChange={handleInputChange}>
                  <option value="rural">Rural (Bolivar Area)</option>
                  <option value="suburban">Suburban</option>
                  <option value="metro">Metro</option>
                </select>
              </div>
            </div>
          </section>

          <section className="v1-card create-estimate-section create-estimate-section-wide" aria-labelledby="create-estimate-rooms-title">
            <h2 className="create-estimate-section-title" id="create-estimate-rooms-title">Room Details</h2>
            <div className="create-estimate-room-grid">
            <div>
              <label htmlFor="estimate-bedroom-count">Bedrooms</label>
              <input
                id="estimate-bedroom-count"
                className="create-estimate-control"
                type="number"
                name="bedroomCount"
                value={formData.bedroomCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="estimate-bathroom-count">Bathrooms</label>
              <input
                id="estimate-bathroom-count"
                className="create-estimate-control"
                type="number"
                name="bathroomCount"
                value={formData.bathroomCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="estimate-kitchen-count">Kitchens</label>
              <input
                id="estimate-kitchen-count"
                className="create-estimate-control"
                type="number"
                name="kitchenCount"
                value={formData.kitchenCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="estimate-living-room-count">Living Rooms</label>
              <input
                id="estimate-living-room-count"
                className="create-estimate-control"
                type="number"
                name="livingRoomCount"
                value={formData.livingRoomCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="estimate-dining-room-count">Dining Rooms</label>
              <input
                id="estimate-dining-room-count"
                className="create-estimate-control"
                type="number"
                name="diningRoomCount"
                value={formData.diningRoomCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="estimate-office-count">Offices</label>
              <input
                id="estimate-office-count"
                className="create-estimate-control"
                type="number"
                name="officeCount"
                value={formData.officeCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="estimate-basement-count">Basements</label>
              <input
                id="estimate-basement-count"
                className="create-estimate-control"
                type="number"
                name="basementCount"
                value={formData.basementCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            <div>
              <label htmlFor="estimate-stairs-count">Stairs Count</label>
              <input
                id="estimate-stairs-count"
                className="create-estimate-control"
                type="number"
                name="stairsCount"
                value={formData.stairsCount}
                onChange={handleInputChange}
                min="0"
              />
            </div>
            </div>
            <label className="create-estimate-checkbox-row create-estimate-stairs-toggle">
              <input
                className="create-estimate-checkbox"
                type="checkbox"
                name="stairs"
                checked={formData.stairs}
                onChange={(e) => setFormData(prev => ({ ...prev, stairs: e.target.checked }))}
              />
              <span>Has stairs</span>
            </label>
          </section>

          <section className="v1-card create-estimate-section create-estimate-section-wide" aria-labelledby="create-estimate-condition-title">
            <h2 className="create-estimate-section-title" id="create-estimate-condition-title">Property Condition</h2>
            <div className="create-estimate-field-grid create-estimate-field-grid-three">
              <div className="create-estimate-field">
                <label htmlFor="estimate-pet-hair-level">Pet Hair Level</label>
              <select
                id="estimate-pet-hair-level"
                className="create-estimate-control"
                name="petHairLevel"
                value={formData.petHairLevel}
                onChange={handleInputChange}
              >
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="heavy">Heavy</option>
              </select>
            </div>
              <div className="create-estimate-field">
                <label htmlFor="estimate-clutter-level">Clutter Level</label>
              <select
                id="estimate-clutter-level"
                className="create-estimate-control"
                name="clutterLevel"
                value={formData.clutterLevel}
                onChange={handleInputChange}
              >
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="normal">Normal</option>
                <option value="moderate">Moderate</option>
                <option value="heavy">Heavy</option>
              </select>
            </div>
              <div className="create-estimate-field">
                <label htmlFor="estimate-last-cleaned">Last Cleaned</label>
              <select
                id="estimate-last-cleaned"
                className="create-estimate-control"
                name="lastCleaned"
                value={formData.lastCleaned}
                onChange={handleInputChange}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 Weeks</option>
                <option value="monthly">Monthly</option>
                <option value="2-3months">2-3 Months</option>
                <option value="6months+">6+ Months</option>
              </select>
            </div>
            </div>
          </section>

          <section className="v1-card create-estimate-section create-estimate-section-wide" aria-labelledby="create-estimate-extras-title">
            <div className="create-estimate-section-heading-row">
              <h2 className="create-estimate-section-title" id="create-estimate-extras-title">Additional Services</h2>
              <label className="create-estimate-checkbox-row create-estimate-select-all">
            <input
              className="create-estimate-checkbox"
              type="checkbox"
              aria-label="Select all additional services"
              checked={allExtrasSelected}
              onChange={(event) => handleSelectAllExtras(event.target.checked)}
            />
            <span>Select All</span>
          </label>
            </div>
          
          <h3 className="create-estimate-extra-group-title">Kitchen & Appliances</h3>
          <div className="create-estimate-checklist-grid">
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.oven" checked={formData.extras.oven} onChange={handleInputChange} />
              <span>Inside Oven (+1h)</span>
            </label>
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.fridge" checked={formData.extras.fridge} onChange={handleInputChange} />
              <span>Inside Fridge (+0.75h)</span>
            </label>
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.cabinetsInside" checked={formData.extras.cabinetsInside} onChange={handleInputChange} />
              <span>Cabinet Interiors (+1.5h)</span>
            </label>
          </div>

          <h3 className="create-estimate-extra-group-title">Detailing</h3>
          <div className="create-estimate-checklist-grid">
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.windows" checked={formData.extras.windows} onChange={handleInputChange} />
              <span>Windows (+1.5h)</span>
            </label>
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.baseboards" checked={formData.extras.baseboards} onChange={handleInputChange} />
              <span>Baseboards (+1h)</span>
            </label>
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.blindCleaning" checked={formData.extras.blindCleaning} onChange={handleInputChange} />
              <span>Blind Cleaning (+1h)</span>
            </label>
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.ceilingFanCleaning" checked={formData.extras.ceilingFanCleaning} onChange={handleInputChange} />
              <span>Ceiling Fans (+0.5h)</span>
            </label>
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.wallSpotCleaning" checked={formData.extras.wallSpotCleaning} onChange={handleInputChange} />
              <span>Wall Spot Cleaning (+1h)</span>
            </label>
          </div>

          <h3 className="create-estimate-extra-group-title">Special Areas</h3>
          <div className="create-estimate-checklist-grid">
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.laundryRoomCleaning" checked={formData.extras.laundryRoomCleaning} onChange={handleInputChange} />
              <span>Laundry Room (+0.5h)</span>
            </label>
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.basementCleaning" checked={formData.extras.basementCleaning} onChange={handleInputChange} />
              <span>Basement (+1.5h)</span>
            </label>
          </div>

          <h3 className="create-estimate-extra-group-title">Organization Services</h3>
          <div className="create-estimate-conditional-extra">
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.garageCleaning" checked={formData.extras.garageCleaning} onChange={handleInputChange} />
              <span>Garage Cleaning</span>
            </label>
            {formData.extras.garageCleaning && (
              <select className="create-estimate-control create-estimate-extra-level" name="levels.garageLevel" value={formData.levels.garageLevel} onChange={handleInputChange}>
                <option value="none">Select clutter level</option>
                <option value="light">Light (+1h)</option>
                <option value="moderate">Moderate (+2h)</option>
                <option value="heavy">Heavy (+4h)</option>
              </select>
            )}
          </div>

          <div className="create-estimate-conditional-extra">
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.closetOrganization" checked={formData.extras.closetOrganization} onChange={handleInputChange} />
              <span>Closet Organization</span>
            </label>
            {formData.extras.closetOrganization && (
              <select className="create-estimate-control create-estimate-extra-level" name="levels.closetLevel" value={formData.levels.closetLevel} onChange={handleInputChange}>
                <option value="none">Select clutter level</option>
                <option value="light">Light (+0.5h)</option>
                <option value="moderate">Moderate (+1.5h)</option>
                <option value="heavy">Heavy (+3h)</option>
              </select>
            )}
          </div>

          <div className="create-estimate-conditional-extra">
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.pantryOrganization" checked={formData.extras.pantryOrganization} onChange={handleInputChange} />
              <span>Pantry Organization (+1h)</span>
            </label>
          </div>

          <h3 className="create-estimate-extra-group-title">Pet Services</h3>
          <div className="create-estimate-checklist-grid">
            <label className="create-estimate-checkbox-row">
              <input className="create-estimate-checkbox" type="checkbox" name="extras.petWasteRemoval" checked={formData.extras.petWasteRemoval} onChange={handleInputChange} />
              <span>Pet Waste Removal (+1h)</span>
            </label>
          </div>
          </section>

          <section className="v1-card create-estimate-section" aria-labelledby="create-estimate-photos-title">
            <h2 className="create-estimate-section-title" id="create-estimate-photos-title">Photos <span className="create-estimate-title-note">Preview only</span></h2>
          <p className="create-estimate-help-text">
            Photos can be previewed here but are not saved with this estimate. AI photo analysis is unavailable in this release. {compressing && "Compressing images..."}
          </p>
          <input
            className="create-estimate-file-input"
            type="file"
            aria-label="Upload estimate photos"
            multiple
            accept="image/*"
            onChange={handleUpload}
            disabled={compressing}
          />
          {photoPreviews.length > 0 && <PhotoGrid photos={photoPreviews} />}
          </section>

          <section className="v1-card create-estimate-section" aria-labelledby="create-estimate-requests-title">
            <h2 className="create-estimate-section-title" id="create-estimate-requests-title">Special Requests</h2>
          <textarea
            id="estimate-special-requests"
            className="create-estimate-control create-estimate-textarea"
            aria-label="Special Requests"
            name="specialRequests"
            value={formData.specialRequests}
            onChange={handleInputChange}
            rows={4}
          />
          </section>
        </div>

        <div className="create-estimate-action-area">
          <button
            className="v1-button v1-button-primary create-estimate-submit"
            onClick={() => setStep("review")}
            disabled={!formData.firstName || !formData.lastName || !formData.email || !formData.phone}
          >
            Review & Generate Estimate
          </button>
        </div>
      </section>
    );
  }

  if (step === "review") {
    return (
      <div style={{ padding: "24px", maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
          Review Your Request
        </h2>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Contact Information
          </h3>
          <p><strong>Name:</strong> {formData.firstName} {formData.lastName}</p>
          <p><strong>Email:</strong> {formData.email}</p>
          <p><strong>Phone:</strong> {formData.phone}</p>
          <p><strong>Address:</strong> {formData.address}, {formData.city}, {formData.state} {formData.zip}</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Room Details
          </h3>
          <p><strong>Bedrooms:</strong> {formData.bedroomCount}</p>
          <p><strong>Bathrooms:</strong> {formData.bathroomCount}</p>
          <p><strong>Kitchens:</strong> {formData.kitchenCount}</p>
          <p><strong>Living Rooms:</strong> {formData.livingRoomCount}</p>
          <p><strong>Dining Rooms:</strong> {formData.diningRoomCount}</p>
          <p><strong>Offices:</strong> {formData.officeCount}</p>
          <p><strong>Basements:</strong> {formData.basementCount}</p>
          <p><strong>Stairs:</strong> {formData.stairs ? `Yes (${formData.stairsCount})` : 'No'}</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Property Condition
          </h3>
          <p><strong>Pet Hair Level:</strong> {formData.petHairLevel}</p>
          <p><strong>Clutter Level:</strong> {formData.clutterLevel}</p>
          <p><strong>Last Cleaned:</strong> {formData.lastCleaned}</p>
          <p><strong>Service Type:</strong> {formData.cleaningType}</p>
          <p><strong>Frequency:</strong> {formData.frequency}</p>
          <p><strong>Market Type:</strong> {formData.marketType}</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Additional Services
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {formData.extras.oven && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Inside Oven</span>}
            {formData.extras.fridge && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Inside Fridge</span>}
            {formData.extras.windows && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Windows</span>}
            {formData.extras.baseboards && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Baseboards</span>}
            {formData.extras.cabinetsInside && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Cabinet Interiors</span>}
            {formData.extras.blindCleaning && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Blind Cleaning</span>}
            {formData.extras.ceilingFanCleaning && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Ceiling Fans</span>}
            {formData.extras.wallSpotCleaning && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Wall Spot Cleaning</span>}
            {formData.extras.laundryRoomCleaning && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Laundry Room</span>}
            {formData.extras.basementCleaning && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Basement</span>}
            {formData.extras.garageCleaning && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Garage ({formData.levels.garageLevel})</span>}
            {formData.extras.closetOrganization && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Closet Organization ({formData.levels.closetLevel})</span>}
            {formData.extras.pantryOrganization && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Pantry Organization</span>}
            {formData.extras.petWasteRemoval && <span style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 4, fontSize: 12 }}>Pet Waste Removal</span>}
            {!formData.extras.oven && !formData.extras.fridge && !formData.extras.windows && !formData.extras.baseboards && !formData.extras.cabinetsInside && !formData.extras.blindCleaning && !formData.extras.ceilingFanCleaning && !formData.extras.wallSpotCleaning && !formData.extras.laundryRoomCleaning && !formData.extras.basementCleaning && !formData.extras.garageCleaning && !formData.extras.closetOrganization && !formData.extras.pantryOrganization && !formData.extras.petWasteRemoval && <span style={{ color: "#64748b", fontSize: 14 }}>None selected</span>}
          </div>
        </div>

        {photoPreviews.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              Photos
            </h3>
            <PhotoGrid photos={photoPreviews} />
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setStep("intake")}
            style={{
              padding: "12px 24px",
              background: "white",
              color: "#0f172a",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Back
          </button>
          <button
            type="button"
            disabled
            aria-describedby="ai-analysis-unavailable"
            style={{
              padding: "12px 24px",
              background: "#e2e8f0",
              color: "#475569",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "not-allowed",
              opacity: 0.8
            }}
          >
            AI Analysis Unavailable
          </button>
          <button
            onClick={generate}
            disabled={saving}
            style={{
              padding: "12px 24px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1
            }}
          >
            {saving ? "Saving Estimate..." : aiAnalysis ? "Save AI-Enhanced Estimate" : "Save Manual Estimate"}
          </button>
        </div>
        <p id="ai-analysis-unavailable" role="status" style={{ marginTop: 12, fontSize: 14, color: "#64748b" }}>
          AI photo analysis is unavailable in this release. You can still save a manual estimate.
        </p>
        {saveError && (
          <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>
            {saveError}
          </div>
        )}
      </div>
    );
  }

  if (step === "results") {
    return (
      <div style={{ padding: "24px" }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
          Estimate Results
        </h2>

        <div style={{
          padding: 24,
          background: "#f0fdf4",
          borderRadius: 12,
          border: "1px solid #bbf7d0",
          marginBottom: 24
        }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
            ${estimate.priceLow} - ${estimate.priceHigh}
          </div>
          <p style={{ fontSize: 16, color: "#166534" }}>
            Estimated cleaning cost
          </p>
        </div>

        {notificationStatus && (
          <div
            role="status"
            style={{
              padding: 14,
              borderRadius: 8,
              marginBottom: 24,
              background: notificationStatus.type === "success" ? "#f0fdf4" : "#fff7ed",
              border: notificationStatus.type === "success" ? "1px solid #bbf7d0" : "1px solid #fed7aa",
              color: notificationStatus.type === "success" ? "#166534" : "#9a3412"
            }}
          >
            {notificationStatus.message}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Details
          </h3>
          <p><strong>Appointment Duration:</strong> {estimate.appointmentDuration} hours</p>
          {formData.preferredDate && (
            <p><strong>Preferred Date:</strong> {new Date(formData.preferredDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
          )}
          {formData.preferredTime && (
            <p><strong>Preferred Time:</strong> {
              formData.preferredTime === 'morning' ? 'Morning (8AM - 12PM)' :
              formData.preferredTime === 'afternoon' ? 'Afternoon (12PM - 5PM)' :
              formData.preferredTime === 'evening' ? 'Evening (5PM - 8PM)' : formData.preferredTime
            }</p>
          )}
          {estimate.aiEnhanced && (
            <p style={{ color: "#7c3aed", fontSize: 14 }}>
              ✨ AI-powered analysis used for accurate pricing
            </p>
          )}
        </div>

        {aiAnalysis?.recommendations && aiAnalysis.recommendations.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              Service Recommendations
            </h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {aiAnalysis.recommendations.map((rec, index) => (
                <li key={index} style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 6, marginBottom: 8, fontSize: 14 }}>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={downloadPDF}
            style={{
              padding: "12px 24px",
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Download PDF
          </button>
          <button
            onClick={() => {
              setStep("intake");
              setPhotoFiles([]);
              setPhotoPreviews([]);
              setAiAnalysis(null);
              setEstimate(null);
              setNotificationStatus(null);
            }}
            style={{
              padding: "12px 24px",
              background: "white",
              color: "#0f172a",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Create Another Estimate
          </button>
        </div>
      </div>
    );
  }

  return null;
}
