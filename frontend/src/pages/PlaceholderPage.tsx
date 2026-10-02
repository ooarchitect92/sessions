import { Link } from 'react-router-dom';

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="placeholder-page">
      <span className="eyebrow">Planned capability</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="placeholder-card">
        <span>◇</span>
        <div>
          <strong>This workflow is intentionally marked as incomplete.</strong>
          <p>The architecture and delivery status are documented without presenting placeholder screens as production functionality.</p>
        </div>
      </div>
      <Link to="/" className="button secondary">Return to overview</Link>
    </section>
  );
}
