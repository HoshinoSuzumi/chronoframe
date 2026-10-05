---
search: false
---

::: warning 历史文档
本文保留旧版的部署和环境变量说明，仅供维护旧实例时查阅。当前版本请从[快速开始](/zh/guide/getting-started)进入，日常设置在后台完成。
:::

# 地图提供器

ChronoFrame 支持两种地图提供器，您可以根据需求选择合适的提供器。

| 提供器                | 支持 | 额外配置          | 特性                     |
| --------------------- | :--: | ----------------- | ------------------------ |
| [MapLibre](#maplibre) |  ✅  | MapTiler 访问令牌 | 免费开源，支持自定义样式 |
| [Mapbox](#mapbox)     |  ✅  | MapBox 访问令牌   | 免费用量，更好的渲染器   |

## MapLibre

要使用 MapLibre 作为地图提供器，您需要一个 [MapTiler 访问令牌](https://cloud.maptiler.com/account/keys/)。

```bash
NUXT_PUBLIC_MAP_PROVIDER=maplibre
NUXT_PUBLIC_MAP_MAPLIBRE_TOKEN=your_maplibre_access_token
```

### 自定义样式

```bash
# ChronoFrame 已经内置了自动切换的浅色和深色两种样式
# 如果配置自定义样式，将会覆盖默认样式
# 示例: https://demotiles.maplibre.org/globe.json
NUXT_PUBLIC_MAP_MAPLIBRE_STYLE=
```

## MapBox

要使用 Mapbox 作为地图提供器，您需要一个 [Mapbox 访问令牌](https://console.mapbox.com/account/access-tokens/)。

```bash
NUXT_PUBLIC_MAP_PROVIDER=mapbox
NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
```

### 自定义样式

```bash
# 如果配置自定义样式，将会覆盖默认样式
# 示例: mapbox://styles/mapbox/streets-v11
NUXT_PUBLIC_MAP_MAPBOX_STYLE=
```
