import React, { useEffect, useRef, useState } from 'react';
import { sendToActiveTab, getActiveTab } from '../tabMessaging';

const INIT_RETRY_MS = 1000;
const INIT_MAX_TRIES = 10;

const PitchControl = ({ currentPitch, onPitchChange, isEnabled, onToggle }) => {
  const [isPitchReady, setIsPitchReady] = useState(false);
  // 'pending' | 'needsReload' | 'failed'
  const [initStatus, setInitStatus] = useState('pending');
  
  // 피치 오디오 체인 준비만 한다.
  // setPitch는 사용자가 값을 바꿀 때 VideoController에서 보낸다.
  // (예전에는 팝업을 열 때마다 setPitch를 보내서 재생 속도와 피치가 초기화됐다)
  // 준비가 안 되면 몇 번 다시 시도하고, 새로고침이 필요한 경우엔 바로 안내한다.
  useEffect(() => {
    if (!isEnabled || isPitchReady) return undefined;
    let cancelled = false;
    let timer = null;
    let tries = 0;

    const init = async () => {
      tries += 1;
      let res;
      try {
        res = await sendToActiveTab({ action: 'initializePitch' });
      } catch (e) {
        console.error('🎵 initializePitch failed', e);
      }
      if (cancelled) return;
      if (res && res.success) {
        setIsPitchReady(true);
        return;
      }
      if (res && res.reason === 'needsReload') {
        setInitStatus('needsReload');
        return;
      }
      if (tries >= INIT_MAX_TRIES) {
        setInitStatus('failed');
        return;
      }
      timer = setTimeout(init, INIT_RETRY_MS);
    };

    setInitStatus('pending');
    init();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isEnabled, isPitchReady]);

  const reloadTab = async () => {
    const tab = await getActiveTab();
    if (tab) await chrome.tabs.reload(tab.id);
  };

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



  const steps = [
    { label: '−2', title: 'Down 2 semitones', delta: -2, kind: 'decrease' },
    { label: '−1', title: 'Down 1 semitone', delta: -1, kind: 'decrease' },
    null, // 현재 값 자리
    { label: '+1', title: 'Up 1 semitone', delta: 1, kind: 'increase' },
    { label: '+2', title: 'Up 2 semitones', delta: 2, kind: 'increase' },
  ];

  const presets = [
    { label: '-2T', title: 'Down 2 tones', value: -4 },
    { label: '-1T', title: 'Down 1 tone', value: -2 },
    { label: '+1T', title: 'Up 1 tone', value: 2 },
    { label: '+2T', title: 'Up 2 tones', value: 4 },
  ];

  const isLocked = !isPitchReady;

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
          padding: '8px',
          marginBottom: '8px',
          textAlign: 'center',
          color: '#ff9800',
          fontSize: '12px',
          fontWeight: '500'
        }}>
          {initStatus === 'needsReload' ? (
            <>
              <div>피치를 쓰려면 유튜브 탭을 새로고침해 주세요</div>
              <button className="control-button notice-button" onClick={reloadTab}>
                새로고침
              </button>
            </>
          ) : initStatus === 'failed' ? (
            <div>피치 엔진을 시작하지 못했어요. 영상을 재생한 뒤 팝업을 다시 열어 주세요</div>
          ) : (
            <div>Initializing pitch engine...</div>
          )}
        </div>
      )}
      
      <div className="pitch-controls" style={{ opacity: isLocked ? 0.5 : 1 }}>
        <div className="stepper-row">
          {steps.map((step) =>
            step ? (
              <button
                key={step.title}
                className={`control-button step-button ${step.kind}`}
                onClick={() => adjustPitch(step.delta)}
                title={step.title}
                disabled={isLocked}
              >
                {step.label}
              </button>
            ) : (
              <button
                key="value"
                className={`current-value value-button ${currentPitch === 0 ? 'active' : ''}`}
                onClick={() => handlePitchChange(0)}
                title="Reset to original pitch"
                disabled={isLocked}
              >
                <span>{formatPitch(currentPitch)}</span>
                {currentPitch !== 0 && <span className="reset-hint">↺</span>}
              </button>
            )
          )}
        </div>

        <div className="preset-row">
          {presets.map((preset) => (
            <button
              key={preset.title}
              className={`control-button preset-button ${currentPitch === preset.value ? 'active' : ''}`}
              onClick={() => handlePitchChange(preset.value)}
              title={preset.title}
              disabled={isLocked}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PitchControl;
