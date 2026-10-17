import React, { useState, useRef, useCallback } from 'react';

const LoopControl = ({ 
  videoDuration, 
  currentTime, 
  loopStart, 
  loopEnd, 
  isLooping,
  onLoopChange,
  onLoopToggle,
  onSeekToStart,
  onSeekToEnd,
  isEnabled,
  onEnabledToggle,
  onSetPointNow
}) => {
  const [isDragging, setIsDragging] = useState(null);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const sliderRef = useRef(null);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeToPercentage = (time) => {
    return videoDuration > 0 ? (time / videoDuration) * 100 : 0;
  };

  const percentageToTime = (percentage) => {
    return (percentage / 100) * videoDuration;
  };

  // 끝점을 안전하게 제한 (비디오 끝으로부터 1초 마진)
  const constrainEndPoint = useCallback((endTime) => {
    let newEnd = Math.max(endTime, loopStart + 1);
    if (videoDuration > 0 && newEnd > videoDuration - 1) {
      newEnd = Math.max(videoDuration - 1, loopStart + 1);
    }
    return newEnd;
  }, [loopStart, videoDuration]);

  // 드래그 중에는 구간만 바꾸고 영상은 이동시키지 않는다.
  // (예전에는 마우스가 움직일 때마다 영상을 이동시켜서 버퍼링이 쌓이고 재생이 버벅였다)
  // 손을 떼면 마지막 위치로 한 번만 이동한다.
  const handleMouseDown = (type) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(type);
    let last = null;
    
    const handleMove = (moveEvent) => {
      if (!sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      if (!rect.width) return;
      const percentage = Math.max(0, Math.min(100, 
        ((moveEvent.clientX - rect.left) / rect.width) * 100
      ));
      const time = percentageToTime(percentage);

      if (type === 'start') {
        const newStart = Math.min(time, loopEnd - 1);
        last = { start: newStart, end: loopEnd, seek: newStart };
      } else {
        const newEnd = constrainEndPoint(time);
        last = { start: loopStart, end: newEnd, seek: Math.max(newEnd - 1, loopStart) };
      }
      onLoopChange(last.start, last.end);
    };

    const handleUp = () => {
      setIsDragging(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      if (last) onLoopChange(last.start, last.end, last.seek);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const handleTrackClick = (e) => {
    if (isDragging || e.target.classList.contains('unified-slider-thumb')) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(100, 
      ((e.clientX - rect.left) / rect.width) * 100
    ));
    const time = percentageToTime(percentage);
    
    const distanceToStart = Math.abs(time - loopStart);
    const distanceToEnd = Math.abs(time - loopEnd);
    
    if (distanceToStart < distanceToEnd) {
      const newStart = Math.min(time, loopEnd - 1);
      onLoopChange(newStart, loopEnd, newStart);
    } else {
      const newEnd = constrainEndPoint(time);
      const seekPoint = Math.max(newEnd - 1, loopStart);
      onLoopChange(loopStart, newEnd, seekPoint);
    }
  };

  const handleInputChange = (type) => (e) => {
    const value = e.target.value;
    if (type === 'start') {
      setStartInput(value);
    } else {
      setEndInput(value);
    }
  };

  const handleInputSubmit = (type) => () => {
    const value = type === 'start' ? startInput : endInput;
    const timeMatch = value.match(/^(\d+):(\d+)$/) || value.match(/^(\d+)$/);
    
    if (!timeMatch) return;
    
    const seconds = timeMatch[2] !== undefined
      ? parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2])
      : parseInt(timeMatch[1]);
    
    const clampedSeconds = Math.max(0, Math.min(videoDuration, seconds));
    
    if (type === 'start') {
      const newStart = Math.min(clampedSeconds, loopEnd - 1);
      onLoopChange(newStart, loopEnd, newStart);
      setStartInput('');
    } else {
      const newEnd = constrainEndPoint(clampedSeconds);
      const seekPoint = Math.max(newEnd - 1, loopStart);
      onLoopChange(loopStart, newEnd, seekPoint);
      setEndInput('');
    }
  };

  const handleInputKeyPress = (type) => (e) => {
    if (e.key === 'Enter') {
      handleInputSubmit(type)();
    }
  };

  const startPercentage = Math.min(100, Math.max(0, timeToPercentage(loopStart)));
  const endPercentage = Math.min(100, Math.max(0, timeToPercentage(loopEnd)));
  const currentPercentage = Math.min(100, Math.max(0, timeToPercentage(currentTime)));

  return (
    <div className={`control-section ${!isEnabled ? 'disabled' : ''}`}>
      <div className="section-header">
        <h3 className="section-title">🔄 Loop Control</h3>
        <div 
          className={`toggle-switch ${isEnabled ? 'enabled' : 'disabled'}`}
          onClick={onEnabledToggle}
          title={isEnabled ? 'Disable Loop Control' : 'Enable Loop Control'}
        >
          <div className="toggle-switch-thumb"></div>
        </div>
      </div>
      
      <div className="loop-controls">
        {/* A/B 지점: 직접 입력하거나 "Now"로 현재 재생 위치를 지정 */}
        <div className="loop-points">
          <div className="loop-point">
            <span className="loop-point-label a">A</span>
            <input
              type="text"
              className="loop-point-input"
              placeholder={formatTime(loopStart)}
              value={startInput}
              onChange={handleInputChange('start')}
              onKeyPress={handleInputKeyPress('start')}
              onBlur={handleInputSubmit('start')}
              title="Set start time (MM:SS or SS)"
            />
            <button
              className="control-button now-button"
              onClick={() => onSetPointNow('start')}
              title="Set start (A) to current position"
            >
              Now
            </button>
          </div>

          <span style={{ color: '#888', fontSize: '14px', fontWeight: 'bold' }}>–</span>

          <div className="loop-point">
            <span className="loop-point-label b">B</span>
            <input
              type="text"
              className="loop-point-input"
              placeholder={formatTime(loopEnd)}
              value={endInput}
              onChange={handleInputChange('end')}
              onKeyPress={handleInputKeyPress('end')}
              onBlur={handleInputSubmit('end')}
              title="Set end time (MM:SS or SS)"
            />
            <button
              className="control-button now-button"
              onClick={() => onSetPointNow('end')}
              title="Set end (B) to current position and start loop"
            >
              Now
            </button>
          </div>
        </div>

        <div className="slider-container" style={{ margin: '12px 0 0' }}>
          <div 
            ref={sliderRef}
            className="unified-slider-track"
            onClick={handleTrackClick}
            style={{
              margin: '0 9px',
              position: 'relative'
            }}
          >
            <div 
              className="unified-slider-range"
              style={{
                left: `${startPercentage}%`,
                width: `${endPercentage - startPercentage}%`
              }}
            />
            
            {/* 현재 재생 위치 표시 - 선으로 표시 */}
            <div 
              style={{
                position: 'absolute',
                left: `${currentPercentage}%`,
                top: '0',
                bottom: '0',
                width: '4px',
                background: '#FFC107',
                borderRadius: '2px',
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                zIndex: 15,
                boxShadow: '0 0 6px rgba(255, 193, 7, 0.9)'
              }}
            />
            
            {/* 시작 썸 */}
            <div 
              className="unified-slider-thumb"
              style={{ 
                left: `${startPercentage}%`,
                borderColor: '#FF9800'
              }}
              onMouseDown={handleMouseDown('start')}
              title={`Start: ${formatTime(loopStart)}`}
            />
            
            {/* End thumb */}
            <div 
              className="unified-slider-thumb"
              style={{ 
                left: `${endPercentage}%`,
                borderColor: '#2196F3'
              }}
              onMouseDown={handleMouseDown('end')}
              title={`End: ${formatTime(loopEnd)}`}
            />
          </div>
          
          <div className="slider-labels" style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginTop: '6px',
            fontSize: '10px',
            color: '#888',
            padding: '0 9px' // 슬라이더 트랙과 동일한 패딩
          }}>
            <span>0:00</span>
            <span>{formatTime(videoDuration)}</span>
          </div>
        </div>

        <div className="loop-actions">
          <button
            className={`control-button loop-action-button ${isLooping ? 'looping' : ''}`}
            onClick={onLoopToggle}
            title={isLooping ? 'Stop Loop' : 'Start Loop'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              {isLooping ? (
                <path d="M6 6h12v12H6z"/>
              ) : (
                <path d="M8 5v14l11-7z"/>
              )}
            </svg>
            {isLooping ? 'Stop' : 'Loop'}
          </button>

          <button
            className="control-button loop-action-button"
            onClick={onSeekToStart}
            title="Jump to start point"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
            To A
          </button>
          
          <button
            className="control-button loop-action-button"
            onClick={() => onLoopChange(0, videoDuration)}
            title="Reset loop to full video"
          >
            Full
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoopControl;
