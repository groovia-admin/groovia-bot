# Groovia Bot — WhatsApp Webhook

Production-ready WhatsApp Cloud API webhook.

## Setup

1. Copy env vars: `cp .env.example .env`
2. Fill in values from Meta App Dashboard
3. Install: `npm install`
4. Run: `npm start`

## Endpoints

- `GET  /health`   — Health check
- `GET  /webhook`  — Meta verification
- `POST /webhook`  — Meta event notifications (signature-verified)

## Environment Variables

| Key | Description |
|---|---|
| `PORT` | Server port (Railway sets automatically) |
| `NODE_ENV` | `production` or `development` |
| `VERIFY_TOKEN` | Token you set in Meta webhook config |
| `APP_SECRET` | Meta App Secret (from App Settings → Basic) |
| `WHATSAPP_TOKEN` | WhatsApp API access token |
| `PHONE_NUMBER_ID` | WhatsApp business phone number ID |
| `GRAPH_API_VERSION` | e.g. `v21.0` |

## Deploy

Push to `main` — Railway auto-deploys.