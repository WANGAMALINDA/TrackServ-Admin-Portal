import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  ChevronDown,
  Headphones,
  LogOut,
  MapPin,
  Menu,
  User,
  X,
} from "lucide-react";

function NavRow({ item, active, onClick }) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        backgroundColor: active ? "#ecfdf5" : "transparent",
        color: active ? "#047857" : "#374151",
      }}
    >
      <Icon size={18} color={active ? "#059669" : "#6b7280"} />
      <span>{item.label}</span>
    </button>
  );
}

export default function Sidebar({
  children,
  activePage,
  onPageChange,
  navItemsOverride = [],
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [currentUser, setCurrentUser] = useState({
    name: "",
    role: "citizen",
    avatar: "",
  });
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileNavOpen(false);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("full_name, role, profile_picture, username")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (cancelled) return;

      setCurrentUser({
        name: profile?.full_name || profile?.username || user.email || "User",
        role: profile?.role || "citizen",
        avatar: profile?.profile_picture || "",
      });
    }

    loadCurrentUser().catch((error) => {
      console.error("Could not load the signed-in user profile:", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const closeMobileNav = () => {
    if (isMobile) setMobileNavOpen(false);
  };

  const handleLogout = async () => {
    setLogoutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.assign(import.meta.env.BASE_URL);
    } catch (error) {
      setLogoutError("Could not log out. Please try again.");
      console.error("Could not sign out:", error);
    }
  };

  const roleLabel = {
    citizen: "Active Citizen",
    moderator: "Moderator",
    admin: "Administrator",
  }[currentUser.role] || "Active Citizen";

  return (
    <div
      style={{
        height: "100vh",
        backgroundColor: "#f3f4f6",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          height: 64,
          backgroundColor: "#fff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          padding: isMobile ? "0 8px" : "0 16px",
          gap: isMobile ? 6 : 16,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-label="Toggle navigation"
          style={{
            padding: 6,
            color: "#6b7280",
            background: "none",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Menu size={20} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <MapPin size={16} color="#fff" />
          </div>
          {!isMobile && (
            <div style={{ lineHeight: 1.2 }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#111827", fontSize: 16 }}>
                Track<span style={{ color: "#059669" }}>Serv</span>
              </p>
              <p style={{ margin: 0, marginTop: -2, fontSize: 11, color: "#6b7280" }}>
                Admin Portal
              </p>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingLeft: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "#e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6b7280",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <User size={16} />
            )}
          </div>
          {!isMobile && (
            <div style={{ textAlign: "left", lineHeight: 1.2 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
                {currentUser.name || "Guest"}
              </p>
              <p style={{ margin: 0, marginTop: -2, fontSize: 11, color: "#6b7280" }}>
                {roleLabel}
              </p>
            </div>
          )}
          {!isMobile && <ChevronDown size={16} color="#9ca3af" />}
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, position: "relative", minHeight: 0 }}>
        {isMobile && mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 30,
              backgroundColor: "rgba(0,0,0,0.3)",
            }}
          />
        )}

        <aside
          style={{
            width: isMobile ? "min(256px, 80vw)" : 256,
            backgroundColor: "#fff",
            borderRight: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            flexShrink: 0,
            ...(isMobile
              ? {
                  position: "fixed",
                  top: 64,
                  bottom: 0,
                  left: 0,
                  zIndex: 40,
                  transform: mobileNavOpen ? "translateX(0)" : "translateX(-100%)",
                  transition: "transform 0.2s ease-in-out",
                }
              : { position: "static" }),
          }}
        >
          {isMobile && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
              }}
            >
              <span style={{ fontWeight: 600, color: "#111827" }}>Menu</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                style={{
                  padding: 4,
                  color: "#6b7280",
                  background: "none",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>
          )}

          <nav style={{ padding: "16px 8px 0", display: "flex", flexDirection: "column", gap: 4 }}>
            {navItemsOverride.map((item) => (
              <NavRow
                key={item.key}
                item={item}
                active={activePage === item.key}
                onClick={() => {
                  onPageChange?.(item.key);
                  closeMobileNav();
                }}
              />
            ))}
          </nav>

          <div>
            <div
              style={{
                margin: 16,
                padding: 16,
                borderRadius: 12,
                backgroundColor: "#ecfdf5",
                border: "1px solid #d1fae5",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  backgroundColor: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                <Headphones size={18} color="#059669" />
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Need help?
              </p>
              <p style={{ margin: "2px 0 12px", fontSize: 12, color: "#6b7280" }}>
                Contact our support team, we're here to help.
              </p>
              <a
                href="tel:+27123456789"
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#047857",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 500,
                  padding: "8px 0",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                Contact Support
              </a>
            </div>

            {logoutError && (
              <p role="alert" style={{ margin: "0 16px 8px", color: "#b91c1c", fontSize: 12 }}>
                {logoutError}
              </p>
            )}
            <div style={{ margin: "0 16px 16px" }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: "#fff",
                  color: "#b91c1c",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  cursor: "pointer",
                }}
              >
                <LogOut size={16} />
                Log Out
              </button>
            </div>
          </div>
        </aside>

        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowY: "auto",
            backgroundColor: "rgba(229,231,235,0.7)",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
