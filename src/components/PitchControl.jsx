import React, { useEffect, useRef, useState } from 'react';

const PitchControl = ({ currentPitch, onPitchChange, isEnabled, onToggle }) => {
  const [isPitchReady, setIsPitchReady] = useState(false);
  
  // 피치 변경 시 메시지 전송 (실제 처리는 비활성화됨)
  useEffect(() => {
    const init = async () => {
      if (!isEnabled || isPitchReady) return;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'initializePitch' });
        if (res && res.success) {
          setIsPitchReady(true);
        }
      } catch (e) {
        console.error('🎵 initializePitch failed', e);
      }
    };
    init();
  }, [isEnabled, isPitchReady]);

  useEffect(() => {
    if (!isPitchReady || !isEnabled) return;
    const send = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // 전체 범위 허용 - 여기서 반전시켜서 전송
        const clamped = Math.max(-24, Math.min(24, currentPitch));
        const transmitPitch = -clamped; // 실제 전송할 때 반전
        console.log(`🎵 Sending pitch: display=${clamped}, transmit=${transmitPitch}`);
        await chrome.tabs.sendMessage(tab.id, { action: 'setPitch', pitch: transmitPitch });
      } catch (e) {
        console.error('🎵 setPitch failed', e);
      }
    };
    send();
  }, [currentPitch, isEnabled, isPitchReady]);
  const adjustPitch = (semitones) => {
    if (!isEnabled || !isPitchReady) return;
    // UI 표시는 정상적으로
    const newPitch = Math.max(-24, Math.min(24, currentPitch + semitones));
    console.log(`🎵 Pitch Control: Adjusting pitch from ${currentPitch} to ${newPitch} semitones`);
    onPitchChange(newPitch);
  };

  const resetPitch = () => {
    if (!isEnabled || !isPitchReady) return;
    onPitchChange(0);
  };

  const handlePitchChange = (value) => {
    if (!isEnabled || !isPitchReady) return;
    // 전체 범위 허용
    const clamped = Math.max(-24, Math.min(24, value));
    onPitchChange(clamped);
  };

  const formatPitch = (semitones) => {
    if (semitones === 0) return 'Original';
    
    // 1톤 = 2 semitones로 계산
    const absSemitones = Math.abs(semitones);
    const wholeTones = Math.floor(absSemitones / 2);
    const remainingSemitones = absSemitones % 2;
    const sign = semitones > 0 ? '+' : '-';
    
    // 완전한 톤만 있는 경우
    if (remainingSemitones === 0 && wholeTones > 0) {
      return `${sign}${wholeTones} tone${wholeTones > 1 ? 's' : ''}`;
    }
    // 반음만 있는 경우
    else if (wholeTones === 0) {
      return `${sign}${remainingSemitones} semitone${remainingSemitones > 1 ? 's' : ''}`;
    }
    // 톤 + 반음
    else {
      return `${sign}${wholeTones}t ${remainingSemitones}st`;
    }
  };



  return (
    <div className={`control-section ${!isEnabled ? 'disabled' : ''}`}>
      <div className="section-header">
        <h3 className="section-title">🎵 Pitch Control</h3>
        <div 
          className={`toggle-switch ${isEnabled ? 'enabled' : 'disabled'}`}
          onClick={isPitchReady ? onToggle : undefined}
          title={
            isEnabled 
              ? 'Disable Pitch Control' 
              : 'Enable Pitch Control'
          }
          style={{
            cursor: isPitchReady ? 'pointer' : 'not-allowed',
            opacity: isPitchReady ? 1 : 0.5
          }}
        >
          <div className="toggle-switch-thumb"></div>
        </div>
      </div>

      {/* 피치 기능 상태 표시 */}
      {!isPitchReady && isEnabled && (
        <div style={{
          background: 'rgba(255, 152, 0, 0.1)',
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '8px',
          padding: '12px',
          margin: '12px 0',
          textAlign: 'center',
          color: '#ff9800',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          <div>Initializing pitch engine...</div>
        </div>
      )}
      
      <div className="pitch-controls">
        <div className="current-value" style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div>{formatPitch(currentPitch)}</div>
        </div>

        {/* Professional Pitch Control */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <button
            className="control-button decrease"
            onClick={() => adjustPitch(-2)}
            title="Down 2 semitones"
            style={{
              padding: '10px 18px',
              fontSize: '16px',
              fontWeight: '700',
              minWidth: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(244, 67, 54, 0.2)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              color: '#f44336'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
          
          <button
            className="control-button decrease"
            onClick={() => adjustPitch(-1)}
            title="Down 1 semitone"
            style={{
              padding: '10px 18px',
              fontSize: '16px',
              fontWeight: '700',
              minWidth: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(244, 67, 54, 0.2)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              color: '#f44336'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
          
          <button
            className={`control-button reset ${currentPitch === 0 ? 'active' : ''}`}
            onClick={() => handlePitchChange(0)}
            title="Reset to original pitch"
            style={{
              padding: '10px 18px',
              fontSize: '18px',
              minWidth: '52px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
          
          <button
            className="control-button increase"
            onClick={() => adjustPitch(1)}
            title="Up 1 semitone"
            style={{
              padding: '10px 18px',
              fontSize: '16px',
              fontWeight: '700',
              minWidth: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(76, 175, 80, 0.2)',
              border: '1px solid rgba(76, 175, 80, 0.3)',
              color: '#4caf50'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          
          <button
            className="control-button increase"
            onClick={() => adjustPitch(2)}
            title="Up 2 semitones"
            style={{
              padding: '10px 18px',
              fontSize: '16px',
              fontWeight: '700',
              minWidth: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(76, 175, 80, 0.2)',
              border: '1px solid rgba(76, 175, 80, 0.3)',
              color: '#4caf50'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>

        {/* Quick Tone Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
          <button
            className={`control-button ${currentPitch === -4 ? 'active' : ''}`}
            onClick={() => handlePitchChange(-4)}
            title="Down 2 tones"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            -2T
          </button>
          
          <button
            className={`control-button ${currentPitch === -2 ? 'active' : ''}`}
            onClick={() => handlePitchChange(-2)}
            title="Down 1 tone"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            -1T
          </button>
          
          <button
            className={`control-button ${currentPitch === 2 ? 'active' : ''}`}
            onClick={() => handlePitchChange(2)}
            title="Up 1 tone"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            +1T
          </button>
          
          <button
            className={`control-button ${currentPitch === 4 ? 'active' : ''}`}
            onClick={() => handlePitchChange(4)}
            title="Up 2 tones"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            +2T
          </button>
        </div>
      </div>
    </div>
  );
};

export default PitchControl;
