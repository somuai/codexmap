/**
 * ui/ui-state.js - client-only workspace state for the Miro-style UI.
 */

(function() {
  const STORAGE = {
    sidebar: 'codexmap.sidebarCollapsed',
    warning: 'codexmap.dismissedCollapseWarning',
    viewMode: 'codexmap.viewMode',
    incidentOpen: 'codexmap.incidentOpen',
    incidentTab: 'codexmap.incidentTab',
  };

  const INCIDENT_BATCH_PREFIX = 'incident';
  const SESSION_ID = new URLSearchParams(window.location.search).get('session') || null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem(STORAGE.sidebar, collapsed ? '1' : '0');
  }

  function showToast(message, timeout = 2200) {
    const toast = $('#canvas-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, timeout);
  }

  function updateViewModeButtons(mode) {
    $all('[data-view-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.viewMode === mode);
    });
  }

  function updateDriftScoreBadge(score) {
    const value = $('#drift-score-value');
    const pill = $('#drift-pill');
    const drawerValue = $('#drawer-drift-score');
    const drawerCopy = $('#drawer-drift-copy');
    if (!value || !pill || typeof score !== 'number') return;

    const pct = Math.round(score <= 1 ? score * 100 : score);
    value.textContent = `${pct}%`;
    if (drawerValue) drawerValue.textContent = `${pct}%`;
    if (drawerCopy) {
      drawerCopy.textContent = pct >= 80
        ? 'Strong alignment'
        : pct >= 50
          ? 'Review recommended'
          : 'Critical drift risk';
    }

    pill.className = 'drift-pill roobert';
    if (pct >= 80) pill.classList.add('grade-a-chip');
    else if (pct >= 50) pill.classList.add('grade-c-chip');
    else pill.classList.add('grade-f-chip');
  }

  function updateAgentPill(agent, state) {
    const pill = document.querySelector(`[data-agent="${agent}"]`);
    if (pill) pill.classList.toggle('active', state === 'active');
  }

  function setSelectedBreadcrumb(data) {
    const el = $('#breadcrumb');
    if (!el) return;
    if (!data) {
      el.textContent = 'No node selected';
      el.title = 'No node selected';
      return;
    }
    const label = data.label || String(data.id || '').split('/').pop();
    const path = data.path || data.id || '';
    el.textContent = `${data.type || 'node'} / ${label}`;
    el.title = path;
  }

  function collapseWarningSignature(payload) {
    const signals = Array.isArray(payload?.signals) ? payload.signals.join('|') : '';
    return `${payload?.triggered ? '1' : '0'}:${signals}`;
  }

  function handleCollapseWarning(payload) {
    const banner = $('#collapse-banner');
    if (!banner) return;
    const signature = collapseWarningSignature(payload);
    const dismissed = localStorage.getItem(STORAGE.warning);

    if (!payload?.triggered || dismissed === signature) {
      banner.hidden = true;
      return;
    }

    const text = $('#collapse-banner-text');
    if (text) {
      const signals = Array.isArray(payload.signals) && payload.signals.length
        ? payload.signals.join(', ')
        : 'drift threshold exceeded';
      text.textContent = `Architectural collapse risk: ${signals}`;
    }
    banner.dataset.signature = signature;
    banner.hidden = false;
  }

  function wireKeyboardShortcuts() {
    window.addEventListener('keydown', (event) => {
      const target = event.target;
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const overlay = $('#shortcuts-overlay');

      if (event.key === 'Escape') {
        if (document.body.classList.contains('incident-open')) {
          closeIncidentDrawer();
          return;
        }
        if (overlay && !overlay.hidden) overlay.hidden = true;
        return;
      }

      if (event.key === '?' && !isTyping) {
        event.preventDefault();
        if (overlay) overlay.hidden = false;
        return;
      }

      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        $('#node-search')?.focus();
        return;
      }

      if (isTyping) return;

      const graph = window.CodexGraph;
      const key = event.key.toLowerCase();
      const shortcuts = {
        '1': 'overview',
        '2': 'files',
        '3': 'functions',
        d: 'drift',
        c: 'critical',
      };

      if (shortcuts[key]) {
        graph?.setViewMode(shortcuts[key]);
      } else if (key === 'f') {
        graph?.fitVisible();
      }
    });
  }

  const incidentState = {
    selected: new Set(),
    queueEntries: [],
    activeTab: localStorage.getItem(STORAGE.incidentTab) || 'risky',
  };

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function normalizeQueueStatus(status) {
    if (!status) return '';
    const value = String(status).toLowerCase();
    if (value === 'pending') return 'queued';
    if (value === 'running') return 'healing';
    if (value === 'done') return 'resolved';
    return value;
  }

  function queueKey(entry) {
    return `${entry?.batchId || 'default'}:${entry?.nodeId || ''}`;
  }

  function upsertQueueEntry(entry) {
    if (!entry?.nodeId) return;
    const key = queueKey(entry);
    const index = incidentState.queueEntries.findIndex((item) => queueKey(item) === key);
    if (index >= 0) {
      incidentState.queueEntries[index] = { ...incidentState.queueEntries[index], ...entry };
    } else {
      incidentState.queueEntries.unshift(entry);
    }
  }

  function latestQueueForNode(nodeId) {
    if (!nodeId) return null;
    return incidentState.queueEntries
      .filter((entry) => entry.nodeId === nodeId)
      .sort((a, b) => {
        const aTime = Date.parse(a.completedAt || a.startedAt || a.enqueuedAt || 0);
        const bTime = Date.parse(b.completedAt || b.startedAt || b.enqueuedAt || 0);
        return bTime - aTime;
      })[0] || null;
  }

  function getIncidentGroups() {
    return window.CodexGraph?.getIncidentTargets?.() || [];
  }

  function activeQueueEntries() {
    return incidentState.queueEntries.filter((entry) => {
      const status = normalizeQueueStatus(entry.status);
      return status === 'queued' || status === 'healing' || status === 'rescoring';
    });
  }

  function summarizeIncident(groups = getIncidentGroups()) {
    const summary = groups.reduce((acc, group) => {
      acc.riskyFiles += 1;
      acc.issueCount += group.issueCount || 0;
      acc.redCount += group.redCount || 0;
      acc.criticalYellowCount += group.criticalYellowCount || 0;
      return acc;
    }, {
      riskyFiles: 0,
      issueCount: 0,
      redCount: 0,
      criticalYellowCount: 0,
      queueCount: activeQueueEntries().length,
    });

    return summary;
  }

  function updateIncidentShell(groups = getIncidentGroups()) {
    const summary = summarizeIncident(groups);
    const trigger = $('#incident-trigger');
    const triggerCount = $('#incident-trigger-count');
    if (triggerCount) triggerCount.textContent = summary.issueCount;
    if (trigger) trigger.classList.toggle('has-risk', summary.issueCount > 0);

    const headline = $('#incident-drawer-headline');
    const copy = $('#incident-drawer-copy');
    if (headline) {
      headline.textContent = summary.issueCount
        ? `${summary.riskyFiles} repair candidate file${summary.riskyFiles === 1 ? '' : 's'}`
        : 'No critical drift';
    }
    if (copy) {
      copy.textContent = summary.issueCount
        ? `${summary.redCount} red and ${summary.criticalYellowCount} critical-yellow nodes are repair-eligible.`
        : 'Ordinary yellow nodes stay review-only until they cross the critical threshold.';
    }

    
    const recommendation = $('#incident-recommendation');
    if (recommendation) {
      if (!summary.issueCount) {
        recommendation.textContent = 'No red or critical-yellow nodes are currently repair-eligible.';
      } else if (summary.redCount > 0) {
        recommendation.textContent = 'Start with red files, then repair critical-yellow children if they remain off-prompt.';
      } else {
        recommendation.textContent = 'Critical-yellow files are below 0.45 alignment; review them before ordinary yellow nodes.';
      }
    }

    const metrics = {
      'incident-risky-count': summary.riskyFiles,
      'incident-red-count': summary.redCount,
      'incident-yellow-count': summary.criticalYellowCount,
      'incident-queue-count': summary.queueCount,
    };
    Object.entries(metrics).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  }

  function setIncidentOpen(open) {
    const drawer = $('#incident-drawer');
    const backdrop = $('#incident-backdrop');
    if (!drawer || !backdrop) return;
    drawer.hidden = false;
    backdrop.hidden = !open;
    document.body.classList.toggle('incident-open', open);
    localStorage.setItem(STORAGE.incidentOpen, open ? '1' : '0');
  }

  function openIncidentDrawer(tab = incidentState.activeTab) {
    setIncidentTab(tab || 'risky');
    setIncidentOpen(true);
    refreshIncident();
  }

  function closeIncidentDrawer() {
    setIncidentOpen(false);
  }

  function setIncidentTab(tab) {
    incidentState.activeTab = tab || 'risky';
    localStorage.setItem(STORAGE.incidentTab, incidentState.activeTab);
    $all('[data-incident-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.incidentTab === incidentState.activeTab);
    });
    renderIncident();
  }

  function scoreLabel(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '--';
    return `${Math.round(value * 100)}%`;
  }

  function renderRiskyTab(groups) {
    if (!groups.length) {
      return `
        <div class="incident-empty">
          <div>
            <h3>No critical drift</h3>
            <p>There are no red nodes or critical-yellow nodes below 45% alignment. Review ordinary yellow nodes manually from Drift Only mode.</p>
            <button class="incident-action primary" data-incident-action="fit-drift">Open Drift Only view</button>
          </div>
        </div>
      `;
    }

    const selectedCount = incidentState.selected.size;
    return `
      <div class="incident-actions">
        <button class="incident-action primary" data-incident-action="queue-selected" ${selectedCount ? '' : 'disabled'}>Re-anchor selected (${selectedCount})</button>
        <button class="incident-action danger" data-incident-action="queue-all">Re-anchor all incident nodes</button>
        <button class="incident-action wide" data-incident-action="fit-incident">Fit incident nodes</button>
      </div>
      <div class="incident-list">
        ${groups.map((group) => {
          const latest = latestQueueForNode(group.targetId);
          const status = normalizeQueueStatus(latest?.status || group.repairStatus);
          const selected = incidentState.selected.has(group.targetId);
          return `
            <article class="incident-row ${selected ? 'is-selected' : ''}">
              <input type="checkbox" data-incident-select="${escapeHtml(group.targetId)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(group.label)}">
              <div class="incident-main">
                <p class="incident-title">
                  ${escapeHtml(group.label)}
                  ${status ? `<span class="repair-chip ${status}">${escapeHtml(status)}</span>` : ''}
                </p>
                <p class="incident-path">${escapeHtml(group.path || group.targetId)}</p>
                <div class="incident-meta">
                  ${group.redCount ? `<span class="risk-chip red">${group.redCount} red</span>` : ''}
                  ${group.criticalYellowCount ? `<span class="risk-chip yellow">${group.criticalYellowCount} critical yellow</span>` : ''}
                  <span class="risk-chip score">worst ${scoreLabel(group.worstScore)}</span>
                  <span class="risk-chip score">${group.issueCount} affected node${group.issueCount === 1 ? '' : 's'}</span>
                </div>
              </div>
              <div class="incident-side">
                <button class="incident-mini" data-incident-action="focus-one" data-node-id="${escapeHtml(group.targetId)}">Focus</button>
                <button class="incident-mini" data-incident-action="queue-one" data-node-id="${escapeHtml(group.targetId)}">Queue</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderQueueTab(mode = 'active') {
    const entries = incidentState.queueEntries
      .filter((entry) => {
        const status = normalizeQueueStatus(entry.status);
        const active = status === 'queued' || status === 'healing' || status === 'rescoring';
        return mode === 'history' ? !active : active;
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.completedAt || a.startedAt || a.enqueuedAt || 0);
        const bTime = Date.parse(b.completedAt || b.startedAt || b.enqueuedAt || 0);
        return bTime - aTime;
      });

    if (!entries.length) {
      return `
        <div class="incident-empty">
          <div>
            <h3>${mode === 'history' ? 'No repair history yet' : 'Repair queue is empty'}</h3>
            <p>${mode === 'history' ? 'Completed and failed repairs will appear here.' : 'Queue individual files or the full incident set from the Risky Nodes tab.'}</p>
            <button class="incident-action primary" data-incident-action="tab-risky">Review risky nodes</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="incident-list">
        ${entries.map((entry) => {
          const status = normalizeQueueStatus(entry.status) || 'queued';
          const name = String(entry.nodeId || '').split('/').pop() || entry.nodeId;
          const time = entry.completedAt || entry.startedAt || entry.enqueuedAt || '';
          return `
            <article class="incident-row">
              <span class="repair-chip ${status}">${escapeHtml(status)}</span>
              <div class="incident-main">
                <p class="incident-title">${escapeHtml(name)}</p>
                <p class="incident-path">${escapeHtml(entry.nodeId || '')}</p>
                <div class="incident-meta">
                  <span class="risk-chip score">batch ${escapeHtml(entry.batchId || 'manual')}</span>
                  <span class="risk-chip score">attempt ${escapeHtml(entry.attemptCount || 0)}</span>
                  ${entry.error ? `<span class="risk-chip red">${escapeHtml(entry.error)}</span>` : ''}
                </div>
                ${time ? `<p class="incident-history-time">${escapeHtml(new Date(time).toLocaleString())}</p>` : ''}
              </div>
              <div class="incident-side">
                <button class="incident-mini" data-incident-action="focus-one" data-node-id="${escapeHtml(entry.nodeId)}">Focus</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderIncident() {
    const body = $('#incident-body');
    if (!body) return;
    const groups = getIncidentGroups();
    updateIncidentShell(groups);

    if (incidentState.activeTab === 'queue') {
      body.innerHTML = renderQueueTab('active');
    } else if (incidentState.activeTab === 'history') {
      body.innerHTML = renderQueueTab('history');
    } else {
      body.innerHTML = renderRiskyTab(groups);
    }
  }

  function refreshIncident() {
    updateIncidentShell();
    renderIncident();
  }

  async function fetchHealQueue() {
    try {
      const response = await fetch('/api/heal-queue', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      syncHealQueue(payload);
    } catch (error) {
      console.warn('[INCIDENT] Could not restore heal queue:', error.message);
    }
  }

  function syncHealQueue(payload) {
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.queue)
        ? payload.queue
        : [];
    incidentState.queueEntries = entries.map((entry) => ({ ...entry }));
    window.CodexGraph?.applyRepairQueue?.({ queue: incidentState.queueEntries });
    refreshIncident();
  }

  async function queueNodes(nodeIds, source = 'incident', options = {}) {
    const unique = [...new Set((nodeIds || []).filter(Boolean))];
    if (!unique.length) {
      showToast('No repair-eligible nodes selected');
      return null;
    }

    if (options.confirm !== false) {
      const noun = unique.length === 1 ? 'file' : 'files';
      const ok = window.confirm(`Queue re-anchor for ${unique.length} ${noun}? CodexMap will target the owning file for each risky child node.`);
      if (!ok) return null;
    }

    const batchId = `${INCIDENT_BATCH_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const enqueuedAt = new Date().toISOString();
    unique.forEach((nodeId) => {
      const entry = { nodeId, status: 'pending', batchId, triggeredBy: source, enqueuedAt, attemptCount: 0 };
      upsertQueueEntry(entry);
      window.CodexGraph?.markRepairState?.(nodeId, 'queued', entry);
    });
    refreshIncident();

    try {
      const response = await fetch(window.CODEXMAP_REANCHOR_URL || '/api/reheal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds: unique, batchId, triggeredBy: source, sessionId: SESSION_ID }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      const skipped = Array.isArray(result.skipped) ? result.skipped : [];
      const queued = Array.isArray(result.queued) ? result.queued : unique;
      queued.forEach((nodeId) => {
        upsertQueueEntry({ nodeId, status: 'pending', batchId: result.batchId || batchId, triggeredBy: source, enqueuedAt, attemptCount: 0 });
      });
      showToast(skipped.length
        ? `Queued ${queued.length}, skipped ${skipped.length} already active`
        : `Queued ${queued.length} repair${queued.length === 1 ? '' : 's'}`);
      await fetchHealQueue();
      return result;

    } catch (error) {
      unique.forEach((nodeId) => {
        upsertQueueEntry({ nodeId, status: 'failed', batchId, triggeredBy: source, enqueuedAt, completedAt: new Date().toISOString(), error: error.message });
        window.CodexGraph?.markRepairState?.(nodeId, 'failed', { batchId, error: error.message });
      });
      showToast(`Repair queue failed: ${error.message}`, 3600);
      refreshIncident();
      return null;
    }
  }

  function handleQueueStatus(payload) {
    if (!payload?.nodeId) return;
    upsertQueueEntry(payload);
    window.CodexGraph?.markRepairState?.(payload.nodeId, payload.status, payload);
    refreshIncident();
  }

  function wireIncident() {
    $('#incident-trigger')?.addEventListener('click', () => openIncidentDrawer('risky'));
    $('#open-incident-from-drawer')?.addEventListener('click', () => openIncidentDrawer('risky'));
    $('#incident-close')?.addEventListener('click', closeIncidentDrawer);
    $('#incident-backdrop')?.addEventListener('click', closeIncidentDrawer);

    $all('[data-incident-tab]').forEach((button) => {
      button.addEventListener('click', () => setIncidentTab(button.dataset.incidentTab));
    });

    $('#incident-body')?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-incident-select]');
      if (!checkbox) return;
      const nodeId = checkbox.dataset.incidentSelect;
      if (checkbox.checked) incidentState.selected.add(nodeId);
      else incidentState.selected.delete(nodeId);
      renderIncident();
    });

    $('#incident-body')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-incident-action]');
      if (!button) return;
      const action = button.dataset.incidentAction;
      const groups = getIncidentGroups();

      if (action === 'queue-selected') {
        queueNodes([...incidentState.selected], 'incident-selected');
      } else if (action === 'queue-all') {
        queueNodes(groups.map((group) => group.targetId), 'incident-all');
      } else if (action === 'queue-one') {
        queueNodes([button.dataset.nodeId], 'incident-single');
      } else if (action === 'fit-incident') {
        window.CodexGraph?.focusNodes?.(groups.map((group) => group.targetId));
      } else if (action === 'fit-drift') {
        window.CodexGraph?.setViewMode?.('drift');
        window.CodexGraph?.fitDrifted?.();
      } else if (action === 'focus-one') {
        window.CodexGraph?.focusNodes?.([button.dataset.nodeId]);
      } else if (action === 'tab-risky') {
        setIncidentTab('risky');
      }
    });

    window.addEventListener('codexmap:graph-hydrated', refreshIncident);
    window.addEventListener('codexmap:repair-state-updated', refreshIncident);
    fetchHealQueue();
    refreshIncident();

    if (localStorage.getItem(STORAGE.incidentOpen) === '1') {
      openIncidentDrawer(incidentState.activeTab);
    }
  }

  function init() {
    setSidebarCollapsed(localStorage.getItem(STORAGE.sidebar) === '1');

    $('#sidebar-toggle')?.addEventListener('click', () => {
      setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
    });

    $('#sidebar-collapse')?.addEventListener('click', () => {
      setSidebarCollapsed(true);
    });

    $('#help-shortcuts')?.addEventListener('click', () => {
      const overlay = $('#shortcuts-overlay');
      if (overlay) overlay.hidden = false;
    });

    $('#shortcuts-close')?.addEventListener('click', () => {
      const overlay = $('#shortcuts-overlay');
      if (overlay) overlay.hidden = true;
    });

    $('#shortcuts-overlay')?.addEventListener('click', (event) => {
      if (event.target.id === 'shortcuts-overlay') event.currentTarget.hidden = true;
    });

    $('#collapse-dismiss')?.addEventListener('click', () => {
      const banner = $('#collapse-banner');
      if (!banner) return;
      localStorage.setItem(STORAGE.warning, banner.dataset.signature || '');
      banner.hidden = true;
    });

    $all('[data-view-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        window.CodexGraph?.setViewMode(button.dataset.viewMode);
      });
    });

    $('#btn-fit-drift')?.addEventListener('click', () => {
      window.CodexGraph?.fitDrifted();
    });

    wireIncident();
    wireKeyboardShortcuts();
  }

  window.CodexUI = {
    STORAGE,
    showToast,
    updateViewModeButtons,
    setSelectedBreadcrumb,
    handleCollapseWarning,
  };

  window.CodexIncident = {
    open: openIncidentDrawer,
    close: closeIncidentDrawer,
    refresh: refreshIncident,
    queueNodes,
    syncHealQueue,
    handleQueueStatus,
    getSelected: () => [...incidentState.selected],
  };

  window.updateDriftScoreBadge = window.updateDriftScoreBadge || updateDriftScoreBadge;
  window.updateAgentPill = window.updateAgentPill || updateAgentPill;

  window.addEventListener('DOMContentLoaded', init);
})();
