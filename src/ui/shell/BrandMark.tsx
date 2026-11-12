/** The app mark: an open curve joining two stops. Drawn in the accent color; decorative, so hidden from assistive technology. */
export function BrandMark() {
  return <svg className="app-bar__mark" viewBox="290 210 720 840" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="69">
    <path d="M785 325A437 302 0 0 0 785 929" />
    <circle cx="875" cy="325" r="74" />
    <circle cx="875" cy="929" r="74" />
  </svg>;
}
