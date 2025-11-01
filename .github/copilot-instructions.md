# ChronoFrame AI Coding Guidelines

ChronoFrame is a high-performance photo management and gallery application built with Nuxt 4, featuring WebGL-accelerated image viewing, comprehensive EXIF processing, and multi-storage backend support.

## Architecture Overview

### Core Components
- **Frontend**: Nuxt 4 app with Vue 3, TypeScript, and TailwindCSS
- **Backend**: Nitro server with SQLite (Drizzle ORM) and multi-provider storage
- **WebGL Package**: Custom `@chronoframe/webgl-image` for hardware-accelerated viewing
- **Processing Pipeline**: Async photo processing with EXIF, thumbnails, and geolocation

### Key Directories
- `app/`: Nuxt 4 application (components, pages, composables)
- `server/`: API routes and backend services
- `packages/webgl-image/`: Standalone WebGL image viewer package
- `shared/`: Type definitions shared between client/server

## Development Workflow

### Essential Commands
```bash
# Development with dependency building
pnpm dev:deps

# Build WebGL package only
pnpm build:deps

# Database operations
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Apply migrations

# Production build
pnpm build
```

### Monorepo Structure
This is a pnpm workspace with the WebGL package as a local dependency. Always use `pnpm dev:deps` for development to ensure the WebGL package builds alongside the main app.

## Storage Architecture

### Multi-Provider System
Storage providers are abstracted through `server/services/storage/interfaces.ts`:
- **S3**: AWS S3-compatible storage (primary)
- **HubR2**: Cloudflare R2 via NuxtHub
- **GitHub**: Git-based storage (experimental)

### Key Pattern
All storage operations go through `useStorageProvider(event)` in API routes. The provider is configured via `NUXT_STORAGE_PROVIDER` environment variable.

## Photo Processing Pipeline

### Async Processing Pattern
Photos are processed via `execPhotoPipelineAsync()` in `server/services/photo/pipeline-async.ts`:

1. **Preprocessing**: HEIC conversion to JPEG, buffer management
2. **Metadata**: Sharp processing for dimensions/format
3. **Thumbnails**: WebP generation with ThumbHash
4. **EXIF**: Comprehensive metadata extraction via exiftool-vendored
5. **Geolocation**: Reverse geocoding for GPS coordinates
6. **LivePhoto**: Video companion file detection and processing

### Critical Implementation Details
- Use `setImmediate()` for non-blocking async operations
- Always handle HEIC → JPEG conversion for Apple photos
- EXIF processing requires temporary file writes (see `server/services/image/exif.ts`)
- Thumbnails are stored as separate WebP files with hash compression

## Component Patterns

### Vue Components

- All components are auto imported via Nuxt (eg. `/app/components/photo/PhotoItem.client.vue` can be used directly as `<PhotoPhotoItem />`)

### Vue Composables
- `usePhotos()`: Central photo data management with injection/provide pattern
- `usePhotoFilters()`: Client-side filtering with reactive state
- `useLivePhotoProcessor()`: WebGL-based MOV to MP4 conversion
- `useWebGLWorkState()`: Performance monitoring for WebGL operations

### Masonry Grid System
The `app/components/masonry/Root.vue` implements a CSS-based masonry layout:
- Auto-responsive column counts based on viewport
- Intersection Observer for performance and date range tracking
- Background LivePhoto processing for visible items only

### WebGL Integration
Register WebGL components via plugin (`app/plugins/chrono-webgl-image.ts`). The package provides hardware-accelerated zooming and panning for large images.

## Database Operations

### Core Database Pattern
**ALWAYS use `useDB()` from `server/utils/db.ts` for all database operations:**

```typescript
import { useDB, tables, eq } from '~~/server/utils/db'

// Get all photos
const photos = await useDB().select().from(tables.photos)

// Get specific photo
const photo = await useDB()
  .select()
  .from(tables.photos)
  .where(eq(tables.photos.id, photoId))
  .get()

// Insert new photo
await useDB().insert(tables.photos).values(photoData)

// Update photo
await useDB()
  .update(tables.photos)
  .set({ title: 'New Title' })
  .where(eq(tables.photos.id, photoId))
```

### Database Configuration
- Uses **better-sqlite3** with Drizzle ORM
- Database file: `data/app.sqlite3` 
- Schema exports types: `User`, `Photo` from `useDB`
- Import patterns: `eq`, `and`, `or`, `sql` from the same file

### Photo Model Schema
Key fields in `server/database/schema.ts`:
- `storageKey`: Original file path in storage
- `originalUrl`: Public URL (may point to JPEG version for HEIC)
- `thumbnailUrl`/`thumbnailHash`: WebP thumbnail with ThumbHash
- `exif`: Full EXIF JSON (typed as `NeededExif`)
- `latitude`/`longitude`/`city`/`country`: Extracted geolocation
- `isLivePhoto`: Boolean with optional video companion file

### Migration Pattern
Use Drizzle migrations for schema changes. Initial user setup is handled in migration files.

## API Conventions

### Authentication
All photo management APIs require `await requireUserSession(event)` using nuxt-auth-utils with GitHub OAuth.

### Upload Flow
1. POST `/api/photos` → Get presigned URL
2. Direct upload to storage provider
3. POST `/api/photos/process` → Trigger async processing
4. Background pipeline processes and saves to database

### Background Processing
Use this pattern for long-running operations:
```typescript
// Return immediately, process in background
processPhotoInBackground(fileKey, storageObject)
return { message: 'Processing started' }
```

## Environment Configuration

### Required Variables
- `NUXT_STORAGE_PROVIDER`: `s3` | `hub-r2` | `github`
- `NUXT_SESSION_PASSWORD`: 32-character random string
- `NUXT_OAUTH_GITHUB_CLIENT_ID/SECRET`: GitHub OAuth app
- `MAPBOX_TOKEN`: For map functionality

### Storage Provider Config
Each provider has specific env vars (see README). S3 is most commonly used with CDN support via `NUXT_PROVIDER_S3_CDN_URL`.

## Performance Considerations

### Image Processing
- Large images are processed asynchronously to avoid blocking
- HEIC files automatically get JPEG versions uploaded
- Thumbnails use WebP format for optimal size/quality
- Use Sharp for all image manipulation

### WebGL Viewer
- Monitors work state via `useWebGLWorkState()`
- Automatically falls back for unsupported devices
- Lazy loads textures for large images

## Code Style

### Database Operations
- **CRITICAL**: Always use `useDB()` from `server/utils/db.ts` - never import Drizzle directly
- Import query helpers: `import { useDB, tables, eq, and, or } from '~~/server/utils/db'`
- Use `tables.photos`, `tables.users` for schema references
- Database file is `data/app.sqlite3` (better-sqlite3 + Drizzle ORM)

### TypeScript
- Strict typing with shared types in `shared/types/`
- Use Drizzle schema types for database operations
- Avoid `any` except for complex EXIF data structures

### Vue/Nuxt
- Composition API throughout
- Use `definePageMeta()` for layouts
- Server-side components for data fetching
- Client-side `.vue` files for interactive components (see `PhotoItem.client.vue`)

When working on this codebase, prioritize understanding the async processing pipeline and storage abstraction layer, as these are the most complex architectural decisions that impact all photo operations.