#!/usr/bin/env sh
set -eu

REPO="${DROXY_GITHUB_REPO:-mihneaptu/droxy-cli}"
VERSION="${DROXY_VERSION:-latest}"
INSTALL_DIR="${DROXY_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/droxy-cli}"
BIN_DIR="${DROXY_INSTALL_BIN:-$HOME/.local/bin}"
UNINSTALL=0

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'This installer needs `%s` available on your PATH.\n' "$1" >&2
    exit 1
  fi
}

print_usage() {
  printf 'Usage: install.sh [--uninstall]\n'
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    printf 'Droxy requires Node.js 18 or later.\n' >&2
    printf 'Install it from https://nodejs.org and try again.\n' >&2
    exit 1
  fi

  node_version="$(node -v)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"

  case "$node_major" in
    ''|*[!0-9]*)
      printf 'Could not read your Node.js version from `%s`.\n' "$node_version" >&2
      printf 'Please install Node.js 18 or later from https://nodejs.org.\n' >&2
      exit 1
      ;;
  esac

  if [ "$node_major" -lt 18 ]; then
    printf 'Node.js %s found, but Droxy requires 18 or later.\n' "$node_version" >&2
    printf 'Update at https://nodejs.org and try again.\n' >&2
    exit 1
  fi
}

remove_install_dir() {
  if [ -z "$INSTALL_DIR" ] || [ "$INSTALL_DIR" = "/" ] || [ "$INSTALL_DIR" = "." ]; then
    printf 'Refusing to remove install directory: %s\n' "$INSTALL_DIR" >&2
    exit 1
  fi
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
  fi
}

run_uninstall() {
  link_path="${BIN_DIR}/droxy"
  removed_anything=0

  if [ -L "$link_path" ]; then
    rm -f "$link_path"
    removed_anything=1
    printf 'Removed command link: %s\n' "$link_path"
  elif [ -e "$link_path" ]; then
    printf 'Left %s in place because it is not a symlink.\n' "$link_path"
  else
    printf 'Command link not found at %s\n' "$link_path"
  fi

  if [ -d "$INSTALL_DIR" ]; then
    remove_install_dir
    removed_anything=1
    printf 'Removed install directory: %s\n' "$INSTALL_DIR"
  else
    printf 'Install directory not found at %s\n' "$INSTALL_DIR"
  fi

  if [ "$removed_anything" -eq 1 ]; then
    printf 'Droxy has been uninstalled.\n'
  else
    printf 'Nothing to uninstall.\n'
  fi
}

detect_os() {
  case "$(uname -s | tr '[:upper:]' '[:lower:]')" in
    linux*) printf 'linux' ;;
    darwin*) printf 'darwin' ;;
    *)
      printf 'This installer supports macOS and Linux only.\n' >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m | tr '[:upper:]' '[:lower:]')" in
    x86_64|amd64) printf 'x64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *)
      printf 'Unsupported architecture: %s\n' "$(uname -m)" >&2
      exit 1
      ;;
  esac
}

checksum_file() {
  target="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$target" | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$target" | awk '{print $1}'
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$target" | awk '{print $NF}'
    return 0
  fi
  return 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --uninstall)
      UNINSTALL=1
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$UNINSTALL" -eq 1 ]; then
  run_uninstall
  exit 0
fi

check_node
need_cmd curl
need_cmd tar

OS_NAME="$(detect_os)"
ARCH_NAME="$(detect_arch)"
ASSET="droxy-cli-${OS_NAME}-${ARCH_NAME}.tar.gz"

if [ "$VERSION" = "latest" ]; then
  BASE_URL="https://github.com/${REPO}/releases/latest/download"
else
  case "$VERSION" in
    v*) TAG="$VERSION" ;;
    *) TAG="v$VERSION" ;;
  esac
  BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"
fi

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t droxy-install)"
ARCHIVE_PATH="${TMP_DIR}/${ASSET}"
CHECKSUM_PATH="${TMP_DIR}/${ASSET}.sha256"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

printf 'Downloading %s...\n' "$ASSET"
curl -fsSL "${BASE_URL}/${ASSET}" -o "$ARCHIVE_PATH"

if curl -fsSL "${BASE_URL}/${ASSET}.sha256" -o "$CHECKSUM_PATH"; then
  expected="$(awk '{print $1}' "$CHECKSUM_PATH" | tr '[:upper:]' '[:lower:]')"
  if actual="$(checksum_file "$ARCHIVE_PATH" | tr '[:upper:]' '[:lower:]')"; then
    if [ -n "$expected" ] && [ "$expected" != "$actual" ]; then
      printf 'Checksum verification failed for %s\n' "$ASSET" >&2
      exit 1
    fi
  fi
fi

tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"
PACKAGE_DIR="${TMP_DIR}/droxy-cli-${OS_NAME}-${ARCH_NAME}"

if [ ! -d "$PACKAGE_DIR" ]; then
  printf 'Unexpected archive layout for %s\n' "$ASSET" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"
remove_install_dir
mkdir -p "$INSTALL_DIR"
cp -R "$PACKAGE_DIR"/. "$INSTALL_DIR"/

if [ ! -f "$INSTALL_DIR/droxy" ]; then
  cat > "$INSTALL_DIR/droxy" <<'EOF'
#!/usr/bin/env sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$SCRIPT_DIR/droxy.js" "$@"
EOF
fi

chmod +x "$INSTALL_DIR/droxy"
ln -sf "$INSTALL_DIR/droxy" "$BIN_DIR/droxy"

printf 'Installed Droxy to %s\n' "$INSTALL_DIR"
printf 'Linked command at %s/droxy\n' "$BIN_DIR"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '\nIf `droxy` is not found, add this to your shell profile:\n'
    printf '  export PATH="%s:$PATH"\n' "$BIN_DIR"
    ;;
esac

printf '\nNext step: droxy --help\n'
