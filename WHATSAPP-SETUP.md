# WhatsApp alerts for Meet Pings

Status: **built, not configured.** Meet Pings work fully in the app without this. Until the settings
below are added, the server answers `501 not configured` and no WhatsApp message is sent.

## How it works
1. Someone sends a Meet Ping. The ping and the recipient's in-app notification are saved together.
2. The sender's app then calls `POST /api/meetping/notify` (a Vercel server function) with their sign-in token.
3. The server checks the token belongs to the sender, claims the ping once (so it can never send twice),
   reads the recipient's private opt-in (`users/{uid}/profile/me`: `whatsappOptIn`, `whatsappPhone`),
   and sends the approved template through the WhatsApp Business Cloud API.
4. The result (`sent`, `skipped`, `failed`) is saved on the ping. Delivery updates (`delivered`, `read`)
   arrive at `/api/whatsapp/webhook`, checked against your app secret.
A WhatsApp failure never removes or changes the in-app Meet Ping.

## What you need
1. A Meta Business account and a WhatsApp Business Cloud API app (developers.facebook.com).
2. A phone number added to it (not one already used in the WhatsApp app).
3. An approved **utility** message template, for example named `meet_ping`, language `en`, body:
   `Hi {{1}}! {{2}} would love to connect with you at {{3}}. They've sent you a Meet Ping on Gather. Open Gather to view the request and connect: https://gatherapp-live.vercel.app/inbox`
4. A permanent access token (System User token) with `whatsapp_business_messaging`.
5. A Firebase service account key: Firebase console → Project settings → Service accounts → Generate new private key.

## Vercel environment variables (Production)
| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole JSON key file, as one line |
| `WHATSAPP_TOKEN` | The access token |
| `WHATSAPP_PHONE_NUMBER_ID` | From the WhatsApp app's API setup page |
| `WHATSAPP_TEMPLATE` | Template name, e.g. `meet_ping` |
| `WHATSAPP_TEMPLATE_LANG` | e.g. `en` (optional) |
| `WHATSAPP_APP_SECRET` | App secret (for delivery-status webhooks) |
| `WHATSAPP_VERIFY_TOKEN` | Any secret string; enter the same one in Meta's webhook settings |

Webhook URL to give Meta: `https://gatherapp-live.vercel.app/api/whatsapp/webhook` (subscribe to `messages`).

## Costs and plan limits
- **Meta** charges per template message (utility category in India is roughly ₹0.12–0.15 each at the
  time of writing; check Meta's current pricing). A free monthly allowance may apply.
- **Firebase**: works on the free Spark plan. The server uses the Admin SDK; its reads and writes count
  towards the normal free quota. No Cloud Functions (Blaze) are needed.
- **Vercel**: the server routes run as Vercel functions. Vercel's free Hobby plan is for non-commercial
  use; commercial use needs a Pro plan.
