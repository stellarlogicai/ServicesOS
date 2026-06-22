// src/App.jsx
import { useState, useEffect } from "react";
import AIPhotoEstimateSystem  from "./AIPhotoEstimateSystem.jsx";
import Dashboard              from "./pages/Dashboard.jsx";
import LoginForm              from "./components/LoginForm.jsx";
import BackupPanel            from "./components/BackupPanel.jsx";
import CompanySettings        from "./components/CompanySettings.jsx";
import StaffScheduling        from "./components/StaffScheduling.jsx";
import CustomerPortal         from "./components/CustomerPortal.jsx";
import CustomerManagement     from "./components/CustomerManagement.jsx";
import TenantManagement       from "./components/TenantManagement.jsx";
import AIModelTraining        from "./components/AIModelTraining.jsx";
import CalendarView           from "./components/CalendarView.jsx";
import DataExport             from "./components/DataExport.jsx";
import PaymentLinks           from "./components/PaymentLinks.jsx";
import InsuranceTracking      from "./components/InsuranceTracking.jsx";
import ImprovedOnboarding     from "./components/ImprovedOnboarding.jsx";
import RouteOptimization      from "./components/RouteOptimization.jsx";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import { saveLead }           from "./services/crmService.js";

// ─── Window resize hook ───────────────────────────────────────────────────────
function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width:  window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const handler = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return windowSize;
}

// ─── Nav definition ───────────────────────────────────────────────────────────
// `roles`      — which roles can see this item
// `permission` — optional fine-grained check (matches ROLE_PERMISSIONS keys)
const NAV_ITEMS = [
  {
    id: "intake",
    icon: "📋",
    label: "New quote",
    roles: ["admin", "super-admin"],
  },
  {
    id: "dashboard",
    icon: "📊",
    label: "Dashboard",
    roles: ["admin", "super-admin"],
    permission: "view_all_leads",
  },
  {
    id: "customers",
    icon: "👥",
    label: "Customers",
    roles: ["admin", "super-admin"],
  },
  {
    id: "customer-portal",
    icon: "👤",
    label: "Customer portal",
    roles: ["customer", "admin", "super-admin"],
  },
  {
    id: "staff-scheduling",
    icon: "👥",
    label: "Staff scheduling",
    roles: ["admin", "super-admin"],
    permission: "manage_staff",
  },
  {
    id: "route-optimization",
    icon: "🗺️",
    label: "Route optimization",
    roles: ["admin", "super-admin"],
    permission: "manage_staff",
  },
  {
    id: "calendar",
    icon: "📅",
    label: "Calendar",
    roles: ["admin", "super-admin"],
    permission: "manage_staff",
  },
  {
    id: "payment-links",
    icon: "💳",
    label: "Payment links",
    roles: ["admin", "super-admin"],
  },
  {
    id: "insurance",
    icon: "🛡️",
    label: "Insurance",
    roles: ["admin", "super-admin"],
  },
  {
    id: "data-export",
    icon: "📤",
    label: "Data export",
    roles: ["admin", "super-admin"],
  },
  {
    id: "tenant-management",
    icon: "🏢",
    label: "Tenant management",
    roles: ["super-admin"],
  },
  {
    id: "ai-training",
    icon: "🤖",
    label: "AI training",
    roles: ["super-admin"],
  },
  {
    id: "backup",
    icon: "💾",
    label: "Backup",
    roles: ["admin", "super-admin"],
  },
  {
    id: "settings",
    icon: "⚙️",
    label: "Settings",
    roles: ["admin", "super-admin"],
    permission: "manage_settings",
  },
];

// ─── Role-based access hook ───────────────────────────────────────────────────
function useCanView() {
  const { role, hasPermission } = useAuth();
  return (navItem) => {
    if (!navItem.roles.includes(role)) return false;
    if (navItem.permission && !hasPermission(navItem.permission)) return false;
    return true;
  };
}

// Default landing page per role
function defaultPage(role) {
  if (role === "customer")    return "customer-portal";
  if (role === "super-admin") return "tenant-management";
  return "intake";
}

