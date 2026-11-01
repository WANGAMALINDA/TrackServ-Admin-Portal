import { useState } from "react";
import "./CookieConsent.css";

const CONSENT_KEY = "adminCookieConsent";

function readConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

export default function CookieConsent() {
  const [consent, setConsent] = useState(readConsent);

  const saveConsent = (choice) => {
    try {
      window.localStorage.setItem(CONSENT_KEY, choice);
    } catch (error) {
      console.error("Could not save cookie preferences:", error);
    }
    setConsent(choice);
  };

  if (consent) return null;

  return (
    <aside className="cookie-consent" role="dialog" aria-labelledby="cookie-consent-title">
      <div className="cookie-consent__copy">
        <h2 id="cookie-consent-title">Cookie preferences</h2>
        <p>
          TrackServ uses essential storage to keep your session and preferences working.
          This portal does not use advertising or analytics cookies.
        </p>
      </div>
      <div className="cookie-consent__actions">
        <button type="button" className="cookie-consent__secondary" onClick={() => saveConsent("necessary")}>
          Only necessary
        </button>
        <button type="button" className="cookie-consent__primary" onClick={() => saveConsent("accepted")}>
          Accept
        </button>
      </div>
    </aside>
  );
}
