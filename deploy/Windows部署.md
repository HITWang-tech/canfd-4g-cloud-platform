# Windows Server 接收端部署

适用于 Windows Server 2016 或更高版本、x64。需要管理员 PowerShell 5.1 或更高版本。

## 安装 TCP 接收端

在服务器的管理员 PowerShell 中执行（将公网 IP 改为实际值）：

```powershell
$setup=Join-Path $env:TEMP 'CANFD4G-Install.ps1'
Invoke-WebRequest -UseBasicParsing 'https://hitwang-tech.github.io/canfd-4g-cloud-platform/Install-Windows.ps1' -OutFile $setup
& $setup -PublicIp 'YOUR_PUBLIC_IPV4'
```

如遇到执行策略、下载失败或端口占用错误，保留错误原文以便处理；脚本不修改系统执行策略，也不会结束其他应用。

默认安装目录为 `C:\ProgramData\CANFD4G`。脚本会：

- 下载官方 Node.js 22.23.4 和接收程序，核对固定 SHA256。
- 创建独立的访问令牌，保存到安装目录的 config.json。
- 创建以 Local Service 运行的 `CANFD4G-Receiver` 开机任务。
- 只为本应用添加 Windows 防火墙 TCP 19090 规则。
- 验证回环地址的数据接口。数据接口 19080 不直接对公网监听。

成功时显示 `RECEIVER_OK`；HTTPS 阶段尚未完成时会明确显示 `HTTPS_API: NOT_CONFIGURED_YET`。这时不能把 GitHub 网页描述为已经接到实时数据。

## 阿里云安全组

在实例所用安全组中添加入方向 TCP 19090 规则。此项与 Windows 防火墙不同，脚本不会操作阿里云账号或安全组。

在外网确认 TCP 接收程序和协议应答后，才能把 `公网IP:19090` 交给记录仪操作人员。对方使用 TCP 客户端及 V1.1 二进制帧，不是 HTTP、ASC 文本或 ASCII HEX。

## HTTPS 数据接口

TCP 收包和网页 HTTPS 接入分两步验证。后续可用受浏览器信任的 HTTPS 反向代理或 HTTPS 中转代理回环地址 `http://127.0.0.1:19080`，保留 Authorization 请求头并允许 GitHub 网页 Origin。

获得已验证的 HTTPS 根地址后，在网页“平台设置 → 实时数据接入”填写地址及访问令牌。

访问令牌位于服务器的 config.json，仅填写进网页访问令牌输入框，不要提交到仓库或包含在截图中。

## 目录与维护

- `config.json`：接收端配置和访问令牌。
- `data\records.ndjson`：收到的设备记录。
- `logs\receiver.log`：接收进程日志。
- `Run-Receiver.ps1`：任务计划程序的启动脚本。

脚本重跑会保留当前配置、令牌和数据，只更新本项目文件与任务。若安装目录、任务名或端口已被其他应用使用，会停止并报告冲突。

## 发布前验证范围

部署脚本经过 PowerShell 5.1 语法检查、`-PrepareOnly` 下载/哈希/解包检查，接收代码以目标 Node.js 22 运行协议测试。真实服务器的 Local Service 任务、权限、防火墙、安全组和 HTTPS 仍需现场执行并验证。预备模式不注册任务或修改防火墙。
