/**
 * IntakeForm.jsx
 * 5-step production intake form.
 *
 * Steps:
 *  1  Contact info
 *  2  Property details
 *  3  Cleaning needs + service scope
 *  4  Environmental factors + AI photo upload
 *  5  Schedule + review + estimate
 *
 * Props:
 *   onLeadSaved(formData, estimate, aiAnalysis) — called on successful submit
 */

import { useState, useRef } from "react";

// ─── Calculation engine (same formula as before) ──────────────────────────────
function calculateEstimate(fd, aiAnalysis) {
  const B = Number(fd.bedrooms)     || 0;
  const R = Number(fd.bathrooms)    || 0;
  const H = Number(fd.halfBaths)    || 0;
  const S = Number(fd.squareFootage)|| 0;

  const totalR     = R + H * 0.5;
  const baseLab    = 0.75 * B + 1.25 * totalR + 0.0008 * S;

  const condMult   = { light: 1.0, moderate: 1.25, heavy: 1.6 }[fd.condition] || 1.25;

  // Add-ons
  let addOn = 0;
  if (fd.pets) addOn += fd.petCount <= 1 ? 0.5 : fd.petCount <= 2 ? 1.0 : 1.5;
  if (fd.children)     addOn += 0.25;
  if (fd.smokingInside) addOn += 0.5;
  if (fd.levels > 1)   addOn += (fd.levels - 1) * 0.5;
  if (fd.garage)       addOn += 0.5;
  if (fd.basement)     addOn += 0.75;

  // Service scope add-ons
  const scope = fd.serviceScope || {};
  if (scope.insideFridge)   addOn += 0.5;
  if (scope.insideOven)     addOn += 0.5;
  if (scope.insideCabinets) addOn += 0.75;
  if (scope.baseboards)     addOn += 0.5;
  if (scope.windows)        addOn += 0.75;
  if (scope.laundry)        addOn += 0.5;
  if (scope.dishes)         addOn += 0.25;
  if (scope.organization)   addOn += 1.0;

  // AI-recommended extra time
  if (aiAnalysis?.estimatedAddTime) addOn += aiAnalysis.estimatedAddTime;

  // Hazards
  const hazards = fd.hazards || [];
  if (hazards.includes("hoarding"))   addOn += 3.0;
  if (hazards.includes("mold"))       addOn += 1.0;
  if (hazards.includes("biohazard")) addOn += 2.0;
  if (hazards.includes("fleas"))      addOn += 0.5;
  if (hazards.includes("rodents"))    addOn += 1.0;

  let labor = (baseLab * condMult) + addOn;

  const svcMult = { standard: 1.0, deep: 1.25, moveout: 1.4, construction: 1.8 }[fd.cleaningType] || 1.0;
  labor *= svcMult;
  labor  = Math.max(2.0, Math.round(labor * 2) / 2);

  const apptDur  = Math.round(labor * 1.15 * 2) / 2;
  let   priceLow = labor * 35;
  let   priceHigh= labor * 65;

  if (fd.condition === "heavy") { priceLow *= 1.15; priceHigh *= 1.25; }
  if (fd.cleaningType === "moveout")      { priceLow *= 1.25; priceHigh *= 1.40; }
  else if (fd.cleaningType === "deep")   { priceLow *= 1.20; priceHigh *= 1.30; }
  else if (fd.cleaningType === "construction") { priceLow *= 1.50; priceHigh *= 1.80; }

  // AI confidence gating
  const aiConfidence = aiAnalysis?.confidence ?? 100;
  const requiresReview = aiConfidence < 60 || (hazards.length > 0 && hazards.some(h => ["hoarding","biohazard","mold"].includes(h)));

  return {
    laborHours:          labor,
    appointmentDuration: apptDur,
    priceLow:            Math.round(priceLow),
    priceHigh:           Math.round(priceHigh),
    aiEnhanced:          !!(aiAnalysis && !aiAnalysis.error),
    requiresReview,
    aiConfidence,
    breakdown: { baseLab: Math.round(baseLab * 10) / 10, condMult, addOn: Math.round(addOn * 10) / 10 },
  };
}

