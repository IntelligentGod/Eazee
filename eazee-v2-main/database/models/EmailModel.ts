import { Model } from "@nozbe/watermelondb";
import { field, text, date, readonly } from "@nozbe/watermelondb/decorators";

export default class EmailModel extends Model {
  static table = "emails";

  // @ts-ignore
  @text("from") from!: string;
  // @ts-ignore
  @text("subject") subject!: string;
  // @ts-ignore
  @text("body") body!: string;
  // @ts-ignore
  @text("snippet") snippet?: string;
  // @ts-ignore
  @text("gmail_id") gmailId!: string;
  // @ts-ignore
  @date("email_date") emailDate!: Date;
  // @ts-ignore
  @readonly @date("created_at") createdAt!: Date;
  // @ts-ignore
  @readonly @date("updated_at") updatedAt!: Date;
}
