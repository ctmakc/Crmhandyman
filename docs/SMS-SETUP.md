# SMS setup — Twilio

HandymanPro uses a dedicated Twilio phone number for two-way lead texting. Credentials are stored per workspace in `ChannelIntegration`; there are no shared Twilio credentials in server environment variables.

## 1. Prepare the Twilio number

Use an SMS-capable Twilio number for the workspace. One Twilio number may belong to only one HandymanPro workspace because inbound replies are routed by the number the customer texted.

Have these three values ready:

- Account SID (`AC...`)
- Auth Token
- Twilio phone number in E.164 form, e.g. `+16135550100`

## 2. Save it in HandymanPro

Open **Settings → SMS** and enter the Account SID, Auth Token and phone number.

The Auth Token is write-only in the CRM UI. Once saved, the API reports only that a token exists and a short hint; it never returns the stored token.

The SMS screen should read **READY** after all three values are present and the channel is active.

## 3. Configure inbound messages in Twilio

On the Twilio phone number, set the **A message comes in** webhook to:

`https://YOUR-CRM-DOMAIN/api/webhooks/twilio/sms`

Method: **HTTP POST**.

Do not add query-string secrets. Twilio signs every request with `X-Twilio-Signature`; HandymanPro validates that signature using the workspace's Auth Token before accepting the message.

The reverse proxy must preserve the public host and scheme in `X-Forwarded-Host` and `X-Forwarded-Proto`, which the standard Caddy deployment does.

## 4. Acceptance test

Create a test lead with a mobile phone number and open **Work lead**.

1. Send **New lead · received**. The message should appear as SENT and a NEW lead should become CONTACTED only after Twilio accepts the send.
2. Reply from the mobile phone. The reply should appear as RECEIVED in the same lead.
3. Reply `STOP`. The lead should show OPTED OUT and the CRM must refuse another outbound SMS.
4. Reply `START`. The lead should show OPTED IN and outbound sending should work again.
5. Send a message from a phone number that is not yet a CRM lead. HandymanPro should create an `Inbound SMS` lead rather than leaving the conversation only in Twilio.

## 5. Operational behaviour

Twilio retries can deliver the same webhook more than once. HandymanPro deduplicates inbound deliveries by Twilio `MessageSid` before writing another activity.

The first Beaver Movers rollout stores SMS activity in the existing append-only `AuditLog`. This intentionally avoids a production schema migration for the first client. If real usage requires threads, attachments, delivery-status callbacks or high-volume history, move this layer to a dedicated `Communication` model rather than extending lead notes.

The CRM also persists STOP/START state in lead activity and blocks outbound sends while the latest consent event is STOP. Twilio's own opt-out handling remains an additional provider-side safeguard.
