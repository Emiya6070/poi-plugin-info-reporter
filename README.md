# poi-plugin-info-reporter

POI plugin that forwards raw KanColle API request/response payloads to a configured HTTP target.

## Compatibility

Compatible with POI 11 and POI 12. The release package was checked against the POI 11.0.0 and 12.0.0 plugin contracts, using React 18.3.1 and Immutable 4.1.0 / 5.1.9 respectively. Checks cover loading, settings, game events, HTTP forwarding, and unloading/reloading; they do not replace an in-game test in both desktop versions.

## Admiral experience (0.10.0)

Battle result uploads include `admiralExperience.total` from `api_member_exp` and `admiralExperience.gained` from `api_get_exp`, directly from the result response. Returning to port is not required. Sortie, combined-fleet, and practice result APIs are supported; missing experience fields are reported as `null`.

Experience storage and the candidate lookup API require the companion server 0.7.0 or newer. They are server features and are not included in this plugin package.

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
