import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type { Query } from '@nozbe/watermelondb';
import type ChatMessageModel from './ChatMessageModel';

export default class ChatSessionModel extends Model {
  static table = 'chat_sessions';

  static associations = {
    chat_messages: { type: 'has_many' as const, foreignKey: 'session_id' },
  };

  // @ts-ignore
  @text('title') title!: string;
  // @ts-ignore
  @text('summary') summary?: string;
  // @ts-ignore
  @field('pinned') pinned!: boolean;
  // @ts-ignore
  @field('last_message_at') lastMessageAt?: number;
  // @ts-ignore
  @readonly @date('created_at') createdAt!: Date;
  // @ts-ignore
  @readonly @date('updated_at') updatedAt!: Date;

  // @ts-ignore
  @children('chat_messages') messages!: Query<ChatMessageModel>;
}
