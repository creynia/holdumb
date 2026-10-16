import { Link } from '../components/Link';

export function NotFound({ what }: { what?: string }) {
  return (
    <div class="page">
      <h1>Not found</h1>
      <p>{what ?? 'That page'} does not exist.</p>
      <Link to="/" class="btn">
        Back home
      </Link>
    </div>
  );
}
