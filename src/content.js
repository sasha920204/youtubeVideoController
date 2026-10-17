// Ensure dynamic chunks load from the extension URL, not the page origin (fixes CSP)
try {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    __webpack_public_path__ = chrome.runtime.getURL('/');
  }
} catch (_) {}

// 구간 반복을 위한 변수들
let loopInterval = null;
let loopStart = 0;
let loopEnd = 0;
let isLooping = false;
let videoEndedHandler = null; // 비디오 종료 이벤트 핸들러
let videoTimeupdateHandler = null; // 시간 업데이트 이벤트 핸들러

// 피치 변경을 위한 변수들 (Web Audio + AudioWorklet)
let audioContext = null; // AudioContext
let mediaSourceNode = null; // MediaElementAudioSourceNode
let pitchWorkletNode = null; // AudioWorkletNode for pitch shifting
let outputGainNode = null;  // GainNode
let isPitchInitialized = false;
let pitchInitPromise = null; // 동시에 여러 번 호출돼도 초기화는 한 번만 진행
let pitchInitError = null; // 마지막 초기화 실패 이유 (팝업 안내용)
let isWorkletLoaded = false; // Worklet 모듈 로드 상태
let currentPitchSemitones = 0; // 저장용
let cachedVolume = 1.0; // 마지막 설정된 볼륨 (0~1) - 기본값 100%

// 곡 변경 감지를 위한 변수들
let lastVideoId = '';
let videoChangeCheckInterval = null;

// 화면(팝업)에 설정된 재생 속도. 유튜브 플레이어가 속도를 되돌리면 이 값으로 다시 맞춘다
let desiredPlaybackRate = null;
const rateGuardedVideos = new WeakSet();
// 플레이어와 속도를 무한히 다투지 않도록 1초에 몇 번까지만 되돌린다
const RATE_RESTORE_LIMIT = 3;
let rateRestoreWindowStart = 0;
let rateRestoreCount = 0;

// 구간 반복 점프 직후 잠깐은 다시 점프하지 않는다 (이동 결과가 A보다 아주 조금 앞일 수 있음)
const LOOP_START_TOLERANCE = 0.25; // 초
const LOOP_JUMP_COOLDOWN_MS = 300;
let lastLoopJumpAt = 0;

async function ensureAudioContextResumed(ctx) {
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    // 자동재생 정책 때문에 resume()이 끝나지 않을 수 있으므로 오래 기다리지 않는다
    // (재생/클릭 이벤트 때 다시 resume 됨)
    try {
      await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
    } catch (e) { /* ignore */ }
  }
}

function getYouTubeVideo() {
  return document.querySelector('video');
}

function initializePitch() {
  if (isPitchInitialized) {
    return ensureAudioContextResumed(audioContext).then(() => true);
  }
  // 이미 진행 중이면 같은 결과를 기다린다.
  // 동시에 두 번 진행되면 두 번째 createMediaElementSource가 실패해서 "Initializing..."에 멈췄다
  if (!pitchInitPromise) {
    pitchInitPromise = doInitializePitch().finally(() => { pitchInitPromise = null; });
  }
  return pitchInitPromise;
}

