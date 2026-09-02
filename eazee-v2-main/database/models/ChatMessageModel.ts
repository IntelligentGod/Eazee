import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type { Relation } from '@nozbe/watermelondb';
import type ChatSessionModel from './ChatSessionModel';

export default class ChatMessageModel extends Model {
  static table = 'chat_messages';

  static associations = {
    chat_sessions: { type: 'belongs_to' as const, key: 'session_id' },
  };

  // @ts-ignore
  @text('session_id') sessionId!: string;
  // @ts-ignore
  @text('role') role!: 'user' | 'assistant' | 'tool';
  // @ts-ignore
  @text('content') content?: string;
  // @ts-ignore
  @text('card_json') cardJson?: string;
  // @ts-ignore
  @readonly @date('created_at') createdAt!: Date;

  // @ts-ignore
  @relation('chat_sessions', 'session_id') session!: Relation<ChatSessionModel>;
}
