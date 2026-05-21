(() => {
  'use strict';

  const video = document.getElementById('video');
  const placeholder = document.getElementById('placeholder');
  const fileInput = document.getElementById('fileInput');

  const currentTimeEl = document.getElementById('currentTime');
  const currentFrameEl = document.getElementById('currentFrame');
  const fpsDisplay = document.getElementById('fpsDisplay');
  const seekBar = document.getElementById('seekBar');

  const playBtn = document.getElementById('playBtn');
  const stepBackBtn = document.getElementById('stepBackBtn');
  const stepFwdBtn = document.getElementById('stepFwdBtn');
  const jumpBack10Btn = document.getElementById('jumpBack10Btn');
  const jumpFwd10Btn = document.getElementById('jumpFwd10Btn');
  const speedSelect = document.getElementById('speedSelect');

  const setStartBtn = document.getElementById('setStartBtn');
  const setEndBtn = document.getElementById('setEndBtn');
  const saveLapBtn = document.getElementById('saveLapBtn');

  const startMarkerEl = document.getElementById('startMarker');
  const endMarkerEl = document.getElementById('endMarker');
  const deltaValueEl = document.getElementById('deltaValue');
  const jumpStartBtn = document.getElementById('jumpStartBtn');
  const jumpEndBtn = document.getElementById('jumpEndBtn');

  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const screenshotBtn = document.getElementById('screenshotBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const measurementList = document.getElementById('measurementList');

  const snapshotCanvas = document.getElementById('snapshotCanvas');

  const state = {
    fps: 30,
    startTime: null,
    endTime: null,
    measurements: [],
    currentFile: null,
  };

  fpsDisplay.textContent = String(state.fps);

  // ── Utilities ─────────────────────────────────────────────────────────
  function fmtTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '00:00.000';
    const total = Math.max(0, seconds);
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const ms = Math.round((total - Math.floor(total)) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function fmtDelta(seconds) {
    const sign = seconds < 0 ? '-' : '';
    const total = Math.abs(seconds);
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const ms = Math.round((total - Math.floor(total)) * 1000);
    return `${sign}${m > 0 ? m + ':' : ''}${m > 0 ? String(s).padStart(2, '0') : s}.${String(ms).padStart(3, '0')}s`;
  }

  function frameFromTime(t) {
    return Math.round(t * state.fps);
  }

  function timeFromFrame(f) {
    return f / state.fps;
  }

  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }

  // ── UI Updates ────────────────────────────────────────────────────────
  function updateTimeDisplay() {
    const t = video.currentTime || 0;
    currentTimeEl.textContent = fmtTime(t);
    currentFrameEl.textContent = String(frameFromTime(t));
    if (video.duration && isFinite(video.duration)) {
      seekBar.value = String(Math.round((t / video.duration) * 1000));
    }
  }

  function updateMarkersDisplay() {
    startMarkerEl.textContent = state.startTime != null ? fmtTime(state.startTime) : '–';
    endMarkerEl.textContent = state.endTime != null ? fmtTime(state.endTime) : '–';

    if (state.startTime != null && state.endTime != null) {
      const delta = state.endTime - state.startTime;
      const frames = Math.round(delta * state.fps);
      deltaValueEl.textContent = `${fmtDelta(delta)} (${frames}F)`;
      saveLapBtn.disabled = false;
    } else {
      deltaValueEl.textContent = '–';
      saveLapBtn.disabled = true;
    }
  }

  function renderMeasurementList() {
    measurementList.innerHTML = '';
    if (state.measurements.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Noch keine Messungen gespeichert.';
      measurementList.appendChild(li);
      exportCsvBtn.disabled = true;
      clearAllBtn.disabled = true;
      return;
    }

    state.measurements.forEach((m, i) => {
      const li = document.createElement('li');
      li.className = 'measurement-item';

      const delta = m.end - m.start;
      const frames = Math.round(delta * m.fps);

      li.innerHTML = `
        <span class="idx">#${i + 1}</span>
        <div class="data">
          <span class="name" contenteditable="true" spellcheck="false"></span>
          <span class="times">${fmtTime(m.start)} → ${fmtTime(m.end)} · ${m.fps} fps</span>
        </div>
        <div class="actions">
          <span class="duration">${fmtDelta(delta)}</span>
          <button class="icon-btn" data-action="jump" title="Zu Start springen">↧</button>
          <button class="icon-btn danger" data-action="del" title="Löschen">✕</button>
        </div>
      `;
      const nameEl = li.querySelector('.name');
      nameEl.textContent = m.name || `Messung ${i + 1}`;
      nameEl.addEventListener('blur', () => {
        m.name = nameEl.textContent.trim() || `Messung ${i + 1}`;
      });
      nameEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      });

      li.querySelector('[data-action="jump"]').addEventListener('click', () => {
        if (!video.duration) return;
        video.currentTime = m.start;
        toast(`Springe zu #${i + 1}`);
      });
      li.querySelector('[data-action="del"]').addEventListener('click', () => {
        state.measurements.splice(i, 1);
        renderMeasurementList();
      });

      li.title = `${frames} Frames`;
      measurementList.appendChild(li);
    });

    exportCsvBtn.disabled = false;
    clearAllBtn.disabled = false;
  }

  // ── Frame Stepping ────────────────────────────────────────────────────
  function pauseIfNeeded() {
    if (!video.paused) video.pause();
  }

  function stepFrame(direction) {
    if (!video.duration) return;
    pauseIfNeeded();
    const frameDur = 1 / state.fps;
    // Add tiny epsilon to land safely inside the next/prev frame
    const newTime = video.currentTime + direction * frameDur;
    video.currentTime = Math.max(0, Math.min(video.duration, newTime));
  }

  function jumpFrames(count) {
    if (!video.duration) return;
    pauseIfNeeded();
    const newTime = video.currentTime + count / state.fps;
    video.currentTime = Math.max(0, Math.min(video.duration, newTime));
  }

  // ── Event Handlers ────────────────────────────────────────────────────
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (state.currentFile) URL.revokeObjectURL(state.currentFile.url);
    state.currentFile = { name: file.name, url };
    video.src = url;
    video.load();
    placeholder.classList.add('hidden');
  });

  video.addEventListener('loadedmetadata', () => {
    seekBar.disabled = false;
    updateTimeDisplay();
    updateMarkersDisplay();
    // Best-effort FPS guess: keep user value, but if obviously unset, try common defaults via duration heuristics
  });

  video.addEventListener('timeupdate', updateTimeDisplay);
  video.addEventListener('seeked', updateTimeDisplay);

  // Per-frame callback (when supported) gives crisp updates while stepping
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = () => {
      updateTimeDisplay();
      video.requestVideoFrameCallback(onFrame);
    };
    video.addEventListener('loadedmetadata', () => video.requestVideoFrameCallback(onFrame), { once: true });
  }

  video.addEventListener('play', () => { playBtn.textContent = '⏸'; });
  video.addEventListener('pause', () => { playBtn.textContent = '▶'; });

  playBtn.addEventListener('click', () => {
    if (!video.src) return;
    if (video.paused) video.play();
    else video.pause();
  });

  stepBackBtn.addEventListener('click', () => stepFrame(-1));
  stepFwdBtn.addEventListener('click', () => stepFrame(+1));
  jumpBack10Btn.addEventListener('click', () => jumpFrames(-10));
  jumpFwd10Btn.addEventListener('click', () => jumpFrames(+10));

  speedSelect.addEventListener('change', () => {
    const sp = parseFloat(speedSelect.value);
    if (isFinite(sp) && sp > 0) video.playbackRate = sp;
  });

  seekBar.addEventListener('input', () => {
    if (!video.duration) return;
    pauseIfNeeded();
    const ratio = Number(seekBar.value) / 1000;
    video.currentTime = ratio * video.duration;
  });

  setStartBtn.addEventListener('click', () => {
    if (!video.duration) return;
    state.startTime = video.currentTime;
    updateMarkersDisplay();
    toast(`Start: ${fmtTime(state.startTime)}`);
  });

  setEndBtn.addEventListener('click', () => {
    if (!video.duration) return;
    state.endTime = video.currentTime;
    updateMarkersDisplay();
    toast(`Ende: ${fmtTime(state.endTime)}`);
  });

  jumpStartBtn.addEventListener('click', () => {
    if (state.startTime != null) video.currentTime = state.startTime;
  });
  jumpEndBtn.addEventListener('click', () => {
    if (state.endTime != null) video.currentTime = state.endTime;
  });

  saveLapBtn.addEventListener('click', () => {
    if (state.startTime == null || state.endTime == null) return;
    const start = Math.min(state.startTime, state.endTime);
    const end = Math.max(state.startTime, state.endTime);
    state.measurements.push({
      name: `Messung ${state.measurements.length + 1}`,
      start,
      end,
      fps: state.fps,
      file: state.currentFile ? state.currentFile.name : '',
      createdAt: new Date().toISOString(),
    });
    renderMeasurementList();
    toast('Messung gespeichert');
    // Roll over: end → new start
    state.startTime = state.endTime;
    state.endTime = null;
    updateMarkersDisplay();
  });

  clearAllBtn.addEventListener('click', () => {
    if (state.measurements.length === 0) return;
    if (!confirm('Alle Messungen löschen?')) return;
    state.measurements = [];
    renderMeasurementList();
  });

  // ── Export ────────────────────────────────────────────────────────────
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  exportCsvBtn.addEventListener('click', () => {
    if (state.measurements.length === 0) return;
    const header = ['#', 'Name', 'Datei', 'Start (s)', 'Ende (s)', 'Dauer (s)', 'Start (mm:ss.ms)', 'Ende (mm:ss.ms)', 'Dauer (mm:ss.ms)', 'Frames', 'FPS', 'Erstellt'];
    const rows = state.measurements.map((m, i) => {
      const dur = m.end - m.start;
      const frames = Math.round(dur * m.fps);
      return [
        i + 1,
        csvEscape(m.name),
        csvEscape(m.file || ''),
        m.start.toFixed(6),
        m.end.toFixed(6),
        dur.toFixed(6),
        fmtTime(m.start),
        fmtTime(m.end),
        fmtDelta(dur),
        frames,
        m.fps,
        m.createdAt,
      ].join(',');
    });
    const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const baseName = state.currentFile ? state.currentFile.name.replace(/\.[^.]+$/, '') : 'messungen';
    downloadBlob(blob, `${baseName}-messungen.csv`);
    toast('CSV exportiert');
  });

  function csvEscape(s) {
    const str = String(s ?? '');
    if (/[",\r\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  }

  screenshotBtn.addEventListener('click', () => {
    if (!video.videoWidth) {
      toast('Kein Video geladen');
      return;
    }
    snapshotCanvas.width = video.videoWidth;
    snapshotCanvas.height = video.videoHeight;
    const ctx = snapshotCanvas.getContext('2d');
    try {
      ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    } catch (err) {
      toast('Screenshot fehlgeschlagen');
      return;
    }
    snapshotCanvas.toBlob((blob) => {
      if (!blob) { toast('Screenshot fehlgeschlagen'); return; }
      const t = video.currentTime;
      const frame = frameFromTime(t);
      const baseName = state.currentFile ? state.currentFile.name.replace(/\.[^.]+$/, '') : 'frame';
      downloadBlob(blob, `${baseName}-f${frame}-${fmtTime(t).replace(/[:.]/g, '-')}.png`);
      toast('Screenshot gespeichert');
    }, 'image/png');
  });

  // ── Keyboard Shortcuts ────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.isContentEditable)) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (video.src) (video.paused ? video.play() : video.pause());
        break;
      case 'ArrowLeft':
        e.preventDefault();
        stepFrame(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        stepFrame(+1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        jumpFrames(-10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        jumpFrames(+10);
        break;
      case 's': case 'S':
        setStartBtn.click();
        break;
      case 'e': case 'E':
        setEndBtn.click();
        break;
      case 'l': case 'L':
        if (!saveLapBtn.disabled) saveLapBtn.click();
        break;
    }
  });

  // ── Touch Gestures on Video ───────────────────────────────────────────
  let touchStartX = null;
  let touchStartT = null;
  const SWIPE_THRESHOLD = 18; // px per frame step

  video.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !video.duration) return;
    touchStartX = e.touches[0].clientX;
    touchStartT = video.currentTime;
    pauseIfNeeded();
  }, { passive: true });

  video.addEventListener('touchmove', (e) => {
    if (touchStartX == null || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartX;
    const steps = Math.trunc(dx / SWIPE_THRESHOLD);
    const target = touchStartT + steps / state.fps;
    const clamped = Math.max(0, Math.min(video.duration, target));
    video.currentTime = clamped;
  }, { passive: true });

  video.addEventListener('touchend', () => {
    touchStartX = null;
    touchStartT = null;
  });

  // Double-tap on video toggles play
  let lastTap = 0;
  video.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 300 && video.src) {
      if (video.paused) video.play(); else video.pause();
    }
    lastTap = now;
  });

  // ── Service Worker ────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support optional */ });
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────
  renderMeasurementList();
  updateMarkersDisplay();
  updateTimeDisplay();
})();
