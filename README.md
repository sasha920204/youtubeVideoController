# Video Controller Chrome Extension

유튜브 및 웹 비디오용 고급 컨트롤러 크롬 익스텐션입니다.

## 기능

### 🚀 재생 속도 조절
- **플러스/마이너스 버튼**: 0.1x 단위로 세밀한 속도 조절
- **프리셋 버튼**: 50%, 60%, 70%, 80%, 90%, 일반, 110%, 125%, 150%, 175%, 200%
- **범위**: 0.25x ~ 4.0x

### 🎵 음계(피치) 조절
- **반음 단위 조절**: +/- 버튼으로 정밀한 피치 변경
- **한음/옥타브 단위**: 빠른 큰 폭 조절
- **범위**: -12 ~ +12 반음 (1옥타브)
- **음계 표시**: 현재 피치의 음계명 표시

### 🔄 구간 반복
- **시간 입력**: "분:초" (1:30) 또는 "초" (90) 형식으로 직접 입력
- **슬라이더 조절**: 시각적으로 구간 설정
- **실시간 동기화**: 슬라이더 움직임과 동시에 유튜브 재생 위치 이동
- **현재 위치 표시**: 노란색 인디케이터로 현재 재생 위치 표시
- **구간 이동**: 시작점/종료점으로 즉시 이동

## 설치 방법

1. 의존성 설치:
```bash
npm install
```

2. 빌드:
```bash
npm run build
```

3. 크롬 익스텐션 로드:
   - Chrome에서 `chrome://extensions/` 접속
   - "개발자 모드" 활성화
   - "압축해제된 확장 프로그램을 로드합니다" 클릭
   - 이 프로젝트 폴더 선택

## 사용법

1. YouTube 페이지에서 익스텐션 아이콘 클릭
2. 팝업에서 원하는 기능 사용:
   - **재생 속도**: +/- 버튼 또는 프리셋 버튼 클릭
   - **피치 조절**: 반음/옥타브 단위로 조절
   - **구간 반복**: 시작/종료 시간 설정 후 "반복 시작" 클릭

## 개발 모드

개발 중 자동 빌드:
```bash
npm run dev
```

## 기술 스택

- **Frontend**: React 18, JSX
- **Build**: Webpack 5, Babel
- **Extension**: Chrome Extension Manifest V3
- **Audio**: Web Audio API (피치 조절)

## 파일 구조

```
VideoController/
├── manifest.json          # 크롬 익스텐션 매니페스트
├── popup.html             # 팝업 HTML
├── styles.css             # 추가 스타일
├── src/
│   ├── popup.jsx          # 팝업 엔트리 포인트
│   ├── content.js         # 콘텐츠 스크립트
│   ├── styles.css         # 메인 스타일
│   └── components/
│       ├── VideoController.jsx  # 메인 컨트롤러
│       ├── SpeedControl.jsx     # 속도 조절
│       ├── PitchControl.jsx     # 피치 조절
│       └── LoopControl.jsx      # 구간 반복
├── package.json
├── webpack.config.js
└── README.md
```

## 주의사항

- YouTube에서만 테스트되었습니다
- 피치 조절 기능은 Web Audio API의 제한으로 인해 기본적인 구현입니다
- 일부 DRM 보호된 콘텐츠에서는 작동하지 않을 수 있습니다

## 라이센스

MIT License
