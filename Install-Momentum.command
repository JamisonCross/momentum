#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
trap 'printf "\nInstallation stopped. The message above explains why. Your existing data was not removed.\n"; read -r -p "Press Return to close… " unused' ERR
if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'This installer runs on macOS only.\n'
  exit 1
fi
printf '\nMomentum — Mac desktop installer\n\n'
# Use an already-installed compiler without changing the system developer directory.
if ! /usr/bin/xcrun --find swiftc >/dev/null 2>&1; then
  if [[ -x /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc ]]; then
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  elif [[ -x /Library/Developer/CommandLineTools/usr/bin/swiftc ]]; then
    export DEVELOPER_DIR=/Library/Developer/CommandLineTools
  else
    printf 'Apple’s free Command Line Tools are needed once to build this app.\n'
    printf 'Install them using: xcode-select --install\n'
    printf 'Finish the Apple installer, then run this file again.\n'
    read -r -p 'Press Return to close… ' unused
    exit 0
  fi
fi
if /usr/bin/pgrep -x Momentum >/dev/null; then
  printf 'Please quit Momentum before installing an update, then run this installer again.\n'
  read -r -p 'Press Return to close… ' unused
  exit 0
fi
momentum_root="$PWD"
momentum_build="$(mktemp -d "${TMPDIR:-/tmp}/Momentum-build.XXXXXX")"
momentum_app="$momentum_build/Momentum.app"
mkdir -p "$momentum_app/Contents/MacOS" "$momentum_app/Contents/Resources"
printf 'Building the native Mac launcher for this Mac…\n'
MACOSX_DEPLOYMENT_TARGET=13.0 /usr/bin/xcrun swiftc -swift-version 5 -parse-as-library -O "$momentum_root/Native/main.swift" -framework Cocoa -framework WebKit -framework UniformTypeIdentifiers -o "$momentum_app/Contents/MacOS/Momentum"
cp "$momentum_root/Resources/"* "$momentum_app/Contents/Resources/"
cp "$momentum_root/Native/Info.plist" "$momentum_app/Contents/Info.plist"
if [[ -f "$momentum_root/Native/Momentum.icns" ]]; then cp "$momentum_root/Native/Momentum.icns" "$momentum_app/Contents/Resources/Momentum.icns"; fi
/usr/bin/codesign --force --deep --sign - "$momentum_app"
/usr/bin/codesign --verify --deep --strict "$momentum_app"
mkdir -p "$HOME/Applications"
momentum_destination="$HOME/Applications/Momentum.app"
if [[ -e "$momentum_destination" ]]; then
  momentum_previous="$HOME/Applications/Momentum-previous-$(date +%Y%m%d-%H%M%S).app"
  mv "$momentum_destination" "$momentum_previous"
  printf 'Previous application kept at: %s\n' "$momentum_previous"
fi
mv "$momentum_app" "$momentum_destination"
rmdir "$momentum_build"
printf '\nInstalled successfully at %s\n' "$momentum_destination"
printf 'Opening Momentum. You can keep its Dock icon for quick access.\n'
/usr/bin/open "$momentum_destination"
