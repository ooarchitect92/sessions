import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertEventReminderTemplate,
  renderEventReminderTemplate,
} from './event-reminder-template';

describe('event reminder templates', () => {
  it('renders only supported event variables', () => {
    expect(
      renderEventReminderTemplate(
        'Hi {{attendee_name}}, {{event_title}} starts at {{event_time}}.',
        {
          attendee_name: 'Mina',
          event_title: 'Launch',
          event_time: 'Friday at 10:00 AM',
          event_timezone: 'Asia/Kolkata',
        },
      ),
    ).toBe('Hi Mina, Launch starts at Friday at 10:00 AM.');
  });

  it('rejects unknown variables', () => {
    expect(() =>
      assertEventReminderTemplate(
        'Reminder for {{event_title}}',
        'Use {{workspace_secret}}',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects malformed placeholder syntax', () => {
    expect(() =>
      assertEventReminderTemplate('Reminder {{event_title', 'Body'),
    ).toThrow(BadRequestException);
  });
});
