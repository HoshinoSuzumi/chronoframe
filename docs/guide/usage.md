# Using ChronoFrame

## Upload and organize photos

Sign in and open `/dashboard`. Select files or drag them onto the Photos page to upload a batch. After upload, background tasks extract EXIF, create thumbnails and identify locations. The task queue shows progress, errors and retry results.

- Sort and filter the photo table and choose which columns to show. ChronoFrame remembers column visibility and supports sorting by upload date.
- Select photos to delete, download, reindex or add them to albums in batches. You can also use Shift + click range selection.
- Edit photo metadata such as title, description and rating.
- For Apple Live Photos, use matching image and MOV filenames, such as `IMG_1234.heic` and `IMG_1234.mov`. Either file can be uploaded first; pairing can be retried in the dashboard.
- Motion Photos with embedded video are also supported. The WebGL viewer provides zoom, pan and tiled rendering for large images.

## Albums and visibility

Albums group photos by subject. ChronoFrame supports ordering for both albums and the photos within them.

Hidden albums restrict public visibility. ChronoFrame also restricts anonymous access to their photos, even when a photo belongs to a public album as well. Check the public gallery after changing visibility.

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

Map settings control display; location settings convert GPS coordinates into place names. After changing the place-name language, reindex existing locations to update names already saved in the database.

Before switching storage schemes, make sure existing photos remain accessible. Selecting a scheme does not automatically move originals to the new storage. Local paths must be inside a mounted directory to survive container replacement.

The upload privacy option applies to future uploads; it does not automatically clean previously uploaded files. For existing photos, use the individual or batch location-removal action and confirm completion in the task queue. Check descriptions and tags for information you do not want to publish as well.

## GitHub login

Sign in with the email and password created during setup, then enable GitHub OAuth in system settings and enter the Client ID and Client Secret. Set the OAuth application's callback URL to `https://your-domain/api/auth/github`.

The email returned by GitHub must match an existing administrator. Enabling OAuth does not grant administrator access to every GitHub user; unauthorized accounts are rejected.

## Troubleshoot uploads

Use the task queue for processing errors and the log page for live and historical logs. For rejected uploads, check both the application and proxy size limits. For storage failures, check directory permissions or remote credentials. Include your version, storage type and relevant logs when reporting a problem, removing tokens and secrets first.
