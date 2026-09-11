# InternetMap-Geographic 测试覆盖文档

测试位于 `InternetMap-Geographic/frontend`，对应 CI 为 `.github/workflows/ci-internet-map-geographic.yaml`。

## 运行方式

```bash
cd InternetMap-Geographic/frontend
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test:unit
pnpm exec playwright install chromium
pnpm run test:e2e
```

E2E 自动启动本地开发服务器，使用 `http://127.0.0.1:5174` 和 `/dev` 路由前缀。Docker API、抓包过滤器接口和 WebSocket 使用 mock，无需启动仿真后端。测试仍会初始化 Cesium 页面。

## 单元测试

| 测试文件 | 覆盖范围 |
| --- | --- |
| `tests/unit/utils/tools.test.ts` | 路由展开、父路由查找、图片 URL、Compose 数据转换、缺失数据处理、路由器权重排序 |
| `tests/unit/view/map3dGraph.test.ts` | 无向边键、路由器类型识别、卫星连接路由器的 AS 高亮节点 |
| `tests/unit/view/packetFlowAnalyzer.test.ts` | ICMP 正向路径分析、排除应答包、重复实时数据包的路径去重 |

## E2E 测试

`tests/e2e/emulator-topology-pages.spec.ts` 分别检查 3D 和 2D 路由，共 4 个用例：

| 路由 | 覆盖范围 |
| --- | --- |
| `/dev/map/3d`、`/dev/map/2d` | 使用 mock Docker API 数据加载实时拓扑页面，显示对应标题及节点/链路统计 |
| `/dev/upload/3d`、`/dev/upload/2d` | 显示 Compose 文件上传入口和解析按钮 |

辅助数据位于 `tests/e2e/fixtures/map.ts`，后端 mock 位于 `tests/e2e/helpers/mapMock.ts`。抓包过滤器 mock 对应当前的 `/traffic-observer/filter` 接口。

Playwright 将 HTML 报告输出到 `playwright-report/`；CI 上传为 `internet-map-geographic-playwright-report`。失败时的测试产物位于 `test-results/`。

当前测试未覆盖真实后端通信、上传文件后的完整图形渲染、蠕虫传播及控制台任务栏交互。
