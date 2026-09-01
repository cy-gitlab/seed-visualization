# 实时拓扑页面

实时拓扑页面的数据源是 Docker API，通过 `emulator-service` 获取当前正在运行的仿真器容器和 Docker 网络。

- 3D 地球：`/map/3d`
- 2D 平铺地图：`/map/2d`

生产环境默认地址：

- `http://localhost:8090/pro/map/3d`
- `http://localhost:8090/pro/map/2d`

## 适用场景

- 仿真器容器已经启动，需要观察当前真实 Docker 拓扑。
- 需要按 AS / IX / 节点类型过滤显示。
- 需要通过 `traffic-observer-service` 设置 filter，实时观察抓包流量动画。

## 加载流程

1. 页面加载后请求 `emulator-service` 的容器和网络数据。
2. 前端将 Docker 容器转换为 Router / Host 节点，将 Docker 网络转换为 IX / 普通 Network 节点。
3. 根据容器接入的网络生成节点与网络之间的拓扑链路。
4. `Map3DGlobe.vue` 根据 scene mode 渲染 3D 地球或 2D 平铺地图。
5. 如果开启 Traffic Replay，页面会连接 `traffic-observer-service`，提交 filter 并接收 WebSocket 数据包事件。

## Traffic Replay

实时页面支持真实抓包：

- 输入 tcpdump-like filter 后点击 Apply，开始抓包。
- 提交空 filter 表示停止抓包。
- 只有点击记录按钮后，收到的数据包才会进入页面回放列表。
- 已记录的数据包可以按 Interval 或 Timeline 模式播放。
- 开启 `Packet path links only` 后，只显示数据包路径相关链路。

## 注意事项

- 实时页面依赖 `emulator-service` 和 Docker API。
- 实时抓包依赖 `traffic-observer-service`。
- 如果拓扑为空，先确认仿真器容器是否已经启动，再点击 Dock 顶部刷新按钮重新加载。
- 如果 filter 后没有动画，检查 filter 是否匹配真实流量，以及抓包服务是否已经发现容器 veth 接口。
