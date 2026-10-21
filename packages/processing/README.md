# Processing

`createPhotoProcessor` composes media decoding, HEIC conversion, metadata, WebP/ThumbHash, EXIF, geocoding, Motion Photo and Live Photo discovery. It receives storage, EXIF tooling, geocoding, policy and stage/cancellation callbacks explicitly. It has no framework or database imports and returns a result for core validation and transactional publication.

The embedded adapter supplies a storage wrapper that admits writes only while its lease is valid and writes derived objects under a unique attempt directory. Unpublished attempt outputs are cleaned without touching another attempt or the original source. A final source digest check and database generation check precede publication. Storage providers and native tools retain their existing self-hosted capabilities.
