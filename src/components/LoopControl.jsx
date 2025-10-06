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
  onEnabledToggle
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

  // 끝점을 안전하게 제한 (비디오 끝으로부터 0.5초 마진)
  const constrainEndPoint = useCallback((endTime) => {
    let newEnd = Math.max(endTime, loopStart + 1);
    if (videoDuration > 0 && newEnd > videoDuration - 0.5) {
      newEnd = Math.max(videoDuration - 0.5, loopStart + 1);
    }
    return newEnd;
  }, [loopStart, videoDuration]);

  const handleMouseDown = (type) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(type);
    
    const handleMove = (moveEvent) => {
      if (!sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(100, 
        ((moveEvent.clientX - rect.left) / rect.width) * 100
      ));
      const time = percentageToTime(percentage);

      if (type === 'start') {
        const newStart = Math.min(time, loopEnd - 1);
        onLoopChange(newStart, loopEnd, newStart);
      } else {
        const newEnd = constrainEndPoint(time);
        const seekPoint = Math.max(newEnd - 1, loopStart);
        onLoopChange(loopStart, newEnd, seekPoint);
      }
    };

    const handleUp = () => {
      setIsDragging(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
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

  const startPercentage = timeToPercentage(loopStart);
  const endPercentage = timeToPercentage(loopEnd);
  const currentPercentage = timeToPercentage(currentTime);

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

        {/* 시간 입력창 */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <input
            type="text"
            className="control-button"
            placeholder={formatTime(loopStart)}
            value={startInput}
            onChange={handleInputChange('start')}
            onKeyPress={handleInputKeyPress('start')}
            onBlur={handleInputSubmit('start')}
            style={{
              padding: '10px 14px',
              fontSize: '14px',
              fontWeight: '700',
              minWidth: '80px',
              textAlign: 'center',
              background: 'rgba(0, 0, 0, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '8px',
              color: '#ffffff',
              outline: 'none'
            }}
            title="Set start time (MM:SS or SS)"
          />
          
          <span style={{ color: '#888', fontSize: '16px', fontWeight: 'bold' }}>-</span>
          
          <input
            type="text"
            className="control-button"
            placeholder={formatTime(loopEnd)}
            value={endInput}
            onChange={handleInputChange('end')}
            onKeyPress={handleInputKeyPress('end')}
            onBlur={handleInputSubmit('end')}
            style={{
              padding: '10px 14px',
              fontSize: '14px',
              fontWeight: '700',
              minWidth: '80px',
              textAlign: 'center',
              background: 'rgba(0, 0, 0, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '8px',
              color: '#ffffff',
              outline: 'none'
            }}
            title="Set end time (MM:SS or SS)"
          />
        </div>

        <div className="slider-container">
          {/* 시간 라벨 - 시작시간과 종료시간을 슬라이더 위치에 맞춰 표시 */}
          <div style={{ 
            position: 'relative',
            height: '20px',
            marginBottom: '15px',
            fontSize: '12px',
            color: '#c0c0c0',
            fontWeight: '600'
          }}>
            <span style={{ 
              position: 'absolute',
              left: `${Math.max(0, Math.min(85, startPercentage))}%`,
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,1)',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              color: '#FF9800',
              fontWeight: '700',
              zIndex: 20
            }}>
              {formatTime(loopStart)}
            </span>
            <span style={{ 
              position: 'absolute',
              left: `${Math.max(15, Math.min(100, endPercentage))}%`,
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,1)',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              color: '#2196F3',
              fontWeight: '700',
              zIndex: 20
            }}>
              {formatTime(loopEnd)}
            </span>
          </div>
          
          <div 
            ref={sliderRef}
            className="unified-slider-track"
            onClick={handleTrackClick}
            style={{
              margin: '0 12px',
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
            marginTop: '8px',
            fontSize: '10px',
            color: '#888',
            padding: '0 12px' // 슬라이더 트랙과 동일한 패딩
          }}>
            <span>0:00</span>
            <span>{formatTime(videoDuration)}</span>
          </div>
        </div>

        <div className="loop-actions" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
          {/* 루프 토글 버튼 */}
          <button
            className={`control-button ${isLooping ? 'active' : ''}`}
            onClick={onLoopToggle}
            title={isLooping ? 'Stop Loop' : 'Start Loop'}
            style={{
              padding: '12px',
              fontSize: '15px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '48px',
              minHeight: '48px',
              background: isLooping ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: isLooping ? '2px solid #4caf50' : '2px solid rgba(255, 255, 255, 0.2)',
              color: isLooping ? '#4caf50' : '#fff'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              {isLooping ? (
                <path d="M6 6h12v12H6z"/>
              ) : (
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              )}
            </svg>
          </button>

          <button
            className="control-button"
            onClick={onSeekToStart}
            title="Jump to start point"
            style={{
              padding: '12px',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '48px',
              minHeight: '48px'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>
          
          <button
            className="control-button"
            onClick={() => onLoopChange(0, videoDuration)}
            title="Reset loop to full video"
            style={{
              padding: '12px',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '48px',
              minHeight: '48px'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoopControl;
