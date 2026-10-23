# 4G记录仪云平台

基于浏览器的 CANFD-4G 记录仪数据工作空间：仪表监测、时域 Scope、动态循环回放、GPS 定位与轨迹、原始报文检查及 CSV/PNG/GPX 导出。无需 MATLAB、Syslab 或本地计算程序。

## 使用

1. 打开 GitHub Pages 网页。默认载入标明“合成演示数据”的演示记录。
2. 点击“导入数据”：支持 HEX 日志 TXT/HEX、协议二进制 BIN、经典 CAN ASC、物理量 CSV/JSON。
3. 选择设备、CAN 通道和 ECU 源地址，查看仪表、Scope 和地图。
4. 底部控制播放、暂停、倍速、进度和循环；Scope 可选择窗口长度、缩放、修改图题/坐标/字号/图例并导出图片。
5. 平台设置可填写发动机参考扭矩。未填写时，扭矩显示 %；填写后换算为 N·m。

上传文件仅在当前浏览器解析，不上传到 GitHub 或项目服务器。文件不会自动写入仓库或浏览器永久存储。平台设置保存在当前浏览器；关闭页面后需要重新导入数据。访问令牌仅保留于当前页面会话。

网页资源采用相对路径，可部署到 GitHub Pages 项目子目录。ECharts 5.6.0 与 Leaflet 1.9.4 已随项目保存，绘图不依赖运行时 CDN；地图底图需要联网访问 OpenStreetMap，并保留版权标识。

## 数据规则

- 按 CANFD-4G V1.1 的帧长度、序列号长度、类型和 XOR 校验解析；支持 TCP 拆包、粘包和 CAN/CAN FD 标准/扩展帧。
- 0x0F 为 CAN 上报，0x13 为定位上报，0x19 为心跳。CAN 数据和外层帧的字节序分别按 DBC 和协议处理。
- 目标字段依据工作信息表及核对后的 DBC 定义，共 22 项。大气压力/温度来自 AMB，最大可用扭矩来自 EEC2，行程燃油来自 LFC。
- 零值保留，空值/NaN/失效码不补零；未收到的仪表显示“—”。默认时效 3 秒；超时仪表恢复缺失状态。Scope 不跨长缺口连线。
- 显示与回放按设备、通道和 ECU 地址隔离，不把不同来源拼成同一条动力曲线。
- 计算油耗仅对有效燃油率做梯形积分，超过 5 秒或无效段不补算，不代表 ECU 生命周期总油耗。
- GPS 必须定位状态有效且经纬度有效、范围合理。协议对 2 字节速度/航向/海拔字段把有效位写为 bit16，存在冲突。默认按样例推定为 bit15，页面可改为严格模式（不解析这三项）；接实机前需厂家确认。经纬度按 WGS84 显示，协议未明确坐标基准，需实机核对。
- 仓库只包含合成演示数据与解析代码，不包含未发布协议原文、厂家 DBC、真实设备标识、原始日志或真实定位数据。

## GitHub Pages 发布

`main` 保存完整源代码，`gh-pages` 保存 `web/` 内容。Pages 发布源设为 `gh-pages` 分支根目录，构建不需要额外服务。访问权限遵循 GitHub Pages 的站点权限；网页源码和演示数据可公开，导入文件仍只保存在访问者浏览器内。

## 未来接入真实 4G 设备

GitHub Pages 只托管静态网页，不能接收设备 TCP 长连接。可将 `server/collector.mjs` 部署到有公网 TCP 端口的服务器，由设备连接该服务器，再通过 HTTPS 向网页提供数据。浏览器解析和绘图仍不依赖 Syslab。

本次按需求先交付上传文件和动态回放；实时配置入口与采集服务代码已保留，未声称已有真实设备在线。

### 本地开发

需要 Node.js 20 或以上，无需安装 npm 依赖：

```text
npm test
npm start
```

默认网页 `127.0.0.1:8880`，TCP `127.0.0.1:8890`。如端口被 Windows 保留，可用环境变量改为其他端口。

### 采集服务配置

| 环境变量 | 用途 |
| --- | --- |
| PORT / HOST | 网页及数据 API 监听地址，默认 8880 / 127.0.0.1 |
| RECORDER_TCP_PORT / RECORDER_TCP_HOST | 设备 TCP 监听地址，默认 8890 / 127.0.0.1 |
| RECORDER_API_TOKEN | 数据读取令牌，未配置时 API 不允许访问 |
| RECORDER_ALLOWED_ORIGINS | 允许访问 API 的网页 Origin，逗号分隔 |
| RECORDER_DEVICES | 允许的设备 SN，逗号分隔；空值不筛选 |
| RECORDER_LOG_DIR | 可选 NDJSON 日志目录，不设时仅保留内存记录 |

生产部署需 HTTPS 反向代理、TCP 端口与设备 SN 配置。该采集代码只实现文档明确的 CAN、定位、心跳接收与应答，不实现未定义的注册/鉴权流程，也不向车辆下发控制报文。

HTTPS API：`GET /api/snapshot?after=<cursor>`，请求头 `Authorization: Bearer <token>`。响应包含 `records`、`cursor`、`report`、`devices`，CAN payload 用字节数组传输。服务最多保留 50000 条内存记录；长期存储应配置日志或数据库。

## 第三方组件

- Apache ECharts 5.6.0，Apache-2.0： https://github.com/apache/echarts
- Leaflet 1.9.4，BSD-2-Clause： https://github.com/Leaflet/Leaflet
- OpenStreetMap 底图及数据版权： https://www.openstreetmap.org/copyright
