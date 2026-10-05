# Changelog

Changes grouped by stable version. 1.0.0 includes all changes since v0.14.1, without separate beta or release-candidate entries. Historical entries are checked against adjacent stable Git tags; early prerelease tags are omitted.

## v1.0.0

[Upgrade guide](/guide/updates) · [Changes since v0.14.1](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.14.1...main)

### Features

- Add a first-run wizard for the administrator, site, storage and map, with the option to add a map token later.
- Store settings in the database and manage storage schemes, site details, upload limits, duplicate handling and privacy in the dashboard.
- Add hidden and password-protected albums, album and photo ordering, and shares scoped to protected albums.
- Add upload-date sorting, persistent table columns, Shift range selection and recent activity in the dashboard.
- Add dashboard language switching, Russian translations and broader translation coverage.
- Configure GitHub OAuth in system settings, choose a place-name language and add custom analytics scripts.

### Improvements

- Refine globe interactions, reactions, photo editing and the upload queue layout.
- Add log filtering and virtual scrolling; improve live delivery, history loading and scrolling.
- Confirm storage scheme deletion and provide guidance when map setup is missing.
- Update OG image generation and dependencies; move linting and formatting to Oxlint / Oxfmt.

### Bug fixes

- Fix dashboard settings being reset on restart; use legacy environment values for initialization and preserve saved custom settings.
- Fix sign-in redirects after setup and migration of older storage settings.
- Fix viewer navigation escaping the current album, album cover fallbacks and empty-album placeholders.
- Fix stalled local-file loading progress, processing failures from invalid EXIF dates and file-path errors during metadata editing.
- Fix large-image zoom on iOS Safari and viewer position, scale and flicker after window resizing.
- Use HeadObject for S3 metadata; fix custom-script attribute parsing and translation calls in asynchronous flows.

### Security fixes

- Restrict anonymous access to photos in hidden albums, including photos also assigned to public albums.
- Harden protected-album grants, media access, share scope and proxy limits to prevent access through alternate routes.
- Use asynchronous scrypt for album passwords, validate minimum length and rate-limit unlock attempts.
- Harden media filename handling and photo access checks.

### Deployment and documentation

- Run database migrations at startup and generate a persistent session secret in the data directory.
- Rebuild the Docker runtime with TLS certificates, Perl and ExifTool dependencies; the runtime has no shell or package manager.
- Archive environment-based instructions under Legacy and use the wizard for new installations.

### Upgrade notes

- Keep old environment variables for the initial migration and verify settings and storage paths in the dashboard.
- Album passwords cannot block direct access through public S3, OpenList or CDN URLs; manage external storage access too.
- Photos in hidden albums are excluded from anonymous access, which can affect their display in public albums.
- Back up all data before upgrading and restore the pre-migration database when rolling back.

## v0.14.1

2025-10-28 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.14.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.14.0...v0.14.1)

### Bug fixes

- Default the S3 region to auto.

## v0.14.0

2025-10-27 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.14.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.13.1...v0.14.0)

### Improvements

- Reorganize the dashboard around a sidebar layout.

### Bug fixes

- Correct the photo preview action label.

## v0.13.1

2025-10-25 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.13.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.13.0...v0.13.1)

### Features

- Add shuffled photo ordering.
- Support a custom Nominatim service URL.

### Bug fixes

- Fix viewer behavior on direct photo links and Mapbox token lookup.

## v0.13.0

2025-10-24 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.13.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.12.2...v0.13.0)

### Features

- Add OpenList storage support.
- Add original-image downloads, batch downloads and site sharing.

### Bug fixes

- Fix photo editing when storage has no prefix.

## v0.12.2

2025-10-22 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.12.2) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.12.1...v0.12.2)

### Features

- Add configurable photo table columns and rating editing.
- Combine thumbnail and Live Photo previews in one modal.

## v0.12.1

2025-10-21 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.12.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.12.0...v0.12.1)

### Bug fixes

- Fall back to English for unmapped locale codes.

## v0.12.0

2025-10-20 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.12.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.11.0...v0.12.0)

### Features

- Add partial EXIF editing and expandable task rows with error details.

### Bug fixes

- Stop marking failed reverse geocoding tasks as successful.

### Behavior changes

- Remove the separate location management page.

## v0.11.0

2025-10-20 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.11.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.10.0...v0.11.0)

### Features

- Add tiled rendering for large images and thumbnail previews in the dashboard.

### Bug fixes

- Scale oversized images on mobile to avoid GPU texture-limit failures.

## v0.10.0

2025-10-19 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.10.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.9.1...v0.10.0)

### Improvements

- Redesign the upload page and localize upload management.

### Features

- Add a back-to-top button.

## v0.9.1

2025-10-18 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.9.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.9.0...v0.9.1)

### Bug fixes

- Fix camera information in the share panel and album button display.

## v0.9.0

2025-10-17 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.9.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.8.1...v0.9.0)

### Features

- Add album browsing and management, with album membership in photo details.

### Improvements

- Return to the originating page when closing the viewer.

## v0.8.1

2025-10-13 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.8.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.8.0...v0.8.1)

### Bug fixes

- Add the missing MapLibre / MapTiler token configuration.

## v0.8.0

2025-10-13 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.8.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.7.2...v0.8.0)

### Features

- Support MapLibre and Mapbox, including dark map styles.

### Improvements

- Show more location and EXIF information in photo descriptions and share previews.

### Bug fixes

