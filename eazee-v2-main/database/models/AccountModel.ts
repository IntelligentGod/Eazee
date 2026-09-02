import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

export default class AccountModel extends Model {
  static table = "accounts";

  //@ts-ignore
  @field("user_id") userId!: string;
  //@ts-ignore
  @field("amazon_username") amazonUsername!: string;
  //@ts-ignore
  @field("amazon_session_id") amazonSessionId!: string;
  //@ts-ignore
  @field("amazon_email") amazonEmail!: string;
  //@ts-ignore
  @field("integration_successful") integrationSuccessful!: boolean;
}
