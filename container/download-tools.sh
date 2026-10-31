#!/bin/sh
set -eu
case "${1:?Target architecture is required}" in
  amd64)
    node_arch=x64
    node_sha=6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6
    tunnel_sha=1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872
    ;;
  arm64)
    node_arch=arm64
    node_sha=dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e
    tunnel_sha=3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775
    ;;
  *) echo 'Only linux/amd64 and linux/arm64 are supported.' >&2; exit 2 ;;
esac
mkdir -p /opt/watchdog-tools /tmp/watchdog-tools
cd /tmp/watchdog-tools
curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 --max-time 180 \
  "https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-${node_arch}.tar.xz" -o node.tar.xz
printf '%s  node.tar.xz\n' "$node_sha" | sha256sum --check --strict -
tar -xJf node.tar.xz --strip-components=2 -C /opt/watchdog-tools "node-v24.22.1-linux-${node_arch}/bin/node"
curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 --max-time 180 \
  "https://github.com/cloudflare/cloudflared/releases/download/2026.10.7/cloudflared-linux-${1}" -o cloudflared
printf '%s  cloudflared\n' "$tunnel_sha" | sha256sum --check --strict -
install -m 0755 cloudflared /opt/watchdog-tools/cloudflared
chmod 0755 /opt/watchdog-tools/node
rm -rf /tmp/watchdog-tools
