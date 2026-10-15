# Using ChronoFrame

## Upload and organize photos

Sign in and open `/dashboard`. Select files or drag them onto the Photos page to upload a batch. After upload, background tasks extract EXIF, create thumbnails and identify locations. The task queue shows progress, errors and retry results.

- Sort and filter the photo table and choose which columns to show. ChronoFrame remembers column visibility and supports sorting by upload date.
- Select photos to delete, download, reindex or add them to albums in batches. You can also use Shift + click range selection.
- Edit photo metadata such as title, description and rating.
- Motion Photos with embedded video are also supported. The WebGL viewer provides zoom, pan and tiled rendering for large images.

::: tip Pairing Live Photos
For Apple Live Photos, use matching image and MOV filenames, such as `IMG_1234.heic` and `IMG_1234.mov`. Either file can be uploaded first; pairing can be retried in the dashboard.
:::

## Albums and visibility

Albums group photos by subject. ChronoFrame supports ordering for both albums and the photos within them.

::: warning Hidden albums also affect shared photos
Hidden albums restrict public visibility. ChronoFrame also restricts anonymous access to their photos, even when a photo belongs to a public album as well. Check the public gallery after changing visibility.
:::

ChronoFrame supports album passwords with a minimum of six characters. Visitors must unlock the album to browse it in ChronoFrame, and photo shares retain the album access scope.

::: warning External storage access
Album passwords control access through ChronoFrame. If S3, OpenList or a CDN exposes a direct image URL, someone with that URL may still read the file without opening the album. To protect the files themselves, check the storage and CDN access policies too. Hiding an album cannot revoke an external link that was already public.
:::

## Manage settings in the dashboard

Site details, maps, location services, storage and upload limits can be edited in the dashboard. Settings are stored in the database; there is no need to edit `.env` or rebuild the container.

| Setting   | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| Site      | Title, description, author, avatar and color theme                   |
| Storage   | Add or edit local, S3 and OpenList schemes; choose the active scheme |
| Map       | MapLibre / Mapbox, access token and map style                        |
| Location  | Place-name language, Mapbox geocoding token and custom Nominatim URL |
| System    | Upload size limit, duplicate handling and GitHub login               |
| Privacy   | Automatically remove location data from new uploads                  |
| Analytics | Custom tracking scripts inserted into the page head or body          |

For provider selection, credentials and CORS, see [Storage schemes](/configuration/storage-providers). For tokens and styles, see [Maps and locations](/configuration/map-providers).

::: tip After changing settings

- **Place-name language**: reindex existing locations to update saved names.
- **Storage scheme**: confirm existing photos still open. Switching does not move originals; local paths must remain inside a mounted directory.

:::

::: warning Privacy settings do not clean older files
Location removal on upload applies to future uploads. For existing photos, run the individual or batch removal action and confirm completion in the queue. Check descriptions and tags before publishing too.
:::

## GitHub login

Sign in with the email and password created during setup, then enable GitHub OAuth in system settings and enter the Client ID and Client Secret. Set the OAuth application's callback URL to `https://your-domain/api/auth/github`.

::: info GitHub login does not grant admin access
The email returned by GitHub must match an existing administrator. Enabling OAuth does not grant administrator access to every GitHub user; unauthorized accounts are rejected.
:::

## Troubleshoot uploads

| Symptom            | Where to check                              |
| ------------------ | ------------------------------------------- |
| Upload rejected    | Application and proxy size limits           |
| Storage failure    | Directory permissions or remote credentials |
| Processing failure | Task errors, retry results and the log page |

::: tip Reporting a problem
Include your version, storage type and relevant logs. Remove tokens, credentials and private information first.
:::
