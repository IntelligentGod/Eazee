import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class AppSettingsModel extends Model {
  static table = 'app_settings';
    //@ts-ignore
  @field('last_sync_time') lastSyncTime!: number;
}