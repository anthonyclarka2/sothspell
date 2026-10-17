import { useCallback, useEffect, useState } from 'react';
import { fetchSettings, type SettingsResponse } from '../lib/settings-api.js';
import { ProfileSection } from '../components/settings/ProfileSection.js';

/**
 * The `/settings` route: one place to configure the authoring model and the
 * narration voice. The page keeps the last good payload on screen while a
 * reload is in flight so test results and the open form are not destroyed by a
 * refresh after every action.
 */
export function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchSettings());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="page settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <p>
          Connection profiles decide which model authors tours and which voice narrates
          them. API keys are stored on this machine and never leave the server.
        </p>
      </header>

      {error && !data && (
        <div className="notice" role="alert">
          <strong>Settings did not load.</strong> {error}
        </div>
      )}

      {!data && loading && <p className="notice">Loading settings…</p>}

      {data && (
        <>
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
          <ProfileSection
            kind="authoring"
            title="Authoring"
            description="The model that plans and writes a tour, used by authoring, in-tour questions, and drilldown."
            profiles={data.profiles.filter((profile) => profile.kind === 'authoring')}
            env={data.env}
            onChanged={reload}
          />
          <ProfileSection
            kind="narration"
            title="Narration"
            description="The voice that reads a tour in listen mode. Text is always available; cloud audio is optional."
            profiles={data.profiles.filter((profile) => profile.kind === 'narration')}
            env={data.env}
            onChanged={reload}
          />
        </>
      )}
    </div>
  );
}
