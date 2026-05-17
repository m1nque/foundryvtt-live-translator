# Live Translator Service

Host-side DeepL translation service for the `Live Translator` Foundry module.

## What It Does

- Receives translation requests from the Foundry client
- Uses the GM host's DeepL API key
- Listens on an internal local port behind the reverse proxy
- Stores a host-side translation cache so repeated requests from different users reuse the same result

## Run

1. Copy `.env.example` to `.env`
2. Fill in `DEEPL_API_KEY`
3. Start the service:

```bash
node server.js
```

Default bind: `127.0.0.1:31001`

Default cache directory:

- Direct service run: `services/live-translator-service/.cache/translations`
- Companion app run: app data folder `state/translator-cache`

## Endpoints

- `GET /health`
- `POST /translate`

## Notes

- This service is meant to run on the GM or Foundry host machine
- It is expected to sit behind the companion app reverse proxy on port `31000`
- Players should hit the proxy, not this service directly
- Cache keys are based on `sourceLanguage + targetLanguage + itemName + descriptionText`
