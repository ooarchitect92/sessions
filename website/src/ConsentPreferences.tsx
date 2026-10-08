import { useEffect, useState } from 'react';

interface ConsentState {
  analytics: boolean;
  advertising: boolean;
  updatedAt: string;
}

const storageKey = 'sessions.public.consent.v1';

function readConsent(): ConsentState {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return { analytics: false, advertising: false, updatedAt: '' };
    const parsed = JSON.parse(stored) as Partial<ConsentState>;
    return {
      analytics: parsed.analytics === true,
      advertising: parsed.advertising === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return { analytics: false, advertising: false, updatedAt: '' };
  }
}

export function ConsentPreferences() {
  const [state, setState] = useState<ConsentState>(() => readConsent());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [state.analytics, state.advertising]);

  const save = () => {
    const next = { ...state, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setState(next);
    setSaved(true);
  };

  return (
    <div className="consent-panel">
      <div className="consent-option">
        <div>
          <strong>Essential website operation</strong>
          <p>Required for navigation, forms, booking/event journeys, security, and saved preferences.</p>
        </div>
        <span className="required-pill">Always on</span>
      </div>
      <label className="consent-option">
        <div>
          <strong>Optional analytics</strong>
          <p>
            Permission for future first-party or configured analytics. The current public website does
            not activate a third-party analytics tag by default.
          </p>
        </div>
        <input
          type="checkbox"
          checked={state.analytics}
          onChange={(event) => setState((current) => ({ ...current, analytics: event.target.checked }))}
        />
      </label>
      <label className="consent-option">
        <div>
          <strong>Optional advertising measurement</strong>
          <p>
            Permission for future configured advertising measurement. No advertising SDK is activated by
            this preference alone.
          </p>
        </div>
        <input
          type="checkbox"
          checked={state.advertising}
          onChange={(event) =>
            setState((current) => ({ ...current, advertising: event.target.checked }))
          }
        />
      </label>
      <button className="btn primary" type="button" onClick={save}>
        Save preferences
      </button>
      <p className="preference-status" aria-live="polite">
        {saved
          ? 'Preferences saved on this device.'
          : state.updatedAt
            ? `Last saved ${new Date(state.updatedAt).toLocaleString()}.`
            : 'No optional preference has been saved yet.'}
      </p>
    </div>
  );
}
