#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
project_dir="$PWD"
test "$(id -u)" = 0 || { echo 'Run as root.' >&2; exit 1; }
test -f .env || { echo 'Copy .env.example to .env first.' >&2; exit 1; }
test "$(dpkg --print-architecture)" = amd64 || { echo 'This installer targets Ubuntu amd64.' >&2; exit 1; }

# Isolate the runtime from any Node.js already used by other services.
tools_dir=/opt/mian-echo-tools
install -d -m 0755 "$tools_dir"
node_version=v24.22.3
node_archive="node-${node_version}-linux-x64.tar.xz"
if [[ ! -x "$tools_dir/node-${node_version}-linux-x64/bin/node" ]]; then
  curl -fL --connect-timeout 15 --max-time 180 --retry 2 \
    "https://nodejs.org/download/release/${node_version}/${node_archive}" -o "$tools_dir/$node_archive"
  (cd "$tools_dir" && printf '%s  %s\n' '4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb' "$node_archive" | sha256sum -c -)
  tar -xJf "$tools_dir/$node_archive" -C "$tools_dir"
fi
if [[ ! -x "$tools_dir/caddy" ]]; then
  if ! command -v caddy >/dev/null; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg
    curl -fsSL --connect-timeout 15 --max-time 60 \
      https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$tools_dir/caddy-gpg.key"
    gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "$tools_dir/caddy-gpg.key"
    curl -fsSL --connect-timeout 15 --max-time 60 \
      https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
    # The dedicated proxy below owns the web ports after this fresh install.
    systemctl disable --now caddy
  fi
  ln -s "$(command -v caddy)" "$tools_dir/caddy"
fi
"$tools_dir/caddy" version
"$tools_dir/node-${node_version}-linux-x64/bin/node" --version

install -d -o www-data -g www-data -m 0750 /var/lib/mian-echo-preview /var/lib/mian-echo-caddy
cat > Caddyfile.native <<'CADDY'
{$GAME_DOMAIN} {
    reverse_proxy 127.0.0.1:8787
}
CADDY
cat > /etc/systemd/system/mian-echo-preview.service <<UNIT
[Unit]
Description=Mian Echo website preview
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$project_dir
EnvironmentFile=$project_dir/.env
Environment=HOST=127.0.0.1 PORT=8787 GAME_PUBLIC=1 GAME_DATA=/var/lib/mian-echo-preview/rooms.json
ExecStart=$tools_dir/node-${node_version}-linux-x64/bin/node $project_dir/game/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/mian-echo-preview
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/mian-echo-web.service <<UNIT
[Unit]
Description=Mian Echo HTTPS proxy
After=network-online.target mian-echo-preview.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$project_dir
EnvironmentFile=$project_dir/.env
Environment=HOME=/var/lib/mian-echo-caddy XDG_DATA_HOME=/var/lib/mian-echo-caddy/data XDG_CONFIG_HOME=/var/lib/mian-echo-caddy/config
ExecStart=$tools_dir/caddy run --config $project_dir/Caddyfile.native --adapter caddyfile
ExecReload=$tools_dir/caddy reload --config $project_dir/Caddyfile.native --adapter caddyfile
Restart=on-failure
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/mian-echo-caddy
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now mian-echo-preview
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:8787/healthz; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8787/healthz
systemctl enable --now mian-echo-web
systemctl is-active mian-echo-preview mian-echo-web
echo 'Services started. Verify HTTPS and the homepage from an external network.'
