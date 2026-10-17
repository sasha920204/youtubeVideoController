import React, { useState, useEffect, useCallback } from 'react';
import { TOP_FRAME } from '../tabMessaging';

const BasicVideoControl = ({ 
  isConnected, 
  videoTitle,
  onPlayPause,
  onVolumeChange,
  onProgressChange
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);

  // Listen for video state updates
  useEffect(() => {
    if (!isConnected) return;

    const messageListener = (message) => {
      if (message.type === 'videoStateUpdate') {
        setIsPlaying(message.isPlaying);
        setVolume(message.volume);
        if (!isDragging) {
          setCurrentTime(message.currentTime);
        }
        setDuration(message.duration);
      }
    };

    const requestVideoState = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getVideoState' }, TOP_FRAME, (response) => {
            if (response && response.success) {
              setIsPlaying(response.isPlaying);
              // 신뢰 가능한 게인 노드를 소스 오브 트루스로 사용
              if (typeof response.volume === 'number') setVolume(response.volume);
              if (!isDragging) {
                setCurrentTime(response.currentTime);
              }
              setDuration(response.duration);
            }
          });
        }
      });
    };

    chrome.runtime.onMessage.addListener(messageListener);
    
    // Request initial state immediately
    requestVideoState();
    
    // Request state every 2 seconds to ensure sync
    const stateInterval = setInterval(requestVideoState, 2000);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      clearInterval(stateInterval);
    };
  }, [isConnected, isDragging]);

  const handlePlayPause = useCallback(() => {
    if (!isConnected) return;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'togglePlayPause'
        }, TOP_FRAME);
      }
    });
  }, [isConnected]);

  const handleVolumeChange = useCallback((newVolume) => {
    if (!isConnected) return;
    
    setVolume(newVolume);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'setVolume',
          volume: newVolume
        }, TOP_FRAME);
      }
    });
  }, [isConnected]);

  const handleVolumeMouseDown = useCallback((e) => {
    if (!isConnected) return;
    e.preventDefault();
    setIsVolumeDragging(true);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = (rect.bottom - e.clientY) / rect.height;
    const newVolume = Math.max(0, Math.min(1, progress));
    handleVolumeChange(newVolume);
  }, [isConnected, handleVolumeChange]);

  const handleVolumeMouseMove = useCallback((e) => {
    if (!isVolumeDragging) return;
    
    const volumeTrack = document.querySelector('.volume-track');
    if (volumeTrack) {
      const rect = volumeTrack.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (rect.bottom - e.clientY) / rect.height));
      handleVolumeChange(progress);
    }
  }, [isVolumeDragging, handleVolumeChange]);

  const handleVolumeMouseUp = useCallback(() => {
    setIsVolumeDragging(false);
  }, []);

  const handleProgressMouseDown = useCallback((e) => {
    if (!isConnected) return;
    setIsDragging(true);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = (e.clientX - rect.left) / rect.width;
    const newTime = progress * duration;
    setCurrentTime(newTime);
  }, [isConnected, duration]);

  const handleProgressMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = progress * duration;
    setCurrentTime(newTime);
  }, [isDragging, duration]);

  const handleProgressMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'seekTo',
          time: currentTime
        }, TOP_FRAME);
      }
    });
  }, [isDragging, currentTime]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleProgressMouseMove);
      document.addEventListener('mouseup', handleProgressMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleProgressMouseMove);
        document.removeEventListener('mouseup', handleProgressMouseUp);
      };
    }
  }, [isDragging, handleProgressMouseMove, handleProgressMouseUp]);

  useEffect(() => {
    if (isVolumeDragging) {
      document.addEventListener('mousemove', handleVolumeMouseMove);
      document.addEventListener('mouseup', handleVolumeMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleVolumeMouseMove);
        document.removeEventListener('mouseup', handleVolumeMouseUp);
      };
    }
  }, [isVolumeDragging, handleVolumeMouseMove, handleVolumeMouseUp]);

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!isConnected) {
    return null;
  }

  return (
    <div 
      className="basic-video-control-sticky"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: '15px', // 스크롤바 공간 확보
        background: 'linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%)',
        backdropFilter: 'blur(10px)',
        borderTop: '2px solid #3a3a3c',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '12px',
        height: '74px', // 고정 높이 (패딩 12px * 2 + 내용 50px)
        boxSizing: 'border-box'
      }}
    >
      {/* Play/Pause Toggle Button */}
        <button
          className={`control-button ${isPlaying ? 'active' : ''}`}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
          style={{
            padding: '12px',
            fontSize: '15px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '48px',
            minHeight: '48px',
            background: isPlaying ? 'rgba(244, 67, 54, 0.2)' : 'rgba(76, 175, 80, 0.2)',
            border: isPlaying ? '2px solid #f44336' : '2px solid #4caf50',
            color: isPlaying ? '#f44336' : '#4caf50',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Progress Bar with Title - Takes most space */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          flex: 1, 
          gap: '3px',
          minWidth: 0  // flex 컨테이너에서 shrink 허용
        }}>
          {/* Video Title - 고정 높이 */}
          <div style={{
            height: '16px', // 고정 높이
            overflow: 'hidden',
            padding: '0 4px',
            position: 'relative',
            width: '100%'
          }}>
            <div 
              style={{
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)',
                letterSpacing: '0.2px',
                lineHeight: '16px', // 고정 라인 높이
                position: 'absolute',
                left: '4px',
                right: '4px',
                top: '0',
                // 애니메이션 조건부 적용
                ...(isPlaying && videoTitle && videoTitle.length > 25 ? {
                  animation: 'marquee 15s linear infinite',
                  width: 'max-content',
                  paddingRight: '50px'
                } : {
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                })
              }}
              title={videoTitle}
            >
              🎵 {videoTitle || 'No video selected'}
            </div>
            
            {/* CSS Animation Keyframes */}
            <style>
              {`
                @keyframes marquee {
                  0% {
                    transform: translateX(100%);
                  }
                  100% {
                    transform: translateX(-100%);
                  }
                }
              `}
            </style>
          </div>
          
          {/* Progress Bar */}
          <div 
            className="unified-slider-track"
            style={{ 
              height: '10px',
              width: '100%'
            }}
            onMouseDown={handleProgressMouseDown}
          >
            <div 
              className="unified-slider-fill"
              style={{
                width: `${progressPercentage}%`,
                transition: isDragging ? 'none' : 'width 0.1s ease'
              }}
            />
            
            {/* Progress thumb */}
            <div 
              className="unified-slider-thumb"
              style={{
                left: `${progressPercentage}%`,
                transition: isDragging ? 'none' : 'left 0.1s ease',
                zIndex: 10
              }}
            />
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '10px', 
            color: '#c0c0c0',
            fontWeight: '500',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
            height: '12px', // 고정 높이
            lineHeight: '12px', // 고정 라인 높이
            width: '100%' // 고정 너비
          }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume Control - Unified Vertical Slider */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '10px',
          height: '50px'
        }}>
          <div 
            className="unified-slider-track volume-track"
            style={{ 
              width: '10px', 
              height: '45px',
              flexDirection: 'column'
            }}
            onMouseEnter={() => setIsVolumeHovered(true)}
            onMouseLeave={() => setIsVolumeHovered(false)}
            onMouseDown={handleVolumeMouseDown}
            onClick={(e) => {
              if (!isVolumeDragging) {
                const rect = e.currentTarget.getBoundingClientRect();
                const progress = (rect.bottom - e.clientY) / rect.height;
                handleVolumeChange(Math.max(0, Math.min(1, progress)));
              }
            }}
          >
            {/* Volume Fill */}
            <div 
              style={{
                position: 'absolute',
                left: '0',
                bottom: '0',
                width: '100%',
                height: `${volume * 100}%`,
                background: 'linear-gradient(180deg, #4caf50, #388e3c)',
                borderRadius: '3px',
                transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 0 8px rgba(76, 175, 80, 0.4)'
              }}
            />
            
            {/* Volume Thumb - Only visible on hover or drag */}
            <div 
              className="unified-slider-thumb"
              style={{
                left: '50%',
                top: `${(1 - volume) * 100}%`,
                transform: 'translate(-50%, -50%)',
                opacity: isVolumeHovered || isVolumeDragging ? 1 : 0,
                transition: isVolumeDragging ? 'none' : 'opacity 0.2s ease'
              }}
            />
          </div>
        </div>

    </div>
  );
};

export default BasicVideoControl;
