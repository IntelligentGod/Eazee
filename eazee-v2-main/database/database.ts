import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Platform } from 'react-native';

import schema from './schema';
import migrations from './migrations';
import NoteModel from './models/NoteModel';
import FolderModel from './models/FolderModel';
import EventModel from './models/EventModel';
import AppSettingsModel from './models/AppSettingsModel';
import TokenModel from './models/TokenModel';
import AccountModel from './models/AccountModel';
import TodoModel from './models/TodoModel';
import EmailModel from './models/EmailModel';
import UserPreferenceModel from './models/UserPreferenceModel';
import ChatSessionModel from './models/ChatSessionModel';
import ChatMessageModel from './models/ChatMessageModel';

const adapter = new SQLiteAdapter({
  schema,
  // JSI for iOS for better performance
  jsi: Platform.OS === 'ios',
  dbName: 'NotesApp',
  migrations,
});

export const database = new Database({
  adapter,
  modelClasses: [NoteModel, FolderModel, EventModel, AppSettingsModel, TokenModel, AccountModel, TodoModel, UserPreferenceModel, EmailModel, ChatSessionModel, ChatMessageModel],
});