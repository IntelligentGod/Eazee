jest.mock('../../../../../database/database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(async () => []),
        })),
      })),
    },
    write: jest.fn(),
  },
}));

jest.mock('../../../../../lib/todoMutations', () => ({
  createTodos: jest.fn(async (inputs: any[]) =>
    (Array.isArray(inputs) ? inputs : []).map((input, index) => ({
      todo: {
        id: `todo-${index + 1}`,
        text: input.text,
        dueDate: input.dueDate,
        hasDueTime: input.hasDueTime,
        workspace: input.workspace,
        starred: input.starred,
      },
    }))
  ),
  deleteTodos: jest.fn(async () => []),
  updateTodos: jest.fn(async () => []),
}));

jest.mock('@/app/context/TokenContext', () => ({
  getAccessTokenStatic: jest.fn(async () => null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { overviewToolHandlers } = require('../overview');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { executeToolCall } = require('../engine');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setLastDayPlan } = require('../memory');

describe('plan_my_day', () => {
  afterEach(() => {
    setLastDayPlan(null);
  });

  it('keeps timed tasks as timed todos when the time is in the text', async () => {
    const result = await overviewToolHandlers.plan_my_day({
      date: '2026-03-18',
      items: [{ type: 'task', text: 'Finish report at 3 pm' }],
    });

    expect(result.calendarItems).toHaveLength(0);
    expect(result.todoItems).toHaveLength(1);
    expect(result.todoItems[0]).toMatchObject({
      text: 'Finish report',
      hasDueTime: true,
    });
    const dueDate = new Date(result.todoItems[0].dueDate);
    expect(dueDate.getHours()).toBe(15);
    expect(dueDate.getMinutes()).toBe(0);
  });

  it('keeps a task start time as the todo due time', async () => {
    const result = await overviewToolHandlers.plan_my_day({
      date: '2026-03-18',
      items: [
        {
          type: 'task',
          text: 'Ship build',
          start: '2026-03-18T18:30:00+05:30',
        },
      ],
    });

    expect(result.calendarItems).toHaveLength(0);
    expect(result.todoItems[0]).toMatchObject({
      text: 'Ship build',
      hasDueTime: true,
    });
    const dueDate = new Date(result.todoItems[0].dueDate);
    expect(dueDate.getHours()).toBe(18);
    expect(dueDate.getMinutes()).toBe(30);
  });

  it('keeps an explicit task out of calendar even with event-like wording', async () => {
    const result = await overviewToolHandlers.plan_my_day({
      date: '2026-03-18',
      items: [{ type: 'task', text: 'Call Alex at 3 pm' }],
    });

    expect(result.calendarItems).toHaveLength(0);
    expect(result.todoItems).toHaveLength(1);
    expect(result.todoItems[0]).toMatchObject({
      text: 'Call Alex',
      hasDueTime: true,
    });
  });

  it('parses event time from the title and keeps it out of the title text', async () => {
    const result = await overviewToolHandlers.plan_my_day({
      date: '2026-03-18',
      items: [{ text: 'Meeting at 9 am' }],
    });

    expect(result.todoItems).toHaveLength(0);
    expect(result.calendarItems).toHaveLength(1);
    expect(result.calendarItems[0]).toMatchObject({
      title: 'Meeting',
    });

    const startDate = new Date(result.calendarItems[0].start);
    const endDate = new Date(result.calendarItems[0].end);
    expect(startDate.getHours()).toBe(9);
    expect(startDate.getMinutes()).toBe(0);
    expect(endDate.getHours()).toBe(10);
    expect(endDate.getMinutes()).toBe(0);
  });

  it('parses event time ranges from text-only event items', async () => {
    const result = await overviewToolHandlers.plan_my_day({
      date: '2026-03-18',
      items: [{ text: 'Hospital visit 2 pm - 3:30 pm' }],
    });

    expect(result.todoItems).toHaveLength(0);
    expect(result.calendarItems[0]).toMatchObject({
      title: 'Hospital visit',
    });

    const startDate = new Date(result.calendarItems[0].start);
    const endDate = new Date(result.calendarItems[0].end);
    expect(startDate.getHours()).toBe(14);
    expect(startDate.getMinutes()).toBe(0);
    expect(endDate.getHours()).toBe(15);
    expect(endDate.getMinutes()).toBe(30);
  });

  it('preserves existing event timing when only the title changes', async () => {
    setLastDayPlan({
      date: '2026-03-18',
      calendarItems: [
        {
          title: 'Meeting',
          start: '2026-03-18T09:00:00+05:30',
          end: '2026-03-18T10:00:00+05:30',
        },
      ],
      todoItems: [],
    });

    const result = await overviewToolHandlers.plan_my_day({
      date: '2026-03-18',
      items: [{ type: 'event', text: 'Team sync' }],
    });

    expect(result.calendarItems[0]).toMatchObject({
      title: 'Team sync',
      start: '2026-03-18T09:00:00+05:30',
      end: '2026-03-18T10:00:00+05:30',
    });
  });

  it('preserves existing timed todos when only the title changes', async () => {
    setLastDayPlan({
      date: '2026-03-18',
      calendarItems: [],
      todoItems: [
        {
          text: 'Finish report',
          dueDate: '2026-03-18T15:00:00+05:30',
          hasDueTime: true,
          priority: 'high',
          starred: true,
        },
      ],
    });

    const result = await overviewToolHandlers.plan_my_day({
      date: '2026-03-18',
      items: [{ type: 'task', text: 'Ship report' }],
    });

    expect(result.todoItems[0]).toMatchObject({
      text: 'Ship report',
      dueDate: '2026-03-18T15:00:00+05:30',
      hasDueTime: true,
    });
  });

  it('shows the plan in a single day-plan card', async () => {
    const result = await executeToolCall(
      {
        name: 'plan_my_day',
        arguments: {
          date: '2026-03-18',
          items: [{ type: 'task', text: 'Finish report at 3 pm', priority: 'high' }],
        },
      },
      { serverUrl: 'http://localhost' }
    );

    expect(result.success).toBe(true);
    expect(result.messages[0]?.content).toContain("Here's the plan for the day.");
    expect(result.messages[0]?.card).toMatchObject({
      type: 'dayPlan',
      date: '2026-03-18',
    });
    expect(result.messages[0]?.card?.todoItems?.[0]).toMatchObject({
      text: 'Finish report',
      priority: 'high',
      hasDueTime: true,
    });
  });

  it('saves a confirmed plan with one unified card', async () => {
    setLastDayPlan({
      date: '2026-03-18',
      calendarItems: [],
      todoItems: [
        {
          text: 'Finish report',
          dueDate: '2026-03-18T15:00:00+05:30',
          hasDueTime: true,
          priority: 'high',
          starred: true,
        },
      ],
    });

    const result = await executeToolCall(
      {
        name: 'save_day_plan',
        arguments: {},
      },
      { serverUrl: 'http://localhost' }
    );

    expect(result.success).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toContain('Saved the plan for the day.');
    expect(result.messages[0]?.card).toMatchObject({
      type: 'dayPlan',
      date: '2026-03-18',
    });
    expect(result.messages[0]?.card?.todoItems?.[0]).toMatchObject({
      text: 'Finish report',
      priority: 'high',
      hasDueTime: true,
    });
  });
});
