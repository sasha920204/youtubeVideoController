// 키보드 단축키 → 현재 유튜브 탭의 content script로 전달
// 팝업을 열지 않고도 속도·피치·A/B 반복을 조절할 수 있다
import { TOP_FRAME, isMissingReceiverError, injectContentScript } from './tabMessaging';

export const SHORTCUT_COMMANDS = [
  'speed-up',
  'speed-down',
  'pitch-up',
  'pitch-down',
  'loop-a',
  'loop-b',
  'loop-toggle',
];

const isYouTubeUrl = (url) => /^https:\/\/([^/]+\.)?youtube\.com\//.test(url || '');

export async function handleCommand(command) {
  if (!SHORTCUT_COMMANDS.includes(command)) return false;

  // 전역 스위치가 꺼져 있으면 단축키도 동작하지 않는다
  const { isGlobalEnabled } = await chrome.storage.local.get(['isGlobalEnabled']);
  if (isGlobalEnabled === false) return false;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isYouTubeUrl(tab.url)) return false;

  const message = { action: 'shortcut', command };
  try {
    await chrome.tabs.sendMessage(tab.id, message, TOP_FRAME);
  } catch (error) {
    if (!isMissingReceiverError(error)) return false;
    // 설치 전부터 열려 있던 탭: content script를 넣고 한 번 더 보낸다
    await injectContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, message, TOP_FRAME);
  }
  return true;
}

if (typeof chrome !== 'undefined' && chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    handleCommand(command).catch((error) => console.log('Shortcut failed:', error));
  });
}
