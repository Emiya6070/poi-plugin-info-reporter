# poi-plugin-info-reporter

POI plugin that forwards raw KanColle API request/response payloads to a configured HTTP target.

## Install

Install `poi-plugin-info-reporter` from the POI plugin manager, or place this package under the POI plugins directory.

## Settings

| Setting | Default | Description |
|---|---|---|
| Target URL | `http://127.0.0.1:3721` | Destination for forwarded payloads |
| Proxy URL | _(empty)_ | Optional HTTP proxy |
| Ingest Token | _(empty)_ | Optional auth token sent with requests |

Config keys (kept for compatibility):

- `plugin.KanColleForwarder.targetUrl`
- `plugin.KanColleForwarder.proxyUrl`
- `plugin.KanColleForwarder.ingestToken`

## License

MIT
