import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class TokenModel extends Model {
  static table = 'tokens';
  //@ts-ignore
  @field('access_token') accessToken!: string | null;
  //@ts-ignore
  @field('refresh_token') refreshToken!: string | null;
}