// ─── Reusable field components ────────────────────────────────────────────────
function Label({ children, required }) {
  return (
    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>
      {children}{required && <span style={{ color: "#e24b4a", marginLeft: 3 }}>*</span>}
    </label>
  );
}

function Input({ label, required, style, ...props }) {
  return (
    <div style={style}>
      {label && <Label required={required}>{label}</Label>}
      <input style={{ width: "100%", boxSizing: "border-box" }} {...props} />
    </div>
  );
}

function Select({ label, required, children, style, ...props }) {
  return (
    <div style={style}>
      {label && <Label required={required}>{label}</Label>}
      <select style={{ width: "100%", boxSizing: "border-box" }} {...props}>{children}</select>
    </div>
  );
}

function ToggleChip({ label, selected, onClick, color = "info" }) {
  const colors = {
    info:    { bg: "var(--color-background-info)",    text: "var(--color-text-info)",    border: "var(--color-border-info)"    },
    danger:  { bg: "var(--color-background-danger)",  text: "var(--color-text-danger)",  border: "var(--color-border-danger)"  },
    success: { bg: "var(--color-background-success)", text: "var(--color-text-success)", border: "var(--color-border-success)" },
  };
  const c = colors[color];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px",
        fontSize: 13,
        background:   selected ? c.bg   : "transparent",
        color:        selected ? c.text : "var(--color-text-secondary)",
        border:       `0.5px solid ${selected ? c.border : "var(--color-border-tertiary)"}`,
        borderRadius: "var(--border-radius-md)",
        cursor:       "pointer",
        fontWeight:   selected ? 500 : 400,
        transition:   "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function ScopeToggle({ label, icon, checked, onChange, addTime }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px",
      background: checked ? "var(--color-background-success)" : "var(--color-background-secondary)",
      border: `0.5px solid ${checked ? "var(--color-border-success)" : "var(--color-border-tertiary)"}`,
      borderRadius: "var(--border-radius-md)",
      cursor: "pointer",
      transition: "all 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 18, color: checked ? "var(--color-text-success)" : "var(--color-text-tertiary)" }} />
        <span style={{ fontSize: 14, color: checked ? "var(--color-text-success)" : "var(--color-text-primary)", fontWeight: checked ? 500 : 400 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {addTime && checked && (
          <span style={{ fontSize: 11, color: "var(--color-text-success)", background: "var(--color-background-primary)", padding: "2px 8px", borderRadius: 20 }}>+{addTime}h</span>
        )}
        <input type="checkbox" checked={checked} onChange={onChange} style={{ width: 16, height: 16 }} />
      </div>
    </label>
  );
}

// ─── Step progress bar ────────────────────────────────────────────────────────
function StepBar({ step, total, labels }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        {labels.map((l, i) => (
          <div key={i} style={{ textAlign: "center", flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i + 1 <= step ? "var(--color-background-info)" : "var(--color-background-secondary)",
              border: `0.5px solid ${i + 1 <= step ? "var(--color-border-info)" : "var(--color-border-tertiary)"}`,
              color: i + 1 <= step ? "var(--color-text-info)" : "var(--color-text-tertiary)",
              fontSize: 12, fontWeight: 500,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 4px",
              transition: "all 0.2s",
            }}>
              {i + 1 < step ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: 11, color: i + 1 === step ? "var(--color-text-primary)" : "var(--color-text-tertiary)", fontWeight: i + 1 === step ? 500 : 400 }}>
              {l}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 3, background: "var(--color-background-secondary)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${((step - 1) / (total - 1)) * 100}%`, background: "var(--color-background-info)", transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem", marginBottom: "1.25rem" }}>
      {title && <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>}
      {children}
    </div>
  );
}

const GRID2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };
const GRID3 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 };
const GRID4 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 };

