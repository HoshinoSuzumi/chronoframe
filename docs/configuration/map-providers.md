# Maps and Locations

Open **Site settings → Maps and locations**. Map display and place-name lookup are configured separately: map tokens load the map, while location services turn photo GPS coordinates into city and country names. Enabling maps cannot add a shooting location to a photo without GPS.

## Choose a map service

| Option   | Renderer                   | Default map data | Required credential                     |
| -------- | -------------------------- | ---------------- | --------------------------------------- |
| MapLibre | Open-source MapLibre GL JS | MapTiler         | MapTiler API key for the built-in style |
| Mapbox   | Mapbox GL JS               | Mapbox           | Mapbox public access token              |

::: info Renderer and map data service
MapLibre is the renderer; MapTiler supplies map data. The built-in MapLibre style follows the site's light/dark theme. A custom style overrides it. Check each provider's current terms, allowances and pricing.
:::

<DocTabs label="Map service" :tabs="[{ id: 'maplibre', label: 'MapLibre + MapTiler' }, { id: 'mapbox', label: 'Mapbox' }]">

<template #maplibre>

## MapLibre + MapTiler

1. Sign in to [MapTiler Cloud](https://cloud.maptiler.com/).
2. Create or copy a key for your gallery on the [API keys page](https://cloud.maptiler.com/account/keys/).
3. Choose **MapLibre** in ChronoFrame and paste the key into its token field. Leave the style empty to start with the built-in map.
4. Set **Allowed HTTP origins** for the key to your gallery origin, such as `https://gallery.example.com`. Add `http://localhost:3000` for local testing.
5. Save and open the globe or a GPS-tagged photo to check the map.

::: warning Restrict where the key can be used
The browser uses this key, so it is not a server-only secret. See the [MapTiler API key guide](https://docs.maptiler.com/guides/credentials/api-key/) for origin restrictions.
:::

### Custom styles

Copy a MapLibre-compatible **Style JSON URL** from the MapTiler map page and enter it in the MapLibre style field, for example:

```text
https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_MAPTILER_KEY
```

::: tip Use the Style JSON URL

- Enter a style URL, not a preview page or embedded HTML.
- Use your own key in the URL and check it when rotating keys.
- Self-hosted tiles, fonts and sprites must be accessible to visitors' browsers with appropriate CORS headers.

:::

</template>

<template #mapbox>

## Mapbox

1. Sign in to [Mapbox](https://console.mapbox.com/).
2. Create a public token on the [Access tokens page](https://console.mapbox.com/account/access-tokens/). It normally starts with `pk.`; retain read access needed for map styles, tiles and fonts.
3. Choose **Mapbox** in ChronoFrame and enter the public token. Do not enter a secret `sk.` token.
4. Add **URL restrictions** for the gallery and any local testing address. Create a dedicated token: the default public token cannot have URL restrictions.
5. Leave the style empty to use Mapbox Standard. Save and open a map to check the result.

See [Mapbox token management](https://docs.mapbox.com/accounts/guides/tokens/) for creation and restrictions.

### Custom styles

Choose or create a style in Mapbox Studio, copy its **Style URL** from the sharing panel and enter it in the Mapbox style field:

```text
mapbox://styles/YOUR_USERNAME/YOUR_STYLE_ID
```

The token must be able to read the style. Do not use the Studio editor URL.

</template>

</DocTabs>

## Place-name lookup

Location settings further down the same page include:

- **Place-name language**: controls names saved by future lookups; reindex existing photo locations to update them.
- **Mapbox reverse-geocoding token**: used for server requests, independently of the browser map token. URL restrictions can reject server requests, so do not simply reuse an origin-restricted map token.
- **Nominatim URL**: use it for a self-hosted service or proxy; otherwise keep the default.

MapLibre can display maps while Mapbox or Nominatim identifies places. Troubleshoot map display and place-name lookup separately.

## Configure later and troubleshoot

::: tip Configure maps later
You can skip the token during setup and add it here later. Uploads and photo management still work. MapLibre views indicate that setup is missing only when neither a token nor a custom style is configured; the built-in MapTiler style requires a key.
:::

For blank maps or 401 / 403 responses, check the provider, token, current URL restrictions and access to styles, tiles and fonts. Update origin restrictions when moving from localhost to a public domain.
