import type { CanvasRect } from '@sothspell/canvas';
import { useLocale } from '../../i18n/locale.js';

/** Numeric inputs expose the same board coordinates as dragging a card or its resize handles. */
export function CardPlacement({
  title,
  rect,
  resizable,
  onApply,
}: {
  title: string;
  rect: CanvasRect;
  resizable: boolean;
  onApply: (rect: CanvasRect) => void;
}) {
  const { t } = useLocale();
  const fields: (keyof CanvasRect)[] = resizable
    ? ['x', 'y', 'width', 'height']
    : ['x', 'y'];
  return (
    <details className="card-placement">
      <summary>{t('canvas.adjust', { title })}</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = { ...rect };
          for (const field of fields) next[field] = Number(form.get(field));
          onApply(next);
        }}
      >
        {fields.map((field) => (
          <label key={field}>
            {t(`canvas.placement.${field}`)}
            <input
              key={rect[field]}
              type="number"
              name={field}
              required
              defaultValue={Math.round(rect[field])}
              min={field === 'width' ? 280 : field === 'height' ? 180 : undefined}
            />
          </label>
        ))}
        <button type="submit" className="canvas-outline-action">
          {t('canvas.applyPlacement')}
        </button>
      </form>
    </details>
  );
}
