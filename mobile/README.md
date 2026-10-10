# 같이가개 모바일 앱

모바일 앱 관련 파일을 모아 둔 폴더입니다. 지금은 안드로이드 앱 하나가 있습니다.

## 어떤 앱인가요

웹사이트(`https://gachigagae.vercel.app`)를 **그대로 감싼 앱**입니다(안드로이드의 TWA 방식).
앱 아이콘으로 열면 주소창 없이 전체 화면으로 사이트가 뜹니다.

- 화면·기능이 웹과 같습니다 — 로그인(카카오·구글), 위치, 지도 모두 폰 크롬에서 되던 그대로 동작합니다.
- **사이트를 고치면 앱에도 바로 반영됩니다.** 앱을 다시 만들거나 다시 설치할 필요가 없습니다.
- 앱을 다시 만들어야 하는 경우는 앱 이름·아이콘·색·버전을 바꿀 때뿐입니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `android/twa-manifest.json` | 앱 설정(앱 이름, 패키지 이름 `kr.gachigagae.app`, 색, 버전, 연결할 사이트 주소) |
| `android/app/` | 안드로이드 프로젝트 소스(위 설정으로 자동 생성된 것 — 직접 고치지 않습니다) |
| `android/build-apk.sh` | 앱 파일(APK)을 만드는 스크립트 |
| `android/keys/` | **서명 열쇠와 비밀번호 — git에 올리지 않습니다** |
| `android/*.apk` | 만들어진 앱 파일 — git에 올리지 않습니다 |

웹 쪽에 있는 관련 파일(사이트가 직접 내려줘야 해서 이 폴더로 옮길 수 없습니다):

| 경로 | 내용 |
|---|---|
| `src/app/manifest.ts` | 앱 이름·아이콘·전체 화면 설정(`/manifest.webmanifest`) |
| `public/.well-known/assetlinks.json` | "이 앱은 이 사이트의 앱이 맞다"는 인증 — 여기 적힌 지문이 서명 열쇠와 같아야 주소창 없이 뜹니다 |

## ⚠ 서명 열쇠는 꼭 백업하세요

`android/keys/` 안의 두 파일(`gachigagae-release.jks`, `keystore-password.txt`)은 git에 없고 **이 컴퓨터에만** 있습니다.

- 이 열쇠로 서명한 앱만 "같은 앱"으로 인정됩니다. 잃어버리면 기존에 설치한 앱을 업데이트할 수 없고,
  플레이스토어에 올린 뒤라면 앱을 새로 등록해야 할 수 있습니다.
- USB나 개인 클라우드 등 안전한 곳에 폴더째 복사해 두세요. 다른 사람에게 주거나 git에 올리면 안 됩니다.

## 앱 파일 만들기

필요한 것: 자바 17, Android SDK(`C:/Users/<사용자>/android-sdk`), `android/keys/` 폴더.

```bash
bash mobile/android/build-apk.sh
```

끝나면 `mobile/android/gachigagae-<버전>.apk`가 생깁니다.

## 폰에 설치하기

1. APK 파일을 폰으로 옮깁니다(카카오톡 나에게 보내기, 구글 드라이브, USB 등).
2. 폰에서 파일을 열고 "설치"를 누릅니다. 처음에는 "출처를 알 수 없는 앱 설치" 허용을 한 번 눌러야 합니다.
3. 홈 화면의 "같이가개" 아이콘으로 엽니다.

앱은 크롬을 엔진으로 씁니다. 폰에 크롬이 설치돼 있어야 주소창 없이 전체 화면으로 뜹니다.

## 버전 올리기

`android/twa-manifest.json`의 `appVersionName`(예: `0.1.1`)과 `appVersionCode`(1씩 올림)를 바꾸고,
`android/app/build.gradle`의 `versionCode`·`versionName`도 같은 값으로 맞춘 뒤 다시 빌드합니다.

## 앱 아이콘

글자 없는 핀 로고(갈색 핀 속 슈나우저와 발자국)를 씁니다. 그림을 바꾸려면 `mobile/icon-drafts/make-app-icons.cjs`의 도형을 고친 뒤
`node mobile/icon-drafts/make-app-icons.cjs`를 실행하면 사이트 아이콘(브라우저 탭·홈 화면 추가)과 앱 아이콘·시작 화면 그림이 모든 크기로 다시 만들어집니다.
그다음 버전을 올려 앱을 다시 빌드합니다.

## 알림 아이콘

상단바에 뜨는 작은 알림 아이콘은 안드로이드 규칙상 **한 가지 색 실루엣**만 됩니다(투명하지 않은 부분이 전부 흰색으로 칠해짐).
색이 꽉 찬 그림을 넣으면 흰 동그라미로만 보여서, 투명 바탕의 핀 실루엣을 따로 만들어 씁니다.

- 실루엣·컬러 아이콘은 `node mobile/icon-drafts/make-notification-icons.cjs`로 다시 만듭니다
  (`public/notification-badge.png`, `public/notification-icon.png`, 앱의 `ic_notification_icon.png` 5종).
- 앱이 알림을 대신 띄울 때는 앱 안의 `ic_notification_icon`을 쓰므로, 실루엣을 바꾸면 앱도 다시 빌드해 설치해야 합니다.
- 알림창을 내렸을 때의 아이콘 색은 로고의 갈색입니다(`DelegationService.java`의 `NOTIFICATION_COLOR`).
  상단바에 뜨는 아이콘의 색은 안드로이드가 정해서(어두운 바탕 흰색, 밝은 바탕 검은색) 바꿀 수 없습니다.
- ⚠ `DelegationService.java`는 직접 고친 파일입니다. `bubblewrap update`로 프로젝트를 다시 만들면 덮어써지니, 그때는 이 파일의 색 지정 부분을 다시 넣어야 합니다.

## 아직 없는 것

- 앱 푸시 알림(구글 Firebase 연결 필요)
- 아이폰 앱(맥과 애플 개발자 계정 필요)
- 플레이스토어 등록(개발자 계정 등록비 필요, 스토어용 파일 형식은 `.aab`)