// ─── Step 1: Contact ──────────────────────────────────────────────────────────
function StepContact({ fd, set }) {
  const toggle = (field, val) => set(field, fd[field] === val ? "" : val);

  return (
    <>
      <Section title="Your contact details">
        <div style={{ ...GRID2, marginBottom: 12 }}>
          <Input label="Full name" required placeholder="Jane Smith" value={fd.fullName} onChange={e => set("fullName", e.target.value)} />
          <Input label="Phone number" required type="tel" placeholder="(555) 123-4567" value={fd.phone} onChange={e => set("phone", e.target.value)} />
        </div>
        <Input label="Email address" required type="email" placeholder="jane@example.com" value={fd.email} onChange={e => set("email", e.target.value)} />
      </Section>

      <Section title="Preferred contact method">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {["Call", "Text", "Email", "Text only"].map(m => (
            <ToggleChip key={m} label={m} selected={fd.preferredContactMethod === m} onClick={() => toggle("preferredContactMethod", m)} />
          ))}
        </div>
        <Label>Best time to reach you</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Morning (8–11am)", "Afternoon (12–4pm)", "Evening (5–7pm)", "Anytime"].map(t => (
            <ToggleChip key={t} label={t} selected={fd.bestTimeToCall === t} onClick={() => toggle("bestTimeToCall", t)} />
          ))}
        </div>
      </Section>
    </>
  );
}

// ─── Step 2: Property ─────────────────────────────────────────────────────────
function StepProperty({ fd, set }) {
  return (
    <>
      <Section title="Property address">
        <Input label="Street address" required placeholder="123 Main St" value={fd.address} onChange={e => set("address", e.target.value)} style={{ marginBottom: 12 }} />
        <div style={{ ...GRID3 }}>
          <Input label="City" required placeholder="Kansas City" value={fd.city} onChange={e => set("city", e.target.value)} />
          <Input label="State" required placeholder="MO" value={fd.state} onChange={e => set("state", e.target.value)} />
          <Input label="Zip code" required placeholder="64101" value={fd.zipCode} onChange={e => set("zipCode", e.target.value)} />
        </div>
      </Section>

      <Section title="Property type">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["House", "Apartment", "Condo", "Airbnb", "Office", "Commercial"].map(t => (
            <ToggleChip key={t} label={t} selected={fd.propertyType === t} onClick={() => set("propertyType", t)} />
          ))}
        </div>
      </Section>

      <Section title="Size and layout">
        <div style={{ ...GRID4, marginBottom: 12 }}>
          <Input label="Bedrooms" required type="number" min={0} value={fd.bedrooms} onChange={e => set("bedrooms", e.target.value)} />
          <Input label="Full baths" required type="number" min={0} value={fd.bathrooms} onChange={e => set("bathrooms", e.target.value)} />
          <Input label="Half baths" type="number" min={0} value={fd.halfBaths} onChange={e => set("halfBaths", e.target.value)} />
          <Input label="Square footage" required type="number" min={0} step={100} value={fd.squareFootage} onChange={e => set("squareFootage", e.target.value)} />
        </div>

        <div style={{ ...GRID3, marginBottom: 12 }}>
          <Select label="Levels / floors" value={fd.levels} onChange={e => set("levels", Number(e.target.value))}>
            <option value={1}>1 floor</option>
            <option value={2}>2 floors</option>
            <option value={3}>3+ floors</option>
          </Select>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={fd.garage} onChange={e => set("garage", e.target.checked)} />
            Garage (to be cleaned)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={fd.basement} onChange={e => set("basement", e.target.checked)} />
            Basement (to be cleaned)
          </label>
        </div>
      </Section>
    </>
  );
}

