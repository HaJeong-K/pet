#!/usr/bin/env bash
# 같이가개 안드로이드 앱 파일(APK) 만들기 — Git Bash에서 `bash mobile/android/build-apk.sh`
# 하는 일: ① 앱 빌드(Gradle) ② 정렬(zipalign) ③ 서명 열쇠로 서명(apksigner) ④ 서명 확인
# 필요한 것: 자바 17, Android SDK(기본 위치 C:/Users/<사용자>/android-sdk), 서명 열쇠(keys/ — git에 올리지 않음)
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-$HOME/android-sdk}"
BUILD_TOOLS="$SDK/build-tools/35.0.0"
KEYSTORE="keys/gachigagae-release.jks"
PASSWORD_FILE="keys/keystore-password.txt"
VERSION="$(grep -o '"appVersionName": *"[^"]*"' twa-manifest.json | sed 's/.*"\([^"]*\)"$/\1/')"
OUT="gachigagae-$VERSION.apk"

[ -d "$BUILD_TOOLS" ] || { echo "Android SDK를 찾을 수 없어요: $BUILD_TOOLS"; exit 1; }
[ -f "$KEYSTORE" ] && [ -f "$PASSWORD_FILE" ] || { echo "서명 열쇠가 없어요: $KEYSTORE (백업해 둔 keys 폴더를 이 자리에 넣어 주세요)"; exit 1; }

# 내 컴퓨터의 SDK 위치(이 파일은 git에 올리지 않습니다)
printf 'sdk.dir=%s\n' "$(cygpath -m "$SDK" 2>/dev/null || echo "$SDK")" | sed 's/^sdk.dir=\([A-Za-z]\):/sdk.dir=\1\\:/' > local.properties

export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
./gradlew.bat assembleRelease --no-daemon -q

PASSWORD="$(cat "$PASSWORD_FILE")"
"$BUILD_TOOLS/zipalign.exe" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk .aligned.apk
"$BUILD_TOOLS/apksigner.bat" sign --ks "$KEYSTORE" --ks-key-alias gachigagae --ks-pass "pass:$PASSWORD" --key-pass "pass:$PASSWORD" --out "$OUT" .aligned.apk
rm -f .aligned.apk "$OUT.idsig"
"$BUILD_TOOLS/apksigner.bat" verify --print-certs "$OUT" | grep "SHA-256"
echo "완료: mobile/android/$OUT"
