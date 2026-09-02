import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class UserPreferenceModel extends Model {
  static table = 'user_preferences';

  //@ts-ignore
  @field('workspace_name') workspace_name!: string;
  //@ts-ignore
  @field('display_name') display_name?: string;
  //@ts-ignore
  @field('original_name') original_name?: string;
  //@ts-ignore
  @field('color') color!: string;
  //@ts-ignore
  @field('todo_type') todo_type!: 'basic' | 'progress' | 'slider';
}