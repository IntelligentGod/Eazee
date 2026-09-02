import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 60,
  tables: [
    tableSchema({
      name: "folders",
      columns: [
        { name: "name", type: "string" },
        { name: "expanded", type: "boolean" },
        { name: "parent_id", type: "string", isOptional: true },
        { name: 'total_notes', type: 'number' },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "notes",
      columns: [
        { name: "title", type: "string" },
        { name: "content", type: "string" },
        { name: "folder_id", type: "string" },
        { name: "timestamp", type: "number" },
        { name: "edited", type: "boolean" },
        { name: "event_id", type: "string", isOptional: true }, 
        { name: "pinned", type: "boolean", isOptional: true}, 
      ],
    }),
    tableSchema({
      name: "events",
      columns: [
        { name: "title", type: "string" },
        { name: "start_date", type: "number" },
        { name: "start_time", type: "number" },
        { name: "end_date", type: "number" },
        { name: "end_time", type: "number" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
        { name: "google_event_id", type: "string", isOptional: true },
        { name: 'is_google_event', type: 'boolean' }, 
        { name: 'is_todo', type: 'boolean', isOptional: true },
        { name: 'location', type: 'string', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'tokens',
      columns: [
        { name: 'access_token', type: 'string' },
        { name: 'expiration_time', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'app_settings',
      columns: [
        { name: 'last_sync_time', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'accounts',
      columns: [
        { name: 'user_id', type: 'string' },
        { name: 'amazon_username', type: 'string' },
        { name: 'amazon_session_id', type: 'string' },
        { name: 'amazon_email', type: 'string' },
        { name: 'integration_successful', type: 'boolean' },
      ]
    }),
    tableSchema({
      name: 'todos',
      columns: [
        { name: 'text', type: 'string' },
        { name: 'completed', type: 'boolean' },
        { name: 'details', type: 'string', isOptional: true },
        { name: 'due_date', type: 'number', isOptional: true },
        { name: 'has_due_time', type: 'boolean' },
        { name: 'starred', type: 'boolean' },
        { name: 'workspace', type: 'string' },
        { name: 'amazon_url', type: 'string', isOptional: true },
        { name: 'is_amazon_url_loaded', type: 'boolean' },
        { name: 'amazon_url_load_attempts', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'email_id', type: 'string', isOptional: true },
        { name: 'type', type: 'string', isOptional: true },
        { name: 'started_at', type: 'number', isOptional: true },
        { name: 'progress', type: 'number', isOptional: true },
        { name: 'reminder_enabled', type: 'boolean', isOptional: true },
        { name: 'reminder_mode', type: 'string', isOptional: true },
        { name: 'reminder_minutes_before', type: 'number', isOptional: true },
        { name: 'notification_id', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'user_preferences',
      columns: [
        { name: 'workspace_name', type: 'string' },
        { name: 'display_name', type: 'string', isOptional: true },
        { name: 'original_name', type: 'string', isOptional: true },
        { name: 'color', type: 'string' },
        { name: 'todo_type', type: 'string', isOptional: true },
      ]
    }),
    tableSchema({
      name: 'emails',
      columns: [
        { name: 'from', type: 'string' },
        { name: 'subject', type: 'string' },
        { name: 'body', type: 'string' },  
        { name: 'snippet', type: 'string', isOptional: true },
        { name: 'gmail_id', type: 'string' },
        { name: 'email_date', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'chat_sessions',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'summary', type: 'string', isOptional: true },
        { name: 'pinned', type: 'boolean' },
        { name: 'last_message_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
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
});
