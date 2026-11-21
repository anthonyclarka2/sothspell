import type { PositionedDiagram } from '@sothspell/diagram';
import { useLocale } from '../i18n/locale.js';

/** Preserve the direction and meaning of each edge when reading a diagram in order. */
export function DiagramRelations({
  diagram,
  focusedIds,
}: {
  diagram: PositionedDiagram;
  focusedIds?: string[];
}) {
  const { t } = useLocale();
  const labels = new Map(diagram.nodes.map((node) => [node.id, node.label]));
  if (!diagram.edges.length) return null;

  return (
    <ol
      aria-label={t('diagram.relations')}
      className={focusedIds ? 'sequence-messages' : undefined}
    >
      {diagram.edges.map((edge) => (
        <li key={edge.id} data-focused={focusedIds?.includes(edge.id)}>
          {t(`diagram.${edge.kind}`, {
            from: labels.get(edge.from) ?? edge.from,
            to: labels.get(edge.to) ?? edge.to,
          })}
          {edge.label && ` (${edge.label})`}
        </li>
      ))}
    </ol>
  );
}
