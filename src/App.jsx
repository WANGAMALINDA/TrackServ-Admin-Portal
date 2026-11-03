import { lazy, Suspense, useEffect, useState } from "react";
import {
  ChartNoAxesCombined, ClipboardList, FileSearch, History, UserRound, Users,
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import Footer from "./components/footer";
import UserManagement from "./pages/UserManagement";
import NotFound from "./pages/NotFound";
import SignIn from "./pages/SignIn";
import CookieConsent from "./components/CookieConsent";
import { supabase } from "./components/supabaseClient";
import "./App.css";

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const Profile = lazy(() => import("./pages/AdminProfile"));
const Analysis = lazy(() => import("./pages/Analysis"));
const CommunityModeration = lazy(() => import("./pages/CommunityModeration"));
const IssueOversight = lazy(() => import("./pages/IssueOversight"));
const AuditLog = lazy(() => import("./pages/AuditLog"));

const navigationItems = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "user-management", label: "User Management", icon: Users },
  { key: "community-moderation", label: "Community Moderation", icon: ClipboardList },
  { key: "issue-oversight", label: "Service Issue Oversight", icon: FileSearch },
  { key: "audit-log", label: "Audit Log", icon: History },
  { key: "analysis", label: "Analysis", icon: ChartNoAxesCombined },
];

function App() {
  const recoveryLink = new URLSearchParams(window.location.hash.slice(1)).get("type")
    === "recovery"
    || new URLSearchParams(window.location.search).get("type") === "recovery";
  const [activePage, setActivePage] = useState(
    () => window.location.hash.slice(1) || "user-management"
  );
  const [auth, setAuth] = useState({
    loading: true,
    isAdmin: false,
    error: "",
    recovery: recoveryLink,
  });

  useEffect(() => {
    const handleHashChange = () => {
      setActivePage(window.location.hash.slice(1) || "user-management");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    let active = true;
    let authCheckId = 0;

    const checkAdmin = async (user) => {
      const currentCheckId = ++authCheckId;
      if (!user) {
        if (active && currentCheckId === authCheckId) {
          setAuth((current) => ({ ...current, loading: false, isAdmin: false }));
        }
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, is_suspended")
        .eq("id", user.id)
        .maybeSingle();

      if (!active || currentCheckId !== authCheckId) return;
      if (error) {
        console.error("Could not verify admin access:", error);
        setAuth({ loading: false, isAdmin: false, error: "Could not verify admin access. Please try again.", recovery: false });
        void supabase.auth.signOut().then(({ error: signOutError }) => {
          if (signOutError) console.error("Could not sign out an unverified session:", signOutError);
        });
        return;
      }

      if (!profile) {
        setAuth({
          loading: false,
          isAdmin: false,
          error: "Your sign-in succeeded, but your account profile is unavailable. Please contact your administrator.",
          recovery: false,
        });
        void supabase.auth.signOut().then(({ error: signOutError }) => {
          if (signOutError) console.error("Could not sign out an account without a profile:", signOutError);
        });
        return;
      }

      if (profile.role !== "admin") {
        setAuth({
          loading: false,
          isAdmin: false,
          error: "Invalid credentials. Please check your email and password and try again.",
          recovery: false,
        });
        void supabase.auth.signOut().then(({ error: signOutError }) => {
          if (signOutError) console.error("Could not sign out an account without admin access:", signOutError);
        });
        return;
      }

      if (profile.is_suspended) {
        setAuth({
          loading: false,
          isAdmin: false,
          error: "This administrator account is suspended. Contact another administrator for assistance.",
          recovery: false,
        });
        void supabase.auth.signOut().then(({ error: signOutError }) => {
          if (signOutError) console.error("Could not sign out a suspended administrator:", signOutError);
        });
        return;
      }

      setAuth({ loading: false, isAdmin: true, error: "", recovery: false });
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      authCheckId += 1;
      const eventCheckId = authCheckId;
      if (event === "PASSWORD_RECOVERY") {
        if (active) setAuth({ loading: false, isAdmin: false, error: "", recovery: true });
        return;
      }
      if (event === "SIGNED_OUT") {
        if (active) setAuth((current) => ({ ...current, loading: false, isAdmin: false, recovery: false }));
        return;
      }
      if (session?.user) {
        window.setTimeout(() => {
          if (active && eventCheckId === authCheckId) void checkAdmin(session.user);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Could not read the authentication session:", error);
        if (active) {
          setAuth({ loading: false, isAdmin: false, error: "Could not check your sign-in session. Please try again.", recovery: false });
        }
        return;
      }
      if (active) void checkAdmin(data.session?.user);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!auth.isAdmin) return undefined;

    let timeoutId;
    const logout = () => {
      void supabase.auth.signOut().then(({ error }) => {
        if (error) console.error("Could not sign out after an idle timeout:", error);
      });
    };
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logout, SESSION_TIMEOUT_MS);
    };
    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

    activityEvents.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [auth.isAdmin]);

  if (auth.loading) {
    return <main className="admin-auth-loading" aria-live="polite">Checking your session…</main>;
  }

  if (!auth.isAdmin) {
    return (
      <>
        <SignIn
          authError={auth.error}
          recovery={auth.recovery}
          onRecoveryComplete={() => setAuth((current) => ({ ...current, recovery: false, error: "" }))}
        />
        <CookieConsent />
      </>
    );
  }

  const handlePageChange = (page) => {
    window.location.hash = page;
  };
  const page = activePage === "user-management"
    ? <UserManagement />
    : activePage === "analysis"
      ? (
        <Suspense fallback={<main className="admin-auth-loading" aria-live="polite">Loading analytics…</main>}>
          <Analysis />
        </Suspense>
      )
      : activePage === "community-moderation"
        ? (
          <Suspense fallback={<main className="admin-auth-loading" aria-live="polite">Loading community moderation…</main>}>
            <CommunityModeration />
          </Suspense>
        )
        : activePage === "issue-oversight"
          ? (
            <Suspense fallback={<main className="admin-auth-loading" aria-live="polite">Loading service issue oversight…</main>}>
              <IssueOversight />
            </Suspense>
          )
          : activePage === "audit-log"
            ? (
              <Suspense fallback={<main className="admin-auth-loading" aria-live="polite">Loading audit log…</main>}>
                <AuditLog />
              </Suspense>
            )
    : activePage === "profile"
      ? (
        <Suspense fallback={<main className="admin-auth-loading" aria-live="polite">Loading your profile…</main>}>
          <Profile embedded />
        </Suspense>
      )
      : <NotFound onReturn={() => handlePageChange("user-management")} />;

  return (
    <>
      <Sidebar
        activePage={activePage}
        onPageChange={handlePageChange}
        navItemsOverride={navigationItems}
      >
        <>
          {page}
          <Footer />
        </>
      </Sidebar>
      <CookieConsent />
    </>
  );
}

export default App;
