import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 55,
      steps: [
        addColumns({
          table: 'user_preferences',
          columns: [
            { name: 'display_name', type: 'string', isOptional: true },
            { name: 'original_name', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 56,
      steps: [
        createTable({
          name: 'chat_sessions',
          columns: [
            { name: 'title', type: 'string' },
            { name: 'summary', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'chat_messages',
          columns: [
            { name: 'session_id', type: 'string', isIndexed: true },
            { name: 'role', type: 'string' },
            { name: 'content', type: 'string', isOptional: true },
            { name: 'card_json', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 57,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [
            { name: 'pinned', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 58,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [
            { name: 'last_message_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 59,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'has_due_time', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 60,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'reminder_enabled', type: 'boolean', isOptional: true },
            { name: 'reminder_mode', type: 'string', isOptional: true },
            { name: 'reminder_minutes_before', type: 'number', isOptional: true },
            { name: 'notification_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
