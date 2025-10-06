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
let isWorkletLoaded = false; // Worklet 모듈 로드 상태
let currentPitchSemitones = 0; // 저장용
let cachedVolume = 1.0; // 마지막 설정된 볼륨 (0~1) - 기본값 100%

// 곡 변경 감지를 위한 변수들
let lastVideoTitle = '';
let lastVideoCurrentTime = 0;
let videoChangeCheckInterval = null;

async function ensureAudioContextResumed(ctx) {
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (e) { /* ignore */ }
  }
}

function getYouTubeVideo() {
  return document.querySelector('video');
}

async function initializePitch() {
  const video = getYouTubeVideo();
  if (!video) {
    console.log('🎵 Pitch init: No video element found');
    return false;
  }
  if (isPitchInitialized) {
    console.log('🎵 Pitch already initialized');
    await ensureAudioContextResumed(audioContext);
    return true;
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
        return false;
      }
    }

    if (!mediaSourceNode) {
      mediaSourceNode = audioContext.createMediaElementSource(video);
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
    console.log('🎵 Pitch system initialized successfully');
    return true;
  } catch (error) {
    console.error('🎵 Pitch init failed:', error);
    isPitchInitialized = false;
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
    
    // Always keep video at normal speed (pitch is handled by worklet)
    video.playbackRate = 1.0;
    
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
    // 속도 리셋
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

// 비디오 변경 감지 함수
function checkForVideoChange() {
  const video = getYouTubeVideo();
  if (!video) return;
  
  const currentTitle = getVideoTitle();
  const currentTime = video.currentTime;
  
  // 제목이 변경되었거나, 현재 시간이 크게 뒤로 건너뛴 경우 (새 곡으로 판단)
  const titleChanged = currentTitle !== lastVideoTitle && lastVideoTitle !== '';
  const timeJumpedBack = currentTime < lastVideoCurrentTime - 30; // 30초 이상 뒤로 이동
  const timeJumpedForward = currentTime > lastVideoCurrentTime + 60; // 1분 이상 앞으로 이동
  
  if (titleChanged || timeJumpedBack || timeJumpedForward) {
    console.log('🎵 Video change detected:', {
      titleChanged,
      timeJumpedBack,
      timeJumpedForward,
      oldTitle: lastVideoTitle,
      newTitle: currentTitle,
      oldTime: lastVideoCurrentTime,
      newTime: currentTime
    });
    
    resetAllControls();
  }
  
  lastVideoTitle = currentTitle;
  lastVideoCurrentTime = currentTime;
}

// 비디오 변경 감지 시작
function startVideoChangeDetection() {
  if (videoChangeCheckInterval) {
    clearInterval(videoChangeCheckInterval);
  }
  
  // 초기값 설정
  lastVideoTitle = getVideoTitle();
  const video = getYouTubeVideo();
  lastVideoCurrentTime = video ? video.currentTime : 0;
  
  // 5초마다 체크
  videoChangeCheckInterval = setInterval(checkForVideoChange, 5000);
  console.log('🎵 Video change detection started');
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

// 재생 속도 설정
function setPlaybackRate(speed) {
  const video = getYouTubeVideo();
  if (video) {
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

  if (end >= video.duration - 0.5 && start === 0) {
    console.log('⚠️ Full video loop disabled');
    isLooping = false;
    return true;
  }

  loopStart = start;
  loopEnd = Math.min(end, video.duration - 0.5);
  isLooping = true;

  // 1. 비디오 종료 이벤트 차단 (다음 곡 넘어가기 방지)
  videoEndedHandler = (e) => {
    if (isLooping) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      video.currentTime = loopStart;
      video.play().catch(() => {});
      return false;
    }
  };
  video.addEventListener('ended', videoEndedHandler, true);

  // 2. 선제적 루프 점프 (0.3초 전에 미리 돌아감)
  videoTimeupdateHandler = () => {
    if (!isLooping || video.paused) return;
    
    const currentTime = video.currentTime;
    
    if (currentTime >= loopEnd - 0.3 || currentTime >= loopEnd) {
      video.currentTime = loopStart;
    } else if (currentTime < loopStart) {
      video.currentTime = loopStart;
    }
  };
  video.addEventListener('timeupdate', videoTimeupdateHandler);

  // 3. 백업 인터벌 (이벤트 놓침 대비)
  loopInterval = setInterval(() => {
    if (!video || video.paused || !isLooping) return;
    if (video.currentTime >= loopEnd) {
      video.currentTime = loopStart;
    }
  }, 50);

  console.log(`✅ Loop active with 3-layer protection`);
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
    // 피치를 0으로 리셋
    currentPitchSemitones = 0;
    
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
          sendResponse({ success: ok });
        })();
        return true;

      case 'disablePitch':
        const disableResult = disablePitch();
        sendResponse({ success: disableResult });
        break;

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