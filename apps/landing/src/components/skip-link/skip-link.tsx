import "./skip-link.scss";

/** Before the bar, so a keyboard user can go straight to the page. */
export function SkipLink() {
  return (
    <a className="skip-link" href="#content">
      Skip to content
    </a>
  );
}