// ─── Tenant switcher (super-admin only) ──────────────────────────────────────
function TenantSwitcher() {
  const { isSuperAdmin, currentTenant, switchTenant } = useAuth();
  if (!isSuperAdmin()) return null;

  return (
    <div style={{
      padding: "8px 20px 16px",
      borderBottom: "1px solid #1e293b",
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        Viewing tenant
      </div>
      <div style={{ fontSize: 12, color: currentTenant ? "#38bdf8" : "#64748b", fontWeight: 500 }}>
        {currentTenant ? currentTenant.businessName : "All tenants (global)"}
      </div>
      {currentTenant && (
        <button
          onClick={() => switchTenant(null)}
          style={{ marginTop: 6, fontSize: 11, color: "#64748b", background: "transparent", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          ← Back to global view
        </button>
      )}
    </div>
  );
}

// ─── Authenticated shell ──────────────────────────────────────────────────────
function AuthenticatedApp() {
  const { user, role, logout, currentTenant, isSuperAdmin } = useAuth();
  const { width } = useWindowSize();
  const isMobile  = width < 768;
  const canView   = useCanView();

  const visibleNav = NAV_ITEMS.filter(canView);

  const [page, setPage] = useState(() => {
    const def = defaultPage(role);
    return visibleNav.some(n => n.id === def) ? def : (visibleNav[0]?.id ?? "intake");
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Redirect if current page becomes inaccessible
  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (!isActive) return;

      setPage(currentPage =>
        visibleNav.some(n => n.id === currentPage) ? currentPage : (visibleNav[0]?.id ?? "intake")
      );
    });

    return () => {
      isActive = false;
    };
  }, [role]); // eslint-disable-line

  // Show onboarding if tenant hasn't completed it
  if (currentTenant && !currentTenant.onboardingCompleted && role === 'admin') {
    return <ImprovedOnboarding />;
  }

  const navigate = (id) => {
    if (!canView(NAV_ITEMS.find(n => n.id === id) ?? {})) return;
    setPage(id);
    setMobileMenuOpen(false);
  };

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const sidebar = (
    <nav style={{
      width: 220,
      background: "#0f172a",
      color: "#fff",
      display: "flex",
      flexDirection: "column",
      padding: "24px 0",
      flexShrink: 0,
      position: isMobile ? "fixed" : "relative",
      left: 0, top: 0,
      height: isMobile ? "100vh" : "auto",
      zIndex: 50,
      transform: isMobile ? (mobileMenuOpen ? "translateX(0)" : "translateX(-100%)") : "none",
      transition: isMobile ? "transform 0.3s ease" : "none",
    }}>
      {/* Logo */}
      <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #1e293b", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧹</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {currentTenant?.businessName ?? "Aunt B's"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {isSuperAdmin() ? "Super Admin" : "Cleaning Services"}
            </div>
          </div>
        </div>
      </div>

      <TenantSwitcher />

      {/* Filtered nav links */}
      {visibleNav.map(n => (
        <button
          key={n.id}
          onClick={() => navigate(n.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            background: page === n.id ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : "transparent",
            color:  page === n.id ? "#fff" : "#94a3b8",
            border: "none",
            fontSize: 14,
            fontWeight: page === n.id ? 600 : 400,
            cursor: "pointer",
            textAlign: "left",
            borderRadius: page === n.id ? "0 8px 8px 0" : 0,
            marginRight: page === n.id ? 8 : 0,
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 18 }}>{n.icon}</span>
          {n.label}
        </button>
      ))}

      {/* Role badge */}
      <div style={{ padding: "16px 20px 0" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
          padding: "3px 10px", borderRadius: 20,
          background: role === "super-admin" ? "rgba(168,85,247,0.2)" : role === "admin" ? "rgba(59,130,246,0.2)" : "rgba(100,116,139,0.2)",
          color:      role === "super-admin" ? "#c084fc"              : role === "admin" ? "#60a5fa"              : "#94a3b8",
        }}>
          {role}
        </span>
      </div>

      {/* Footer */}
      <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid #1e293b" }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{user?.email}</div>
        <button
          onClick={logout}
          style={{ width: "100%", padding: "8px", background: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );

  // ── Page renderer with RBAC double-check ─────────────────────────────────
  const renderPage = () => {
    const item = NAV_ITEMS.find(n => n.id === page);
    if (item && !canView(item)) return <AccessDenied />;

    // Extract tenant ID safely - handle both object and string cases
    const tenantId = typeof currentTenant === 'string' ? currentTenant : currentTenant?.id;

    switch (page) {
      case "intake":            return <div style={{ maxWidth: 680, margin: "0 auto" }}><AIPhotoEstimateSystem onLeadSaved={(formData, estimate, aiAnalysis) => saveLead(tenantId, formData, estimate, aiAnalysis)} /></div>;
      case "dashboard":         return <Dashboard />;
      case "customers":         return <CustomerManagement />;
      case "staff-scheduling":  return <StaffScheduling tenantId={tenantId} />;
      case "route-optimization": return <RouteOptimization tenantId={tenantId} />;
      case "calendar":          return <CalendarView />;
      case "payment-links":     return <PaymentLinks />;
      case "insurance":         return <InsuranceTracking tenantId={tenantId} />;
      case "data-export":       return <DataExport />;
      case "customer-portal":   return <CustomerPortal />;
      case "tenant-management": return <TenantManagement />;
      case "ai-training":       return <AIModelTraining />;
      case "backup":            return <BackupPanel />;
      case "settings":          return <CompanySettings />;
      default:                  return null;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f8fafc" }}>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileMenuOpen(o => !o)}
        style={{ display: isMobile ? "block" : "none", position: "fixed", top: 16, left: 16, zIndex: 100, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", color: "white", border: "none", borderRadius: 8, padding: "12px", cursor: "pointer", fontSize: 20, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}
      >
        {mobileMenuOpen ? "✕" : "☰"}
      </button>

      {mobileMenuOpen && isMobile && (
        <div onClick={() => setMobileMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      )}

      {sidebar}

      <main style={{ flex: 1, overflowY: "auto", background: "#ffffff", padding: isMobile ? "60px 16px 24px" : "0 24px 48px" }}>
        {renderPage()}
      </main>
    </div>
  );
}

// ─── Access denied fallback ───────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 360, padding: "40px 32px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: "0 0 8px" }}>Access denied</h2>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
          You don't have permission to view this page. Contact your administrator if you think this is a mistake.
        </p>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 14, color: "#64748b" }}>Loading…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return user ? <AuthenticatedApp /> : <LoginForm />;
}