async function doInitializePitch() {
  const video = getYouTubeVideo();
  if (!video) {
    console.log('🎵 Pitch init: No video element found');
    pitchInitError = 'noVideo';
    return false;
  }

  try {
    console.log('🎵 Starting pitch initialization...');
    
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    await ensureAudioContextResumed(audioContext);
    console.log('🎵 AudioContext state:', audioContext.state);

    // Load AudioWorklet module
    if (!isWorkletLoaded) {
      try {
        const workletUrl = chrome.runtime.getURL('pitch-shifter.worklet.js');
        await audioContext.audioWorklet.addModule(workletUrl);
        isWorkletLoaded = true;
        console.log('🎵 AudioWorklet module loaded');
      } catch (error) {
        console.error('🎵 Failed to load AudioWorklet module:', error);
        pitchInitError = 'workletLoadFailed';
        return false;
      }
    }

    if (!mediaSourceNode) {
      try {
        mediaSourceNode = audioContext.createMediaElementSource(video);
      } catch (error) {
        // 확장을 다시 로드하면 이전 content script가 이미 영상 소리를 잡고 있다.
        // 이 경우 탭을 새로고침해야만 다시 연결할 수 있다
        console.error('🎵 Video audio already connected elsewhere:', error);
        pitchInitError = 'needsReload';
        return false;
      }
      console.log('🎵 MediaElementSource created');
    }

    if (!outputGainNode) {
      outputGainNode = audioContext.createGain();
      const initialVolume = Math.max(0, Math.min(1, cachedVolume));
      outputGainNode.gain.value = initialVolume;
      console.log('🎵 Gain node created with volume:', initialVolume);
    }

    // Create AudioWorkletNode for pitch shifting
    if (!pitchWorkletNode) {
      pitchWorkletNode = new AudioWorkletNode(audioContext, 'pitch-shifter-processor');
      console.log('🎵 AudioWorkletNode created');
    }

    // Setup audio chain: video -> mediaSource -> worklet -> gain -> destination
    try { mediaSourceNode.disconnect(); } catch (_) {}
    try { pitchWorkletNode.disconnect(); } catch (_) {}
    try { outputGainNode.disconnect(); } catch (_) {}

    mediaSourceNode.connect(pitchWorkletNode);
    pitchWorkletNode.connect(outputGainNode);
    outputGainNode.connect(audioContext.destination);
    console.log('🎵 Audio chain connected (with AudioWorklet pitch processing)');

    // 원본 중복 출력 방지
    video.muted = true;

    // 비디오 재생 이벤트에 AudioContext 재개 리스너 추가
    video.addEventListener('play', async () => {
      if (audioContext) {
        await ensureAudioContextResumed(audioContext);
        console.log('🎵 AudioContext resumed on play');
      }
    });

    video.addEventListener('playing', async () => {
      if (audioContext) {
        await ensureAudioContextResumed(audioContext);
        console.log('🎵 AudioContext resumed on playing');
      }
    });

    isPitchInitialized = true;
    pitchInitError = null;
    console.log('🎵 Pitch system initialized successfully');
    return true;
  } catch (error) {
    console.error('🎵 Pitch init failed:', error);
    isPitchInitialized = false;
    pitchInitError = 'failed';
    return false;
  }
}

async function applyPitchSemitones(semitones) {
  // 전체 범위: -24 ~ +24
  const clamped = Math.max(-24, Math.min(24, semitones));
  currentPitchSemitones = clamped;
  
  const video = getYouTubeVideo();
  if (!video) return false;

  if (!isPitchInitialized) {
    const ok = await initializePitch();
    if (!ok) return false;
  }

  try {
    // Set pitch via AudioWorkletNode parameter
    if (pitchWorkletNode && pitchWorkletNode.parameters) {
      const semitonesParam = pitchWorkletNode.parameters.get('semitones');
      if (semitonesParam) {
        semitonesParam.value = clamped;
      }
    }
    
    console.log(`🎵 Pitch set to: ${clamped} semitones`);
    return true;
  } catch (e) {
    console.error('🎵 Failed to set pitch:', e);
    return false;
  }
}

