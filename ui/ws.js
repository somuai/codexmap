/**
 * ui/ws.js — WebSocket connection & synchronization logic
 * Fixed: force style() after every node_grade message
 * Added: heal_progress / heal_complete handlers
 * Fixed: proper cy reference via window.CodexGraph
 */

(function() {
  let ws;
  let reconnectTimer;
  let reconnectAttempts = 0;
  const MAX_ATTEMPTS = 10;
  const WS_URL = window.CODEXMAP_WS_URL || `ws://${window.location.hostname}:${window.CODEXMAP_WS_PORT || 4242}`;

  const GRADE_COLORS = {
    green:   { bg: '#c3faf5', border: '#187574', color: '#0d4d4d' },
    yellow:  { bg: '#ffe6cd', border: '#d4850a', color: '#5a3a00' },
    red:     { bg: '#ffc6c6', border: '#600000', color: '#600000' },
    pending: { bg: '#f0efe9', border: '#c7cad5', color: '#a5a8b5' },
  };

  const pulsingNodes = new Map();

  function getCy() {
    if (window.CodexGraph && typeof window.CodexGraph.getCy === 'function') {
      return window.CodexGraph.getCy();
    }
    return null;
  }

  function startPulse(node) {
    if (pulsingNodes.has(node.id())) return;
    let opacity = 1;
    let direction = -1;
    const interval = setInterval(() => {
      const cy = getCy();
      if (!cy || !cy.getElementById(node.id()).length) {
        clearInterval(interval);
        pulsingNodes.delete(node.id());
        return;
      }
      opacity += direction * 0.05;
      if (opacity <= 0.55) direction = 1;
      if (opacity >= 1.00) direction = -1;
      node.style('opacity', opacity);
    }, 50);
    pulsingNodes.set(node.id(), interval);
  }

  function stopPulse(node) {
    const interval = pulsingNodes.get(node.id());
    if (interval) {
      clearInterval(interval);
      pulsingNodes.delete(node.id());
      node.style('opacity', 1);
    }
  }

  function updateGradeCounter() {
    const cy = getCy();
    if (!cy) return;
    const counts = { green: 0, yellow: 0, red: 0, pending: 0 };
    cy.nodes().forEach(n => {
      const g = n.data('grade') || 'pending';
      if (n.data('type') !== 'block') {
        counts[g] = (counts[g] || 0) + 1;
      }
    });

    const pills = {
      green:   document.getElementById('count-green'),
      yellow:  document.getElementById('count-yellow'),
      red:     document.getElementById('count-red'),
      pending: document.getElementById('count-pending'),
    };
    Object.entries(pills).forEach(([grade, el]) => {
      if (el) el.textContent = counts[grade];
    });

    const total = counts.green + counts.yellow + counts.red;
    if (total > 0) {
      const alignScore = Math.round(
        (counts.green * 100 + counts.yellow * 50) / total
      );
      if (window.updateDriftScoreBadge) window.updateDriftScoreBadge(alignScore);
    }
  }

  function applyGradeStyle(node, grade) {
    const s = GRADE_COLORS[grade] || GRADE_COLORS.pending;
    node.style({
      'background-color': s.bg,
      'border-color':     s.border,
      'border-width':     grade === 'pending' ? '1.5px' : '2px',
      'color':            s.color,
    });
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (ws && ws.readyState === WebSocket.OPEN) return;
    updateConnectionStatus('connecting');
    try {
      ws = new WebSocket(WS_URL);
    } catch(e) {
      console.error('[WS] Failed to create WebSocket:', e.message);
      scheduleReconnect();
      return;
    }

    const socket = ws;

    ws.onopen = () => {
      if (socket !== ws) return;
      console.log('[WS] Connected');
      reconnectAttempts = 0;
      updateConnectionStatus('live');
      hideError();
      socket.send(JSON.stringify({ type: 'request_full_reset' }));
    };

    ws.onclose = (event) => {
      if (socket !== ws) return;
      console.log('[WS] Closed, code:', event.code);
      updateConnectionStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      if (socket !== ws) return;
      console.warn('[WS] Error — orchestrator may not be running');
      // Force close to trigger onclose → reconnect
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    };

    ws.onmessage = (event) => {
      if (socket !== ws) return;
      updateConnectionStatus('live');
      try {
        handleMessage(JSON.parse(event.data));
      } catch(e) {
        console.error('[WS] Bad message:', e.message);
      }
    };
  }

  function scheduleReconnect() {
    // Never stop trying — just cap the delay
    const delay = Math.min(1000 * Math.pow(1.5, Math.min(reconnectAttempts, 8)), 8000);
    reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${(delay/1000).toFixed(1)}s (attempt ${reconnectAttempts})`);
    reconnectTimer = setTimeout(connect, delay);
  }

  function updateConnectionStatus(state) {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const connText = document.getElementById('conn-status-text');
    const connDot = document.querySelector('.conn-dot');
    if (!dot || !text) return;
    const states = {
      live:         { color: '#00b473', label: 'Live' },
      connecting:   { color: '#d4850a', label: 'Connecting...' },
      disconnected: { color: '#e8453c', label: 'Disconnected' },
      syncing:      { color: '#5b76fe', label: 'Syncing' },
    };
    const s = states[state] || states.disconnected;
    dot.style.background  = s.color;
    text.textContent      = s.label;
    if (connText) connText.textContent = s.label;
    if (connDot) {
      connDot.style.background = s.color;
      connDot.classList.toggle('online', state === 'live');
    }
  }

  function showError() {
    const overlay = document.getElementById('conn-error-overlay');
    if (overlay) overlay.hidden = false;
  }

  function hideError() {
    const overlay = document.getElementById('conn-error-overlay');
    if (overlay) overlay.hidden = true;
  }

  function handleMessage(msg) {
    const { type, payload } = msg;

    switch (type) {
      case 'full_reset':
        if (window.CodexGraph) {
          window.CodexGraph.update(payload);
          updateNodeCount(payload.nodes?.length || 0);
        }
        break;

      case 'graph_update':
        if (window.CodexGraph) {
          window.CodexGraph.applyDiff(payload);
          const cy = getCy();
          if (cy) updateNodeCount(cy.nodes().length);
        }
        break;

      case 'node_grade': {
        const p = payload;
        if (!p?.id || !p?.grade) break;
        const cy = getCy();
        if (!cy) break;

        let node = cy.getElementById(p.id);

        if (!node.length) {
          console.log('[WS] New node from grade:', p.id);
          const parentCandidate = (p.path || p.id).includes('/') ? (p.path || p.id).split('/').slice(0, -1).join('/') : undefined;
          cy.add({
            group: 'nodes',
            data: {
              id:        p.id,
              label:     p.label || p.id.split('/').pop().replace(/\.(js|ts|jsx|tsx)$/, ''),
              grade:     p.grade,
              score:     p.S_final ?? p.score ?? 0,
              S_final:   p.S_final ?? 0,
              S1: p.S1 ?? 0, S2: p.S2 ?? 0,
              A:  p.A  ?? 0, T:  p.T  ?? 0,
              D:  p.D  ?? 0,
              path:      p.path      || p.id,
              type:      p.type      || 'file',
              lineCount: p.lineCount || 0,
              code:      p.code      || '',
              summary:   p.summary   || '',
              parentRef: p.parent || p.parentRef || parentCandidate,
            }
          });
          node = cy.getElementById(p.id);
        }

        node.data('grade',   p.grade);
        node.data('score',   p.S_final ?? p.score ?? 0);
        node.data('S_final', p.S_final ?? 0);
        node.data('S1', p.S1 ?? 0);
        node.data('S2', p.S2 ?? 0);
        node.data('A',  p.A  ?? 0);
        node.data('T',  p.T  ?? 0);
        node.data('D',  p.D  ?? 0);
        if (p.summary)           node.data('summary', p.summary);
        if (p.pageindex_summary) node.data('pageindex_summary', p.pageindex_summary);
        if (p.code)              node.data('code', p.code);
        if (p.lineCount)         node.data('lineCount', p.lineCount);

        const s = GRADE_COLORS[p.grade] || GRADE_COLORS.pending;
        node.style({
          'background-color': s.bg,
          'border-color':     s.border,
          'border-width':     p.grade === 'pending' ? '1.5px' : '2px',
          'color':            s.color,
        });

        if (p.grade !== 'pending') {
          node.style('background-color', '#ffffff');
          setTimeout(() => node.style('background-color', s.bg), 120);
        }

        if (p.grade === 'red') startPulse(node);
        else stopPulse(node);

        node.connectedEdges().forEach(edge => {
          edge.data('sourceGrade', edge.source().data('grade') || 'pending');
          edge.data('targetGrade', edge.target().data('grade') || 'pending');
          if (edge.target().data('grade') === 'red') {
            edge.style({
              'line-color':         '#ffc6c6',
              'line-style':         'dotted',
              'target-arrow-color': '#600000',
            });
          }
        });

        updateGradeCounter();

        if (window.openPanelNodeId === p.id && window.updatePanelScores) {
          window.updatePanelScores(p);
        }

        const icon = { green:'🟢', yellow:'🟡', red:'🔴' }[p.grade] || '⚪';
        const pct  = ((p.S_final ?? p.score ?? 0) * 100).toFixed(0);
        if (window.ActivityFeed) {
          window.ActivityFeed.addEntry({
            agent: 'Sentinel',
            text: `${icon} ${p.label || p.id.split('/').pop()} → ${p.grade} (${pct}%)`,
          });
        }
        console.log(`[WS] Colored: ${p.id} → ${p.grade} ${s.bg}`);
        break;
      }

      case 'heal_progress': {
        const { nodeId, status, label, attempt } = payload;
        const cy = getCy();
        if (cy) {
          const node = cy.getElementById(nodeId);
          if (node.length) {
            node.style('border-style', 'dashed');
            node.style('border-color', '#d4850a');
            node.style('border-width', '3px');
            // Add orange glow pulse
            startPulse(node);
          }
        }
        if (window.openPanelNodeId === nodeId) {
          const btn = document.querySelector('.btn-reanchor');
          if (btn) {
            btn.textContent  = attempt ? `⟳ Rewriting (attempt ${attempt})...` : '⟳ Rewriting file...';
            btn.style.background = '#d4850a';
            btn.disabled = true;
          }
        }
        if (window.ActivityFeed) {
          window.ActivityFeed.addEntry({
            agent: 'Healer',
            text: `🔧 Healing ${label || nodeId.split('/').pop()}...`,
          });
        }
        break;
      }

      case 'heal_complete': {
        const p = payload;
        const cy = getCy();
        if (cy) {
          const node = cy.getElementById(p.nodeId);
          if (node.length) {
            node.data('grade',   p.grade);
            node.data('score',   p.S_final);
            node.data('S_final', p.S_final);
            node.style('border-style', 'solid');
            node.style('border-width', '2px');

            // Flash white then transition to grade color
            const s = GRADE_COLORS[p.grade] || GRADE_COLORS.pending;
            node.style('background-color', '#ffffff');
            node.style('border-color',     '#5b76fe');
            setTimeout(() => {
              node.style({
                'background-color': s.bg,
                'border-color':     s.border,
                'color':            s.color,
              });
              if (p.grade !== 'red') stopPulse(node);
              else startPulse(node); // Keep pulsing if still red
            }, 400);
          }
        }

        if (window.openPanelNodeId === p.nodeId) {
          if (window.updatePanelScores) window.updatePanelScores(p);
          const btn = document.querySelector('.btn-reanchor');
          if (btn) {
            if (p.grade === 'red') {
              btn.disabled    = false;
              btn.textContent = '↺ Re-anchor Again';
              btn.style.background = '#600000';
            } else {
              btn.textContent  = `✓ Healed → ${p.grade}`;
              btn.style.background = '#00b473';
              btn.style.color  = 'white';
              setTimeout(() => btn.closest('.panel-section')?.remove(), 5000);
            }
          }
        }

        const icon = p.improved ? '✅' : '⚠';
        const label = p.label || p.nodeId.split('/').pop();
        if (window.ActivityFeed) {
          window.ActivityFeed.addEntry({
            agent: 'Healer',
            text: `${icon} ${label} → ${p.grade} (${((p.S_final||0)*100).toFixed(0)}%)`,
          });
        }
        updateGradeCounter();
        break;
      }

      case 'drift_score':
        if (window.updateDriftScoreBadge) {
          window.updateDriftScoreBadge(payload.score);
        }
        if (window.DriftTimeline) {
          window.DriftTimeline.addPoint(payload.score, payload.timestamp);
        }
        break;

      case 'agent_activity':
        if (window.ActivityFeed) {
          window.ActivityFeed.addEntry(payload);
        }
        if (window.updateAgentPill) {
          const agent = payload.agent ? payload.agent.toLowerCase() : '';
          if (agent) {
            window.updateAgentPill(agent, 'active');
            setTimeout(() => window.updateAgentPill(agent, 'idle'), 3000);
          }
        }
        break;

      case 'collapse_warning':
        if (window.handleCollapseWarning) {
          window.handleCollapseWarning(payload);
        } else {
          const banner = document.getElementById('collapse-banner');
          if (banner) banner.hidden = !payload.triggered;
        }
        break;

      case 'cost_update':
        const tokEl = document.getElementById('api-tokens');
        const costEl = document.getElementById('api-cost');
        if (tokEl) tokEl.textContent = payload.total_tokens.toLocaleString();
        if (costEl) costEl.textContent = payload.total_cost_usd.toFixed(4);
        break;

      case 'settings_update':
        if (window.updateSettingsUI) {
          window.updateSettingsUI(payload);
        }
        break;

      case 'heal_status_update':
        // Show toast notification for heal status changes
        const { nodeId: hNodeId, status: hStatus } = payload;
        if (hStatus === 'done' && window.ActivityFeed) {
          const hLabel = hNodeId?.split('/').pop() || hNodeId;
          window.ActivityFeed.addEntry({
            agent: 'Healer',
            text: `✅ ${hLabel} rewrite complete — re-scoring...`,
          });
        }
        if (hStatus === 'failed' && window.ActivityFeed) {
          const hLabel = hNodeId?.split('/').pop() || hNodeId;
          window.ActivityFeed.addEntry({
            agent: 'Healer',
            text: `❌ ${hLabel} rewrite failed — will retry`,
          });
        }
        break;
    }
  }

  function updateNodeCount(count) {
    const el = document.getElementById('node-count');
    if (el) el.textContent = `${count} nodes`;
  }

  window.CodexWS = {
    connect,
    send: (data) => ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(data)),
    updateStatus: updateConnectionStatus
  };

  connect();

  setInterval(() => {
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      connect();
    }
  }, 5000);
})();
