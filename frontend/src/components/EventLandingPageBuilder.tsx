import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  EventBranding,
  EventLandingSection,
} from '@sessions/contracts';
import { useMemo, useState } from 'react';
import { api, type EventRecord } from '../api/client';

const DEFAULT_ORDER: EventLandingSection[] = [
  'ABOUT',
  'PRESENTERS',
  'DETAILS',
];

function normalizedBranding(event: EventRecord): EventBranding {
  return {
    primaryColor: event.branding.primaryColor ?? '#183f38',
    accentColor: event.branding.accentColor ?? '#dcefe8',
    eyebrow: event.branding.eyebrow ?? 'Interactive event',
    heroHeadline: event.branding.heroHeadline ?? event.title,
    heroSubheadline:
      event.branding.heroSubheadline ??
      event.description ??
      'Join a focused, interactive webinar built around useful participation.',
    heroImageUrl: event.branding.heroImageUrl,
    aboutHeading: event.branding.aboutHeading ?? 'About this event',
    aboutBody:
      event.branding.aboutBody ??
      event.description ??
      'Add a concise description of what attendees will learn and why the session matters.',
    ctaLabel: event.branding.ctaLabel ?? 'Register now',
    showPresenters: event.branding.showPresenters ?? true,
    showEventFacts: event.branding.showEventFacts ?? true,
    sectionOrder: event.branding.sectionOrder ?? DEFAULT_ORDER,
  };
}

function sectionName(section: EventLandingSection): string {
  return section === 'ABOUT'
    ? 'About'
    : section === 'PRESENTERS'
      ? 'Presenters'
      : 'Event details';
}