// 모든 컨트롤을 기본값으로 리셋하는 함수
function resetAllControls() {
  console.log('🔄 Video change detected - resetting all controls');
  
  const video = getYouTubeVideo();
  if (!video) return;
  
  try {
    // 속도 리셋 (새 영상에서는 더 이상 이전 속도를 강제하지 않음)
    desiredPlaybackRate = null;
    video.playbackRate = 1.0;
    
    // 루프 리셋
    if (loopInterval) {
      clearInterval(loopInterval);
      loopInterval = null;
    }
    // 루프 이벤트 리스너 제거
    if (videoEndedHandler) {
      video.removeEventListener('ended', videoEndedHandler);
      videoEndedHandler = null;
    }
    if (videoTimeupdateHandler) {
      video.removeEventListener('timeupdate', videoTimeupdateHandler);
      videoTimeupdateHandler = null;
    }
    loopStart = 0;
    loopEnd = video.duration || 0; // 비디오 길이로 설정
    isLooping = false;
    
    // 피치 리셋
    currentPitchSemitones = 0;
    disablePitch(); // 피치를 완전히 비활성화하여 비디오의 muted 해제
    
    // Storage도 기본값으로 리셋
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        currentSpeed: 1.0,
        currentPitch: 0,
        loopStart: 0,
        loopEnd: video.duration || 0,
        isLoopEnabled: true,
        isSpeedEnabled: true,
        isPitchEnabled: true
      }, () => {
        console.log('💾 Storage reset to default values');
      });
    }
    
    // 볼륨은 유지 (사용자 설정이므로)
    
    console.log('✅ All controls and storage reset to default');
  } catch (error) {
    console.error('❌ Failed to reset controls:', error);
  }
}

// 현재 영상 ID (watch?v=, /shorts/, /embed/, /live/ 주소 지원). 영상 페이지가 아니면 URL 경로
function getVideoId() {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get('v');
    if (v) return v;
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
    if (match) return match[1];
    return url.pathname;
  } catch (_) {
    return window.location.href;
  }
}

// 비디오 변경 감지 함수
// 영상 ID가 바뀔 때만 다른 곡으로 본다.
// 예전에는 제목 변경이나 큰 시간 이동(10초 뒤로, 30초 앞으로, 처음으로)도 곡 변경으로 봤다.
// 그래서 구간 반복을 지정하거나(시작점으로 이동) 반복이 한 바퀴 돌 때마다 속도·피치·반복이 초기화됐다.
function checkForVideoChange() {
  const video = getYouTubeVideo();
  if (!video) return;
  
  const currentId = getVideoId();
  if (lastVideoId !== '' && currentId !== lastVideoId) {
    console.log('🎵 곡 변경 감지 - 모든 설정 리셋');
    resetAllControls();
  }
  
  lastVideoId = currentId;
}

// 비디오 변경 감지 시작
function startVideoChangeDetection() {
  if (videoChangeCheckInterval) {
    clearInterval(videoChangeCheckInterval);
  }
  
  // 초기값 설정
  lastVideoId = getVideoId();
  const video = getYouTubeVideo();
  
  // 비디오 종료 이벤트 리스너 추가 (다음 곡으로 넘어갈 때 감지)
  if (video) {
    video.addEventListener('ended', () => {
      // 루프 중이 아닐 때만 리셋 (루프 중에는 종료 이벤트가 차단됨)
      if (!isLooping) {
        console.log('🎵 곡 종료 감지 - 다음 곡 대기');
        setTimeout(checkForVideoChange, 1000);
      }
    });
  }
  
  // 2초마다 체크 (더 빠른 감지)
  videoChangeCheckInterval = setInterval(checkForVideoChange, 2000);
  console.log('🎵 곡 변경 감지 시작 (자동 리셋)');
}

// 비디오 변경 감지 중지
function stopVideoChangeDetection() {
  if (videoChangeCheckInterval) {
    clearInterval(videoChangeCheckInterval);
    videoChangeCheckInterval = null;
    console.log('🎵 Video change detection stopped');
  }
}

// YouTube 비디오 요소 찾기
// getYouTubeVideo는 위에서 정의됨

// 비디오 제목 가져오기
function getVideoTitle() {
  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || 
                      document.querySelector('h1.title') ||
                      document.querySelector('.watch-main-col h1');
  return titleElement ? titleElement.textContent.trim() : 'Unknown Video';
}

// 비디오 정보 가져오기
function getVideoInfo() {
  const video = getYouTubeVideo();
  if (!video) return null;
  
  return {
    duration: video.duration || 0,
    currentTime: video.currentTime || 0,
    title: getVideoTitle(),
    isPlaying: !video.paused
  };
}

