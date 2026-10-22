# @chronoframe/console

Nuxt layer containing shared dashboard pages, layout, settings forms, upload UI,
and client composables. Extend this layer from an application that supplies Nuxt
UI, Pinia, translations and the session adapter. Authentication is enforced by
server APIs; the dashboard session check is a presentation guard.

The entry sets `runtimeConfig.public.console`: `apiBase` (application API origin),
`signInPath`, `galleryPath`, and optional `navigation` groups. Issued storage URLs
are not prefixed. The Self-hosted entry retains its existing defaults.
