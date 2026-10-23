# @chronoframe/gallery

Nuxt layer for public gallery routes, albums and visitor grants, photo viewing,
filters, maps and common UI. It owns public settings state, shared presentation
utilities and translations. Console-only settings forms live in the console
layer; gallery settings requests use only the public secret-filtered endpoint.

The host supplies the session adapter and `runtimeConfig.public.gallery.apiBase`.
The entry owns its photo query and chooses public or authenticated data; the
viewer accepts that collection. This layer never imports console or server
implementations. Shared source modules are available through `./shared/*`.

Entry middleware installs a request-local `EntrySiteContext` before rendering.
Shared API helpers derive portal/public paths from that context and frame async
cache keys with its Site/audience/principal scope. Site/account changes clear
settings and viewer state; late settings responses cannot repopulate the old scope.
API instances reject calls after their creating Site/account scope changes.
Self-hosted uses its existing unprefixed APIs when no platform context is installed.
Public capability flags describe available UI features, not authorization.
