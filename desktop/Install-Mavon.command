#!/bin/bash
set -euo pipefail
bundle_dir="$(cd "$(dirname "$0")" && pwd)"
mavon_source="$bundle_dir/Mavon Finance.app"
mavon_target="$HOME/Applications/Mavon Finance.app"
echo "Mavon Finance 0.7.2 — Apple Silicon"
echo "Quit Mavon Finance before installing or updating."
echo "This build is not signed with an Apple Developer certificate."
echo "The installer applies a local ad-hoc signature; it does not change macOS security settings."
if [[ ! -d "$mavon_source" ]]; then echo "Mavon Finance.app was not found next to this installer."; exit 1; fi
if pgrep -f "$mavon_target/Contents/MacOS" >/dev/null; then echo "Please quit Mavon Finance, then run this installer again."; exit 1; fi
mkdir -p "$HOME/Applications"
mavon_stage="$(mktemp -d "$HOME/Applications/.mavon-install.XXXXXX")"
trap 'rm -rf "$mavon_stage"' EXIT
/usr/bin/ditto "$mavon_source" "$mavon_stage/Mavon Finance.app"
/usr/bin/codesign --force --deep --sign - "$mavon_stage/Mavon Finance.app"
/usr/bin/codesign --verify --deep --strict "$mavon_stage/Mavon Finance.app"
if [[ -d "$mavon_target" ]]; then
  mavon_previous="$HOME/Applications/Mavon Finance previous $(date +%Y%m%d-%H%M%S).app"
  mv "$mavon_target" "$mavon_previous"
fi
mv "$mavon_stage/Mavon Finance.app" "$mavon_target"
echo "Installed in $mavon_target"
echo "Your Mavon user data was not removed."
echo "Open Mavon Finance from your Applications folder. See README-FA.txt for first setup."
read -r -p "Press Enter to close this window. " || true
