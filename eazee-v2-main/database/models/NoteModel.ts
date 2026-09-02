import { Model } from "@nozbe/watermelondb";
import { field, text, date } from "@nozbe/watermelondb/decorators";

class Note extends Model {
  static table = "notes";
  // @ts-ignore
  @text("title") title!: string;
  // @ts-ignore
  @text("content") content!: string;
  // @ts-ignore
  @text("folder_id") folderId!: string;
  getFolderId(): string {
    return this.folderId;
  }
  // @ts-ignore
  @date("timestamp") timestamp!: Date;
  // @ts-ignore
  @field("edited") edited!: boolean;
  // @ts-ignore
  @text("event_id") eventId?: string;
  // @ts-ignore
  @field("pinned") pinned: boolean;  
}

export default Note;