// 유튜브 플레이어가 속도를 바꾸면(구간 이동, 화질 변경, 광고 후 등) 화면에 설정된 속도로 되돌린다
function guardPlaybackRate(video) {
  if (rateGuardedVideos.has(video)) return;
  rateGuardedVideos.add(video);
  video.addEventListener('ratechange', () => {
    if (desiredPlaybackRate === null || video.playbackRate === desiredPlaybackRate) return;
    const now = Date.now();
    if (now - rateRestoreWindowStart > 1000) {
      rateRestoreWindowStart = now;
      rateRestoreCount = 0;
    }
    if (rateRestoreCount >= RATE_RESTORE_LIMIT) {
      console.log('⚡ Player keeps changing playback rate - not fighting it');
      return;
    }
    rateRestoreCount += 1;
    console.log(`⚡ Playback rate changed to ${video.playbackRate}x → restoring ${desiredPlaybackRate}x`);
    video.playbackRate = desiredPlaybackRate;
  });
}

// 재생 속도 설정
function setPlaybackRate(speed) {
  const video = getYouTubeVideo();
  if (video) {
    desiredPlaybackRate = speed;
    rateRestoreCount = 0;
    guardPlaybackRate(video);
    video.playbackRate = speed;
    console.log(`Playback rate set to: ${speed}x`);
    return true;
  }
  return false;
}



// 특정 시간으로 이동
async function seekTo(time) {
  const video = getYouTubeVideo();
  if (video) {
    video.currentTime = time;
    console.log(`Seeked to: ${time}s`);
    
    // AudioContext가 있으면 재개하여 소리가 나도록 함
    if (audioContext) {
      await ensureAudioContextResumed(audioContext);
      console.log('🎵 AudioContext resumed after seek');
    }
    
    return true;
  }
  return false;
}

// 구간 반복 설정
function setLoop(start, end, enabled) {
  const video = getYouTubeVideo();
  if (!video) {
    console.log('❌ Loop: No video element found');
    return false;
  }

  console.log(`🔄 Loop: ${enabled ? 'ON' : 'OFF'} [${start.toFixed(1)}s - ${end.toFixed(1)}s]`);

  // 기존 루프 정리
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
  
  if (videoEndedHandler) {
    video.removeEventListener('ended', videoEndedHandler);
    videoEndedHandler = null;
  }
  if (videoTimeupdateHandler) {
    video.removeEventListener('timeupdate', videoTimeupdateHandler);
    videoTimeupdateHandler = null;
  }

  if (!enabled) {
    isLooping = false;
    console.log('✅ Loop disabled');
    return true;
  }

  // 유효성 검사
  if (start >= end || start < 0 || end > video.duration) {
    console.log(`❌ Invalid loop range: ${start}-${end} (duration: ${video.duration})`);
    return false;
  }

  if (end >= video.duration - 1 && start === 0) {
    console.log('⚠️ Full video loop disabled');
    isLooping = false;
    return true;
  }

  loopStart = start;
  loopEnd = Math.min(end, video.duration - 1); // 끝점은 항상 1초 마진
  lastLoopJumpAt = 0;
  isLooping = true;

  console.log(`🔒 루프 활성화: [${loopStart.toFixed(1)}s - ${loopEnd.toFixed(1)}s] | isLooping: ${isLooping}`);

  // 1. 비디오 종료 이벤트 차단 (최우선 - capture phase)
  videoEndedHandler = (e) => {
    if (isLooping) {
      console.log('🛑 비디오 종료 차단 → 루프 시작점으로');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      video.currentTime = loopStart;
      video.play().catch(() => {});
      return false;
    }
  };
  video.addEventListener('ended', videoEndedHandler, { capture: true, passive: false });

  // 2. 끝점(B) 도달 시 시작점으로 점프
  // 예전에는 B 0.5초 전에 미리 점프해서 B 직전이 잘렸고, B를 조정하면(B-1초로 이동) 0.5초 만에 튕겨 나갔다.
  // 끝점은 이미 영상 끝에서 1초 전으로 제한되므로 B에서 바로 점프해도 자동재생으로 넘어가지 않는다.
  // 이동(seek)이 진행 중일 때 다시 이동시키면 버퍼링이 겹쳐 버벅이므로 건너뛴다.
  // 점프 직후에는 다시 점프하지 않고, A보다 조금(0.25초 이내) 앞인 것은 범위 안으로 본다.
  // 브라우저는 위치를 마이크로초 단위로 저장해서 70.123456789초로 이동하면 70.123456초가 된다.
  // 정확히 비교하면 "A보다 앞"으로 판단해 계속 다시 이동하면서 버벅이는 소리만 나고 재생이 안 됐다.
  const jumpToLoopStart = (reason) => {
    console.log(`🔁 ${reason}: ${video.currentTime.toFixed(2)}s → ${loopStart.toFixed(2)}s`);
    lastLoopJumpAt = Date.now();
    video.currentTime = loopStart;
  };
  const inJumpCooldown = () => Date.now() - lastLoopJumpAt < LOOP_JUMP_COOLDOWN_MS;

  videoTimeupdateHandler = () => {
    if (!isLooping || video.paused || video.seeking || inJumpCooldown()) return;
    
    const currentTime = video.currentTime;
    
    if (currentTime >= loopEnd) {
      jumpToLoopStart('끝점 도달');
    } else if (currentTime < loopStart - LOOP_START_TOLERANCE) {
      jumpToLoopStart('범위 이탈 복귀');
    }
  };
  video.addEventListener('timeupdate', videoTimeupdateHandler);

  // 3. 백업 인터벌 (timeupdate는 약 250ms 간격이라 30ms로 정확하게 B를 잡는다)
  loopInterval = setInterval(() => {
    if (!video || video.paused || !isLooping || video.seeking || inJumpCooldown()) return;
    
    const currentTime = video.currentTime;
    
    // 끝점 도달 또는 영상 끝 근처 (YouTube 자동재생 방지)
    if (currentTime >= loopEnd || currentTime >= video.duration - 1) {
      jumpToLoopStart('끝점 도달');
    }
  }, 30);

  console.log(`✅ 3단계 루프 보호 활성화`);
  return true;
}

