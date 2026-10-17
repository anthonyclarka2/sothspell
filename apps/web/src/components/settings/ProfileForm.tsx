import { useState, type FormEvent } from 'react';
import {
  SettingsApiError,
  createProfile,
  updateProfile,
  type ProfileDraft,
  type ProfileKind,
  type ProfileProvider,
  type PublicProfile,
  type SettingsEnv,
} from '../../lib/settings-api.js';

/**
 * One profile form, used for both create and edit and for both kinds. Inline
 * validation mirrors the server schema so the publisher sees the field and the
 * expected shape before a request is made; server issues are mapped back onto
 * the same fields.
 */

export const AUTHORING_PROVIDER_OPTIONS: Array<{
  value: ProfileProvider;
  label: string;
}> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
];

export const NARRATION_PROVIDER_OPTIONS: Array<{
  value: ProfileProvider;
  label: string;
}> = [
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'browser', label: 'Browser speech (local)' },
];

export function providerLabel(provider: ProfileProvider): string {
  const option = [...AUTHORING_PROVIDER_OPTIONS, ...NARRATION_PROVIDER_OPTIONS].find(
    (candidate) => candidate.value === provider,
  );
  return option?.label ?? provider;
}

interface DraftState {
  name: string;
  provider: ProfileProvider;
  baseUrl: string;
  modelId: string;
  voiceId: string;
  outputFormat: string;
  secret: string;
}

interface ProfileFormProps {
  kind: ProfileKind;
  profile: PublicProfile | null;
  env: SettingsEnv;
  onCancel: () => void;
  onSaved: (profile: PublicProfile) => void;
}

