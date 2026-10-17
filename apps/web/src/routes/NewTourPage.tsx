import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  CheckCircle,
  Circle,
  CircleNotch,
  FolderOpen,
  GithubLogo,
  WarningCircle,
} from '@phosphor-icons/react';
import { useLocale } from '../i18n/locale.js';
import { fetchSettings } from '../lib/settings-api.js';
import {
  cancelAuthoring,
  fetchAuthoringJob,
  inspectProject,
  startAuthoring,
  type AuthoringJob,
  type AuthoringModelChoice,
  type AuthoringStepId,
  type ProjectInspection,
} from '../lib/authoring-api.js';

type SourceKind = 'local' | 'github';
type Audience = 'new-contributor' | 'technical-evaluator' | 'maintainer';

const TERMINAL: ReadonlySet<AuthoringJob['status']> = new Set([
  'done',
  'failed',
  'cancelled',
]);

function stepLabelKey(id: AuthoringStepId) {
  return `new.step.${id}` as const;
}

/**
 * The demo-friendly entry point: open a local git repository or a public
 * GitHub URL, choose the fixture or the active authoring profile, and watch the
 * authoring pipeline produce a playable tour. The project stays read-only.
 */
export function NewTourPage() {
  const { t } = useLocale();
  const [sourceKind, setSourceKind] = useState<SourceKind>('local');
  const [localPath, setLocalPath] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [ref, setRef] = useState('');
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [checking, setChecking] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [model, setModel] = useState<AuthoringModelChoice>('fixture');
  const [profileLabel, setProfileLabel] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>('new-contributor');
  const [maxMinutes, setMaxMinutes] = useState(8);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [job, setJob] = useState<AuthoringJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const active = settings.profiles.find(
          (profile) => profile.kind === 'authoring' && profile.active,
        );
        setProfileLabel(active?.name ?? settings.env.authoring.modelId ?? null);
      })
      .catch(() => {
        // Settings are optional for the fixture demo.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void fetchAuthoringJob(job.id)
        .then(setJob)
        .catch(() => {
          // A transient poll failure keeps the last state; the next tick retries.
        });
    }, 800);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  const checkRepository = async () => {
    setChecking(true);
    setInspectError(null);
    try {
      setInspection(await inspectProject(localPath));
    } catch (error) {
      setInspection(null);
      setInspectError(error instanceof Error ? error.message : t('new.checkError'));
    } finally {
      setChecking(false);
    }
  };

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const source =
        sourceKind === 'local'
          ? ({ kind: 'local', path: localPath } as const)
          : ({
              kind: 'github',
              url: githubUrl,
              ...(ref.trim().length === 0 ? {} : { ref: ref.trim() }),
            } as const);
      const started = await startAuthoring({
        source,
        model,
        audience,
        maxMinutes,
      });
      setJob(started);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : t('new.error.generic'));
    } finally {
      setStarting(false);
    }
  };

  const reset = () => {
    setJob(null);
    setInspection(null);
    setInspectError(null);
    setStartError(null);
  };

  const modelHint = (message: string) =>
    message.toLowerCase().includes('profile') || message.toLowerCase().includes('model')
      ? ` ${t('new.error.model')}`
      : '';

  const canStart =
    !starting &&
    job === null &&
    (sourceKind === 'local' ? inspection !== null : githubUrl.trim().length > 0);

  return (
    <div className="page new-page">
      <header className="new-header">
        <h1>{t('new.title')}</h1>
        <p>{t('new.subtitle')}</p>
      </header>

      <section className="new-section" aria-labelledby="new-source-heading">
        <h2 id="new-source-heading">{t('new.sourceLabel')}</h2>
        <div className="source-grid" role="radiogroup" aria-label={t('new.sourceLabel')}>
          <button
            type="button"
            className={sourceKind === 'local' ? 'source-card is-active' : 'source-card'}
            role="radio"
            aria-checked={sourceKind === 'local'}
            onClick={() => setSourceKind('local')}
          >
            <FolderOpen size={22} weight="duotone" aria-hidden="true" />
            <strong>{t('new.local')}</strong>
            <span>{t('new.localHint')}</span>
          </button>
          <button
            type="button"
            className={sourceKind === 'github' ? 'source-card is-active' : 'source-card'}
            role="radio"
            aria-checked={sourceKind === 'github'}
            onClick={() => setSourceKind('github')}
          >
            <GithubLogo size={22} weight="duotone" aria-hidden="true" />
            <strong>{t('new.github')}</strong>
            <span>{t('new.githubHint')}</span>
          </button>
        </div>

        {sourceKind === 'local' ? (
          <div className="new-form">
            <label className="field">
              <span>{t('new.localPath')}</span>
              <input
                type="text"
                value={localPath}
                placeholder={t('new.localPlaceholder')}
                onChange={(event) => {
                  setLocalPath(event.target.value);
                  setInspection(null);
                  setInspectError(null);
                }}
              />
            </label>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void checkRepository()}
              disabled={checking || localPath.trim().length === 0}
            >
              {checking ? t('new.checking') : t('new.check')}
            </button>
            {inspectError ? <p className="notice">{inspectError}</p> : null}
            {inspection ? (
              <dl className="inspect-grid">
                <div>
                  <dt>{t('new.project')}</dt>
                  <dd>{inspection.name}</dd>
                </div>
                <div>
                  <dt>{t('new.revision')}</dt>
                  <dd className="mono">
                    {inspection.revision.branch} ·{' '}
                    {inspection.revision.commit.slice(0, 7)}
                  </dd>
                </div>
                <div>
                  <dt>{t('new.languages')}</dt>
                  <dd>
                    {inspection.languages
                      .filter((language) => language.primary)
                      .map((language) => language.id)
                      .join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>{t('new.files')}</dt>
                  <dd>{inspection.fileCount}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : (
          <div className="new-form">
            <label className="field">
              <span>{t('new.githubUrl')}</span>
              <input
                type="url"
                value={githubUrl}
                placeholder={t('new.githubPlaceholder')}
                onChange={(event) => setGithubUrl(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t('new.ref')}</span>
              <input
                type="text"
                value={ref}
                placeholder={t('new.refPlaceholder')}
                onChange={(event) => setRef(event.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      <section className="new-section" aria-labelledby="new-model-heading">
        <h2 id="new-model-heading">{t('new.model')}</h2>
        <fieldset className="model-choices">
          <legend className="visually-hidden">{t('new.model')}</legend>
          <label
            className={model === 'fixture' ? 'model-choice is-active' : 'model-choice'}
          >
            <input
              type="radio"
              name="authoring-model"
              value="fixture"
              checked={model === 'fixture'}
              onChange={() => setModel('fixture')}
            />
            <span>
              <strong>{t('new.modelFixture')}</strong>
              <small>{t('new.modelFixtureHint')}</small>
            </span>
          </label>
          <label
            className={model === 'profile' ? 'model-choice is-active' : 'model-choice'}
          >
            <input
              type="radio"
              name="authoring-model"
              value="profile"
              checked={model === 'profile'}
              disabled={profileLabel === null}
              onChange={() => setModel('profile')}
            />
            <span>
              <strong>{t('new.modelProfile')}</strong>
              <small>
                {profileLabel === null
                  ? t('new.modelProfileNone')
                  : t('new.modelProfileHint', { name: profileLabel })}
              </small>
            </span>
          </label>
        </fieldset>

        <div className="new-form new-form-row">
          <label className="field">
            <span>{t('new.audience')}</span>
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value as Audience)}
            >
              <option value="new-contributor">{t('new.audienceNew')}</option>
              <option value="technical-evaluator">{t('new.audienceTechnical')}</option>
              <option value="maintainer">{t('new.audienceMaintainer')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('new.maxMinutes')}</span>
            <input
              type="number"
              min={1}
              max={120}
              value={maxMinutes}
              onChange={(event) => setMaxMinutes(Number(event.target.value) || 8)}
            />
          </label>
        </div>
      </section>

      <div className="new-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => void start()}
          disabled={!canStart}
        >
          {starting ? t('new.starting') : t('new.start')}
        </button>
        {startError ? (
          <p className="notice">
            {startError}
            {modelHint(startError)}
          </p>
        ) : null}
      </div>

      {job ? (
        <section className="new-section job-panel" aria-live="polite">
          <h2>
            {job.status === 'done'
              ? t('new.resultTitle')
              : job.status === 'failed' || job.status === 'cancelled'
                ? t('new.errorTitle')
                : t('new.starting')}
          </h2>
          <ol className="step-list">
            {job.steps.map((step) => (
              <li key={step.id} className={`step is-${step.status}`}>
                {step.status === 'done' ? (
                  <CheckCircle size={16} weight="fill" aria-hidden="true" />
                ) : step.status === 'active' ? (
                  <CircleNotch size={16} weight="bold" aria-hidden="true" />
                ) : step.status === 'failed' ? (
                  <WarningCircle size={16} weight="fill" aria-hidden="true" />
                ) : (
                  <Circle size={16} aria-hidden="true" />
                )}
                <span>{t(stepLabelKey(step.id))}</span>
                <small>
                  {step.detail ??
                    t(
                      step.status === 'done'
                        ? 'new.step.done'
                        : step.status === 'active'
                          ? 'new.step.active'
                          : step.status === 'failed'
                            ? 'new.step.failed'
                            : 'new.step.pending',
                    )}
                </small>
              </li>
            ))}
          </ol>

          {job.status === 'running' || job.status === 'queued' ? (
            <button
              type="button"
              className="secondary-action"
              onClick={() => void cancelAuthoring(job.id).catch(() => undefined)}
            >
              {t('new.cancel')}
            </button>
          ) : null}

          {job.error ? (
            <p className="notice">
              {job.error}
              {modelHint(job.error)}
            </p>
          ) : null}

          {job.result ? (
            <div className="result-card">
              <h3>{job.result.title}</h3>
              <p>
                {t('new.resultMeta', {
                  chapters: job.result.chapters,
                  beats: job.result.beats,
                  anchors: job.result.anchors,
                })}
              </p>
              <div className="result-actions">
                <Link to={job.result.playerPath} className="primary-action">
                  {t('new.open')}
                </Link>
                <button type="button" className="secondary-action" onClick={reset}>
                  {t('new.another')}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
