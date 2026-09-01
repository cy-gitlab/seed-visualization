# 通用 Dock、设置和播放说明

`internet-map-globe` 的 3D 和 2D 拓扑页面共用右下角 `EmulatorTopologyDock.vue`。

适用页面：

- `/map/3d`
- `/map/2d`
- `/upload/3d`
- `/upload/2d`

## Dock 折叠与展开

Dock 顶部右侧包含刷新按钮和最小化按钮。

- 刷新：重新加载当前拓扑数据。
- 最小化：折叠 Dock，只保留右下角的小图标；点击小图标可展开。

## Overview

Overview 显示当前拓扑统计：

- AS
- IX
- Networks
- Routers
- Hosts

点击 AS 或 IX 统计卡片，可以打开选择器进行过滤。AS 选择器支持查看该 AS 下的 Router 明细。

## Settings

Settings 包含：

- Search：按节点 ID、label、object、IP、AS、角色、容器名、网络名搜索。
- Node visibility：控制 IX、Network、Router、Host 是否显示。
- Node / link scale：控制节点和链路视觉大小。
- Node labels：控制节点文字标签是否显示。
- Hover details：控制鼠标悬浮时是否显示节点详情卡片。

普通 Network 依赖 Router；Router 隐藏时，Network 开关不可用。

## Traffic Replay

实时页面和上传页面共用播放概念，但数据来源不同。

### 实时页面

- 页面：`/map/3d`、`/map/2d`
- 提交 filter 后由 `traffic-observer-service` 真实抓包。
- WebSocket 收到数据包事件后，页面可以实时动画展示，也可以在开启记录后加入回放列表。

### 上传页面

- 页面：`/upload/3d`、`/upload/2d`
- 导入 collector JSON，或 JSON + PCAP。
- 同时导入 JSON + PCAP 时，可以在浏览器中执行离线 filter。
- 上传页面不连接实时抓包服务。

## Playback timing

- Interval：按固定间隔逐包播放。
- Timeline：按数据包真实时间戳播放，`Timeline speed` 用于倍速缩放。
- Timeline + `Time window = 0`：退化为按真实时间间隔逐包播放。
- Timeline + `Time window > 0`：把窗口内的数据包按时间偏移调度，适合观察多流并行动画。

## Packet path links only

开启后只显示数据包路径相关链路，适合大规模拓扑中突出当前流量路径。
