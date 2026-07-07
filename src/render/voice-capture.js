/**
 * [INPUT]: SpeechRecognition API (浏览器内置,可选)
 * [OUTPUT]: createVoiceCapture({ onText, onState }) → { start, stop, isSupported, isListening }
 * [POS]: src/render/voice-capture.js — 语音录入(Web Speech API);仅当浏览器支持时启用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计哲学:多模态输入兜底;不强制支持,有则启用
 *  - chrome / edge 支持 SpeechRecognition
 *  - 用户首次激活(工具栏点击麦克风)时初始化
 *  - 持续监听直到用户点击停止,中间结果实时回调
 */

export function isVoiceSupported() {
  if (typeof window === 'undefined') return false;
  return !!(
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    window.mozSpeechRecognition ||
    window.msSpeechRecognition
  );
}

export function createVoiceCapture({ lang = 'zh-CN', onText, onState, onError } = {}) {
  let recognition = null;
  let listening = false;
  let baseText = '';

  function init() {
    if (recognition) return recognition;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      let interim = '';
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText) baseText += finalText;
      const live = baseText + interim;
      if (onText) onText(live, { interim: !!interim });
    };

    recognition.onerror = (e) => {
      if (onError) onError(e.error || 'unknown');
      listening = false;
      if (onState) onState('idle');
    };

    recognition.onend = () => {
      listening = false;
      if (onState) onState('idle');
    };

    recognition.onstart = () => {
      listening = true;
      baseText = '';
      if (onState) onState('listening');
    };

    return recognition;
  }

  function start() {
    const rec = init();
    if (!rec) {
      if (onError) onError('not-supported');
      return false;
    }
    try {
      baseText = '';
      rec.start();
      return true;
    } catch (e) {
      if (onError) onError(e.message || 'start-failed');
      return false;
    }
  }

  function stop() {
    if (recognition && listening) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
    listening = false;
    if (onState) onState('idle');
  }

  return {
    start,
    stop,
    isSupported: isVoiceSupported,
    isListening: () => listening
  };
}