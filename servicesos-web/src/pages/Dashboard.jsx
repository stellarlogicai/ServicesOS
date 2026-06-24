import { useState, useEffect, useCallback } from "react";
import { checkInsuranceExpiration } from "../services/insuranceService";
import { useAuth } from "../contexts/AuthContext";
import { getRemainingCredits } from "../services/aiUsageEngineService";
import { getLeads, bookLead, setLeadStatus, deleteLead } from "../services/crmService";
import {
  getQuoteLeadDisplayData,
  getQuoteLeadPriceDisplay,
  getRoomSummary,
  isPendingOwnerReview
} from "../services/quoteLeadDisplay";

// Helper function to safely access form data from both old and new structures
function getFormData(lead) {
  return {
    ...lead,
    ...(lead.formData || {}),
    ...getQuoteLeadDisplayData(lead)
  };
}

// ─── Tiny status badge ────────────────────────────────────────────────────────
const STATUS_STYLES = {
  new:    { bg: "#eff6ff", color: "#1d4ed8", label: "New" },
  quoted: { bg: "#fefce8", color: "#a16207", label: "Quoted" },
  booked: { bg: "#f0fdf4", color: "#15803d", label: "Booked" },
  lost:   { bg: "#fef2f2", color: "#b91c1c", label: "Lost" },
};