// 피치 변경 적용
async function setPitch(semitones) {
  return await applyPitchSemitones(semitones);
}

// 피치 시스템 비활성화 (원래 소리로 복원)
function disablePitch() {
  const video = getYouTubeVideo();
  if (!video) return false;
  
  try {
    // 피치를 0으로 리셋 (워클릿 파라미터도 함께 — 안 그러면 소리가 계속 변조됨)
    currentPitchSemitones = 0;
    if (pitchWorkletNode && pitchWorkletNode.parameters) {
      const semitonesParam = pitchWorkletNode.parameters.get('semitones');
      if (semitonesParam) semitonesParam.value = 0;
    }
    
    // 피치 시스템이 초기화되어 있으면 비디오의 muted 해제
    if (isPitchInitialized) {
      video.muted = false;
      console.log('🎵 Video unmuted - original audio restored');
    }
    
    console.log('🎵 Pitch disabled');
    return true;
  } catch (error) {
    console.error('🎵 Failed to disable pitch:', error);
    return false;
  }
}

// ===== 키보드 단축키 =====

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// 팝업 없이 단축키를 쓸 때 화면 위에 잠깐 보여주는 안내
let toastElement = null;
let toastTimer = null;
function showToast(text) {
  try {
    if (!toastElement) {
      toastElement = document.createElement('div');
      toastElement.setAttribute('data-video-controller-toast', '');
      Object.assign(toastElement.style, {
        position: 'fixed', top: '72px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483647', padding: '8px 16px', borderRadius: '10px',
        background: 'rgba(20, 20, 20, 0.88)', color: '#fff',
        font: '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        pointerEvents: 'none', transition: 'opacity 0.2s',
      });
    }
    // 전체화면에서도 보이도록 전체화면 요소 안에 붙인다
    const host = document.fullscreenElement || document.body;
    if (toastElement.parentNode !== host) host.appendChild(toastElement);
    toastElement.textContent = text;
    toastElement.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastElement.style.opacity = '0'; }, 1200);
  } catch (_) { /* 안내 표시 실패는 무시 */ }
}

