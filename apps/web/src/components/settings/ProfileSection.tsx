import { useState } from 'react';
import {
  activateProfile,
  deleteProfile,
  testProfile,
  type ProfileKind,
  type PublicProfile,
  type SettingsEnv,
} from '../../lib/settings-api.js';
import { ProfileForm, providerLabel } from './ProfileForm.js';

/**
 * One capability section of the settings page: the profile list, the per-profile
 * actions (test, activate, edit, delete), and the inline form. Test outcomes are
 * announced through `role="status"` and never shown with color alone.
 */

interface ProfileSectionProps {
  kind: ProfileKind;
  title: string;
  description: string;
  profiles: PublicProfile[];
  env: SettingsEnv;
  onChanged: () => Promise<void> | void;
}

type Mode = { view: 'list' } | { view: 'create' } | { view: 'edit'; id: string };

interface TestState {
  status: 'running' | 'ok' | 'error';
  message: string;
}

function profileSummary(profile: PublicProfile): string {
  const parts: string[] = [providerLabel(profile.provider)];
  if (profile.modelId) {
    parts.push(`model ${profile.modelId}`);
  }
  if (profile.voiceId) {
    parts.push(`voice ${profile.voiceId}`);
  }
  if (profile.outputFormat) {
    parts.push(profile.outputFormat);
  }
  return parts.join(' · ');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ProfileSection({
  kind,
  title,
  description,
  profiles,
  env,
  onChanged,
}: ProfileSectionProps) {
  const [mode, setMode] = useState<Mode>({ view: 'list' });
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const envNote =
    kind === 'authoring'
      ? env.authoring.modelId === null
        ? null
        : `SOTHSPELL_MODEL is set on the server (${env.authoring.modelId}); it overrides the active profile and the model id field is read-only.`
      : env.narration.voiceId === null
        ? null
        : `ELEVENLABS_VOICE_ID is set on the server (${env.narration.voiceId}); it overrides the active profile and the voice id field is read-only.`;

  async function runTest(profile: PublicProfile): Promise<void> {
    setBusyId(profile.id);
    setActionError(null);
    setTestStates((current) => ({
      ...current,
      [profile.id]: { status: 'running', message: `Testing ${profile.name}…` },
    }));
    try {
      const result = await testProfile(profile.id);
      setTestStates((current) => ({
        ...current,
        [profile.id]: result.ok
          ? {
              status: 'ok',
              message: `Connection ok · ${result.latencyMs} ms${
                result.detail ? ` · ${result.detail}` : ''
              }`,
            }
          : {
              status: 'error',
              message: `Test failed: ${result.error ?? 'unknown provider error'}`,
            },
      }));
    } catch (error) {
      setTestStates((current) => ({
        ...current,
        [profile.id]: {
          status: 'error',
          message: `Test failed: ${errorMessage(error)}`,
        },
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function runAction(
    profile: PublicProfile,
    action: () => Promise<unknown>,
    label: string,
  ): Promise<void> {
    setBusyId(profile.id);
    setActionError(null);
    try {
      await action();
      await onChanged();
    } catch (error) {
      setActionError(`${label} failed for ${profile.name}: ${errorMessage(error)}`);
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(profile: PublicProfile): void {
    if (window.confirm(`Delete the profile "${profile.name}"?`)) {
      void runAction(profile, () => deleteProfile(profile.id), 'Delete');
    }
  }

  const editing =
    mode.view === 'edit'
      ? (profiles.find((profile) => profile.id === mode.id) ?? null)
      : null;

  return (
    <section className="settings-section" aria-labelledby={`settings-${kind}-heading`}>
      <header className="settings-section-head">
        <div>
          <h2 id={`settings-${kind}-heading`}>{title}</h2>
          <p>{description}</p>
        </div>
        {mode.view === 'list' && (
          <button
            type="button"
            className="secondary-action"
            onClick={() => setMode({ view: 'create' })}
          >
            New {title.toLowerCase()} profile
          </button>
        )}
      </header>

      {envNote && <p className="settings-env-note">{envNote}</p>}

      {actionError && (
        <p className="settings-error" role="alert">
          {actionError}
        </p>
      )}

      {profiles.length === 0 && mode.view === 'list' && (
        <p className="notice">
          No {title.toLowerCase()} profiles yet. Create one to choose the{' '}
          {kind === 'authoring' ? 'model that writes tours' : 'voice that reads tours'}.
        </p>
      )}

      {profiles.length > 0 && (
        <ul className="profile-list">
          {profiles.map((profile) => {
            const test = testStates[profile.id];
            const busy = busyId === profile.id;
            return (
              <li className="profile-card" key={profile.id} data-active={profile.active}>
                <div className="profile-card-head">
                  <h3>{profile.name}</h3>
                  {profile.active && <span className="profile-badge">Active</span>}
                  <span className="profile-badge profile-badge--muted">
                    {providerLabel(profile.provider)}
                  </span>
                </div>
                <p className="profile-card-meta mono">{profileSummary(profile)}</p>
                <p className="profile-card-note">
                  {profile.secretRef === null
                    ? 'No API key stored'
                    : profile.hasSecret
                      ? 'API key stored'
                      : 'API key reference is missing from the secret store'}
                </p>
                <div className="profile-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    aria-label={`Test ${profile.name}`}
                    disabled={busy}
                    onClick={() => void runTest(profile)}
                  >
                    Test
                  </button>
                  {!profile.active && (
                    <button
                      type="button"
                      className="secondary-action"
                      aria-label={`Activate ${profile.name}`}
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          profile,
                          () => activateProfile(profile.id),
                          'Activate',
                        )
                      }
                    >
                      Activate
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary-action"
                    aria-label={`Edit ${profile.name}`}
                    disabled={busy}
                    onClick={() => setMode({ view: 'edit', id: profile.id })}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    aria-label={`Delete ${profile.name}`}
                    disabled={busy}
                    onClick={() => confirmDelete(profile)}
                  >
                    Delete
                  </button>
                </div>
                <p
                  className="profile-test-result"
                  role="status"
                  data-state={test?.status ?? 'idle'}
                >
                  {test?.message ?? ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {mode.view === 'create' && (
        <ProfileForm
          kind={kind}
          profile={null}
          env={env}
          onCancel={() => setMode({ view: 'list' })}
          onSaved={() => {
            setMode({ view: 'list' });
            void onChanged();
          }}
        />
      )}

      {mode.view === 'edit' && editing && (
        <ProfileForm
          key={editing.id}
          kind={kind}
          profile={editing}
          env={env}
          onCancel={() => setMode({ view: 'list' })}
          onSaved={() => {
            setMode({ view: 'list' });
            void onChanged();
          }}
        />
      )}
    </section>
  );
}
