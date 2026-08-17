/**
 * ui/panel.js — Node detail panel rendering and healing logic
 */

(function() {
  const panel = document.getElementById('panel-right');
  let currentSelectedId = null;
  let showFullCode = false;

  window.addEventListener('node-selected', (e) => {
    currentSelectedId = e.detail.id;
    window.openPanelNodeId = currentSelectedId;
    showFullCode = false;
    openPanel(e.detail);
  });

  window.addEventListener('node-data-updated', (e) => {
    if (currentSelectedId === e.detail.id) {
      console.log('[PANEL] Selected node updated, refreshing...');
      openPanel(e.detail);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      currentSelectedId = null;
      closePanel();
    }
  });

  function openPanel(data) {
    if (!panel) return;
    const workspace = document.getElementById('workspace');
    workspace.classList.add('panel-open');
    panel.removeAttribute('hidden');
    
    if (data.type === 'directory') {
      panel.innerHTML = renderParentPanel(data);
    } else {
      panel.innerHTML = renderLeafPanel(data);
    }

    // Wire re-anchor button if present
    const btn = panel.querySelector('.btn-reanchor');
    if (btn) {
      if (data.type === 'directory') {
        btn.onclick = () => {
          const cy = window.CodexGraph?.getCy();
          if (!cy) return;
          const node = cy.getElementById(data.id);
          const redChildren = node.children().filter(c => c.data('grade') === 'red' && c.data('type') !== 'directory');
          const targetIds = redChildren.map(c => {
            return window.CodexGraph?.getRepairTargetForNode ? window.CodexGraph.getRepairTargetForNode(c.id()) : c.id();
          });
          const uniqueIds = [...new Set(targetIds)];
          if (uniqueIds.length > 0) {
            reanchorNode(uniqueIds);
          } else {
            window.CodexUI?.showToast('No red child nodes to heal.');
          }
        };
      } else {
        btn.onclick = () => {
          const targetId = window.CodexGraph?.getRepairTargetForNode ? window.CodexGraph.getRepairTargetForNode(data.id) : data.id;
          reanchorNode(targetId);
        };
      }
    }
  }

  window.closePanel = function() {
    if (!panel) return;
    document.getElementById('workspace').classList.remove('panel-open');
    window.openPanelNodeId = null;
    setTimeout(() => {
      panel.setAttribute('hidden', '');
    }, 300);
  };

  window.updatePanelScores = function(payload) {
    if (currentSelectedId !== payload.nodeId && currentSelectedId !== payload.id) return;
    const cy = window.CodexGraph?.getCy();
    const node = cy?.getElementById(payload.nodeId || payload.id);
    const existingData = node && node.length ? node.data() : {};

    const data = {
      ...existingData,
      id: payload.nodeId || payload.id,
      grade: payload.grade,
      score: payload.S_final !== undefined ? payload.S_final : (payload.score !== undefined ? payload.score : existingData.score),
      S_final: payload.S_final !== undefined ? payload.S_final : (payload.score !== undefined ? payload.score : existingData.S_final),
      S1: payload.S1 !== undefined ? payload.S1 : existingData.S1,
      S2: payload.S2 !== undefined ? payload.S2 : existingData.S2,
      A: payload.A !== undefined ? payload.A : existingData.A,
      T: payload.T !== undefined ? payload.T : existingData.T,
      D: payload.D !== undefined ? payload.D : existingData.D,
      summary: payload.summary || existingData.summary,
      pageindex_summary: payload.pageindex_summary || existingData.pageindex_summary,
      label: payload.label || existingData.label,
    };
    openPanel(data);
  };

  function renderLeafPanel(d) {
    const drift_signals = [];
    if (d.S1 !== null && d.S1 !== undefined && !isNaN(d.S1) && Number(d.S1) < 0.6) {
      drift_signals.push({ reason: `Low Semantic Similarity (S1 = ${Number(d.S1).toFixed(2)})` });
    }
    if (d.S2 !== null && d.S2 !== undefined && !isNaN(d.S2) && Number(d.S2) < 0.2) {
      drift_signals.push({ reason: `Weak Keyword Matching (S2 = ${Number(d.S2).toFixed(2)})` });
    }
    if (d.A !== null && d.A !== undefined && !isNaN(d.A) && Number(d.A) < 0.8) {
      drift_signals.push({ reason: `Architectural Context Mismatch (A = ${Number(d.A).toFixed(2)})` });
    }
    if (d.D !== null && d.D !== undefined && !isNaN(d.D) && Math.abs(Number(d.D)) > 0.3) {
      drift_signals.push({ reason: `High Graph Centrality Penalty (PageRank Penalty = -${Math.abs(Number(d.D)).toFixed(2)})` });
    }
    
    if (d.code) {
      if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(d.code)) {
        drift_signals.push({ reason: "Dangerous Usage of eval() or new Function()" });
      }
      if (/\b==\b|\b!=\b/.test(d.code)) {
        drift_signals.push({ reason: "Loose comparison operators (== / !=) instead of strict (===)" });
      }
      if (/:\s*any\b/.test(d.code)) {
        drift_signals.push({ reason: "TypeScript generic 'any' bypasses safety checks" });
      }
      if (/db\./.test(d.code) && !/try\s*\{/.test(d.code)) {
        drift_signals.push({ reason: "Database call executed outside of a try-catch exception block" });
      }
    }
    if (d.cyclomaticComplexity === null && d.type === 'file') {
      drift_signals.push({ reason: "AST Parsing Failure (File is syntactically unparseable)" });
    }

    const combinedDriftSignals = [...(d.drift_signals || []), ...drift_signals];

    const gradeLabel = { green:'ON SCOPE', yellow:'REVIEW', red:'CRITICAL', pending:'PENDING' };
    const score = d.score != null ? (d.score*100).toFixed(0)+'%' : '--';
    
    const gc = d.grade === 'green' ? '#00b473' : d.grade === 'yellow' ? '#d4850a' : d.grade === 'red' ? '#600000' : '#c7cad5';
    
    const metricExplanations = {
      S1: "Semantic Similarity (Cosine Similarity between code embeddings and prompt query in embedding space)",
      S2: "Vectorless RAG (BM25 term match: checks exact keyword/class/function presence)",
      A: "Architectural Consistency (Coherence score based on parent context & penalty for red dependencies)",
      T: "Type Safety & Heuristics (Evaluates syntax correctness, typescript typings, and safe practices)",
      D: "Graph Centrality Penalty (PageRank-weighted penalty; penalizes drift on central orchestrator nodes)",
      S_final: "Final Score = max(0, min(1, (S1 + S2 + A + T)/4 + D))"
    };

    function scoreRow(key, label, val, gradeColor) {
      const isPenalty = key === 'D';
      const numVal = Number(val);
      const isNumber = val !== null && val !== undefined && !isNaN(val);
      
      let display = '--';
      if (isNumber) {
        const sign = isPenalty ? (numVal > 0 ? '-' : '') : '+';
        display = `${sign}${Math.abs(numVal).toFixed(2)}`;
      }
      
      const pct = isNumber ? Math.min(100, Math.max(0, Math.abs(numVal) * 100)) : 0;
      const explanation = metricExplanations[key] || '';
      
      const barColor = isPenalty ? '#ef4444' : gradeColor;
      const barBg = isPenalty ? 'rgba(239, 68, 68, 0.08)' : 'rgba(226, 232, 240, 0.5)';
      const valueColor = isPenalty && numVal !== 0 ? '#ef4444' : (isNumber && !isPenalty ? '#00b473' : '');
      const floatStyle = isPenalty ? 'right' : 'left';
      
      return `
        <tr title="${explanation}" style="cursor: help;">
          <td class="score-label" style="font-weight: 600;">${key}</td>
          <td class="score-val" data-score="${key}" style="color:${valueColor}; font-weight: 700;">${display}</td>
          <td class="score-bar-cell">
            <div class="score-bar" style="background:${barBg}; position: relative; overflow: hidden; border-radius: 4px; height: 8px;">
              <div class="score-fill" 
                   data-bar="${key}"
                   style="width:${pct}%;
                          background:${barColor};
                          height: 100%;
                          border-radius: 4px;
                          transition: width 600ms ease;
                          float:${floatStyle};">
              </div>
            </div>
          </td>
          <td class="score-name">${label} <span style="font-size:10px; opacity:0.5;">ⓘ</span></td>
        </tr>`;
    }

    return `
      <div class="panel-header">
        <div>
          <div class="panel-title">${d.label}</div>
          <div class="panel-meta mono">${d.path || d.id}</div>
          <div class="panel-meta">${d.type || 'file'} · ${d.lineCount||0} lines</div>
        </div>
        <button class="btn-close" onclick="closePanel()">✕</button>
      </div>
      <div class="grade-chip grade-${d.grade}">
        ● ${gradeLabel[d.grade]||d.grade} — ${score}
      </div>
      ${d.inheritedFrom ? `
        <div class="inheritance-chip mono">
          <span class="badge badge-blue">INHERITED</span> 
          from ${d.inheritedFrom.split('::').pop()}
        </div>
      ` : ''}
      <div class="section-header">Score Components</div>
      <table class="score-table">
        ${scoreRow('S1', 'Cosine Similarity', d.S1, gc)}
        ${scoreRow('S2', 'Keyword (BM25)', d.S2, gc)}
        ${scoreRow('A', 'Arch Consistency', d.A, gc)}
        ${scoreRow('T', 'Type Safety', d.T, gc)}
        ${scoreRow('D', 'PageIndex Score', d.D, gc)}
        <tr class="score-final-row" title="${metricExplanations.S_final}" style="cursor: help; border-top: 2px solid var(--hairline); font-weight: 700;">
          <td class="score-label">S_final</td>
          <td class="score-val" data-score="S_final" style="font-size: 16px; font-weight: 800; color: ${d.grade === 'red' ? '#ef4444' : '#00b473'}">
            ${d.S_final != null ? Number(d.S_final).toFixed(2) : '--'}
          </td>
          <td class="score-bar-cell"></td>
          <td class="score-name" style="font-size: 13px;">Total Score <span style="font-size: 10px; opacity: 0.5;">ⓘ</span></td>
        </tr>
      </table>
      <div class="formula-card noto" style="margin-top: 14px; padding: 12px; border-radius: 12px; border: 1px dashed var(--hairline); background: rgba(248, 250, 252, 0.8); font-size: 11px; color: var(--muted); line-height: 1.4;">
        <div style="font-weight: 600; color: var(--ink); margin-bottom: 4px; font-size: 12px;">Composite Formula:</div>
        <code style="font-family: var(--font-mono); display: block; font-size: 10.5px; color: var(--ink); margin-bottom: 6px; background: #fff; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--hairline);">S_final = max(0, min(1, (S1 + S2 + A + T)/4 - |D|))</code>
        <span style="font-size: 10px; line-height: 1.3; display: block;">The final alignment score is the average of semantic, structural, and safety criteria, penalized directly by graph centrality value (PageRank Centrality Penalty).</span>
      </div>
      <div class="section-header" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Code Intelligence <span class="live-indicator">LIVE</span></span>
        <div style="display:flex; gap:8px;">
          <button class="btn-copy" onclick="toggleFullCode('${d.id}')">${showFullCode ? 'Collapse' : 'Expand'}</button>
          <button class="btn-copy" onclick="copyToClipboard(\`${d.code?.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">copy</button>
        </div>
      </div>
      <pre class="code-preview grade-${d.grade}-bg ${showFullCode ? 'full-view' : ''}"><code class="mono">${
        showFullCode && d.fullCode 
          ? escapeHtml(d.fullCode)
          : escapeHtml(d.code?.split('\n').slice(0, 30).join('\n') || '// No preview available')
      }</code></pre>
      
      ${d.summary ? `
        <div class="section-header">
          Architectural Intelligence
          <span class="badge badge-blue">vectorless RAG</span>
        </div>
        <p class="summary-text italic" style="margin-bottom: 12px;">${d.summary}</p>
      ` : ''}
      
      ${combinedDriftSignals.length > 0 ? `
        <div class="drift-signals" style="margin-bottom: 16px;">
          <div class="signals-label">Drift Signals & Warnings</div>
          ${combinedDriftSignals.map(s => `
            <div class="signal-chip" style="margin: 3px 0;">⚠ ${s.reason || s}</div>
          `).join('')}
        </div>
      ` : ''}
      
      ${d.grade === 'red' ? `
        <button class="btn-reanchor">↺  Re-anchor This Node</button>` : ''}
    `;
  }

  function renderParentPanel(data) {
    const cy = window.CodexGraph?.getCy();
    if (!cy) return '<div>Graph not ready</div>';
    
    const node = cy.getElementById(data.id);
    const children = node.children();
    
    const counts = { green: 0, yellow: 0, red: 0, pending: 0 };
    const childList = [];
    
    children.forEach(c => {
      const g = c.data('grade') || 'pending';
      counts[g]++;
      if (c.data('type') !== 'directory') {
        childList.push({
          id: c.id(),
          label: c.data('label'),
          score: c.data('score') || 0,
          grade: g
        });
      }
    });

    // Sort by riskiest (lowest score)
    childList.sort((a, b) => a.score - b.score);
    const topRisky = childList.slice(0, 5);
    
    const total = Math.max(1, children.length);
    const getPct = (c) => (c / total * 100).toFixed(0) + '%';
    const gradeColor = { green: '#00b473', yellow: '#d4850a', red: '#600000', pending: '#c7cad5' };

    return `
      <div class="panel-header">
        <div>
          <div class="panel-title" style="font-size: 24px; letter-spacing: -0.72px;">${data.label}</div>
          <div class="panel-meta">Directory · ${data.path || data.id}</div>
        </div>
        <button class="btn-close" onclick="closePanel()">✕</button>
      </div>

      <div class="panel-body">
        <div class="parent-metrics">
          <div class="section-header">Health Distribution</div>
          <div class="child-bar">
             <div class="bar-segment segment-green" style="width: ${getPct(counts.green)}"></div>
             <div class="bar-segment segment-yellow" style="width: ${getPct(counts.yellow)}"></div>
             <div class="bar-segment segment-red" style="width: ${getPct(counts.red)}"></div>
          </div>
          <div class="panel-meta">${counts.green} green · ${counts.yellow} yellow · ${counts.red} red</div>
        </div>

        <div class="section-header">Riskiest Children</div>
        <div class="child-list">
          ${topRisky.map(c => `
            <div class="child-item">
              <span class="child-name">${c.label}</span>
              <div class="child-grade" style="background: ${gradeColor[c.grade]}"></div>
            </div>
          `).join('')}
          ${topRisky.length === 0 ? '<div class="panel-meta">No file children found</div>' : ''}
        </div>

        <button class="btn-reanchor" style="background: var(--color-coral-dark);">
          ↺ Heal All Red Children
        </button>
      </div>
    `;
  }

  window.reanchorNode = async function(nodeIdOrIds) {
    const btn = document.querySelector('.btn-reanchor');
    if (!btn) return;
    
    btn.disabled    = true;
    btn.textContent = '⟳ Healing...';
    btn.style.background = '#d4850a';

    const payload = typeof nodeIdOrIds === 'string'
      ? { nodeId: nodeIdOrIds }
      : { nodeIds: nodeIdOrIds };

    try {
      const response = await fetch(window.CODEXMAP_REANCHOR_URL || '/api/reheal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const res = await response.json();
      if (res.status === 'healing' || res.status === 'queued' || res.ok) {
        console.log('[PANEL] Reheal requested for:', nodeIdOrIds);
        btn.textContent = typeof nodeIdOrIds === 'string' ? '⟳ Rewriting file...' : '⟳ Rewriting files...';
      }
    } catch (err) {
      console.error('[PANEL] Re-anchor request failed:', err);
      btn.disabled    = false;
      btn.textContent = '↺ Re-anchor This Node';
      btn.style.background = '#600000';
      
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'color:#600000;font-size:12px;margin-top:8px;font-family:IBM Plex Mono';
      errDiv.textContent = 'Error: Reheal failed — ' + err.message;
      btn.parentNode.insertBefore(errDiv, btn.nextSibling);
      setTimeout(() => errDiv.remove(), 5000);
    }
  };

  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelector('.btn-copy');
      const old = btn.textContent;
      btn.textContent = 'copied!';
      setTimeout(() => btn.textContent = old, 2000);
    });
  };

  window.toggleFullCode = async function(nodeId) {
    showFullCode = !showFullCode;
    const cy = window.CodexGraph?.getCy();
    if (!cy) return;
    const node = cy.getElementById(nodeId);
    if (!node.length) return;

    if (showFullCode && !node.data('fullCode') && node.data('type') === 'file') {
      try {
        const path = node.data('path');
        const resp = await fetch('/project-code/' + path);
        if (resp.ok) {
          const text = await resp.text();
          node.data('fullCode', text);
        }
      } catch (err) {
        console.error('[PANEL] Failed to fetch full code:', err);
      }
    }
    
    // Refresh panel
    openPanel(node.data());
  };

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
