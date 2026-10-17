import { useState, type FormEvent } from 'react';
import { DownloadSimple } from '@phosphor-icons/react';

export interface ImportFormProps {
  busy: boolean;
  onSubmit: (input: { url: string; ref: string | null }) => void;
}

/**
 * The paste-a-URL form. The server owns validation; the form only trims input
 * and blocks a second submission while one import is in flight.
 */
export function ImportForm({ busy, onSubmit }: ImportFormProps) {
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (busy || trimmedUrl.length === 0) {
      return;
    }
    onSubmit({ url: trimmedUrl, ref: ref.trim() || null });
  }

  return (
    <form className="import-form" onSubmit={handleSubmit}>
      <div className="import-field">
        <label htmlFor="import-url">GitHub repository URL</label>
        <input
          id="import-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="import-field">
        <label htmlFor="import-ref">Ref (optional)</label>
        <input
          id="import-ref"
          name="ref"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="main"
          value={ref}
          onChange={(event) => setRef(event.target.value)}
          disabled={busy}
        />
      </div>
      <button className="primary-action import-submit" type="submit" disabled={busy}>
        <DownloadSimple size={16} weight="bold" />
        Import
      </button>
    </form>
  );
}
