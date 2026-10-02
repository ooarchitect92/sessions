import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="full-page-state">
      <span className="eyebrow">404</span>
      <h1>That page is not in this workspace.</h1>
      <Link to="/" className="button primary">Go to overview</Link>
    </div>
  );
}
