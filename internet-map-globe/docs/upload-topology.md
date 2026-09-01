# 上传拓扑页面

上传拓扑页面的数据源是本地 `docker-compose.yml`，不依赖当前 Docker 容器是否正在运行。

- 3D 地球：`/upload/3d`
- 2D 平铺地图：`/upload/2d`

生产环境默认地址：

- `http://localhost:8090/pro/upload/3d`
- `http://localhost:8090/pro/upload/2d`

## 适用场景

- 离线查看仿真器生成的 `docker-compose.yml`。
- 分析历史拓扑。
- 导入 collector JSON / PCAP 进行离线播放。
- 在没有 Docker API 的环境中查看拓扑。

## 上传拓扑

1. 打开 `/upload/3d` 或 `/upload/2d`。
2. 上传仿真器生成的 `docker-compose.yml`。
3. 页面解析 services 和 networks 中的 SEED Emulator labels。
4. 生成 IX、普通 Network、Router、Host 以及拓扑链路。

如果 service 或 network 的 labels 中包含地理坐标，页面会优先使用：

```yaml
org.seedsecuritylabs.seedemu.meta.geo.lat: "17.416226"
org.seedsecuritylabs.seedemu.meta.geo.lon: "-6.188696"
```

普通网络节点通常没有地理坐标，页面会尽量放在相连节点的中间位置，减少视觉交叉。

## 离线流量导入

上传页面支持两种导入方式：

1. 只上传 JSON
   - 直接播放 JSON 中的数据包事件。
   - 离线 filter 不可用。

2. 同时上传 JSON 和 PCAP
   - JSON 提供节点、容器、网络等语义信息。
   - PCAP 用于按 tcpdump-like filter 重新筛选数据包。
   - filter 命中后，按 PCAP 包索引回到 JSON 中选择对应事件，保持 JSON 与 PCAP 一一对应。

上传页面的 filter 是离线 filter，只作用于上传的 PCAP；它不会连接实时抓包服务。

## 2D 页面

`/upload/2d` 使用 Cesium 2D 平铺地图。对于跨越东西经度边界的链路，页面会通过相邻地图副本展示跨边界连接，避免链路在边界处看起来被截断。

## 常见问题

- 上传后没有节点：确认文件是否为 SEED Emulator 生成的 `docker-compose.yml`，并且 services / networks 中包含 metadata labels。
- JSON 播放顺序异常：播放以数据包时间戳为准；时间戳缺失或异常会影响顺序。
- 节点匹配不上：页面优先使用容器 name、节点名称、IP、networkName、networkLabel 等稳定字段重新映射。
