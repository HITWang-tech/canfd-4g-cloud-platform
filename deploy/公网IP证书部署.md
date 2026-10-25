# Windows Server 公网 IP HTTPS

适用于已安装本项目接收端的 Windows Server 2016+ x64。服务器需要 PowerShell 5.1、.NET Framework 4.7.1+，并能出站访问 Let's Encrypt ACME 服务。安装目录保持 `C:\ProgramData\CANFD4G` 或使用 `-InstallDir` 指定项目拥有的目录。

## 前提

- 在阿里云实例实际绑定的安全组和 Windows 防火墙中允许入方向 TCP 80、443。
- 80 供 HTTP-01 验证使用，443 供浏览器访问。其他应用已占用 443 时安装器会停止，不会结束其他应用；80 如被占用，应先检查归属，不能随意停止。
- 阅读 [Let's Encrypt 当前订户协议](https://letsencrypt.org/repository/)。只有同意后才使用 `-AcceptLetsEncryptTerms`。不接受时不申请证书。
- 公网 IPv4 必须是该实例可用的地址，不能填写阿里云私网地址。

## 安装

在服务器管理员 PowerShell 将 `YOUR_PUBLIC_IPV4` 替换为实际地址后整行执行：

```powershell
$f=Join-Path $env:TEMP 'CANFD4G-IPHTTPS.ps1'; Invoke-WebRequest -UseBasicParsing -Uri 'https://hitwang-tech.github.io/canfd-4g-cloud-platform/Enable-IPHTTPS.ps1?v=20261025.1' -OutFile $f; if ($?) { & $f -PublicIp 'YOUR_PUBLIC_IPV4' -AcceptLetsEncryptTerms }
```

安装包约 2 MB，内含未经修改的 PowerShell Gallery Posh-ACME 4.35.0 包及许可证、本项目转发与续期代码。固定 SHA256 校验通过后才解包。不会全局安装模块、修改 PowerShell 执行策略或跳过 TLS 验证。

成功分两步确认：

1. `CERTIFICATE_ISSUED`：生产 CA 证书已经签发，且 IP、有效期和密钥匹配校验通过。
2. `DIRECT_HTTPS_LOCAL_OK`：通过本机回环连接验证正常信任链、证书上的公网 IP、未认证 401、认证访问 200，以及网页跨域预检。回环连接仍校验证书链和配置的公网 IP，不是忽略证书错误。

之后还须从外网验证 `https://公网IP/api/snapshot`。无访问令牌时应返回 401，带正确令牌时应返回数据；不得仅凭本机验证就描述公网已经可用。

## 运行与续期

- `CANFD4G-IPCertificate`：SYSTEM 运行，开机及每天 00:15、06:15、12:15、18:15 检查续期，按 CA 建议的续期窗口执行。
- `CANFD4G-DirectHTTPS`：Local Service 运行，仅代理 `/api/snapshot` 到回环采集接口，保留认证和 CORS；其他路径不提供文件下载。
- 证书使用 `shortlived` 配置，有效期约 160 小时。代理每 15 秒检查已发布证书，验证成功后热更新，避免证书与私钥不同步。
- ACME 账户和原始私钥目录只允许 SYSTEM 与管理员访问；代理只需读取发布目录中的当前证书和密钥。
- 旧的临时 HTTPS 任务和 TCP 19090 接收程序保持运行。确认公网直连成功并切换网页配置之后，再决定是否停用临时 HTTPS 通道。

## 文件与排错

| 路径（相对安装目录） | 用途 |
| --- | --- |
| `logs/ip-certificate.log` | 申请与续期结果，不输出证书私钥或 API 令牌 |
| `logs/direct-https.log` | HTTPS 启动、证书更新及转发程序错误 |
| `ip-https/renewal-state.json` | 最近申请状态、到期时间或错误摘要 |
| `data/direct-connection.json` | 新的网页连接配置，含 API 令牌，不可公开 |
| `data/Open-Direct.url` | 在服务器打开网页并连接的私有快捷方式 |

网页导入 `direct-connection.json` 后改为直连公网 IP。不要向聊天或仓库提交这个文件、`active-tls.json` 或 ACME 目录。

若显示 `CERTIFICATE_PENDING`，先检查续期状态和申请日志；正在运行的任务不要重复启动。`CERTIFICATE_REQUEST_FAILED` 通常需按具体错误检查公网 80、ACME 出站连接、系统时间及 Windows/.NET 环境。

## 已验证范围

本地离线准备、下载包及官方模块校验、PowerShell 5.1 语法、模块导入及 HTTP 插件检查已通过。临时测试证书用于本机代理测试，验证 IP/有效期/密钥、认证和 CORS，并确认默认信任检查拒绝自签名证书。真实生产签发、任务计划程序、SYSTEM HTTP 监听及公网连通需要在目标服务器现场验证；没有预先替用户申请证书。