function notifyStateChanged() {
  // 팝업이 열려 있으면 화면을 다시 맞춘다 (닫혀 있으면 받는 쪽이 없어 실패하므로 무시)
  try {
    const p = chrome.runtime.sendMessage({ type: 'videoStateChanged' });
    if (p && p.catch) p.catch(() => {});
  } catch (_) { /* ignore */ }
}

async function handleShortcut(command) {
  const video = getYouTubeVideo();
  if (!video) return false;
  const lastEnd = Math.max((video.duration || 0) - 1, 1);
  const now = video.currentTime || 0;

  switch (command) {
    case 'speed-up':
    case 'speed-down': {
      const delta = command === 'speed-up' ? 0.1 : -0.1;
      const base = desiredPlaybackRate !== null ? desiredPlaybackRate : video.playbackRate;
      const speed = Math.round(Math.max(0.25, Math.min(4, base + delta)) * 100) / 100;
      setPlaybackRate(speed);
      showToast(`⚡ ${speed}x`);
      break;
    }
    case 'pitch-up':
    case 'pitch-down': {
      const next = currentPitchSemitones + (command === 'pitch-up' ? 1 : -1);
      const ok = await applyPitchSemitones(next);
      if (!ok) return false;
      showToast(`🎵 ${currentPitchSemitones > 0 ? '+' : ''}${currentPitchSemitones}`);
      break;
    }
    case 'loop-a': {
      // A만 지정: 반복 중이면 구간을 바로 갱신, 아니면 B를 기다린다
      loopStart = Math.max(0, Math.min(now, lastEnd - 1));
      if (loopEnd <= loopStart + 1) loopEnd = lastEnd;
      if (isLooping) setLoop(loopStart, loopEnd, true);
      showToast(`A ${formatClock(loopStart)}`);
      break;
    }
    case 'loop-b': {
      // B를 지정하면 A~B 반복 시작
      const end = Math.min(Math.max(now, 1), lastEnd);
      const start = loopStart < end - 1 ? loopStart : 0;
      loopStart = start;
      loopEnd = end;
      setLoop(start, end, true);
      showToast(`🔁 ${formatClock(start)} – ${formatClock(end)}`);
      break;
    }
    case 'loop-toggle': {
      if (isLooping) {
        setLoop(loopStart, loopEnd, false);
        showToast('🔁 Off');
      } else if (loopEnd > loopStart + 1) {
        setLoop(loopStart, loopEnd, true);
        showToast(isLooping ? `🔁 ${formatClock(loopStart)} – ${formatClock(loopEnd)}` : '🔁 Off');
      } else {
        showToast('🔁 A/B를 먼저 지정하세요');
        return false;
      }
      break;
    }
    default:
      return false;
  }

  notifyStateChanged();
  return true;
}

