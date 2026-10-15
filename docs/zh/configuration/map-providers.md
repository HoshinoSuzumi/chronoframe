# 地图和位置

打开 **站点设置 → 地图和位置**。这里分别设置地图显示和地点识别：地图令牌用于加载地图，位置服务将照片的 GPS 转换成城市、国家等地名。没有 GPS 的照片不会因为开启地图而自动获得拍摄地点。

## 选择地图服务

| 选项     | 地图由谁渲染        | 默认地图数据 | 需要准备                            |
| -------- | ------------------- | ------------ | ----------------------------------- |
| MapLibre | 开源 MapLibre GL JS | MapTiler     | 使用内置样式时需要 MapTiler API Key |
| Mapbox   | Mapbox GL JS        | Mapbox       | Mapbox 公共访问令牌                 |

::: info 渲染器与地图数据服务
MapLibre 是渲染器，MapTiler 是提供地图数据的服务，两者不是同一个产品。默认 MapLibre 样式随站点明暗主题切换；自定义样式会覆盖内置样式。服务的免费额度、商用要求和计费以各自官网为准。
:::

<DocTabs label="地图服务" :tabs="[{ id: 'maplibre', label: 'MapLibre + MapTiler' }, { id: 'mapbox', label: 'Mapbox' }]">

<template #maplibre>

## MapLibre + MapTiler

1. 注册或登录 [MapTiler Cloud](https://cloud.maptiler.com/)。
2. 在 [API keys](https://cloud.maptiler.com/account/keys/) 页面创建或复制一个供画廊使用的 Key。
3. 在 ChronoFrame 中选择 **MapLibre**，将 Key 填入 MapLibre 令牌字段；第一次使用可留空样式，使用内置地图。
4. 在 MapTiler 的 Key 设置中配置 **Allowed HTTP origins**，填写画廊的来源地址，例如 `https://gallery.example.com`；本地调试另加 `http://localhost:3000`。
5. 保存设置并打开地球仪或带 GPS 的照片详情，检查地图是否正常加载。

::: warning 限制 Key 的使用来源
Key 会被浏览器用于请求地图，所以不要把它当作只存在服务器上的秘密。来源限制的说明见 [MapTiler API Key 指南](https://docs.maptiler.com/guides/credentials/api-key/)。
:::

### 自定义样式

从 MapTiler 地图页面复制与 MapLibre 兼容的 **Style JSON URL**，填入 MapLibre 样式字段。例如：

```text
https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_MAPTILER_KEY
```

::: tip 填写 Style JSON 地址

- 填写样式地址，不要填预览页或嵌入 HTML。
- 地址中的 Key 使用自己的；更换令牌时也检查样式地址。
- 自托管样式的瓦片、字体和图标必须可由访客浏览器访问，并允许跨域请求。

:::

</template>

<template #mapbox>

## Mapbox

1. 注册或登录 [Mapbox](https://console.mapbox.com/)。
2. 在 [Access tokens](https://console.mapbox.com/account/access-tokens/) 创建供网页地图使用的公共令牌，通常以 `pk.` 开头，保留地图样式、瓦片和字体所需的读取权限。
3. 在 ChronoFrame 中选择 **Mapbox**，将公共令牌填入 Mapbox 令牌字段。不要填需要保密的 `sk.` 令牌。
4. 为这个专用令牌添加画廊地址的 **URL restrictions**；需要本地调试时也允许本地地址。默认公共令牌不能添加 URL 限制，因此推荐创建专用令牌。
5. 样式可先留空，应用使用 Mapbox Standard。保存后打开地图确认效果。

获取和限制令牌的方法见 [Mapbox 令牌管理](https://docs.mapbox.com/accounts/guides/tokens/)。

### 自定义样式

在 Mapbox Studio 创建或选择样式，从分享面板复制 **Style URL**，填入 Mapbox 样式字段，例如：

```text
mapbox://styles/YOUR_USERNAME/YOUR_STYLE_ID
```

该样式必须对当前令牌可读，不能填 Studio 编辑页的地址。

</template>

</DocTabs>

## 地点识别

同一页面下方的位置设置包括：

- **地名语言**：控制后续识别保存的地点名称；修改后可重新索引已有照片的位置。
- **Mapbox 反向地理编码令牌**：供服务器查询地点，独立于上面的网页地图令牌。URL 限制可能使服务器请求被拒绝，不要直接复用带网页来源限制的地图令牌。
- **Nominatim 地址**：需要自建服务或代理时填写；普通使用可保留默认值。

可使用 MapLibre 显示地图，同时使用 Mapbox 或 Nominatim 识别地点。地图显示与地点识别失败时，应分别检查各自的配置。

## 暂不配置及排查

::: tip 地图可以稍后设置
设置向导允许先跳过令牌，之后在本页补齐。仍可上传和管理照片。MapLibre 仅在令牌和自定义样式均未配置时提示尚未设置；使用内置 MapTiler 样式需要 API Key。
:::

地图空白或请求出现 401 / 403 时，核对选择的提供器、令牌、当前域名限制，以及样式、瓦片和字体的访问权限。站点从 localhost 换成正式域名后，要同步修改服务商的来源限制。
