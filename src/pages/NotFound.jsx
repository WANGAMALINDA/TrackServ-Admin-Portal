import { ArrowLeft, MapPinOff } from "lucide-react";
import "./NotFound.css";

export default function NotFound({ onReturn }) {
  return (
    <section className="admin-not-found" aria-labelledby="not-found-title">
      <div className="admin-not-found__card">
        <span className="admin-not-found__icon" aria-hidden="true">
          <MapPinOff size={28} />
        </span>
        <p className="admin-not-found__code">404 · Page not found</p>
        <h1 id="not-found-title">This page isn’t on the map.</h1>
        <p className="admin-not-found__description">
          The page may have moved, or the address may be incorrect. Return to the admin portal to continue.
        </p>
        <button type="button" onClick={onReturn}>
          <ArrowLeft size={17} />
          Back to User Management
        </button>
      </div>
    </section>
  );
}
