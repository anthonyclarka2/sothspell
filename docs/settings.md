# Settings and Connection Profiles

Preferences are first-class in the next stage. A connection profile is a named
provider configuration for one capability: authoring or narration. Profiles are
managed in the UI and stored under `SOTHSPELL_HOME`.

## Storage

```
$SOTHSPELL_HOME/
  config/profiles.json   connection profiles (0600)
  config/secrets.json    secret values (0600)
```

Profiles and secrets are written atomically. A corrupted file is quarantined and
the service recovers with an empty set rather than crashing. Environment
variables override a stored profile at runtime and are marked read-only in the
UI.

## Profile shape

| Field                     | Meaning                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `id`, `name`              | Stable id and unique-per-kind name                                  |
| `kind`                    | `authoring` or `narration`                                          |
| `provider`                | `openai`, `anthropic`, `openai-compatible`, `elevenlabs`, `browser` |
| `baseUrl`                 | Optional provider base URL                                          |
| `modelId`                 | Model id for authoring                                              |
| `voiceId`, `outputFormat` | Narration voice and output format                                   |
| `secretRef`               | Opaque pointer into the secret store                                |
| `active`                  | At most one active profile per kind                                 |

## API

| Method | Route                                 | Purpose                  |
| ------ | ------------------------------------- | ------------------------ |
| GET    | `/api/settings/profiles`              | List profiles (redacted) |
| POST   | `/api/settings/profiles`              | Create                   |
| PUT    | `/api/settings/profiles/:id`          | Update                   |
| DELETE | `/api/settings/profiles/:id`          | Delete                   |
| POST   | `/api/settings/profiles/:id/activate` | Activate                 |
| POST   | `/api/settings/profiles/:id/test`     | Test the connection      |

Secret values are write-only: a request may include one, but no response, log,
or tour ever contains it. Errors are redacted before they reach the browser.

## UI

`/settings` has an Authoring section and a Narration section. Each lists
profiles with activate/edit/delete actions and a form for name, provider, base
URL, model or voice id, output format, and API key. The test action reports
latency and a redacted result through a live region. The page is keyboard-first
and passes the axe gate in empty, filled, and error states.

## Resolution

- Authoring, in-tour questions, drilldown, and narration resolve the active
  profile of their kind.
- `SOTHSPELL_MODEL` overrides the authoring model; `ELEVENLABS_VOICE_ID`
  overrides the narration voice. Environment overrides are read-only in the UI.
- A narration profile with the `browser` provider needs no key and uses browser
  speech.
- Quality reports record the profile name and model id, never the secret.

## Limits

- The file secret store is the v2 default. A keychain-backed `SecretStore` is a
  future adapter behind the same port.
- Provider test calls are real, small, and cached by content hash for narration.
- Real provider round trips remain owner-gated on credentials.
