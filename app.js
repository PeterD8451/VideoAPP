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

  const zoomControls = document.getElementById('zoomControls');
  const zoomLevel = document.getElementById('zoomLevel');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');

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

  function snapFps(raw) {
    const candidates = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 240];
    let best = candidates[0];
    let bestRel = Math.abs(raw - best) / best;
    for (const c of candidates) {
      const rel = Math.abs(raw - c) / c;
      if (rel < bestRel) { bestRel = rel; best = c; }
    }
    if (bestRel < 0.03) return best;
    return Math.round(raw * 100) / 100;
  }

  function formatFps(fps) {
    if (Math.abs(fps - Math.round(fps)) < 0.005) return String(Math.round(fps));
    return fps.toFixed(2);
  }

  // ── MP4 / MOV Container Metadata Parser ──────────────────────────────
  // Liest die Frame-Rate direkt aus dem ISO-BMFF-Atombaum:
  //   moov → trak(hdlr=vide) → mdia → mdhd.timescale + minf/stbl/stts.sample_duration
  // Codec-unabhängig (HEVC/H.264/AV1/VP9 in MP4/MOV).
  async function parseFpsFromContainer(file) {
    if (!file || file.size < 32) return null;
    try {
      const moov = await findMoov(file);
      if (!moov) return null;
      return extractFpsFromMoov(moov);
    } catch (_) {
      return null;
    }
  }

  async function readBytes(file, offset, length) {
    const end = Math.min(file.size, offset + length);
    const blob = file.slice(offset, end);
    return new Uint8Array(await blob.arrayBuffer());
  }

  function readType(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function readBoxHeader(bytes, view, offset) {
    if (offset + 8 > bytes.length) return null;
    let size = view.getUint32(offset);
    const type = readType(bytes, offset + 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return null;
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      size = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize) return null;
    return { type, size, headerSize, contentOffset: offset + headerSize, endOffset: offset + size };
  }

  async function findMoov(file) {
    let offset = 0;
    let iterations = 0;
    while (offset < file.size && iterations++ < 50) {
      const header = await readBytes(file, offset, 16);
      if (header.length < 8) return null;
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      let size = view.getUint32(0);
      const type = readType(header, 4);
      let headerSize = 8;
      if (size === 1) {
        if (header.length < 16) return null;
        const hi = view.getUint32(8);
        const lo = view.getUint32(12);
        size = hi * 0x100000000 + lo;
        headerSize = 16;
      } else if (size === 0) {
        size = file.size - offset;
      }
      if (size < headerSize || offset + size > file.size) return null;
      if (type === 'moov') return await readBytes(file, offset, size);
      offset += size;
    }
    return null;
  }

  function findChildBox(bytes, view, startOffset, endOffset, targetType) {
    let offset = startOffset;
    while (offset < endOffset) {
      const box = readBoxHeader(bytes, view, offset);
      if (!box || box.endOffset > endOffset) return null;
      if (box.type === targetType) return box;
      offset = box.endOffset;
    }
    return null;
  }

  function extractFpsFromMoov(moov) {
    const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
    let offset = 8;
    while (offset < moov.length) {
      const box = readBoxHeader(moov, view, offset);
      if (!box) break;
      if (box.type === 'trak') {
        const result = parseTrack(moov, view, box.contentOffset, box.endOffset);
        if (result) return result;
      }
      offset = box.endOffset;
    }
    return null;
  }

  function parseTrack(bytes, view, startOffset, endOffset) {
    const mdia = findChildBox(bytes, view, startOffset, endOffset, 'mdia');
    if (!mdia) return null;

    const hdlr = findChildBox(bytes, view, mdia.contentOffset, mdia.endOffset, 'hdlr');
    if (!hdlr || hdlr.contentOffset + 12 > bytes.length) return null;
    const handlerType = readType(bytes, hdlr.contentOffset + 8);
    if (handlerType !== 'vide') return null;

    const mdhd = findChildBox(bytes, view, mdia.contentOffset, mdia.endOffset, 'mdhd');
    if (!mdhd) return null;
    const version = view.getUint8(mdhd.contentOffset);
    let timescale;
    if (version === 0) timescale = view.getUint32(mdhd.contentOffset + 12);
    else if (version === 1) timescale = view.getUint32(mdhd.contentOffset + 20);
    else return null;
    if (!timescale) return null;

    const minf = findChildBox(bytes, view, mdia.contentOffset, mdia.endOffset, 'minf');
    if (!minf) return null;
    const stbl = findChildBox(bytes, view, minf.contentOffset, minf.endOffset, 'stbl');
    if (!stbl) return null;
    const stts = findChildBox(bytes, view, stbl.contentOffset, stbl.endOffset, 'stts');
    if (!stts) return null;

    const entryCount = view.getUint32(stts.contentOffset + 4);
    if (!entryCount) return null;
    if (stts.contentOffset + 8 + entryCount * 8 > stts.endOffset) return null;

    const durations = new Map();
    for (let i = 0; i < entryCount; i++) {
      const sampleCount = view.getUint32(stts.contentOffset + 8 + i * 8);
      const sampleDuration = view.getUint32(stts.contentOffset + 8 + i * 8 + 4);
      if (sampleDuration > 0 && sampleCount > 0) {
        durations.set(sampleDuration, (durations.get(sampleDuration) || 0) + sampleCount);
      }
    }
    if (!durations.size) return null;

    let bestDuration = 0, bestCount = 0;
    for (const [duration, count] of durations) {
      if (count > bestCount) { bestCount = count; bestDuration = duration; }
    }
    return bestDuration ? timescale / bestDuration : null;
  }

  function detectVideoFps() {
    return new Promise((resolve) => {
      if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
        resolve(null);
        return;
      }
      const MAX_SAMPLES = 24;
      const TIMEOUT_MS = 2500;
      const prevMuted = video.muted;
      const prevRate = video.playbackRate;
      const samples = [];
      let prevMediaTime = null;
      let done = false;

      const cleanup = () => {
        try { video.pause(); } catch (_) {}
        try { video.currentTime = 0; } catch (_) {}
        video.muted = prevMuted;
        video.playbackRate = prevRate;
      };

      const finalize = () => {
        if (done) return;
        done = true;
        cleanup();
        if (samples.length < 3) { resolve(null); return; }
        samples.sort((a, b) => a - b);
        const median = samples[Math.floor(samples.length / 2)];
        if (!isFinite(median) || median <= 0) { resolve(null); return; }
        resolve(snapFps(1 / median));
      };

      const onFrame = (_now, metadata) => {
        if (done) return;
        const mt = metadata.mediaTime;
        if (prevMediaTime !== null) {
          const dt = mt - prevMediaTime;
          if (dt > 0.0005 && dt < 1) samples.push(dt);
        }
        prevMediaTime = mt;
        if (samples.length >= MAX_SAMPLES) finalize();
        else video.requestVideoFrameCallback(onFrame);
      };

      setTimeout(finalize, TIMEOUT_MS);

      video.muted = true;
      video.playbackRate = 2;
      try { video.currentTime = 0; } catch (_) {}

      const p = video.play();
      if (p && typeof p.then === 'function') {
        p.then(() => video.requestVideoFrameCallback(onFrame))
         .catch(() => { if (!done) { done = true; cleanup(); resolve(null); } });
      } else {
        video.requestVideoFrameCallback(onFrame);
      }
    });
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
          <button class="icon-btn" data-action="jump" title="Zu Start springen">↦</button>
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
    state.currentFile = { name: file.name, url, file };
    video.src = url;
    video.load();
    placeholder.classList.add('hidden');
    resetZoom();
    zoomControls.hidden = false;
  });

  video.addEventListener('loadedmetadata', () => {
    seekBar.disabled = false;
    updateTimeDisplay();
    updateMarkersDisplay();
  });

  let detectionEpoch = 0;
  video.addEventListener('loadeddata', async () => {
    const epoch = ++detectionEpoch;
    fpsDisplay.textContent = '…';
    state.fps = 30;
    let detected = null;

    // 1) Container-Metadata (MP4/MOV) – instant, ohne Wiedergabe
    if (state.currentFile && state.currentFile.file) {
      const raw = await parseFpsFromContainer(state.currentFile.file);
      if (epoch !== detectionEpoch) return;
      if (raw && isFinite(raw) && raw > 0) detected = snapFps(raw);
    }

    // 2) Playback-Fallback (für WebM und Container ohne lesbares moov)
    if (!detected) {
      detected = await detectVideoFps();
      if (epoch !== detectionEpoch) return;
    }

    if (detected) {
      state.fps = detected;
    } else {
      toast('FPS-Erkennung nicht möglich – Standard 30');
    }
    fpsDisplay.textContent = formatFps(state.fps);
    updateTimeDisplay();
    updateMarkersDisplay();
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

  video.addEventListener('play', () => { playBtn.textContent = '⏸︎'; });
  video.addEventListener('pause', () => { playBtn.textContent = '▶︎'; });

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
      case '+': case '=':
        e.preventDefault();
        setZoomCentered(zoom.scale * 1.5);
        break;
      case '-': case '_':
        e.preventDefault();
        setZoomCentered(zoom.scale / 1.5);
        break;
      case '0':
        e.preventDefault();
        resetZoom();
        break;
    }
  });

  // ── Zoom & Gestures on Video ──────────────────────────────────────────
  const SWIPE_THRESHOLD = 18;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 8;
  const zoom = { scale: 1, tx: 0, ty: 0 };
  const gesture = { type: null };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applyZoom() {
    video.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`;
    zoomLevel.textContent = `${zoom.scale.toFixed(1)}×`;
    zoomOutBtn.disabled = zoom.scale <= ZOOM_MIN + 0.001;
    zoomInBtn.disabled = zoom.scale >= ZOOM_MAX - 0.001;
    zoomResetBtn.disabled = zoom.scale <= ZOOM_MIN + 0.001 && zoom.tx === 0 && zoom.ty === 0;
  }

  function constrainPan() {
    const w = video.offsetWidth;
    const h = video.offsetHeight;
    const maxX = (w * (zoom.scale - 1)) / 2;
    const maxY = (h * (zoom.scale - 1)) / 2;
    zoom.tx = clamp(zoom.tx, -maxX, maxX);
    zoom.ty = clamp(zoom.ty, -maxY, maxY);
  }

  function setZoomAtPoint(newScale, clientX, clientY) {
    newScale = clamp(newScale, ZOOM_MIN, ZOOM_MAX);
    if (newScale === zoom.scale) return;
    const rect = video.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const ratio = newScale / zoom.scale;
    zoom.tx = dx * (1 - ratio) + ratio * zoom.tx;
    zoom.ty = dy * (1 - ratio) + ratio * zoom.ty;
    zoom.scale = newScale;
    constrainPan();
    applyZoom();
  }

  function setZoomCentered(newScale) {
    const rect = video.getBoundingClientRect();
    setZoomAtPoint(newScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function resetZoom() {
    zoom.scale = 1; zoom.tx = 0; zoom.ty = 0;
    applyZoom();
  }

  zoomInBtn.addEventListener('click', () => setZoomCentered(zoom.scale * 1.5));
  zoomOutBtn.addEventListener('click', () => setZoomCentered(zoom.scale / 1.5));
  zoomResetBtn.addEventListener('click', resetZoom);

  function touchDist(t) {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  function touchMid(t) {
    return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
  }

  video.addEventListener('touchstart', (e) => {
    if (!video.duration) return;
    if (e.touches.length === 2) {
      gesture.type = 'pinch';
      gesture.pinchDist = touchDist(e.touches);
      gesture.pinchScale = zoom.scale;
      gesture.pinchCenter = touchMid(e.touches);
      e.preventDefault();
    } else if (e.touches.length === 1) {
      if (zoom.scale > 1.01) {
        gesture.type = 'pan';
        gesture.panX = e.touches[0].clientX;
        gesture.panY = e.touches[0].clientY;
        gesture.panTx = zoom.tx;
        gesture.panTy = zoom.ty;
      } else {
        gesture.type = 'scrub';
        gesture.scrubX = e.touches[0].clientX;
        gesture.scrubT = video.currentTime;
        pauseIfNeeded();
      }
    }
  }, { passive: false });

  video.addEventListener('touchmove', (e) => {
    if (gesture.type === 'pinch' && e.touches.length === 2) {
      const ratio = touchDist(e.touches) / gesture.pinchDist;
      setZoomAtPoint(gesture.pinchScale * ratio, gesture.pinchCenter.x, gesture.pinchCenter.y);
      e.preventDefault();
    } else if (gesture.type === 'pan' && e.touches.length === 1) {
      zoom.tx = gesture.panTx + (e.touches[0].clientX - gesture.panX);
      zoom.ty = gesture.panTy + (e.touches[0].clientY - gesture.panY);
      constrainPan();
      applyZoom();
      e.preventDefault();
    } else if (gesture.type === 'scrub' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - gesture.scrubX;
      const steps = Math.trunc(dx / SWIPE_THRESHOLD);
      const target = gesture.scrubT + steps / state.fps;
      video.currentTime = Math.max(0, Math.min(video.duration, target));
    }
  }, { passive: false });

  video.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) gesture.type = null;
  });
  video.addEventListener('touchcancel', () => { gesture.type = null; });

  video.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoomAtPoint(zoom.scale * factor, e.clientX, e.clientY);
  }, { passive: false });

  // Double-tap on video toggles play (works for taps without drag because we don't preventDefault on simple taps)
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