// ─── Step 3: Cleaning needs ───────────────────────────────────────────────────
function StepCleaning({ fd, set }) {
  const toggleArr = (field, val) =>
    set(field, (fd[field] || []).includes(val)
      ? (fd[field] || []).filter(v => v !== val)
      : [...(fd[field] || []), val]);

  const setScope = (key, val) => set("serviceScope", { ...(fd.serviceScope || {}), [key]: val });

  const scopeItems = [
    { key: "insideFridge",   icon: "ti-building",     label: "Inside refrigerator", time: "0.5" },
    { key: "insideOven",     icon: "ti-flame",         label: "Inside oven",         time: "0.5" },
    { key: "insideCabinets", icon: "ti-layout-list",   label: "Inside cabinets",     time: "0.75" },
    { key: "baseboards",     icon: "ti-border-bottom", label: "Baseboards",          time: "0.5" },
    { key: "windows",        icon: "ti-border-outer",  label: "Interior windows",    time: "0.75" },
    { key: "laundry",        icon: "ti-washing-machine",label:"Laundry",             time: "0.5" },
    { key: "dishes",         icon: "ti-tools-kitchen-2",label:"Dishes",              time: "0.25" },
    { key: "organization",   icon: "ti-layout-cards",  label: "Organization/tidy",   time: "1.0" },
  ];

  const priorityOpts = ["Kitchen", "Bathrooms", "Pet areas", "Appliances", "Windows", "Bedrooms", "Living room"];

  return (
    <>
      <Section title="Service type and frequency">
        <div style={{ ...GRID2, marginBottom: 12 }}>
          <Select label="Type of cleaning" required value={fd.cleaningType} onChange={e => set("cleaningType", e.target.value)}>
            <option value="standard">Standard clean</option>
            <option value="deep">Deep clean</option>
            <option value="moveout">Move-in / move-out</option>
            <option value="construction">Post-construction</option>
          </Select>
          <Select label="How often?" required value={fd.frequency} onChange={e => set("frequency", e.target.value)}>
            <option value="one-time">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="bi-weekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>

        <div style={{ ...GRID2 }}>
          <Input label="Last professional cleaning" type="date" value={fd.lastCleaningDate} onChange={e => set("lastCleaningDate", e.target.value)} />
          <Select label="Occupancy status" value={fd.occupancyStatus} onChange={e => set("occupancyStatus", e.target.value)}>
            <option value="">Select…</option>
            <option value="occupied">Occupied</option>
            <option value="vacant">Vacant</option>
            <option value="tenant">Tenant occupied</option>
            <option value="renovated">Recently renovated</option>
          </Select>
        </div>
      </Section>

      <Section title="Priority areas">
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>Select which areas need special attention</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {priorityOpts.map(a => (
            <ToggleChip key={a} label={a} selected={(fd.priorityAreas || []).includes(a)} onClick={() => toggleArr("priorityAreas", a)} color="success" />
          ))}
        </div>
      </Section>

      <Section title="Service scope">
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>These become add-ons and increase the estimate</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {scopeItems.map(({ key, icon, label, time }) => (
            <ScopeToggle
              key={key}
              icon={icon}
              label={label}
              addTime={time}
              checked={!!(fd.serviceScope || {})[key]}
              onChange={e => setScope(key, e.target.checked)}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

// ─── Step 4: Environmental + Photos ───────────────────────────────────────────
function StepEnvironment({ fd, set, aiAnalysis, setAiAnalysis, analyzing, setAnalyzing }) {
  const toggleArr = (field, val) =>
    set(field, (fd[field] || []).includes(val)
      ? (fd[field] || []).filter(v => v !== val)
      : [...(fd[field] || []), val]);

  const hazardOpts = [
    { value: "mold",      label: "Mold",       color: "danger" },
    { value: "biohazard", label: "Biohazard",   color: "danger" },
    { value: "rodents",   label: "Rodents",     color: "danger" },
    { value: "fleas",     label: "Fleas",       color: "danger" },
    { value: "hoarding",  label: "Hoarding",    color: "danger" },
  ];

  const petTypes = ["Dog", "Cat", "Bird", "Rabbit", "Other"];

  const handlePhotos = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setAnalyzing(false);
    setAiAnalysis({
      error: "AI photo analysis is unavailable in this release. Please select the condition manually.",
      confidence: 0,
    });
  };

  const conditionOpts = [
    { value: "light",    label: "Light",    desc: "Well maintained, regular upkeep" },
    { value: "moderate", label: "Moderate", desc: "Normal buildup, typical household" },
    { value: "heavy",    label: "Heavy",    desc: "Neglected or intensive work needed" },
  ];

  return (
    <>
      <Section title="Pets and household">
        <div style={{ ...GRID2, marginBottom: 12 }}>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
              <input type="checkbox" checked={fd.pets} onChange={e => set("pets", e.target.checked)} />
              <span>Pets in the home</span>
            </label>
            {fd.pets && (
              <>
                <Input type="number" min={1} placeholder="Number of pets" value={fd.petCount} onChange={e => set("petCount", Number(e.target.value))} style={{ marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {petTypes.map(t => (
                    <ToggleChip key={t} label={t} selected={(fd.petTypes || []).includes(t)} onClick={() => toggleArr("petTypes", t)} />
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={fd.children} onChange={e => set("children", e.target.checked)} />
              <span>Children at home</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={fd.smokingInside} onChange={e => set("smokingInside", e.target.checked)} />
              <span>Smoking inside</span>
            </label>
          </div>
        </div>

        <div>
          <Label>Allergies or sensitivities (cleaning product restrictions)</Label>
          <input type="text" placeholder="e.g. bleach, fragrances, latex…" value={fd.allergies} onChange={e => set("allergies", e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
      </Section>

      <Section title="Hazards">
        <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: "0 0 10px" }}>Flag any conditions that may affect crew safety or pricing</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hazardOpts.map(h => (
            <ToggleChip key={h.value} label={h.label} color="danger" selected={(fd.hazards || []).includes(h.value)} onClick={() => toggleArr("hazards", h.value)} />
          ))}
        </div>
      </Section>

      <Section title="Property condition">
        {aiAnalysis && !aiAnalysis.error ? (
          <div style={{ background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)", borderRadius: "var(--border-radius-md)", padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-success)" }}>AI assessment complete</span>
              <span style={{ fontSize: 12, background: "var(--color-background-primary)", color: "var(--color-text-success)", padding: "3px 10px", borderRadius: 20 }}>
                {aiAnalysis.confidence}% confident
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-success)" }}>
              <strong>Condition:</strong> {aiAnalysis.condition} · {aiAnalysis.observations?.overall}
            </div>
            {aiAnalysis.requiresReview && (
              <div style={{ marginTop: 8, fontSize: 13, background: "var(--color-background-warning)", color: "var(--color-text-warning)", padding: "6px 10px", borderRadius: "var(--border-radius-md)" }}>
                Low confidence — this quote will be flagged for human review before sending
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexDirection: "column", marginBottom: 12 }}>
            {conditionOpts.map(o => (
              <label key={o.value} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                border: `0.5px solid ${fd.condition === o.value ? "var(--color-border-info)" : "var(--color-border-tertiary)"}`,
                background: fd.condition === o.value ? "var(--color-background-info)" : "var(--color-background-primary)",
                borderRadius: "var(--border-radius-md)", cursor: "pointer"
              }}>
                <input type="radio" name="condition" value={o.value} checked={fd.condition === o.value} onChange={() => set("condition", o.value)} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{o.label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{o.desc}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title="Photo analysis unavailable">
        <div style={{ marginBottom: 10, fontSize: 13, color: "var(--color-text-secondary)" }}>
          AI photo analysis is unavailable in this release. Select the property condition manually.
        </div>
        <input type="file" accept="image/*" multiple onChange={handlePhotos} disabled={analyzing} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)" }} />
        {analyzing && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--color-text-secondary)" }}>
            <div style={{ width: 16, height: 16, border: "2px solid var(--color-border-info)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            AI analyzing your photos…
          </div>
        )}
        {aiAnalysis?.error && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--color-text-warning)", padding: "8px 12px", background: "var(--color-background-warning)", borderRadius: "var(--border-radius-md)" }}>
            {aiAnalysis.error}
          </div>
        )}
      </Section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ─── Step 5: Schedule + review ────────────────────────────────────────────────
function StepReview({ fd, set, estimate }) {
  const referralSources = ["Google", "Facebook", "Referral / friend", "Flyer / mail", "TikTok", "Instagram", "Yelp", "Nextdoor"];
  const budgetRanges    = ["Under $100", "$100–$200", "$200–$400", "$400–$700", "$700+", "Not sure"];

  const svcLabel = { standard: "Standard clean", deep: "Deep clean", moveout: "Move-in / move-out", construction: "Post-construction" };
  const freqLabel= { "one-time": "One-time", weekly: "Weekly", "bi-weekly": "Bi-weekly", monthly: "Monthly" };

  return (
    <>
      {/* Live estimate card */}
      <div style={{
        background: estimate.requiresReview ? "var(--color-background-warning)" : "var(--color-background-info)",
        border: `0.5px solid ${estimate.requiresReview ? "var(--color-border-warning)" : "var(--color-border-info)"}`,
        borderRadius: "var(--border-radius-lg)", padding: "1.25rem", marginBottom: "1.25rem", textAlign: "center"
      }}>
        {estimate.requiresReview ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-warning)", marginBottom: 8 }}>Requires human review</div>
            <div style={{ fontSize: 13, color: "var(--color-text-warning)" }}>
              Due to {estimate.aiConfidence < 60 ? "low AI confidence" : "detected hazards"}, an agent will review and send your quote within 2 hours.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-info)", marginBottom: 6, fontWeight: 500 }}>
              {estimate.aiEnhanced ? "AI-enhanced estimate" : "Your estimate"}
            </div>
            <div style={{ fontSize: 36, fontWeight: 500, color: "var(--color-text-info)" }}>
              ${estimate.priceLow.toLocaleString()} – ${estimate.priceHigh.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-info)", marginTop: 6 }}>
              {estimate.laborHours}h labor · ~{estimate.appointmentDuration}h appointment
            </div>
          </>
        )}
      </div>

      {/* Scope add-ons summary */}
      {Object.values(fd.serviceScope || {}).some(Boolean) && (
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Add-ons included</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(fd.serviceScope || {}).filter(([, v]) => v).map(([k]) => (
              <span key={k} style={{ fontSize: 12, padding: "3px 10px", background: "var(--color-background-success)", color: "var(--color-text-success)", borderRadius: 20 }}>
                {k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Scheduling */}
      <Section title="Preferred schedule">
        <div style={{ ...GRID2, marginBottom: 12 }}>
          <Input label="Preferred date" type="date" value={fd.preferredDate} onChange={e => set("preferredDate", e.target.value)} />
          <Select label="Preferred time" value={fd.preferredTime} onChange={e => set("preferredTime", e.target.value)}>
            <option value="">No preference</option>
            <option value="8am">8:00 AM</option>
            <option value="9am">9:00 AM</option>
            <option value="10am">10:00 AM</option>
            <option value="11am">11:00 AM</option>
            <option value="12pm">12:00 PM</option>
            <option value="1pm">1:00 PM</option>
            <option value="2pm">2:00 PM</option>
            <option value="3pm">3:00 PM</option>
          </Select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={fd.flexibleSchedule} onChange={e => set("flexibleSchedule", e.target.checked)} />
          I'm flexible on the date/time
        </label>
      </Section>

      {/* Budget + referral */}
      <Section title="Budget and referral">
        <div style={{ marginBottom: 12 }}>
          <Label>Approximate budget</Label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {budgetRanges.map(b => (
              <ToggleChip key={b} label={b} selected={fd.budgetRange === b} onClick={() => set("budgetRange", fd.budgetRange === b ? "" : b)} />
            ))}
          </div>
        </div>
        <div>
          <Label>How did you hear about us?</Label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {referralSources.map(s => (
              <ToggleChip key={s} label={s} selected={fd.referralSource === s} onClick={() => set("referralSource", fd.referralSource === s ? "" : s)} />
            ))}
          </div>
        </div>
      </Section>

      {/* Summary */}
      <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1.25rem", fontSize: 13 }}>
        <div style={{ fontWeight: 500, marginBottom: 10, fontSize: 14 }}>Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", color: "var(--color-text-secondary)" }}>
          <div><span style={{ color: "var(--color-text-primary)" }}>{fd.fullName}</span></div>
          <div><span style={{ color: "var(--color-text-primary)" }}>{fd.phone}</span></div>
          <div>{fd.address}, {fd.city}</div>
          <div>{fd.bedrooms}bd / {fd.bathrooms}ba · {Number(fd.squareFootage).toLocaleString()} sqft</div>
          <div style={{ textTransform: "capitalize" }}>{svcLabel[fd.cleaningType] || fd.cleaningType}</div>
          <div style={{ textTransform: "capitalize" }}>{freqLabel[fd.frequency] || fd.frequency}</div>
        </div>
      </div>
    </>
  );
}

// ─── MAIN FORM ────────────────────────────────────────────────────────────────
const STEPS = ["Contact", "Property", "Cleaning needs", "Environment", "Review"];

const DEFAULTS = {
  // step 1
  fullName: "", phone: "", email: "", preferredContactMethod: "", bestTimeToCall: "",
  // step 2
  address: "", city: "", state: "", zipCode: "", squareFootage: "", bedrooms: 3,
  bathrooms: 2, halfBaths: 0, propertyType: "House", levels: 1, garage: false, basement: false,
  // step 3
  cleaningType: "standard", frequency: "bi-weekly", lastCleaningDate: "", occupancyStatus: "",
  priorityAreas: [], serviceScope: {},
  // step 4
  pets: false, petCount: 0, petTypes: [], children: false, smokingInside: false,
  allergies: "", hazards: [], condition: "moderate",
  // step 5
  preferredDate: "", preferredTime: "", flexibleSchedule: false, budgetRange: "", referralSource: "",
};

export default function IntakeForm({ onLeadSaved }) {
  const [step, setStep]           = useState(1);
  const [fd, setFd]               = useState(DEFAULTS);
  const [aiAnalysis, setAi]       = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const topRef = useRef();

  const set = (field, value) => setFd(prev => ({ ...prev, [field]: value }));

  const estimate = calculateEstimate(fd, aiAnalysis);

  const canAdvance = () => {
    if (step === 1) return fd.fullName && fd.phone && fd.email;
    if (step === 2) return fd.address && fd.city && fd.squareFootage && fd.bedrooms && fd.bathrooms;
    return true;
  };

  const next = () => {
    if (!canAdvance()) return;
    setStep(s => Math.min(s + 1, STEPS.length));
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const back = () => {
    setStep(s => Math.max(s - 1, 1));
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600));
    if (onLeadSaved) onLeadSaved(fd, estimate, aiAnalysis);
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 500, marginBottom: 8 }}>Quote submitted!</h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: 24 }}>
          {estimate.requiresReview
            ? "We'll review your quote and get back to you within 2 hours."
            : `You'll receive your estimate of $${estimate.priceLow}–$${estimate.priceHigh} via ${fd.preferredContactMethod || "email"} shortly.`}
        </p>
        <button onClick={() => { setFd(DEFAULTS); setStep(1); setSubmitted(false); setAi(null); }}
          style={{ padding: "12px 28px", background: "var(--color-background-info)", color: "var(--color-text-info)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          Submit another quote
        </button>
      </div>
    );
  }

  return (
    <div ref={topRef} style={{ padding: "2rem 0" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 6px" }}>Get your instant quote</h2>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>Step {step} of {STEPS.length}</p>
      </div>

      <StepBar step={step} total={STEPS.length} labels={STEPS} />

      {step === 1 && <StepContact fd={fd} set={set} />}
      {step === 2 && <StepProperty fd={fd} set={set} />}
      {step === 3 && <StepCleaning fd={fd} set={set} />}
      {step === 4 && <StepEnvironment fd={fd} set={set} aiAnalysis={aiAnalysis} setAiAnalysis={setAi} analyzing={analyzing} setAnalyzing={setAnalyzing} />}
      {step === 5 && <StepReview fd={fd} set={set} estimate={estimate} />}

      {/* Navigation */}
      <div style={{ display: "flex", gap: 12, marginTop: "1.5rem" }}>
        {step > 1 && (
          <button onClick={back} style={{ flex: 1, padding: "13px", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 14, cursor: "pointer", color: "var(--color-text-primary)" }}>
            ← Back
          </button>
        )}
        {step < STEPS.length ? (
          <button onClick={next} disabled={!canAdvance()} style={{ flex: 2, padding: "13px", background: canAdvance() ? "var(--color-background-info)" : "var(--color-background-secondary)", color: canAdvance() ? "var(--color-text-info)" : "var(--color-text-tertiary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: canAdvance() ? "pointer" : "not-allowed" }}>
            Continue →
          </button>
        ) : (
          <button onClick={submit} disabled={submitting} style={{ flex: 2, padding: "13px", background: "var(--color-background-success)", color: "var(--color-text-success)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Submitting…" : estimate.requiresReview ? "Submit for review" : "Submit and get quote"}
          </button>
        )}
      </div>
    </div>
  );
}
