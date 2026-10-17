import { Link } from '@tanstack/react-router';
import { ArrowRight, Play } from '@phosphor-icons/react';
import { fetchTour, firstBeatId, formatDuration, GOLDEN_TOUR_ID } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';
import { SignInNudge } from '../components/account/SignInNudge.js';
import { useLocale } from '../i18n/locale.js';

export function HomePage() {
  const { locale, t } = useLocale();
  const tour = useAsync(() => fetchTour(GOLDEN_TOUR_ID, locale), [locale]);

  if (tour.status === 'loading') {
    return (
      <div className="page">
        <p className="notice">{t('home.loading')}</p>
      </div>
    );
  }

  if (tour.status === 'error' || !tour.data) {
    return (
      <div className="page">
        <div className="notice">
          <strong>{t('home.loadError')}</strong> {tour.error?.message}
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
              {t('home.play')}
            </Link>
            <a className="secondary-action" href="#chapters">
              {t('home.readChapters')}
              <ArrowRight size={16} weight="bold" className="rtl-flip" />
            </a>
          </div>
        </div>
        <aside className="revision-card">
          <dl>
            <dt>{t('home.project')}</dt>
            <dd>{tourData.project.name}</dd>
            <dt>{t('home.revision')}</dt>
            <dd className="mono">{tourData.project.revision.commit}</dd>
            <dt>{t('home.chapters')}</dt>
            <dd>{tourData.chapters.length}</dd>
            <dt>{t('home.beats')}</dt>
            <dd>{beatCount}</dd>
            <dt>{t('home.runtime')}</dt>
            <dd>{formatDuration(tourData.estimatedDurationMs)}</dd>
          </dl>
        </aside>
      </section>

      <SignInNudge />

      <section
        id="chapters"
        className="chapter-index"
        aria-label={t('home.chapterIndex')}
      >
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
              {t('home.beatCount', { count: chapter.beats.length })}
              <br />
              <Link
                to="/t/$tourId/$beatId"
                params={{ tourId: tourData.id, beatId: chapter.beats[0]?.id ?? beatId }}
              >
                {t('home.startChapter')}
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
