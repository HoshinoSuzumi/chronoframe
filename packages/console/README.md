# @chronoframe/console

Nuxt layer containing shared dashboard pages, layout, settings forms, upload UI,
and client composables. Extend this layer from an application that supplies Nuxt
UI, Pinia, translations and the session adapter. Authentication is enforced by
server APIs; the dashboard session check is a presentation guard.

The entry sets `runtimeConfig.public.console`: `apiBase` (application API origin),
`signInPath`, `galleryPath`, and optional `navigation` groups. Issued storage URLs
are not prefixed. The Self-hosted entry retains its existing defaults.

Shared console requests use the entry-provided Site context and capability profile.
Storage selectors honor the advertised provider support list; subscriptions close
on a Site/account switch. Authorization is always rechecked by server adapters.
Self-hosted retains instance sessions, SQLite, Local/S3/OpenList, custom scripts,
and unlimited quota. Cloud advertises only implemented platform capabilities;
media management and plan enforcement are delivered by later SaaS phases.
