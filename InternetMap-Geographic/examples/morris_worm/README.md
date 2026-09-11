# Morris Worm 仿真与可视化

以下路径均以项目根目录为起点，命令在仿真环境中执行。

## 1. 生成仿真器文件

进入 `InternetMap-Geographic/examples/morris_worm/emulator`，执行：

```bash
python large-internet.py
```

执行完成后生成仿真器文件夹 `demo_output`。

## 2. 构建并启动仿真器

进入生成的 `demo_output` 文件夹，依次执行：

```bash
cd demo_output
DOCKER_BUILDKIT=0 docker compose build
docker compose up -d
sudo -S /sbin/sysctl -w kernel.randomize_va_space=0
```

## 3. 设置可视化过滤器

访问 `http://<ip>:8090/pro/map/3d`，将 `<ip>` 替换为可视化服务所在主机的 IP 地址。

在右下角设置 filter，值为：

```text
dst host 1.2.3.4
```

## 4. 启动蠕虫仿真

进入 `InternetMap-Geographic/examples/morris_worm/worm`，依次执行：

```bash
python first_attack.py
bash ./control_worm.sh run
```

## 5. 观察可视化变化

观察蠕虫在仿真网络中的传播过程。几分钟后，蠕虫会逐渐遍及所有节点，可视化中几乎所有节点都会闪烁。

勾选" Packet path links only "，观察（连线消失，节点持续闪烁）

勾选" Flow animation "，观察（节点持续闪烁或者有包流动动画）

## 6. 清理环境

进入 `demo_output`，执行：
```bash
docker compose down
```