// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCompactActionSystemMessages } = require('../../prompt');

const baseContext = {
  userTimezone: 'Asia/Kolkata',
  nowLocalIso: '2026-03-22T22:30:00+05:30',
  activeSessionSummary: '',
  lastResults: [],
  createdTodoItems: [],
  lastEmailDraft: null,
  lastEmailItems: [],
  lastEmailPageToken: '',
  lastCalendarItems: [],
  createdCalendarItems: [],
  lastDayPlan: null,
};

describe('buildCompactActionSystemMessages', () => {
  it('treats calendar tab requests as calendar events by default', () => {
    const messages = buildCompactActionSystemMessages({
      ...baseContext,
      surface: 'calendar',
    });

    expect(messages[0]?.content).toContain('Inside the calendar tab, assume the user wants a calendar event by default.');
    expect(messages[0]?.content).toContain('Never ask whether something should be a calendar event or a todo or task.');
    expect(messages[0]?.content).toContain('If the user gives a title with a time but no date, ask only for the day.');
  });

  it('does not add the calendar-only routing rule to todo tab prompts', () => {
    const messages = buildCompactActionSystemMessages({
      ...baseContext,
      surface: 'todo',
    });

    expect(messages[0]?.content).not.toContain('Inside the calendar tab, assume the user wants a calendar event by default.');
  });
});
