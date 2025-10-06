import React from 'react';

const SpeedControl = ({ currentSpeed, onSpeedChange, isEnabled, onToggle }) => {
  const adjustSpeed = (delta) => {
    const newSpeed = Math.max(0.25, Math.min(4.0, currentSpeed + delta));
    onSpeedChange(Math.round(newSpeed * 100) / 100);
  };

  const formatSpeed = (speed) => {
    return speed === 1.0 ? 'Normal (1.0x)' : `${speed}x`;
  };

  return (
    <div className={`control-section ${!isEnabled ? 'disabled' : ''}`}>
      <div className="section-header">
        <h3 className="section-title">⚡ Playback Speed</h3>
        <div 
          className={`toggle-switch ${isEnabled ? 'enabled' : 'disabled'}`}
          onClick={onToggle}
          title={isEnabled ? 'Disable Speed Control' : 'Enable Speed Control'}
        >
          <div className="toggle-switch-thumb"></div>
        </div>
      </div>
      
      <div className="speed-controls">
        {/* 첫째줄: 현재 상태 노출 */}
        <div className="current-value" style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div>{formatSpeed(currentSpeed)}</div>
        </div>

        {/* Professional Speed Control */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <button
            className="control-button decrease"
            onClick={() => adjustSpeed(-0.2)}
            title="Down 0.2x"
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
            onClick={() => adjustSpeed(-0.1)}
            title="Down 0.1x"
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
            className={`control-button reset ${currentSpeed === 1.0 ? 'active' : ''}`}
            onClick={() => onSpeedChange(1.0)}
            title="Reset to normal speed"
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
            onClick={() => adjustSpeed(0.1)}
            title="Up 0.1x"
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
            onClick={() => adjustSpeed(0.2)}
            title="Up 0.2x"
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

        {/* Quick Speed Presets */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
          <button
            className={`control-button ${currentSpeed === 0.6 ? 'active' : ''}`}
            onClick={() => onSpeedChange(0.6)}
            title="Set speed to 60%"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            60%
          </button>
          
          <button
            className={`control-button ${currentSpeed === 0.7 ? 'active' : ''}`}
            onClick={() => onSpeedChange(0.7)}
            title="Set speed to 70%"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            70%
          </button>
          
          <button
            className={`control-button ${currentSpeed === 0.8 ? 'active' : ''}`}
            onClick={() => onSpeedChange(0.8)}
            title="Set speed to 80%"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            80%
          </button>
          
          <button
            className={`control-button ${currentSpeed === 0.9 ? 'active' : ''}`}
            onClick={() => onSpeedChange(0.9)}
            title="Set speed to 90%"
            style={{
              padding: '8px 10px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            90%
          </button>
          
          <button
            className={`control-button ${currentSpeed === 1.1 ? 'active' : ''}`}
            onClick={() => onSpeedChange(1.1)}
            title="Set speed to 110%"
            style={{
              padding: '8px 8px',
              fontSize: '9px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            110%
          </button>
          <button
            className={`control-button ${currentSpeed === 1.2 ? 'active' : ''}`}
            onClick={() => onSpeedChange(1.2)}
            title="Set speed to 120%"
            style={{
              padding: '8px 8px',
              fontSize: '9px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              minWidth: '36px'
            }}
          >
            120%
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpeedControl;
