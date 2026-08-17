/**
 * ui/drift-timeline.js — Real-time drift score visualization
 */

const DriftTimeline = (() => {
  let points = [];
  const maxPoints = 50;

  function init() {
    console.log('[Timeline] Initializing...');
    initChart();
    loadInitialData();
  }

  function initChart() {
    const canvas = document.getElementById('drift-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Draw zones immediately (don't wait for data)
    drawZones(ctx, canvas.width, canvas.height);
    
    // Draw placeholder line at 100 (green zone)
    drawPlaceholderLine(ctx, canvas.width, canvas.height);
    
    // Replace "Awaiting" text with a subtle label
    const container = canvas.parentElement;
    let placeholder = document.getElementById('drift-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'drift-placeholder';
      container.appendChild(placeholder);
    }
    placeholder.textContent = 'Waiting for first score...';
    placeholder.style.cssText = `
      font-family: var(--font-mono); font-size: 11px;
      color: #a5a8b5; text-align: center; 
      margin-top: 4px;
    `;
  }

  function drawZones(ctx, w, h) {
    const zones = [
      { min:0, max:40, color:'rgba(255,198,198,0.15)' },   // coral: critical
      { min:40, max:70, color:'rgba(255,230,205,0.15)' },  // orange: review
      { min:70, max:100, color:'rgba(195,250,245,0.15)' }, // teal: aligned
    ];
    zones.forEach(({ min, max, color }) => {
      const y1 = h - (max/100)*h;
      const y2 = h - (min/100)*h;
      ctx.fillStyle = color;
      ctx.fillRect(0, y1, w, y2-y1);
    });
    // Zone labels
    ctx.font = '9px var(--font-mono)';
    ctx.fillStyle = '#a5a8b5';
    ctx.fillText('Aligned', 4, h - (85/100)*h);
    ctx.fillText('Review', 4, h - (55/100)*h);
    ctx.fillText('Critical', 4, h - (20/100)*h);
    // Y-axis markers
    [0,40,70,100].forEach(v => {
      const y = h - (v/100)*h;
      ctx.strokeStyle = '#e0e2e8';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
      ctx.fillStyle = '#a5a8b5';
      ctx.fillText(v, w-18, y-2);
    });
  }

  function drawPlaceholderLine(ctx, w, h) {
    ctx.beginPath();
    ctx.strokeStyle = '#c7cad5';
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, h - (100/100)*h);
    ctx.lineTo(w, h - (100/100)*h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function normalizeScore(score) {
    if (typeof score !== 'number' || Number.isNaN(score)) return null;
    return score <= 1 ? score * 100 : score;
  }

  function parseDriftLogText(raw) {
    const text = (raw || '').trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      const objects = text.match(/\{[^{}]*\}/g) || [];
      return objects
        .map((chunk) => {
          try {
            return JSON.parse(chunk);
          } catch (parseError) {
            return null;
          }
        })
        .filter(Boolean);
    }
  }

  async function loadInitialData() {
    try {
      const response = await fetch('/api/drift-log');
      const raw = await response.text();
      const items = parseDriftLogText(raw);
      if (items.length === 0) return;

      points = items
        .map((item) => ({
          score: normalizeScore(item.score),
          timestamp: item.timestamp ? Date.parse(item.timestamp) : Date.now(),
        }))
        .filter((item) => item.score != null)
        .slice(-maxPoints);

      if (points.length > 0) {
        redrawChart();
        window.updateDriftScoreBadge?.(points[points.length - 1].score);
      }
    } catch (error) {
      console.warn('[Timeline] Failed to preload drift history:', error.message);
    }
  }

  function addDataPoint(payloadOrScore, timestamp) {
    const score = typeof payloadOrScore === 'object' && payloadOrScore !== null
      ? normalizeScore(payloadOrScore.score)
      : normalizeScore(payloadOrScore);
    if (score == null) return;

    points.push({
      score,
      timestamp: timestamp ? Date.parse(timestamp) || Date.now() : Date.now()
    });
    if (points.length > maxPoints) points.shift();
    redrawChart();
  }

  function redrawChart() {
    const canvas = document.getElementById('drift-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawZones(ctx, canvas.width, canvas.height);
    
    if (points.length === 0) {
      drawPlaceholderLine(ctx, canvas.width, canvas.height);
      return;
    }
    
    // Remove placeholder text
    document.getElementById('drift-placeholder')?.remove();
    
    // Draw filled area under curve
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const lastScore = points[points.length-1].score;
    const lineColor = lastScore>=70 ? '#187574' : lastScore>=40 ? '#d4850a' : '#600000';
    gradient.addColorStop(0, lineColor + '30');
    gradient.addColorStop(1, lineColor + '05');
    
    ctx.beginPath();
    points.forEach(({ score }, i) => {
      const x = (i / Math.max(points.length-1,1)) * canvas.width;
      const y = canvas.height - (score/100) * canvas.height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    points.forEach(({ score }, i) => {
      const x = (i / Math.max(points.length-1,1)) * canvas.width;
      const y = canvas.height - (score/100) * canvas.height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Inflection markers (delta > 10)
    points.forEach(({ score, timestamp }, i) => {
      if (i === 0) return;
      const delta = Math.abs(score - points[i-1].score);
      if (delta > 10) {
        const x = (i / Math.max(points.length-1,1)) * canvas.width;
        const y = canvas.height - (score/100) * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI*2);
        ctx.strokeStyle = '#5b76fe';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        // Timestamp label
        ctx.font = '9px var(--font-mono)';
        ctx.fillStyle = '#5b76fe';
        ctx.fillText(new Date(timestamp).toLocaleTimeString('en',
          {hour:'2-digit',minute:'2-digit'}), x-14, y-10);
      }
    });
  }

  return { 
    init, 
    addPoint: addDataPoint 
  };
})();

window.DriftTimeline = DriftTimeline;
window.addEventListener('DOMContentLoaded', () => window.DriftTimeline.init());
