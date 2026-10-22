# @chronoframe/media

Framework-independent image and motion-photo processing.

`createImageProcessor(logger)` provides conversion and metadata operations.
`createExifService({ exiftool, tempDir, logger })` accepts an application-owned
ExifTool instance and work directory; its owner must close ExifTool on shutdown.
Thumbnail, histogram and motion-photo helpers accept explicit inputs and optional
logging. Motion-photo extraction accepts a storage provider. Database updates,
upload orchestration, settings and global services remain in the application.

The private workspace exports TypeScript source for Nuxt/Nitro and Node with type
stripping. Sharp and ExifTool require their native/runtime tools. ImageProcessorOptions accepts a byte cap, Sharp pixel limit and cooperative
cancellation signal. Defaults preserve existing behavior; the application chooses
production limits. Native operations settle before retry/resource-slot release.
Cross-process resource policy remains work for the processing/worker stages. `retry` is a reusable subpath used by the
application compatibility entry and injected into geocoding.

Run `pnpm check:packages` and `pnpm test` from the workspace root.
