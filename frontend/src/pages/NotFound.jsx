import { Link } from 'react-router';
import { fr } from '../i18n/fr.js';

export function NotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{fr.notFound.title}</h1>
      <Link to="/" className="text-sm font-medium text-blue-700 underline hover:text-blue-900">
        {fr.notFound.back}
      </Link>
    </section>
  );
}
