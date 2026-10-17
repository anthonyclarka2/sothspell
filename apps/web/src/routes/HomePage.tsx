import { Link } from '@tanstack/react-router';
import { ArrowRight, Play } from '@phosphor-icons/react';
import { fetchTour, firstBeatId, formatDuration, GOLDEN_TOUR_ID } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';

export function HomePage() {
  const tour = useAsync(() => fetchTour(GOLDEN_TOUR_ID), []);

  if (tour.status === 'loading') {
    return (
      <div className="page">
        <p className="notice">Loading the golden tour…</p>
      </div>
    );
  }

  if (tour.status === 'error' || !tour.data) {
    return (
      <div className="page">
        <div className="notice">
          <strong>The golden tour did not load.</strong> {tour.error?.message}
        </div>
      </div>
    );
  }

  const beatId = firstBeatId(tour.data);
  const tourData = tour.data;
  const beatCount = tourData.chapters.reduce(
    (total, chapter) => total + chapter.beats.length,
    0,
  );

  return (
    <div className="page">
      <section className="home-hero">
        <div>
          <h1>{tourData.title}</h1>
          <p>{tourData.subtitle}</p>
          <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
            <Link
              className="primary-action"
              to="/t/$tourId/$beatId"
              params={{ tourId: tourData.id, beatId }}
            >
              <Play size={16} weight="fill" />
              Play the tour
            </Link>
            <a className="secondary-action" href="#chapters">
              Read the chapters
              <ArrowRight size={16} weight="bold" />
            </a>
          </div>
        </div>
        <aside className="revision-card">
          <dl>
            <dt>Project</dt>
            <dd>{tourData.project.name}</dd>
            <dt>Revision</dt>
            <dd className="mono">{tourData.project.revision.commit}</dd>
            <dt>Chapters</dt>
            <dd>{tourData.chapters.length}</dd>
            <dt>Beats</dt>
            <dd>{beatCount}</dd>
            <dt>Runtime</dt>
            <dd>{formatDuration(tourData.estimatedDurationMs)}</dd>
          </dl>
        </aside>
      </section>

      <section id="chapters" className="chapter-index" aria-label="Tour chapters">
        {tourData.chapters.map((chapter, index) => (
          <article className="chapter-card" key={chapter.id}>
            <div className="chapter-card-number">
              {String(index + 1).padStart(2, '0')}
            </div>
            <div>
              <h2>{chapter.title}</h2>
              <p>{chapter.summary}</p>
            </div>
            <div className="chapter-card-meta">
              {chapter.beats.length} beats
              <br />
              <Link
                to="/t/$tourId/$beatId"
                params={{ tourId: tourData.id, beatId: chapter.beats[0]?.id ?? beatId }}
              >
                Start chapter
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
