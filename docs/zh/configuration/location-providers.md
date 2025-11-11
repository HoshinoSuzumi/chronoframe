# 位置提供器

位置提供器在处理照片的过程中，将照片的经纬度信息转换为人类可读的城市或国家名称，这一过程成为逆向地理编码（Reverse Geocoding）。

默认情况下，您不需要进行任何配置，ChronoFrame 会使用 OpenStreetMap Nominatim 作为默认的位置提供器。

然而，在下列情况下，您可能有必要配置自定义的位置提供器：

- 服务器位于中国大陆
- 服务器与 Nominatim 之间的连接受阻

ChronoFrame 支持两种位置提供器，您可以根据需求选择合适的提供器。

## Nominatim

Nominatim 是 OpenStreetMap 提供的免费逆向地理编码服务。默认情况下，ChronoFrame 会使用 Nominatim 作为位置提供器。

如果您的服务器无法连接到 Nominatim 官方的服务，您可以自行搭建反向代理，然后通过下面的配置使用自己的地址：

```bash
NUXT_NOMINATIM_BASE_URL=http://your-nominatim-proxy-url/
```

## Mapbox Search API

Mapbox Search API 提供强大的逆向地理编码功能，能够在中国大陆境内访问。要使用 Mapbox 作为位置提供器，您需要一个 [Mapbox 访问令牌](https://console.mapbox.com/account/access-tokens/)。

```bash
NUXT_MAPBOX_ACCESS_TOKEN=your-mapbox-access-token
```

当您配置了 `NUXT_MAPBOX_ACCESS_TOKEN` 环境变量后，ChronoFrame 会自动使用 Mapbox Search API 作为位置提供器。
