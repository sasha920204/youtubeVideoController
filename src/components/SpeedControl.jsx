import React from 'react';

const STEPS = [
  { label: '−0.2', title: 'Down 0.2x', delta: -0.2, kind: 'decrease' },
  { label: '−0.1', title: 'Down 0.1x', delta: -0.1, kind: 'decrease' },
  null, // 현재 값 자리
  { label: '+0.1', title: 'Up 0.1x', delta: 0.1, kind: 'increase' },
  { label: '+0.2', title: 'Up 0.2x', delta: 0.2, kind: 'increase' },
];

const PRESETS = [0.6, 0.7, 0.8, 0.9, 1.1, 1.2];

const SpeedControl = ({ currentSpeed, onSpeedChange, isEnabled, onToggle }) => {
  const adjustSpeed = (delta) => {
    const newSpeed = Math.max(0.25, Math.min(4.0, currentSpeed + delta));
    onSpeedChange(Math.round(newSpeed * 100) / 100);
  };

  const formatSpeed = (speed) => (speed === 1.0 ? '1.0x' : `${speed}x`);

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
        <div className="stepper-row">
          {STEPS.map((step) =>
            step ? (
              <button
                key={step.title}
                className={`control-button step-button ${step.kind}`}
                onClick={() => adjustSpeed(step.delta)}
                title={step.title}
              >
                {step.label}
              </button>
            ) : (
              <button
                key="value"
                className={`current-value value-button ${currentSpeed === 1.0 ? 'active' : ''}`}
                onClick={() => onSpeedChange(1.0)}
                title="Reset to normal speed"
              >
                <span>{formatSpeed(currentSpeed)}</span>
                {currentSpeed !== 1.0 && <span className="reset-hint">↺</span>}
              </button>
            )
          )}
        </div>

        <div className="preset-row">
          {PRESETS.map((speed) => (
            <button
              key={speed}
              className={`control-button preset-button ${currentSpeed === speed ? 'active' : ''}`}
              onClick={() => onSpeedChange(speed)}
              title={`Set speed to ${Math.round(speed * 100)}%`}
            >
              {Math.round(speed * 100)}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SpeedControl;
