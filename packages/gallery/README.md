# @chronoframe/gallery

Nuxt layer for public gallery routes, albums and visitor grants, photo viewing,
filters, maps and common UI. It owns public settings state, shared presentation
utilities and translations. Console-only settings forms live in the console
layer; gallery settings requests use only the public secret-filtered endpoint.

The host supplies the session adapter and `runtimeConfig.public.gallery.apiBase`.
The entry owns its photo query and chooses public or authenticated data; the
viewer accepts that collection. This layer never imports console or server
implementations. Shared source modules are available through `./shared/*`.
