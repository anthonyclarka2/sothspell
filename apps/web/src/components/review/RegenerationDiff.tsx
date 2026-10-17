import { diffCounts, diffWords } from './word-diff.js';
import type { BeatRegeneration } from '../../lib/review-api.js';

interface RegenerationDiffProps {
  regeneration: BeatRegeneration;
  busy: boolean;
  onRevert: (regenerationId: string) => void;
}

/**
 * The old-versus-new narration comparison for one regeneration. Reverting is
 * always available while the regeneration is applied: the previous narration
 * is part of the review record, not a transient editor buffer.
 */
export function RegenerationDiff({
  regeneration,
  busy,
  onRevert,
}: RegenerationDiffProps) {
  const diff = diffWords(
    regeneration.previous.narration,
    regeneration.generated.narration,
  );
  const counts = diffCounts(diff);
  const reverted = regeneration.revertedAt !== null;

  return (
    <section className="review-diff" aria-labelledby="review-diff-heading">
      <header className="review-diff-head">
        <div>
          <h3 id="review-diff-heading">Regenerated narration</h3>
          <p className="mono">
            model {regeneration.modelId} · {counts.added} words added · {counts.removed}{' '}
            removed
          </p>
        </div>
        <span className="review-badge review-badge--muted">
          {reverted ? 'reverted' : 'applied'}
        </span>
      </header>

      <div className="review-diff-columns">
        <div>
          <h4>Previous</h4>
          <p className="review-diff-text">
            {diff.before.map((token, index) => (
              <span
                key={`${token.kind}-${index}`}
                className={token.kind === 'removed' ? 'diff-removed' : undefined}
              >
                {token.text}
              </span>
            ))}
          </p>
        </div>
        <div>
          <h4>Regenerated</h4>
          <p className="review-diff-text">
            {diff.after.map((token, index) => (
              <span
                key={`${token.kind}-${index}`}
                className={token.kind === 'added' ? 'diff-added' : undefined}
              >
                {token.text}
              </span>
            ))}
          </p>
        </div>
      </div>

      {!reverted && (
        <div className="review-diff-actions">
          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={() => onRevert(regeneration.id)}
          >
            Revert to the previous narration
          </button>
        </div>
      )}
    </section>
  );
}
