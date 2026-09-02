import { Model } from "@nozbe/watermelondb";
import { field, date } from "@nozbe/watermelondb/decorators";

export default class EventModel extends Model {
  static table = "events";
  // @ts-ignore
  @field("title") title!: string;
  // @ts-ignore
  @date("start_date") startDate!: Date;
  // @ts-ignore
  @field("start_time") startTime!: number;
  // @ts-ignore
  @date("end_date") endDate!: Date;
  // @ts-ignore
  @field("end_time") endTime!: number;
  // @ts-ignore
  @date("created_at") createdAt!: Date;
  // @ts-ignore
  @date("updated_at") updatedAt!: Date;
  // @ts-ignore
  @field('google_event_id') googleEventId?: string;
  // @ts-ignore
  @field('is_google_event') isGoogleEvent!: boolean;
  // @ts-ignore
  @field('is_todo') isTodo!: boolean;
  // @ts-ignore
  @field('location') location?: string;
  // @ts-ignore
  @field('latitude') latitude?: number;
  // @ts-ignore
  @field('longitude') longitude?: number;
  // @ts-ignore
  @field('attendees') attendees?: Array<{ email: string; responseStatus?: string }>;

}
