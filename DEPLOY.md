# 阿里云 ECS 基础网站部署

目标主机为上海 ECS，公网 IP 8.153.174.88，Ubuntu 22.04。默认使用已解析的 play.naiwashengnaidandui.online，网页包含现有游戏首页与试玩入口。

## 控制台准备

1. 已查询到 play 子域名的 A 记录为 8.153.174.88。部署前再次确认。若要使用主域名，在云解析 DNS 的公网解析中为它添加 A 记录，主机记录填 @，记录值填 8.153.174.88，并把 .env 中 GAME_DOMAIN 改为 naiwashengnaidandui.online。
2. ECS 安全组允许公网访问 TCP 80、443。系统防火墙如已启用，也需允许这两个端口。SSH 22 只允许管理员的来源 IP。检查服务器上是否已有网站使用 80、443，若有则先协调现有反向代理。
3. 确认备案通过的域名与所用域名一致，并准备完整 ICP 备案号。网站开通后按期限办理公安联网备案。
4. 能通过阿里云远程连接或已配置的 SSH 登录。密码、私钥与一次性验证码在自己的登录界面输入。

## 首次部署

使用 Docker 官方 Ubuntu 指南安装 Docker Engine 和 Compose 插件，完成后应能运行 docker compose version。若使用普通用户，确保该用户已有 Docker 操作权限，也可在管理员终端执行下面操作。

将部署压缩包上传至服务器的独立目录并解压，进入其中同时包含 compose.yaml 和 game 的目录。首次部署时运行以下命令。

```bash
cp .env.example .env
nano .env
```

保留实际域名，将 ICP_NUMBER 填为审核结果中的完整号码。公安备案两个字段在获批后填写，POLICE_CODE 填官方查询链接中的数字编号。保存后运行。

```bash
bash deploy.sh
```

访问 https://play.naiwashengnaidandui.online/ 和 /healthz。健康检查应返回 {"ok":true}。Caddy 在 DNS 指向本机、80 和 443 可达且证书服务可用时自动申请和续期 HTTPS 证书。首次容器就绪仍需等待证书申请并实测公网访问。

用手机关闭 Wi-Fi 后打开首页，点单人试玩验证开局，再用两台设备建房和凭码加入。检查页脚备案链接，刷新后确认回到原房间。

## 更新、数据与故障

更新源文件前先备份房间数据。使用同一目录和同一 Compose 项目再次运行 bash deploy.sh。对局保存在 rooms 数据卷，证书保存在 certificates 数据卷。

```bash
docker compose cp game:/state/rooms.json ./rooms-backup.json
docker compose logs --tail 80 game web
```

首次对局创建后才有 rooms.json。若 HTTPS 申请失败，先检查 DNS 的 A/AAAA 记录是否都指向当前主机，再检查端口、Caddy 日志及备案信息同步状态。若服务器不能访问镜像仓库，需配置服务器可用的镜像来源后重新构建。

## 对应官方资料

- Docker Ubuntu 安装说明 https://docs.docker.com/engine/install/ubuntu/
- Caddy 自动 HTTPS https://caddyserver.com/docs/automatic-https
- 阿里云 DNS 配置 https://help.aliyun.com/zh/dns/beginner-s-guide

本地验证与容器配置验证不代表已在 ECS 部署。实际部署还需要登录权限、真实备案号和公网联测。