// 안전한 메시지 리스너
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 실행 환경 재확인
    if (window.location.href === 'about:blank' || !document) {
      sendResponse({ success: false, error: 'Invalid execution context' });
      return false;
    }
    
    try {
      switch (request.action) {
      case 'getVideoInfo':
        const info = getVideoInfo();
        sendResponse({ 
          success: !!info, 
          ...info 
        });
        break;

      case 'getVideoState':
        const videoState = getYouTubeVideo();
        if (videoState) {
          const effectiveVolume = (outputGainNode && outputGainNode.gain && typeof outputGainNode.gain.value === 'number')
            ? outputGainNode.gain.value
            : cachedVolume;
          sendResponse({
            success: true,
            isPlaying: !videoState.paused,
            volume: effectiveVolume,
            currentTime: videoState.currentTime,
            duration: videoState.duration,
            speed: videoState.playbackRate,
            pitch: currentPitchSemitones,
            loop: {
              start: loopStart,
              end: loopEnd,
              enabled: isLooping
            }
          });
        } else {
          sendResponse({ success: false });
        }
        break;

      case 'getVideoInfo':
        const video = getYouTubeVideo();
        if (video) {
          const title = getVideoTitle();
          const url = window.location.href;
          sendResponse({
            success: true,
            title: title,
            url: url,
            duration: video.duration,
            currentTime: video.currentTime
          });
        } else {
          sendResponse({ success: false, error: 'No video found' });
        }
        break;

      case 'togglePlayPause':
        const playPauseVideo = getYouTubeVideo();
        if (playPauseVideo) {
          if (playPauseVideo.paused) {
            playPauseVideo.play();
            console.log('▶️ Video resumed');
          } else {
            playPauseVideo.pause();
            console.log('⏸️ Video paused');
          }
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No video found' });
        }
        break;

      case 'setVolume':
        const volumeVideo = getYouTubeVideo();
        if (volumeVideo) {
          const vol = Math.max(0, Math.min(1, request.volume));
          cachedVolume = vol;
          
          // Web Audio API가 활성화되어 있으면 그쪽으로만 볼륨 설정
          if (outputGainNode && outputGainNode.gain) {
            outputGainNode.gain.value = vol;
            console.log(`🔊 Volume set via Web Audio: ${vol}`);
          } else {
            // Web Audio가 없으면 비디오 element 직접 제어
            volumeVideo.volume = vol;
            console.log(`🔊 Volume set via video element: ${vol}`);
          }
          
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false });
        }
        break;

      case 'setPlaybackRate':
        const speedResult = setPlaybackRate(request.speed);
        sendResponse({ success: speedResult });
        break;



      case 'seekTo':
        (async () => {
          const seekResult = await seekTo(request.time);
          sendResponse({ success: seekResult });
        })();
        return true;

      case 'setLoop':
        const loopResult = setLoop(request.start, request.end, request.enabled);
        sendResponse({ success: loopResult });
        break;

      case 'setPitch':
        (async () => {
          const ok = await setPitch(request.pitch);
          sendResponse({ success: ok, currentPitch: currentPitchSemitones });
        })();
        return true;

      case 'initializePitch':
        (async () => {
          const ok = await initializePitch();
          sendResponse(ok ? { success: true } : { success: false, reason: pitchInitError });
        })();
        return true;

      case 'disablePitch':
        const disableResult = disablePitch();
        sendResponse({ success: disableResult });
        break;

      case 'shortcut':
        (async () => {
          const ok = await handleShortcut(request.command);
          sendResponse({ success: ok });
        })();
        return true;

      case 'resetAll':
        resetAllControls();
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    } catch (error) {
      console.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  });
}

// 안전한 실행 환경 체크
(function() {
  'use strict';
  
  // 스크립트 실행 환경 체크
  try {
    if (window.location.href === 'about:blank' || 
        window !== window.top || 
        !document || 
        document.readyState === 'loading') {
      console.log('Video Controller: Skipping execution in sandboxed/iframe context');
      return;
    }
    
    // YouTube 페이지인지 확인
    if (!window.location.hostname.includes('youtube.com')) {
      console.log('Video Controller: Not on YouTube, skipping');
      return;
    }
    
    console.log('Video Controller: Content script loaded safely');
    
    // 비디오 요소가 로드될 때까지 대기
    function waitForVideo() {
      const video = document.querySelector('video');
      if (video) {
        console.log('Video Controller: Video element found');
        // 비디오를 찾으면 자동 감지 시작
        startVideoChangeDetection();
        return true;
      }
      return false;
    }
    
    // 페이지 로드 완료 후 비디오 확인
    if (document.readyState === 'complete') {
      waitForVideo();
    } else {
      document.addEventListener('DOMContentLoaded', waitForVideo);
      window.addEventListener('load', waitForVideo);
    }
    
  } catch (error) {
    console.error('Video Controller: Initialization error:', error);
  }
})();