# 基础页面说明

除拓扑页面外，`internet-map-globe` 保留了基础页面：

- Home
- Dashboard
- Plugin
- Console
- 404

## Home

路径：`/home`

Home 是入口页面，提供主要功能卡片。

## Dashboard

路径：`/dashboard`

Dashboard 用于查看当前 Docker 仿真器中的容器和网络，依赖 `emulator-service`。

## Plugin

路径：`/plugin`

Plugin 页面沿用基础插件页面，用于兼容已有功能。

## Console

路径：`/console`

Console 用于打开容器终端，依赖后端 Docker API 能力。该功能有安全风险，只建议在可信环境中使用。

## 404

访问不存在的路径时进入 404 页面。