function initialDraft(profile: PublicProfile | null, kind: ProfileKind): DraftState {
  if (profile) {
    return {
      name: profile.name,
      provider: profile.provider,
      baseUrl: profile.baseUrl ?? '',
      modelId: profile.modelId ?? '',
      voiceId: profile.voiceId ?? '',
      outputFormat: profile.outputFormat ?? '',
      secret: '',
    };
  }
  return {
    name: '',
    provider: kind === 'authoring' ? 'openai' : 'elevenlabs',
    baseUrl: '',
    modelId: '',
    voiceId: '',
    outputFormat: '',
    secret: '',
  };
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateDraft(kind: ProfileKind, draft: DraftState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
  if (kind === 'authoring') {
    if (draft.modelId.trim().length === 0) {
      errors.modelId =
        'Model id is required for authoring; expected a model name such as gpt-5.2.';
    }
    if (draft.provider === 'openai-compatible' && draft.baseUrl.trim().length === 0) {
      errors.baseUrl = 'Base URL is required for an OpenAI-compatible endpoint.';
    } else if (draft.baseUrl.trim().length > 0 && !isAbsoluteUrl(draft.baseUrl.trim())) {
      errors.baseUrl =
        'Base URL must be an absolute URL, for example https://api.example.com/v1.';
    }
  } else if (draft.provider === 'elevenlabs' && draft.voiceId.trim().length === 0) {
    errors.voiceId = 'Voice id is required for ElevenLabs.';
  }
  return errors;
}

function trimmedOrNull(value: string): string | null {
  return value.trim().length === 0 ? null : value.trim();
}

function buildPayload(kind: ProfileKind, draft: DraftState): ProfileDraft {
  const base = {
    name: draft.name.trim(),
    provider: draft.provider,
    ...(draft.secret.trim().length === 0 ? {} : { secret: draft.secret.trim() }),
  };
  if (kind === 'authoring') {
    return {
      ...base,
      baseUrl: trimmedOrNull(draft.baseUrl),
      modelId: trimmedOrNull(draft.modelId),
      voiceId: null,
      outputFormat: null,
    };
  }
  if (draft.provider === 'browser') {
    return {
      ...base,
      baseUrl: null,
      modelId: null,
      voiceId: null,
      outputFormat: null,
    };
  }
  return {
    ...base,
    baseUrl: null,
    modelId: trimmedOrNull(draft.modelId),
    voiceId: trimmedOrNull(draft.voiceId),
    outputFormat: trimmedOrNull(draft.outputFormat),
  };
}

export function ProfileForm({ kind, profile, env, onCancel, onSaved }: ProfileFormProps) {
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(profile, kind));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const formId = `${kind}-${profile?.id ?? 'new'}`;
  const providerOptions =
    kind === 'authoring' ? AUTHORING_PROVIDER_OPTIONS : NARRATION_PROVIDER_OPTIONS;
  // An environment override wins at runtime, so the matching field is
  // read-only once the profile exists; on create the value is still required
  // for a valid profile.
  const modelReadOnly =
    profile !== null && kind === 'authoring' && env.authoring.modelId !== null;
  const voiceReadOnly =
    profile !== null && kind === 'narration' && env.narration.voiceId !== null;

  function update<K extends keyof DraftState>(field: K, value: DraftState[K]): void {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function fieldError(name: string): string | null {
    return errors[name] ?? null;
  }

  function describedBy(name: string): string | undefined {
    return errors[name] ? `${formId}-${name}-error` : undefined;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateDraft(kind, draft);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(`${formId}-${firstInvalid}`)?.focus();
      return;
    }

    setSubmitError(null);
    setSaving(true);
    try {
      const payload = buildPayload(kind, draft);
      const saved = profile
        ? await updateProfile(profile.id, payload)
        : await createProfile({ ...payload, kind });
      onSaved(saved);
    } catch (error) {
      if (error instanceof SettingsApiError && error.issues.length > 0) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of error.issues) {
          const field = issue.path.split('.')[0] ?? '';
          if (field.length > 0 && fieldErrors[field] === undefined) {
            fieldErrors[field] = issue.message;
          }
        }
        setErrors(fieldErrors);
        if (Object.keys(fieldErrors).length === 0) {
          setSubmitError(error.message);
        }
      } else {
        setSubmitError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSaving(false);
    }
  }

  const heading = profile ? `Edit ${profile.name}` : `New ${kind} profile`;

  return (
    <form className="profile-form" onSubmit={handleSubmit} noValidate>
      <h3>{heading}</h3>

      <div className="field">
        <label htmlFor={`${formId}-name`}>Name</label>
        <input
          id={`${formId}-name`}
          value={draft.name}
          onChange={(event) => update('name', event.target.value)}
          aria-invalid={Boolean(fieldError('name'))}
          aria-describedby={describedBy('name')}
          autoComplete="off"
        />
        {fieldError('name') && (
          <p className="field-error" id={`${formId}-name-error`}>
            {fieldError('name')}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${formId}-provider`}>Provider</label>
        <select
          id={`${formId}-provider`}
          value={draft.provider}
          onChange={(event) => update('provider', event.target.value as ProfileProvider)}
        >
          {providerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {kind === 'authoring' && (
        <div className="field">
          <label htmlFor={`${formId}-baseUrl`}>Base URL</label>
          <input
            id={`${formId}-baseUrl`}
            value={draft.baseUrl}
            onChange={(event) => update('baseUrl', event.target.value)}
            placeholder="https://api.example.com/v1"
            aria-invalid={Boolean(fieldError('baseUrl'))}
            aria-describedby={describedBy('baseUrl')}
            autoComplete="off"
          />
          <p className="field-hint">
            Required for an OpenAI-compatible endpoint; optional for OpenAI and Anthropic.
          </p>
          {fieldError('baseUrl') && (
            <p className="field-error" id={`${formId}-baseUrl-error`}>
              {fieldError('baseUrl')}
            </p>
          )}
        </div>
      )}

      {kind === 'authoring' && (
        <div className="field">
          <label htmlFor={`${formId}-modelId`}>Model id</label>
          <input
            id={`${formId}-modelId`}
            value={draft.modelId}
            onChange={(event) => update('modelId', event.target.value)}
            placeholder={draft.provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-5.2'}
            readOnly={modelReadOnly}
            aria-readonly={modelReadOnly}
            aria-invalid={Boolean(fieldError('modelId'))}
            aria-describedby={describedBy('modelId')}
            autoComplete="off"
          />
          {modelReadOnly && (
            <p className="field-hint">
              Overridden by SOTHSPELL_MODEL on the server; read-only.
            </p>
          )}
          {fieldError('modelId') && (
            <p className="field-error" id={`${formId}-modelId-error`}>
              {fieldError('modelId')}
            </p>
          )}
        </div>
      )}

      {kind === 'narration' && draft.provider === 'elevenlabs' && (
        <>
          <div className="field">
            <label htmlFor={`${formId}-voiceId`}>Voice id</label>
            <input
              id={`${formId}-voiceId`}
              value={draft.voiceId}
              onChange={(event) => update('voiceId', event.target.value)}
              placeholder="voice-1"
              readOnly={voiceReadOnly}
              aria-readonly={voiceReadOnly}
              aria-invalid={Boolean(fieldError('voiceId'))}
              aria-describedby={describedBy('voiceId')}
              autoComplete="off"
            />
            {voiceReadOnly && (
              <p className="field-hint">
                Overridden by ELEVENLABS_VOICE_ID on the server; read-only.
              </p>
            )}
            {fieldError('voiceId') && (
              <p className="field-error" id={`${formId}-voiceId-error`}>
                {fieldError('voiceId')}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor={`${formId}-modelId`}>Model id (optional)</label>
            <input
              id={`${formId}-modelId`}
              value={draft.modelId}
              onChange={(event) => update('modelId', event.target.value)}
              placeholder="eleven_multilingual_v2"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-outputFormat`}>Output format (optional)</label>
            <input
              id={`${formId}-outputFormat`}
              value={draft.outputFormat}
              onChange={(event) => update('outputFormat', event.target.value)}
              placeholder="mp3_44100_128"
              autoComplete="off"
            />
          </div>
        </>
      )}

      {draft.provider !== 'browser' && (
        <div className="field">
          <label htmlFor={`${formId}-secret`}>API key</label>
          <input
            id={`${formId}-secret`}
            type="password"
            value={draft.secret}
            onChange={(event) => update('secret', event.target.value)}
            placeholder={
              profile?.hasSecret ? '•••••••• stored — leave blank to keep' : 'sk-…'
            }
            autoComplete="off"
          />
          <p className="field-hint">
            Stored on the server and never returned; leave blank to keep the stored key.
          </p>
        </div>
      )}

      {submitError && (
        <p className="settings-error" role="alert">
          {submitError}
        </p>
      )}

      <div className="profile-form-actions">
        <button type="submit" className="primary-action" disabled={saving}>
          {saving ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}
        </button>
        <button type="button" className="secondary-action" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