- Fix CJK paths in local storage, share-preview thumbnails and Motion Photo boolean parsing.
- Extract GPS coordinates even without completed reverse geocoding.

## v0.7.2

2025-10-11 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.7.2) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.7.1...v0.7.2)

### Features

- Add XMP Motion Photo processing and S3 forcePathStyle support.

### Improvements

- Expand EXIF description fields and add photo deletion confirmation.

### Bug fixes

- Fix motion-photo video paths and file type checks; clean up converted HEIC JPEGs.

## v0.7.1

2025-10-09 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.7.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.7.0...v0.7.1)

### Bug fixes

- Fix S3 URL generation for Alibaba Cloud OSS.

## v0.7.0

2025-10-09 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.7.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.7...v0.7.0)

### Features

- Add local storage, Matomo analytics and photo reactions in the dashboard.

### Improvements

- Expand translations and improve system information reporting on Windows.

### Bug fixes

- Fix home-page city statistics, sign-in text and viewer loading translations.

## v0.6.7

2025-10-07 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.7) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.6...v0.6.7)

### Features

- Add photo reactions, a reaction picker and confetti effects.
- Add GitHub OAuth configuration and analytics for photo views and shares.

### Bug fixes

- Fix long-press behavior on noninteractive elements and database condition exports.

## v0.6.6

2025-10-05 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.6) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.5...v0.6.6)

### Features

- Add site color-theme preference and Google Analytics configuration.

### Bug fixes

- Correct the analytics variable and Traditional Chinese Live Photo labels.

## v0.6.5

2025-10-04 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.5) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.4...v0.6.5)

### Bug fixes

- Fix masonry header width, alignment and responsive layout.

## v0.6.4

2025-10-03 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.4) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.3...v0.6.4)

### Features

- Add photo sharing, social sharing links and OG preview downloads.

## v0.6.3

2025-10-02 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.3) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.2...v0.6.3)

### Features

- Add a dashboard log viewer, live log streaming and file logging.

## v0.6.2

2025-10-01 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.2) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.1...v0.6.2)

### Features

- Add task queue management and translations, plus a Mapbox geocoding token setting.

### Improvements

- Improve handling guidance for Live Photos missing their paired image.

## v0.6.1

2025-09-30 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.0...v0.6.1)

### Improvements

- Expand white-balance translations and undefined-value labels.

### Behavior changes

- Remove path-based EXIF tag extraction.

## v0.6.0

2025-09-27 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.8...v0.6.0)

### Improvements

- Unify service retries, clean up stale tasks at startup and improve queue concurrency.
- Improve upload status, queue cleanup, Live Photo preloading and playback retries.

### Features

- Complete the calendar heatmap and dashboard overview translations.

## v0.5.8

2025-09-27 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.8) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.7...v0.5.8)

### Features

- Add the calendar heatmap component and dashboard overview translations.

### Bug fixes

- Fix a server error in the dashboard overview.

## v0.5.7

2025-09-26 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.7) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.6...v0.5.7)

### Features

- Add a calendar heatmap to the dashboard.

### Improvements

- Refine the dashboard overview and globe buttons.

### Bug fixes

- Use a dashboard title fallback when the site title is unset.

## v0.5.6

2025-09-26 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.6) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.5...v0.5.6)

### Improvements

- Redesign dashboard overview and system status reporting; reduce refresh overhead.

### Bug fixes

- Add extension fallback for HEIC / HEIF detection and correct upload-limit messages.

## v0.5.5

2025-09-25 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.5) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.4...v0.5.5)

### Features

- Add site owner settings.

### Bug fixes

- Rework the masonry layout to fix photo ordering.

### Behavior changes

- Rename the explore map to Globe.

## v0.5.4

2025-09-25 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.4) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.3...v0.5.4)

### Features

- Add a cookie option for non-HTTPS connections. This legacy option is deprecated in 1.0.0.

## v0.5.3

2025-09-25 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.3) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.2...v0.5.3)

### Improvements

- Scroll to the photo in its list when opening it.

### Bug fixes

- Fix route scrolling and jumps to the top when opening photo details.

## v0.5.2

2025-09-24 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.2) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.1...v0.5.2)

### Bug fixes

- Fix map zoom for photo-ID links and dashboard photo action visibility.

## v0.5.1

2025-09-24 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.0...v0.5.1)

### Behavior changes

- Use Mapbox first for reverse geocoding, with Nominatim as a fallback.

## v0.5.0

2025-09-24 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.0) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.3...v0.5.0)

### Improvements

- Rework the photo processing queue and worker pool, add queue APIs and improve progress reporting.

### Bug fixes

- Fix empty-gallery messages and dashboard titles.

## v0.4.3

2025-09-24 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.3) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.2...v0.4.3)

### Bug fixes

- Fix the site avatar setting not taking effect.

### Improvements

- Reduce Docker image size and update dependencies.

## v0.4.2

2025-09-22 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.2) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.1...v0.4.2)

### Features

- Add OG images for link previews.

## v0.4.1

2025-09-21 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.1) · [Code changes](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.0...v0.4.1)

### Improvements

- Run database migration and seeding through tasks.

## v0.4.0

2025-09-21 · [Release notes](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.0)

### Features

- Provide photo uploads, a masonry gallery, WebGL viewer and dashboard.
- Support EXIF, HEIC conversion, Live Photo pairing and playback, map exploration, tags and filters.
- Support password login, Docker deployment and multiple interface languages.

### Bug fixes

- Fix repeated map loading, histogram loading, EXIF keywords and color-space parsing.
