import { useState } from "react";
import { analyzePhotos } from "./services/aiService";
import { calculateEstimate } from "./lib/estimateEngine";
import { saveQuote } from "./services/crmService";
import { sendQuoteEmail, sendPaymentConfirmationEmail } from "./services/emailService";
import { sendSMS } from "./services/notificationService";
import { PhotoGrid } from "./components/PhotoGrid";
import { downloadQuotePDF } from "./services/pdfService";
import PaymentForm from "./components/PaymentForm";
import { compressImages } from "./services/imageCompressionService";
import { formatAmount } from "./services/stripeService";
import { useAuth } from "./contexts/AuthContext";
import { getPricingProfileForTenant } from "./core/estimates/pricingProfiles";

export default function AIPhotoEstimateSystem({
  enablePayments = true,
  onLeadSaved = null
}) {
  const { currentTenant } = useAuth();
  const [step, setStep] = useState("intake");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
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
  });
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notificationStatus, setNotificationStatus] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);

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

  const runAI = async () => {
    setAnalyzing(true);
    setAiMessage("");

    try {
      const result = await analyzePhotos(photoFiles);
      if (!result || result.error) {
        throw new Error(result?.error || "AI analysis is unavailable");
      }
      setAiAnalysis(result);
    } catch (error) {
      console.error("AI analysis failed:", error);
      setAiAnalysis(null);
      setAiMessage("AI photo analysis is unavailable. You can still save a manual estimate.");
    } finally {
      setAnalyzing(false);
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

      if (onLeadSaved) {
        await onLeadSaved(formData, result, aiAnalysis);
      } else {
        await saveQuote(tenantId, formData, result, aiAnalysis);
      }
      setEstimate(result);
      setStep("results");

      setNotificationStatus({
        type: "unknown",
        message: "Estimate saved successfully. Customer notification status could not be confirmed. Please contact the customer manually if needed."
      });

      void Promise.resolve(sendQuoteEmail(formData, result))
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

  const handlePaymentComplete = async (result) => {
    setPaymentResult(result);
    
    // Send payment confirmation email
    const priceMid = (estimate.priceLow + estimate.priceHigh) / 2;
    const depositAmount = Math.round(priceMid * 0.25 * 100); // 25% deposit in cents
    const remainingBalance = Math.round(priceMid * 0.75 * 100); // 75% remaining in cents
    
    await sendPaymentConfirmationEmail(formData, {
      amount: depositAmount,
      type: 'Deposit',
      paymentId: result.paymentId,
      remainingBalance: remainingBalance,
      createdAt: new Date().toISOString()
    });
    
    setStep("payment-success");
  };

  const goToPayment = () => {
    setStep("payment");
  };

  if (step === "intake") {
    return (
      <div style={{ padding: "24px", maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
          Create Estimate
        </h2>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Contact Information
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label htmlFor="estimate-first-name" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                First Name *
              </label>
              <input
                id="estimate-first-name"
                type="text"
                name="firstName"
                required
                value={formData.firstName}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label htmlFor="estimate-last-name" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Last Name *
              </label>
              <input
                id="estimate-last-name"
                type="text"
                name="lastName"
                required
                value={formData.lastName}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label htmlFor="estimate-email" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Email *
              </label>
              <input
                id="estimate-email"
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label htmlFor="estimate-phone" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Phone *
              </label>
              <input
                id="estimate-phone"
                type="tel"
                name="phone"
                required
                value={formData.phone}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Address
          </h3>
          <input
            type="text"
            name="address"
            placeholder="Street Address"
            value={formData.address}
            onChange={handleInputChange}
            style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6, marginBottom: 8 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <input
              type="text"
              name="city"
              placeholder="City"
              value={formData.city}
              onChange={handleInputChange}
              style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
            <input
              type="text"
              name="state"
              placeholder="State"
              value={formData.state}
              onChange={handleInputChange}
              style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
            <input
              type="text"
              name="zip"
              placeholder="ZIP"
              value={formData.zip}
              onChange={handleInputChange}
              style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Preferred Appointment Time
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Preferred Date
              </label>
              <input
                type="date"
                name="preferredDate"
                value={formData.preferredDate}
                onChange={handleInputChange}
                min={new Date().toISOString().split('T')[0]}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Preferred Time
              </label>
              <select
                name="preferredTime"
                value={formData.preferredTime}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              >
                <option value="">Select a time</option>
                <option value="morning">Morning (8AM - 12PM)</option>
                <option value="afternoon">Afternoon (12PM - 5PM)</option>
                <option value="evening">Evening (5PM - 8PM)</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
            We'll confirm the exact time with you after reviewing your request.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Room Details
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Bedrooms
              </label>
              <input
                type="number"
                name="bedroomCount"
                value={formData.bedroomCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Bathrooms
              </label>
              <input
                type="number"
                name="bathroomCount"
                value={formData.bathroomCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Kitchens
              </label>
              <input
                type="number"
                name="kitchenCount"
                value={formData.kitchenCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Living Rooms
              </label>
              <input
                type="number"
                name="livingRoomCount"
                value={formData.livingRoomCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Dining Rooms
              </label>
              <input
                type="number"
                name="diningRoomCount"
                value={formData.diningRoomCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Offices
              </label>
              <input
                type="number"
                name="officeCount"
                value={formData.officeCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Basements
              </label>
              <input
                type="number"
                name="basementCount"
                value={formData.basementCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Stairs Count
              </label>
              <input
                type="number"
                name="stairsCount"
                value={formData.stairsCount}
                onChange={handleInputChange}
                min="0"
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                name="stairs"
                checked={formData.stairs}
                onChange={(e) => setFormData(prev => ({ ...prev, stairs: e.target.checked }))}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontWeight: 500 }}>Has stairs</span>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Property Condition
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Pet Hair Level
              </label>
              <select
                name="petHairLevel"
                value={formData.petHairLevel}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              >
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="heavy">Heavy</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Clutter Level
              </label>
              <select
                name="clutterLevel"
                value={formData.clutterLevel}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              >
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="normal">Normal</option>
                <option value="moderate">Moderate</option>
                <option value="heavy">Heavy</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Last Cleaned
              </label>
              <select
                name="lastCleaned"
                value={formData.lastCleaned}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 Weeks</option>
                <option value="monthly">Monthly</option>
                <option value="2-3months">2-3 Months</option>
                <option value="6months+">6+ Months</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Service Type
              </label>
              <select
                name="cleaningType"
                value={formData.cleaningType}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              >
                <option value="standard">Standard Clean</option>
                <option value="deep">Deep Clean</option>
                <option value="moveout">Move-In / Move-Out</option>
                <option value="construction">Post-Construction</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Frequency
              </label>
              <select
                name="frequency"
                value={formData.frequency}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              >
                <option value="one-time">One-Time</option>
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Every 2 Weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Market Type
              </label>
              <select
                name="marketType"
                value={formData.marketType}
                onChange={handleInputChange}
                style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
              >
                <option value="rural">Rural (Bolivar Area)</option>
                <option value="suburban">Suburban</option>
                <option value="metro">Metro</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Additional Services
          </h3>
          
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>Kitchen & Appliances</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.oven" checked={formData.extras.oven} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Inside Oven (+1h)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.fridge" checked={formData.extras.fridge} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Inside Fridge (+0.75h)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.cabinetsInside" checked={formData.extras.cabinetsInside} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Cabinet Interiors (+1.5h)</span>
            </label>
          </div>

          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>Detailing</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.windows" checked={formData.extras.windows} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Windows (+1.5h)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.baseboards" checked={formData.extras.baseboards} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Baseboards (+1h)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.blindCleaning" checked={formData.extras.blindCleaning} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Blind Cleaning (+1h)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.ceilingFanCleaning" checked={formData.extras.ceilingFanCleaning} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Ceiling Fans (+0.5h)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.wallSpotCleaning" checked={formData.extras.wallSpotCleaning} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Wall Spot Cleaning (+1h)</span>
            </label>
          </div>

          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>Special Areas</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.laundryRoomCleaning" checked={formData.extras.laundryRoomCleaning} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Laundry Room (+0.5h)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.basementCleaning" checked={formData.extras.basementCleaning} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Basement (+1.5h)</span>
            </label>
          </div>

          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>Organization Services</h4>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input type="checkbox" name="extras.garageCleaning" checked={formData.extras.garageCleaning} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Garage Cleaning</span>
            </label>
            {formData.extras.garageCleaning && (
              <select name="levels.garageLevel" value={formData.levels.garageLevel} onChange={handleInputChange} style={{ marginLeft: 26, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}>
                <option value="none">Select clutter level</option>
                <option value="light">Light (+1h)</option>
                <option value="moderate">Moderate (+2h)</option>
                <option value="heavy">Heavy (+4h)</option>
              </select>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input type="checkbox" name="extras.closetOrganization" checked={formData.extras.closetOrganization} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Closet Organization</span>
            </label>
            {formData.extras.closetOrganization && (
              <select name="levels.closetLevel" value={formData.levels.closetLevel} onChange={handleInputChange} style={{ marginLeft: 26, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}>
                <option value="none">Select clutter level</option>
                <option value="light">Light (+0.5h)</option>
                <option value="moderate">Moderate (+1.5h)</option>
                <option value="heavy">Heavy (+3h)</option>
              </select>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input type="checkbox" name="extras.pantryOrganization" checked={formData.extras.pantryOrganization} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Pantry Organization (+1h)</span>
            </label>
          </div>

          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 16 }}>Pet Services</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="extras.petWasteRemoval" checked={formData.extras.petWasteRemoval} onChange={handleInputChange} style={{ width: 18, height: 18 }} />
              <span>Pet Waste Removal (+1h)</span>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Photos (Optional)
          </h3>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
            Upload up to 5 photos for optional AI-powered analysis. Manual estimates do not require photos or AI. {compressing && "Compressing images..."}
          </p>
          <input
            type="file"
            aria-label="Upload estimate photos"
            multiple
            accept="image/*"
            onChange={handleUpload}
            disabled={compressing}
            style={{ marginBottom: 12 }}
          />
          {photoPreviews.length > 0 && <PhotoGrid photos={photoPreviews} />}
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Special Requests
          </h3>
          <textarea
            name="specialRequests"
            value={formData.specialRequests}
            onChange={handleInputChange}
            rows={4}
            style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6 }}
          />
        </div>

        <button
          onClick={() => setStep("review")}
          disabled={!formData.firstName || !formData.lastName || !formData.email || !formData.phone}
          style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: (!formData.firstName || !formData.lastName || !formData.email || !formData.phone) ? "not-allowed" : "pointer",
            opacity: (!formData.firstName || !formData.lastName || !formData.email || !formData.phone) ? 0.5 : 1
          }}
        >
          Review & Generate Estimate
        </button>
      </div>
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
            onClick={runAI}
            disabled={analyzing || photoFiles.length === 0}
            style={{
              padding: "12px 24px",
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: analyzing || photoFiles.length === 0 ? "not-allowed" : "pointer",
              opacity: analyzing || photoFiles.length === 0 ? 0.5 : 1
            }}
          >
            {analyzing ? "Analyzing..." : "Run AI Analysis"}
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
        {photoFiles.length === 0 && (
          <p style={{ marginTop: 12, fontSize: 14, color: "#64748b" }}>
            Add photos to use AI analysis, or save the estimate manually.
          </p>
        )}
        {aiMessage && (
          <div role="status" style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#fff7ed", color: "#9a3412" }}>
            {aiMessage}
          </div>
        )}
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
          {enablePayments && (
            <button
              onClick={goToPayment}
              style={{
                padding: "12px 24px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Proceed to Payment
            </button>
          )}
          <button
            onClick={() => {
              setStep("intake");
              setPhotoFiles([]);
              setPhotoPreviews([]);
              setAiAnalysis(null);
              setEstimate(null);
              setPaymentResult(null);
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

  if (step === "payment") {
    return (
      <div style={{ padding: "24px", maxWidth: 600, margin: "0 auto" }}>
        <PaymentForm
          estimate={estimate}
          formData={formData}
          onPaymentComplete={handlePaymentComplete}
          onCancel={() => setStep("results")}
        />
      </div>
    );
  }

  if (step === "payment-success") {
    return (
      <div style={{ padding: "24px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
          Payment Successful!
        </h2>
        <p style={{ fontSize: 16, color: "#64748b", marginBottom: 24 }}>
          Your deposit of {formatAmount(paymentResult?.amount || 0)} has been processed.
        </p>
        <div style={{
          padding: 24,
          background: "#f0fdf4",
          borderRadius: 12,
          border: "1px solid #bbf7d0",
          marginBottom: 24
        }}>
          <p style={{ margin: 0, color: "#166534" }}>
            Payment ID: {paymentResult?.paymentId || 'N/A'}
          </p>
        </div>
        <button
          onClick={() => {
            setStep("intake");
            setPhotoFiles([]);
            setPhotoPreviews([]);
            setAiAnalysis(null);
            setEstimate(null);
            setPaymentResult(null);
          }}
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
          Create Another Estimate
        </button>
      </div>
    );
  }

  return null;
}