function Badge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.new;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: accent ? "#eff6ff" : "#f9fafb", border: `1px solid ${accent ? "#bfdbfe" : "#e5e7eb"}`, borderRadius: 12, padding: "20px 24px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 13, color: accent ? "#1d4ed8" : "#6b7280", marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ? "#1d4ed8" : "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Book modal ───────────────────────────────────────────────────────────────
function BookModal({ lead, onClose, onSave }) {
  const [date, setDate]   = useState("");
  const [time, setTime]   = useState("09:00");
  const [price, setPrice] = useState(String(lead.estimate.priceLow));
  const [notes, setNotes] = useState("");

  const handleSave = () => {
    if (!date) return;
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    onSave({ scheduledAt, agreedPrice: Number(price), notes });
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const box     = { background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" };
  const field   = { width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginTop: 6 };
  const label   = { fontSize: 13, fontWeight: 500, color: "#374151" };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600 }}>Convert to booked job</h2>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#6b7280" }}>{getFormData(lead).fullName} · {getFormData(lead).address}</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={label}>Date *</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} />
          </div>
          <div>
            <div style={label}>Time</div>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={field} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={label}>Agreed price ($)</div>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={field} />
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
            Estimate range: ${lead.estimate.priceLow}–${lead.estimate.priceHigh}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={label}>Notes for technician</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Gate code, parking instructions, special requests…" style={{ ...field, resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!date} style={{ flex: 2, padding: "12px", background: date ? "#059669" : "#e5e7eb", color: date ? "#fff" : "#9ca3af", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: date ? "pointer" : "not-allowed" }}>
            Confirm booking
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lead detail drawer ───────────────────────────────────────────────────────
function LeadDrawer({ lead, onClose, onBook, onStatusChange }) {
  const fd = getFormData(lead);
  const es = lead.estimate;
  const priceDisplay = getQuoteLeadPriceDisplay(lead);
  const pendingOwnerReview = isPendingOwnerReview(lead);

  const serviceLabels = { standard: "Standard Clean", deep: "Deep Clean", moveout: "Move-In/Out", construction: "Post-Construction" };
  const freqLabels    = { "one-time": "One-time", weekly: "Weekly", "bi-weekly": "Bi-weekly", monthly: "Monthly" };

  const drawer = { position: "fixed", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: 480, background: "#fff", boxShadow: "-4px 0 40px rgba(0,0,0,0.12)", zIndex: 900, overflowY: "auto" };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 899 }} onClick={onClose} />
      <div style={drawer}>
        {/* Header */}
        <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#1d4ed8" }}>
              {fd.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fd.fullName}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{fd.address}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Status + actions row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
            <Badge status={lead.status} />
            {lead.status !== "booked" && (
              <button onClick={onBook} style={{ padding: "6px 14px", background: "#059669", color: "#fff", border: "none", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                + Convert to booked job
              </button>
            )}
            {["new", "quoted", "booked", "lost"].map(s => s !== lead.status && (
              <button key={s} onClick={() => onStatusChange(s)} style={{ padding: "6px 14px", background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 20, fontSize: 12, cursor: "pointer" }}>
                Mark {s}
              </button>
            ))}
          </div>

          {/* Price */}
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "20px 24px", marginBottom: 24, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#1d4ed8", marginBottom: 6, fontWeight: 500 }}>
              {priceDisplay.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#1d4ed8" }}>
              {priceDisplay.text}
            </div>
            {!pendingOwnerReview && (
              <div style={{ fontSize: 13, color: "#3b82f6", marginTop: 4 }}>
                {es.laborHours} labor hrs · ~{es.appointmentDuration} hr appointment
              </div>
            )}
          </div>

          {/* Booking info if booked */}
          {lead.booking && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d", marginBottom: 10 }}>📅 Booking details</div>
              <div style={{ fontSize: 14, color: "#166534", marginBottom: 4 }}>
                {new Date(lead.booking.scheduledAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                {" at "}
                {new Date(lead.booking.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
              {lead.booking.notes && <div style={{ fontSize: 13, color: "#166534" }}>📝 {lead.booking.notes}</div>}
            </div>
          )}
          {!lead.booking && lead.appointmentRequest && (
            <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#a16207", marginBottom: 6 }}>
                Appointment preference
              </div>
              <div style={{ fontSize: 14, color: "#854d0e" }}>
                Requested for owner review, not a confirmed booking.
              </div>
            </div>
          )}

          {/* Contact */}
          <Section title="Contact">
            <Row label="Phone" value={<a href={`tel:${fd.phone}`} style={{ color: "#1d4ed8" }}>{fd.phone}</a>} />
            <Row label="Email" value={<a href={`mailto:${fd.email}`} style={{ color: "#1d4ed8" }}>{fd.email}</a>} />
            <Row label="Submitted" value={new Date(lead.createdAt).toLocaleDateString()} />
          </Section>

          {/* Property */}
          <Section title="Property">
            <Row label="Bedrooms"    value={fd.bedrooms} />
            <Row label="Bathrooms"   value={`${fd.bathrooms}${fd.halfBaths ? ` + ${fd.halfBaths} half` : ""}`} />
            <Row label="Sq footage"  value={`${Number(fd.squareFootage).toLocaleString()} sq ft`} />
            <Row label="Condition"   value={<span style={{ textTransform: "capitalize" }}>{fd.condition}</span>} />
            <Row label="Pets"        value={fd.pets ? `Yes (${fd.petCount})` : "No"} />
            <Row label="Children"    value={fd.children ? "Yes" : "No"} />
          </Section>

          {/* Service */}
          <Section title="Service">
            <Row label="Type"      value={serviceLabels[fd.cleaningType]} />
            <Row label="Frequency" value={freqLabels[fd.frequency]} />
            {fd.preferredDays?.length > 0 && <Row label="Preferred days" value={fd.preferredDays.join(", ")} />}
            {es.aiEnhanced && <Row label="AI analysis" value={<span style={{ color: "#7c3aed" }}>✨ AI-enhanced</span>} />}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
      <div style={{ background: "#f9fafb", borderRadius: 10, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f3f4f6", fontSize: 14 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "#111827" }}>{value}</span>
    </div>
  );
}

// ─── Revenue chart (30-day bar chart) ────────────────────────────────────────
function RevenueChart({ leads }) {
  const booked = leads.filter(l => l.status === "booked" && l.booking?.agreedPrice);

  // Build last-14-days buckets
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toDateString();
  });

  const buckets = days.map(dayStr => {
    const total = booked
      .filter(l => new Date(l.booking.scheduledAt).toDateString() === dayStr)
      .reduce((sum, l) => sum + l.booking.agreedPrice, 0);
    return { label: new Date(dayStr).toLocaleDateString("en-US", { month: "short", day: "numeric" }), total };
  });

  const max = Math.max(...buckets.map(b => b.total), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, marginBottom: 8 }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              title={`$${b.total}`}
              style={{
                width: "100%",
                height: `${Math.max(4, (b.total / max) * 100)}%`,
                background: b.total > 0 ? "#1d4ed8" : "#e5e7eb",
                borderRadius: "4px 4px 0 0",
                transition: "height 0.3s ease"
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ flex: 1, fontSize: 9, color: "#9ca3af", textAlign: "center", transform: "rotate(-40deg)", transformOrigin: "top center", whiteSpace: "nowrap" }}>
            {i % 2 === 0 ? b.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard component ─────────────────────────────────────────────────
export default function Dashboard() {
  const { currentTenant } = useAuth();
  const [leads, setLeads]             = useState([]);
  const [selectedLead, setSelected]   = useState(null);
  const [bookingLead, setBookingLead] = useState(null);
  const [filter, setFilter]           = useState("all");
  const [search, setSearch]           = useState("");
  const [insuranceStatus, setInsuranceStatus] = useState(null);
  const [credits, setCredits]         = useState(null);

  // Load leads from Firebase
  useEffect(() => {
    if (currentTenant?.id) {
      getLeads(currentTenant.id)
        .then(setLeads)
        .catch(err => console.error('Error loading leads:', err));
    }
  }, [currentTenant?.id]);

  // Load insurance status
  useEffect(() => {
    if (currentTenant?.id) {
      checkInsuranceExpiration(currentTenant.id)
        .then(setInsuranceStatus)
        .catch(err => console.error('Error checking insurance:', err));
      
      // Load AI credits
      getRemainingCredits(currentTenant.id)
        .then(setCredits)
        .catch(err => console.error('Error loading credits:', err));
    }
  }, [currentTenant?.id]);

  // Stats
  const totalLeads    = leads.length;
  const newLeads      = leads.filter(l => l.status === "new").length;
  const bookedLeads   = leads.filter(l => l.status === "booked");
  const revenue       = bookedLeads.reduce((s, l) => s + (l.booking?.agreedPrice || 0), 0);
  const pipeline      = leads
    .filter(l => l.status !== "lost")
    .reduce((s, l) => s + (((l.estimate?.priceLow || 0) + (l.estimate?.priceHigh || 0)) / 2), 0);
  const conversionRate = totalLeads > 0 ? Math.round((bookedLeads.length / totalLeads) * 100) : 0;

  // Filter
  const filtered = leads
    .filter(l => filter === "all" || l.status === filter)
    .filter(l => {
      if (!search) return true;
      const q = search.toLowerCase();
      const display = getFormData(l);
      return display.fullName.toLowerCase().includes(q) ||
        display.address.toLowerCase().includes(q) ||
        display.phone.includes(q);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const handleBook = useCallback(async (lead, bookingData) => {
    try {
      await bookLead(currentTenant?.id, lead.id, bookingData);
      // Refresh leads after booking
      const updatedLeads = await getLeads(currentTenant?.id);
      setLeads(updatedLeads);
      setBookingLead(null);
      setSelected(l => l?.id === lead.id ? { ...l, status: "booked", booking: bookingData } : l);
      alert(`${getFormData(lead).fullName} booked.`);
    } catch (error) {
      console.error('Error booking lead:', error);
      alert('Failed to book lead. Please try again.');
    }
  }, [currentTenant]);

  const handleStatusChange = useCallback(async (lead, status) => {
    try {
      await setLeadStatus(currentTenant?.id, lead.id, status);
      // Refresh leads after status change
      const updatedLeads = await getLeads(currentTenant?.id);
      setLeads(updatedLeads);
      setSelected(l => l?.id === lead.id ? { ...l, status } : l);
    } catch (error) {
      console.error('Error updating lead status:', error);
      alert('Failed to update lead status. Please try again.');
    }
  }, [currentTenant]);

  const handleDeleteLead = useCallback(async (lead) => {
    if (!confirm(`Are you sure you want to delete this lead? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteLead(currentTenant?.id, lead.id);
      // Refresh leads after deletion
      const updatedLeads = await getLeads(currentTenant?.id);
      setLeads(updatedLeads);
      setSelected(null);
    } catch (error) {
      console.error('Error deleting lead:', error);
      alert('Failed to delete lead. Please try again.');
    }
  }, [currentTenant]);

  const filterBtns = [
    { key: "all",    label: `All (${leads.length})` },
    { key: "new",    label: `New (${newLeads})` },
    { key: "quoted", label: `Quoted (${leads.filter(l => l.status === "quoted").length})` },
    { key: "booked", label: `Booked (${bookedLeads.length})` },
    { key: "lost",   label: `Lost (${leads.filter(l => l.status === "lost").length})` },
  ];

  const serviceLabel = { standard: "Standard", deep: "Deep Clean", moveout: "Move-Out", construction: "Post-Constr." };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      
      {/* Top nav */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "#1d4ed8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧹</div>
          <div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>CleanOps</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: "#9ca3af" }}>Admin Dashboard</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, background: "#10b981", borderRadius: "50%" }} />
          <span style={{ fontSize: 13, color: "#6b7280" }}>Live</span>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>

        {/* Insurance warning banner */}
        {insuranceStatus && (insuranceStatus.isExpiring || insuranceStatus.isExpired) && (
          <div style={{
            padding: '16px 20px',
            borderRadius: 12,
            marginBottom: 32,
            background: insuranceStatus.isExpired ? '#fef2f2' : '#fef3c7',
            border: insuranceStatus.isExpired ? '1px solid #ef4444' : '1px solid #f59e0b',
            color: insuranceStatus.isExpired ? '#991b1b' : '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}>
            <span style={{ fontSize: 28 }}>
              {insuranceStatus.isExpired ? '⚠️' : '📅'}
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>
                {insuranceStatus.isExpired 
                  ? 'Insurance Expired!' 
                  : `Insurance Expiring in ${insuranceStatus.daysUntilExpiration} Days`
                }
              </strong>
              <span style={{ fontSize: 13 }}>
                {insuranceStatus.isExpired 
                  ? 'Please renew your insurance immediately to maintain coverage.' 
                  : 'Please renew your insurance before it expires to maintain coverage.'
                }
              </span>
            </div>
            <button
              onClick={() => window.location.hash = '#insurance'}
              style={{
                padding: '8px 16px',
                background: insuranceStatus.isExpired ? '#ef4444' : '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Update Insurance
            </button>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
          <StatCard label="Total leads"   value={totalLeads}             sub="All time" />
          <StatCard label="New leads"     value={newLeads}               sub="Need follow-up" />
          <StatCard label="Booked jobs"   value={bookedLeads.length}     sub={`${conversionRate}% conversion`} />
          <StatCard label="Confirmed revenue" value={`$${revenue.toLocaleString()}`} sub="From booked jobs" accent />
          <StatCard label="Pipeline value"    value={`$${Math.round(pipeline).toLocaleString()}`} sub="Avg of all ranges" />
          {credits && (
            <StatCard 
              label="AI Credits" 
              value={credits.creditsRemaining} 
              sub={`${credits.totalCreditsUsed} used this month`}
              accent={credits.creditsRemaining < 10}
            />
          )}
        </div>

        {/* Revenue chart */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>Revenue (14 days)</div>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>Scheduled booked jobs by appointment date</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1d4ed8" }}>${revenue.toLocaleString()}</div>
          </div>
          <RevenueChart leads={leads} />
        </div>

        {/* Leads table */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
          
          {/* Table header */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>All leads</div>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, address, phone…"
                style={{ padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, width: 260 }}
              />
            </div>
            
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {filterBtns.map(b => (
                <button key={b.key} onClick={() => setFilter(b.key)} style={{ padding: "6px 14px", background: filter === b.key ? "#eff6ff" : "transparent", color: filter === b.key ? "#1d4ed8" : "#6b7280", border: filter === b.key ? "1px solid #bfdbfe" : "1px solid transparent", borderRadius: 20, fontSize: 13, fontWeight: filter === b.key ? 600 : 400, cursor: "pointer" }}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Client", "Service", "Property", "Estimate", "Status", "Date", "Actions"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #f3f4f6" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "48px 24px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                      No leads found
                    </td>
                  </tr>
                ) : filtered.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#1d4ed8", flexShrink: 0 }}>
                          {getFormData(lead).fullName ? getFormData(lead).fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "NA"}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{getFormData(lead).fullName || "No name"}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>{getFormData(lead).phone || "No phone"}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#374151" }}>
                      <div>{serviceLabel[getFormData(lead).cleaningType] || getFormData(lead).cleaningType}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "capitalize" }}>{getFormData(lead).frequency}</div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#374151" }}>
                      <div>{getRoomSummary(getFormData(lead))}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>
                        {getFormData(lead).squareFootage !== null
                          ? `${getFormData(lead).squareFootage.toLocaleString()} sq ft`
                          : "Square footage pending"}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 500, color: "#111827" }}>
                      <span style={{ color: lead.booking ? "#059669" : "#111827" }}>
                        {getQuoteLeadPriceDisplay(lead).text}
                      </span>
                      {!isPendingOwnerReview(lead) && (
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {lead.estimate?.laborHours || 0} hrs labor
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px" }}><Badge status={lead.status} /></td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#9ca3af" }}>
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        {lead.status !== "booked" && (
                          <button
                            onClick={e => { e.stopPropagation(); setBookingLead(lead); }}
                            style={{ padding: "6px 12px", background: "#059669", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            Book
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteLead(lead); }}
                          style={{ padding: "6px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelected(null)}
          onBook={() => setBookingLead(selectedLead)}
          onStatusChange={status => handleStatusChange(selectedLead, status)}
        />
      )}

      {bookingLead && (
        <BookModal
          lead={bookingLead}
          onClose={() => setBookingLead(null)}
          onSave={data => handleBook(bookingLead, data)}
        />
      )}
    </div>
  );
}
