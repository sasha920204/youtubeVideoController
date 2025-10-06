import React, { useState, useEffect, useRef } from "react";
import BasicVideoControl from "./BasicVideoControl";
import SpeedControl from "./SpeedControl";
import LoopControl from "./LoopControl";
import PitchControl from "./PitchControl";

const VideoController = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");

  // 전역 활성화 상태 (마스터 스위치)
  const [isGlobalEnabled, setIsGlobalEnabled] = useState(true);

  // 각 기능의 활성화 상태
  const [isSpeedEnabled, setIsSpeedEnabled] = useState(true);
  const [isLoopEnabled, setIsLoopEnabled] = useState(true);
  const [isPitchEnabled, setIsPitchEnabled] = useState(true);

  // 피치 관련 상태
  const [currentPitch, setCurrentPitch] = useState(0);

  // 상태가 로드되었는지 추적
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  
  // 초기 loopEnd 설정이 완료되었는지 추적
  const [isInitialLoopEndSet, setIsInitialLoopEndSet] = useState(false);

  const getCurrentSongKey = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });
      
      if (response && response.success && response.title) {
        const songKey = `${response.title}_${response.url || ''}`
          .replace(/[^a-zA-Z0-9가-힣_]/g, '_')
          .substring(0, 100);
        return songKey;
      }
    } catch (error) {
      console.log('Failed to get song key:', error);
    }
    return 'default';
  };

  // 전역 설정만 저장 (곡별 저장 제거)
  const saveGlobalSettings = async (settings) => {
    try {
      await chrome.storage.local.set(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const loadStateFromStorage = async () => {
    try {
      // 전역 ON/OFF 상태만 로드
      const globalResult = await chrome.storage.local.get(['isGlobalEnabled']);
      if (globalResult.isGlobalEnabled !== undefined) {
        setIsGlobalEnabled(globalResult.isGlobalEnabled);
      }
      
      // 모든 설정을 기본값으로 시작 (곡별 저장 제거)
      setCurrentSpeed(1.0);
      setCurrentPitch(0);
      setLoopStart(0);
      setLoopEnd(0);
      setIsLooping(false);
      setIsSpeedEnabled(true);
      setIsPitchEnabled(true);
      setIsLoopEnabled(true);
      
      setIsStateLoaded(true);
      console.log('✅ 기본 설정으로 시작 (곡별 저장 비활성화)');
    } catch (error) {
      console.error('Failed to load state:', error);
      setIsStateLoaded(true);
    }
  };

  const syncWithContentScript = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoState' });
      
      if (response && response.success) {
        const { speed, pitch, loop } = response;
        
        if (speed !== undefined) setCurrentSpeed(speed);
        if (pitch !== undefined) setCurrentPitch(pitch);
        if (loop) {
          if (loop.start !== undefined) setLoopStart(loop.start);
          if (loop.end !== undefined) setLoopEnd(loop.end);
          if (loop.enabled !== undefined) setIsLooping(loop.enabled);
        }
      }
    } catch (error) {
      console.log('Sync failed:', error);
    }
  };

  // 컴포넌트 마운트 시 상태 로드 및 동기화
  useEffect(() => {
    const initializeState = async () => {
      // 현재 곡 기준으로 storage에서 로드
      await loadStateFromStorage();
      // content script와 동기화
      await syncWithContentScript();
    };
    
    initializeState();
  }, []);

  const applyRestoredSettings = async () => {
    if (!isConnected || !isStateLoaded || !isGlobalEnabled) return;
    
    try {
      if (isSpeedEnabled && currentSpeed !== 1.0) {
        await sendMessage({ action: "setPlaybackRate", speed: currentSpeed });
      }
      
      if (isLoopEnabled && isLooping && loopStart !== loopEnd) {
        await sendMessage({
          action: "setLoop",
          start: loopStart,
          end: loopEnd,
          enabled: true,
        });
      }
      
      if (isPitchEnabled && currentPitch !== 0) {
        await sendMessage({ action: "setPitch", pitch: currentPitch });
      }
    } catch (error) {
      console.error('Failed to apply settings:', error);
    }
  };

  // 비디오 상태 확인 및 연결
  useEffect(() => {
    const checkVideoConnection = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab && tab.url.includes("youtube.com")) {
          const result = await chrome.tabs.sendMessage(tab.id, {
            action: "getVideoInfo",
          });
          if (result && result.success) {
            setIsConnected(true);
            setVideoDuration(result.duration);
            setCurrentTime(result.currentTime);
            setVideoTitle(result.title || "Unknown Video");
            
            // loopEnd 초기화 또는 수정
            if (!isInitialLoopEndSet && isStateLoaded && loopEnd === 0 && result.duration > 0) {
              // 새 곡 - 비디오 길이로 설정
              setLoopEnd(result.duration);
              setIsInitialLoopEndSet(true);
            } else if (loopEnd > result.duration && result.duration > 0) {
              // loopEnd가 비디오 길이보다 크면 비디오 길이로 제한 (1초 마진)
              setLoopEnd(Math.max(result.duration - 1, 1));
            }
          }
        }
      } catch (error) {
        console.log("Video connection failed:", error);
        setIsConnected(false);
      }
    };

    checkVideoConnection();
    const interval = setInterval(checkVideoConnection, 1000); // 더 자주 업데이트
    return () => clearInterval(interval);
  }, [isStateLoaded, isInitialLoopEndSet, loopEnd]);

  // 연결되고 상태가 로드되면 설정 적용
  useEffect(() => {
    if (isConnected && isStateLoaded) {
      applyRestoredSettings();
    }
  }, [isConnected, isStateLoaded, isGlobalEnabled]);

  // 메시지를 content script로 전송하는 헬퍼 함수
  const sendMessage = async (message) => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      console.log("Message send failed:", error);
      return { success: false };
    }
  };

  const handleGlobalToggle = async () => {
    const newState = !isGlobalEnabled;
    setIsGlobalEnabled(newState);
    await chrome.storage.local.set({ isGlobalEnabled: newState });
    
    if (!newState) {
      await sendMessage({ action: "setPlaybackRate", speed: 1.0 });
      await sendMessage({ action: "setLoop", start: 0, end: videoDuration, enabled: false });
      await sendMessage({ action: "disablePitch" });
    } else {
      if (isSpeedEnabled && currentSpeed !== 1.0) {
        await sendMessage({ action: "setPlaybackRate", speed: currentSpeed });
      }
      if (isLoopEnabled && isLooping) {
        await sendMessage({ action: "setLoop", start: loopStart, end: loopEnd, enabled: true });
      }
      if (isPitchEnabled && currentPitch !== 0) {
        await sendMessage({ action: "initializePitch" });
        await sendMessage({ action: "setPitch", pitch: currentPitch });
      }
    }
  };

  const handleSpeedChange = async (speed) => {
    if (!isGlobalEnabled || !isSpeedEnabled) return;
    setCurrentSpeed(speed);
    await sendMessage({ action: "setPlaybackRate", speed });
  };



  const handleSpeedToggle = async () => {
    if (!isGlobalEnabled) return;
    const newState = !isSpeedEnabled;
    setIsSpeedEnabled(newState);
    if (!newState) {
      await sendMessage({ action: "setPlaybackRate", speed: 1.0 });
    } else {
      await sendMessage({ action: "setPlaybackRate", speed: currentSpeed });
    }
  };



  const handleLoopChange = async (start, end, seekToPoint = null) => {
    if (!isGlobalEnabled) return;
    setLoopStart(start);
    setLoopEnd(end);

    if (seekToPoint !== null) {
      await sendMessage({ action: "seekTo", time: seekToPoint });
    }

    if (isLooping) {
      await sendMessage({ action: "setLoop", start, end, enabled: true });
    }
  };

  const handleLoopToggle = async () => {
    if (!isGlobalEnabled || !isLoopEnabled) return;
    const newLoopState = !isLooping;
    setIsLooping(newLoopState);
    
    await sendMessage({
      action: "setLoop",
      start: loopStart,
      end: loopEnd,
      enabled: newLoopState,
    });
  };

  const handleLoopEnabledToggle = async () => {
    if (!isGlobalEnabled) return;
    const newState = !isLoopEnabled;
    setIsLoopEnabled(newState);
    if (!newState && isLooping) {
      setIsLooping(false);
      await sendMessage({
        action: "setLoop",
        start: loopStart,
        end: loopEnd,
        enabled: false,
      });
    }
  };

  const handleSeekToStart = async () => {
    if (!isGlobalEnabled) return;
    await sendMessage({ action: "seekTo", time: loopStart });
  };

  const handleSeekToEnd = async () => {
    if (!isGlobalEnabled) return;
    await sendMessage({ action: "seekTo", time: loopEnd });
  };

  const handlePreviewLoop = async (start, end) => {
    if (!isGlobalEnabled) return;
    // 시작 지점으로 이동하고 짧은 미리보기 재생
    await sendMessage({ action: "seekTo", time: start });

    // 2초 후에 정지하거나 끝 지점에서 정지
    const previewDuration = Math.min(2, end - start);
    if (previewDuration > 0.5) {
      setTimeout(async () => {
        const stopTime = start + previewDuration;
        await sendMessage({ action: "seekTo", time: Math.min(stopTime, end) });
      }, previewDuration * 1000);
    }
  };

  const handlePitchChange = async (pitch) => {
    if (!isGlobalEnabled || !isPitchEnabled) return;
    const clamped = Math.max(-24, Math.min(24, pitch));
    setCurrentPitch(clamped);
  };

  const handlePitchToggle = async () => {
    if (!isGlobalEnabled) return;
    const newState = !isPitchEnabled;
    setIsPitchEnabled(newState);
    if (!newState) {
      await sendMessage({ action: "disablePitch" });
    } else {
      await sendMessage({ action: "initializePitch" });
    }
  };

  const handleRefresh = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab) {
        await chrome.tabs.reload(tab.id);
      }
    } catch (error) {
      console.log("Refresh failed:", error);
    }
  };

  const handleResetAll = async () => {
    try {
      console.log('🔄 Resetting all controls to default');
      
      // 현재 비디오 길이 가져오기
      let videoDuration = 0;
      try {
        const videoInfo = await sendMessage({ action: "getVideoInfo" });
        if (videoInfo && videoInfo.success && videoInfo.duration) {
          videoDuration = videoInfo.duration;
        }
      } catch (e) {
        console.log('Could not get video duration, using 0');
      }
      
      // 모든 상태를 기본값으로 리셋
      setCurrentSpeed(1.0);
      setLoopStart(0);
      setLoopEnd(videoDuration); // 비디오 길이로 설정
      setIsLooping(false);
      setCurrentPitch(0);
      setIsSpeedEnabled(true);
      setIsLoopEnabled(true);
      setIsPitchEnabled(true);
      
      // Content script에 리셋 명령 전송
      await sendMessage({ action: "setPlaybackRate", speed: 1.0 });
      await sendMessage({ action: "setLoop", start: 0, end: videoDuration, enabled: false });
      await sendMessage({ action: "setPitch", pitch: 0 });
      
      console.log('✅ All controls reset to default');
    } catch (error) {
      console.error('❌ Failed to reset all controls:', error);
    }
  };

  return (
    <div className="video-controller" style={{ marginBottom: '100px' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <h1 className="controller-title" style={{ margin: 0 }}>Video Controller</h1>
        {isConnected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* 전역 ON/OFF 토글 */}
            <div 
              onClick={handleGlobalToggle}
              title={isGlobalEnabled ? 'Extension Enabled (Click to Disable All)' : 'Extension Disabled (Click to Enable)'}
              style={{
                width: '50px',
                height: '26px',
                borderRadius: '13px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.3s',
                backgroundColor: isGlobalEnabled ? '#4caf50' : '#ccc',
                overflow: 'hidden',
                flexShrink: 0
              }}
            >
              <div 
                style={{
                  position: 'absolute',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  top: '3px',
                  left: isGlobalEnabled ? '27px' : '3px',
                  transition: 'left 0.3s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              />
            </div>
            
            {/* 리셋 버튼 */}
            <button
              onClick={handleResetAll}
              title="Reset all controls to original"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f0f0f0';
                e.currentTarget.style.color = '#ff4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#666';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18z"/>
              </svg>
            </button>
          </div>
        )}
      </div>
      
      {!isStateLoaded && (
        <div style={{ 
          textAlign: 'center', 
          padding: '10px', 
          color: '#666',
          fontSize: '14px'
        }}>
          ⏳ 설정을 불러오는 중...
        </div>
      )}

      {isConnected ? (
        <div style={{ 
          opacity: isGlobalEnabled ? 1 : 0.5,
          pointerEvents: isGlobalEnabled ? 'auto' : 'none',
          transition: 'opacity 0.3s'
        }}>
          <BasicVideoControl
            isConnected={isConnected}
            videoTitle={videoTitle}
          />
          <SpeedControl
            currentSpeed={currentSpeed}
            onSpeedChange={handleSpeedChange}
            isEnabled={isSpeedEnabled}
            onToggle={handleSpeedToggle}
          />
          <LoopControl
            videoDuration={videoDuration}
            currentTime={currentTime}
            loopStart={loopStart}
            loopEnd={loopEnd}
            isLooping={isLooping}
            onLoopChange={handleLoopChange}
            onLoopToggle={handleLoopToggle}
            onSeekToStart={handleSeekToStart}
            onSeekToEnd={handleSeekToEnd}
            onPreviewLoop={handlePreviewLoop}
            isEnabled={isLoopEnabled}
            onEnabledToggle={handleLoopEnabledToggle}
          />
          <PitchControl
            currentPitch={currentPitch}
            onPitchChange={handlePitchChange}
            isEnabled={isPitchEnabled}
            onToggle={handlePitchToggle}
          />
        </div>
      ) : (
        <div
          className={`status-indicator ${
            isConnected ? "connected" : "disconnected"
          }`}
        >
          <div className="disconnected-content">
            <div>🔴 Please open YouTube to use this extension</div>
            <button
              className="refresh-button"
              onClick={handleRefresh}
              title="Refresh current page"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                fontSize: "14px",
                fontWeight: "600",
                width: "100%",
                justifyContent: "center",
                marginTop: "10px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
              Refresh Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoController;