export function EventLandingPageBuilder({
  event,
  onClose,
}: {
  event: EventRecord;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [branding, setBranding] = useState<EventBranding>(() =>
    normalizedBranding(event),
  );

  const save = useMutation({
    mutationFn: () => api.updateEvent(event.id, event.version, { branding }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const previewStyle = useMemo(
    () =>
      ({
        '--landing-primary': branding.primaryColor ?? '#183f38',
        '--landing-accent': branding.accentColor ?? '#dcefe8',
      }) as React.CSSProperties,
    [branding.accentColor, branding.primaryColor],
  );

  const set = <K extends keyof EventBranding>(
    key: K,
    value: EventBranding[K],
  ) => setBranding((current) => ({ ...current, [key]: value }));

  const move = (index: number, delta: number) => {
    const order = [...(branding.sectionOrder ?? DEFAULT_ORDER)];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    set('sectionOrder', order);
  };

  const order = branding.sectionOrder ?? DEFAULT_ORDER;

  return (
    <div className="landing-builder-shell">
      <div className="landing-builder-toolbar">
        <div>
          <span className="eyebrow">Visual landing page</span>
          <h3>{event.title}</h3>
          <p>
            Configure the public event hero, page sections, call-to-action and
            visual theme. The preview uses the same content contract as the public
            website.
          </p>
        </div>
        <div className="landing-builder-toolbar-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="button primary"
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save landing page'}
          </button>
        </div>
      </div>

      <div className="landing-builder-grid">
        <div className="landing-builder-controls">
          <section className="landing-builder-group">
            <div>
              <strong>Hero</strong>
              <small>First impression above the registration fold.</small>
            </div>
            <label>
              Eyebrow
              <input
                maxLength={80}
                value={branding.eyebrow ?? ''}
                onChange={(e) => set('eyebrow', e.target.value)}
              />
            </label>
            <label>
              Headline
              <input
                maxLength={180}
                value={branding.heroHeadline ?? ''}
                onChange={(e) => set('heroHeadline', e.target.value)}
              />
            </label>
            <label>
              Subheadline
              <textarea
                maxLength={500}
                value={branding.heroSubheadline ?? ''}
                onChange={(e) => set('heroSubheadline', e.target.value)}
              />
            </label>
            <label>
              Hero image URL
              <input
                type="url"
                placeholder="https://..."
                value={branding.heroImageUrl ?? ''}
                onChange={(e) =>
                  set('heroImageUrl', e.target.value || undefined)
                }
              />
            </label>
          </section>

          <section className="landing-builder-group">
            <div>
              <strong>About section</strong>
              <small>Explain the value of the event without editing HTML.</small>
            </div>
            <label>
              Heading
              <input
                maxLength={120}
                value={branding.aboutHeading ?? ''}
                onChange={(e) => set('aboutHeading', e.target.value)}
              />
            </label>
            <label>
              Body
              <textarea
                maxLength={5000}
                value={branding.aboutBody ?? ''}
                onChange={(e) => set('aboutBody', e.target.value)}
              />
            </label>
          </section>

          <section className="landing-builder-group">
            <div>
              <strong>Theme and registration</strong>
              <small>Validated colors are rendered as scoped CSS variables.</small>
            </div>
            <div className="form-grid">
              <label>
                Primary color
                <input
                  type="color"
                  value={branding.primaryColor ?? '#183f38'}
                  onChange={(e) => set('primaryColor', e.target.value)}
                />
              </label>
              <label>
                Accent color
                <input
                  type="color"
                  value={branding.accentColor ?? '#dcefe8'}
                  onChange={(e) => set('accentColor', e.target.value)}
                />
              </label>
            </div>
            <label>
              CTA label
              <input
                maxLength={80}
                value={branding.ctaLabel ?? ''}
                onChange={(e) => set('ctaLabel', e.target.value)}
              />
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={branding.showPresenters ?? true}
                onChange={(e) => set('showPresenters', e.target.checked)}
              />
              <span>
                <strong>Show presenter team</strong>
                <small>Only presenter profiles marked public are shown.</small>
              </span>
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={branding.showEventFacts ?? true}
                onChange={(e) => set('showEventFacts', e.target.checked)}
              />
              <span>
                <strong>Show event facts</strong>
                <small>Date, duration, capacity and registration count.</small>
              </span>
            </label>
          </section>

          <section className="landing-builder-group">
            <div>
              <strong>Section order</strong>
              <small>Reorder the public content without changing event data.</small>
            </div>
            <div className="landing-section-order">
              {order.map((section, index) => (
                <div key={section}>
                  <span>{sectionName(section)}</span>
                  <div>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === order.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {save.error ? (
            <div className="error-banner">{save.error.message}</div>
          ) : null}
          {save.isSuccess ? (
            <div className="success-banner">Landing page saved.</div>
          ) : null}
        </div>

        <div className="landing-builder-preview" style={previewStyle}>
          <div className="landing-preview-browser-bar">
            <span />
            <span />
            <span />
            <small>Public event preview</small>
          </div>
          <div className="landing-preview-hero">
            <div>
              <span>{branding.eyebrow || 'Interactive event'}</span>
              <h2>{branding.heroHeadline || event.title}</h2>
              <p>
                {branding.heroSubheadline ||
                  event.description ||
                  'Event description'}
              </p>
              <button type="button">{branding.ctaLabel || 'Register now'}</button>
            </div>
            {branding.heroImageUrl ? (
              <img src={branding.heroImageUrl} alt="" />
            ) : (
              <div className="landing-preview-image-placeholder">Event image</div>
            )}
          </div>

          <div className="landing-preview-sections">
            {order.map((section) => {
              if (section === 'ABOUT') {
                return (
                  <section key={section}>
                    <small>About</small>
                    <h3>{branding.aboutHeading || 'About this event'}</h3>
                    <p>
                      {branding.aboutBody ||
                        event.description ||
                        'Explain what attendees will learn and why they should join.'}
                    </p>
                  </section>
                );
              }
              if (section === 'PRESENTERS') {
                if (branding.showPresenters === false) return null;
                return (
                  <section key={section}>
                    <small>Presenters</small>
                    <h3>Meet the presenter team</h3>
                    <div className="landing-preview-presenters">
                      {(event.presenters ?? []).slice(0, 3).map((presenter) => (
                        <span key={presenter.id}>
                          {presenter.name.charAt(0).toUpperCase()}
                        </span>
                      ))}
                      {(event.presenters?.length ?? 0) === 0 ? (
                        <em>Presenter profiles appear here.</em>
                      ) : null}
                    </div>
                  </section>
                );
              }
              if (branding.showEventFacts === false) return null;
              return (
                <section key={section}>
                  <small>Event details</small>
                  <h3>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(event.startsAt))}
                  </h3>
                  <p>
                    {event.durationMinutes} minutes · {event.timezone}
                  </p>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
