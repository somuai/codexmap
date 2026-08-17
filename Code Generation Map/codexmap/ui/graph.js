/**
 * ui/graph.js - Cytoscape renderer for the Miro-style CodexMap canvas.
 */

if (typeof cytoscape !== 'undefined' && typeof fcose !== 'undefined') {
  try {
    cytoscape.use(fcose);
    console.log('[GRAPH] fcose registered');
  } catch (error) {
    console.warn('[GRAPH] fcose registration skipped:', error.message);
  }
}

window.CodexGraph = (function() {
  let cy;
  let tooltip;
  let pendingState = null;
  let viewMode = localStorage.getItem(window.CodexUI?.STORAGE?.viewMode || 'codexmap.viewMode') || 'overview';
  let lastSearch = '';

  const expandedNodes = new Set();
  const gradeFilters = new Set(['green', 'yellow', 'red', 'pending']);

  const GRADE = {
    green: { bg: '#ecfdf5', border: '#22c55e', text: '#14532d', glow: 'rgba(34,197,94,0.20)' },
    yellow: { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', glow: 'rgba(245,158,11,0.22)' },
    red: { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d', glow: 'rgba(239,68,68,0.22)' },
    pending: { bg: '#f8fafc', border: '#94a3b8', text: '#475569', glow: 'rgba(148,163,184,0.18)' },
  };

  const CODE_NODE_TYPES = new Set(['file', 'function', 'block', 'logic_block']);
  const DETAIL_TYPES = new Set(['function', 'block', 'logic_block']);

  const STYLE = [
    {
      selector: 'node',
      style: {
        width: 178,
        height: 56,
        shape: 'round-rectangle',
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'ellipsis',
        'text-max-width': 154,
        'font-family': '"Roobert", "Noto Sans", sans-serif',
        'font-size': 13,
        'font-weight': 700,
        color: '#172033',
        'background-color': '#ffffff',
        'border-color': '#94a3b8',
        'border-width': 2,
        'overlay-opacity': 0,
        'transition-property': 'background-color, border-color, opacity, width, height',
        'transition-duration': '180ms',
        'z-index': 20,
      },
    },
    {
      selector: 'node[type = "file"]',
      style: {
        width: 190,
        height: 58,
        'font-size': 13,
      },
    },
    {
      selector: 'node[type = "function"], node[type = "logic_block"]',
      style: {
        width: 156,
        height: 46,
        'font-size': 12,
        'border-style': 'dashed',
      },
    },
    {
      selector: 'node[type = "block"]',
      style: {
        width: 122,
        height: 38,
        'font-size': 10,
        'border-style': 'dashed',
      },
    },
    {
      selector: 'node[type = "directory"], node:parent',
      style: {
        'background-color': '#fde0f0',
        'background-opacity': 0.15,
        'border-color': '#c7cad5',
        'border-style': 'dotted',
        'border-width': 2,
        'border-opacity': 1.0,
        padding: 32,
        shape: 'round-rectangle',
        label: 'data(label)',
        'text-valign': 'top',
        'text-halign': 'left',
        'text-margin-x': 12,
        'text-margin-y': -14,
        'font-family': '"Roobert PRO Medium", "Roobert", "Noto Sans", sans-serif',
        'font-size': 11,
        'font-weight': 700,
        'text-transform': 'uppercase',
        color: '#1c1c1e',
        'z-index': 1,
      },
    },
    {
      selector: 'node.selected',
      style: {
        'border-color': '#5b76fe',
        'border-width': 3,
        'overlay-color': '#5b76fe',
        'overlay-opacity': 0.08,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        opacity: 0.6,
        'curve-style': 'bezier',
        'line-color': '#c7cad5',
        'line-style': 'dotted',
        'target-arrow-color': '#c7cad5',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.85,
        'source-endpoint': 'outside-to-node',
        'target-endpoint': 'outside-to-node',
        'z-index': 4,
      },
    },
    {
      selector: 'edge.hot',
      style: {
        width: 2.5,
        opacity: 0.9,
        'line-color': '#600000',
        'target-arrow-color': '#600000',
        'line-style': 'dotted',
        'z-index': 5,
      },
    },
    {
      selector: '.faded',
      style: {
        opacity: 0.13,
      },
    },
  ];

  function init() {
    const container = document.getElementById('canvas-container');
    cy = cytoscape({
      container,
      layout: { name: 'preset' },
      style: STYLE,
      wheelSensitivity: 0.22,
      minZoom: 0.08,
      maxZoom: 2.8,
    });

    tooltip = document.createElement('div');
    tooltip.className = 'codex-tooltip';
    document.body.appendChild(tooltip);

    setupInteractions();
    setupControls();

    cy.on('zoom pan', () => {
      updateZoomLabel();
      renderMinimap();
      updateSmartLabels();
    });

    cy.on('layoutstop', () => {
      applyVisibility({ layout: false });
      fitVisible(36, false);
      renderMinimap();
    });

    window.CodexUI?.updateViewModeButtons(viewMode);

    if (pendingState) {
      update(pendingState);
      pendingState = null;
    }
  }

  function setupControls() {
    document.getElementById('btn-fit')?.addEventListener('click', () => fitVisible());
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => zoomBy(1.18));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => zoomBy(1 / 1.18));
    document.getElementById('btn-layout')?.addEventListener('click', () => runLayout({ force: true }));

    document.querySelectorAll('[data-grade-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const grade = button.dataset.gradeFilter;
        if (gradeFilters.has(grade)) gradeFilters.delete(grade);
        else gradeFilters.add(grade);
        button.classList.toggle('active', gradeFilters.has(grade));
        applyVisibility({ layout: true });
        window.CodexUI?.showToast(`Showing ${gradeFilters.size} grade filters`);
      });
    });

    document.getElementById('clear-grade-filters')?.addEventListener('click', () => {
      ['green', 'yellow', 'red', 'pending'].forEach((grade) => gradeFilters.add(grade));
      document.querySelectorAll('[data-grade-filter]').forEach((button) => button.classList.add('active'));
      applyVisibility({ layout: true });
    });
  }

  function setupInteractions() {
    cy.on('tap', 'node', (event) => {
      const node = event.target;
      cy.elements().removeClass('selected');
      node.addClass('selected');
      window.CodexUI?.setSelectedBreadcrumb(node.data());

      if (shouldExpandInsteadOfInspect(node)) {
        toggleExpanded(node);
        return;
      }

      window.dispatchEvent(new CustomEvent('node-selected', { detail: node.data() }));
    });

    cy.on('dbltap', 'node', (event) => {
      toggleExpanded(event.target);
    });

    cy.on('mouseover', 'node', (event) => {
      const node = event.target;
      if (node.style('display') === 'none') return;
      showTooltip(node, event.originalEvent || event.renderedPosition);
    });

    cy.on('mouseout', 'node', hideTooltip);
  }

  function shouldExpandInsteadOfInspect(node) {
    if (DETAIL_TYPES.has(node.data('type'))) return false;
    return hiddenChildren(node).length > 0 || (node.isParent() && !expandedNodes.has(node.id()));
  }

  function hiddenChildren(node) {
    return childrenOf(node.id()).filter((child) => child.style('display') === 'none');
  }

  function toggleExpanded(node) {
    const id = node.id();
    if (expandedNodes.has(id)) {
      expandedNodes.delete(id);
      window.CodexUI?.showToast(`Collapsed ${node.data('label') || id}`);
    } else {
      expandedNodes.add(id);
      window.CodexUI?.showToast(`Expanded ${node.data('label') || id}`);
    }
    applyVisibility({ layout: true });
  }

  function setViewMode(mode) {
    viewMode = mode || 'overview';
    localStorage.setItem(window.CodexUI?.STORAGE?.viewMode || 'codexmap.viewMode', viewMode);
    window.CodexUI?.updateViewModeButtons(viewMode);
    lastSearch = '';
    const searchInput = document.getElementById('node-search');
    if (searchInput) searchInput.value = '';
    applyVisibility({ layout: true });
    window.CodexUI?.showToast(`${labelForMode(viewMode)} view`);
  }

  function labelForMode(mode) {
    return {
      overview: 'Overview',
      files: 'Files',
      functions: 'Functions',
      drift: 'Drift-only',
      critical: 'Critical path',
    }[mode] || 'Overview';
  }

  function nodeLabel(rawNode) {
    const raw = typeof rawNode.label === 'string' ? rawNode.label.trim() : '';
    let labelText = raw;
    if (!labelText) {
      labelText = String(rawNode.id || '')
        .split('/')
        .pop()
        .replace(/\.(js|ts|jsx|tsx|py|md|json|yml|yaml|css|html)$/i, '');
    }
    if (rawNode.type === 'directory' && !labelText.startsWith('📁')) {
      labelText = `📁 ${labelText}`;
    }
    return labelText;
  }

  function nodeType(node) {
    return node.data('type') || 'file';
  }

  function isCodeLike(node) {
    return CODE_NODE_TYPES.has(nodeType(node)) && !node.isParent();
  }

  function normalizedGrade(node) {
    return node.data('grade') || 'pending';
  }

  function hasExpandedAncestor(node) {
    let parentId = node.data('parentRef');
    while (parentId) {
      if (expandedNodes.has(parentId)) return true;
      const parent = cy.getElementById(parentId);
      parentId = parent.length ? parent.data('parentRef') : null;
    }
    return false;
  }

  function addWithAncestors(set, node) {
    set.add(node.id());
    let parentId = node.data('parentRef');
    while (parentId) {
      set.add(parentId);
      const parent = cy.getElementById(parentId);
      parentId = parent.length ? parent.data('parentRef') : null;
    }
  }

  function addWithDescendants(set, node) {
    set.add(node.id());
    childrenOf(node.id()).forEach((child) => addWithDescendants(set, child));
  }

  function childrenOf(parentId) {
    if (!cy || !parentId) return cytoscape().collection();
    return cy.nodes().filter((node) => node.data('parentRef') === parentId);
  }

  function visibleIdsForMode() {
    const ids = new Set();

    if (!cy) return ids;

    if (viewMode === 'drift') {
      cy.nodes().forEach((node) => {
        const grade = normalizedGrade(node);
        if ((grade === 'red' || grade === 'yellow') && gradeFilters.has(grade)) {
          addWithAncestors(ids, node);
        }
      });
      return ids;
    }

    if (viewMode === 'critical') {
      const redNodes = cy.nodes().filter((node) => normalizedGrade(node) === 'red');
      const seeds = redNodes.length
        ? redNodes
        : cy.nodes().filter((node) => normalizedGrade(node) === 'yellow');
      seeds.forEach((node) => {
        if (!gradeFilters.has(normalizedGrade(node))) return;
        addWithAncestors(ids, node);
        node.neighborhood('node').forEach((neighbor) => addWithAncestors(ids, neighbor));
      });
      return ids;
    }

    cy.nodes().forEach((node) => {
      const type = nodeType(node);
      const grade = normalizedGrade(node);
      if (!gradeFilters.has(grade)) return;

      if (viewMode === 'overview') {
        if (type === 'directory' || type === 'file') ids.add(node.id());
        if ((type === 'function' || type === 'logic_block') && hasExpandedAncestor(node)) ids.add(node.id());
        if (type === 'block' && expandedNodes.has(node.data('parentRef'))) ids.add(node.id());
        return;
      }

      if (viewMode === 'files') {
        if (type === 'directory' || type === 'file') ids.add(node.id());
        return;
      }

      if (viewMode === 'functions') {
        if (type !== 'block') ids.add(node.id());
        if (type === 'block' && (expandedNodes.has(node.data('parentRef')) || hasExpandedAncestor(node))) ids.add(node.id());
      }
    });

    return ids;
  }

  function applyVisibility({ layout = false } = {}) {
    if (!cy) return;
    if (lastSearch) {
      search(lastSearch, { preserveQuery: true });
      return;
    }

    const ids = visibleIdsForMode();
    cy.startBatch();
    cy.nodes().forEach((node) => {
      node.style('display', ids.has(node.id()) ? 'element' : 'none');
      node.removeClass('faded');
      applyGradeStyle(node);
    });
    cy.edges().forEach((edge) => {
      const visible = ids.has(edge.source().id()) && ids.has(edge.target().id());
      edge.style('display', visible ? 'element' : 'none');
      edge.removeClass('faded');
      updateEdgeHeat(edge);
    });
    cy.endBatch();

    updateCounts();
    updateEmptyState();
    updateSmartLabels();
    renderMinimap();

    if (layout) runLayout();
  }

  function updateSmartLabels() {
    if (!cy) return;
    const zoom = cy.zoom();
    cy.nodes().forEach((node) => {
      const type = nodeType(node);
      const shouldHide = zoom < 0.46 && (type === 'function' || type === 'logic_block' || type === 'block');
      node.style('label', shouldHide ? '' : node.data('label'));
    });
  }

  function applyGradeStyle(node) {
    if (node.isParent() && nodeType(node) === 'directory') return;
    const grade = normalizedGrade(node);
    const style = GRADE[grade] || GRADE.pending;
    node.style({
      'background-color': style.bg,
      'border-color': style.border,
      'border-width': grade === 'pending' ? 1.5 : 2.5,
      color: style.text,
      'shadow-blur': grade === 'pending' ? 0 : 16,
      'shadow-color': style.glow,
      'shadow-opacity': grade === 'pending' ? 0 : 0.75,
      'shadow-offset-x': 0,
      'shadow-offset-y': 4,
    });
  }

  function updateEdgeHeat(edge) {
    const sourceGrade = edge.source().data('grade') || 'pending';
    const targetGrade = edge.target().data('grade') || 'pending';
    edge.data({ sourceGrade, targetGrade });
    edge.toggleClass('hot', targetGrade === 'red' || (sourceGrade === 'green' && targetGrade === 'red'));
  }

  function visibleElements() {
    if (!cy) return null;
    return cy.elements().filter((element) => element.style('display') !== 'none');
  }

  function visibleCodeNodes() {
    if (!cy) return null;
    const nodes = cy.nodes().filter((node) => node.style('display') !== 'none' && isCodeLike(node));
    return nodes.length ? nodes : cy.nodes().filter((node) => node.style('display') !== 'none');
  }

  function runLayout({ force = false } = {}) {
    if (!cy) return;
    const nodes = visibleCodeNodes();
    if (!nodes || !nodes.length) return;
    
    // Always use organic force-directed layout for a premium knowledge-graph whiteboard feel
    const layoutName = (typeof fcose !== 'undefined' ? 'fcose' : 'cose');

    cy.layout({
      name: layoutName,
      animate: true,
      animationDuration: 520,
      fit: false,
      padding: 70,
      nodeDimensionsIncludeLabels: true,
      packComponents: true,
      nodeSeparation: 85,
      idealEdgeLength: 180,
      nodeRepulsion: 3200,
      gravity: 0.45,
      randomize: false,
    }).run();
  }

  function applyGridLayout(nodes) {
    const count = nodes.length;
    const cols = count > 80 ? 8 : count > 52 ? 7 : Math.max(4, Math.ceil(Math.sqrt(count * 1.15)));
    const xGap = viewMode === 'overview' ? 218 : 208;
    const yGap = viewMode === 'overview' ? 94 : 90;

    cy.startBatch();
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      node.position({ x: col * xGap, y: row * yGap });
    });
    cy.endBatch();
    fitVisible(36, false);
    renderMinimap();
  }

  function fitVisible(padding = 42, animate = true) {
    if (!cy) return;
    const nodes = visibleCodeNodes();
    if (!nodes || !nodes.length) return;
    if (animate) {
      cy.animate({ fit: { eles: nodes, padding } }, { duration: 260 });
    } else {
      cy.fit(nodes, padding);
    }
    if (cy.zoom() < 0.42) {
      cy.zoom({
        level: 0.42,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
      cy.center(nodes);
    }
    updateZoomLabel();
  }

  function fitDrifted() {
    if (!cy) return;
    const drifted = cy.nodes().filter((node) => {
      const grade = normalizedGrade(node);
      return node.style('display') !== 'none' && (grade === 'red' || grade === 'yellow');
    });
    if (drifted.length) {
      cy.animate({ fit: { eles: drifted, padding: 70 } }, { duration: 260 });
      window.CodexUI?.showToast(`Focused ${drifted.length} drifted nodes`);
    } else {
      window.CodexUI?.showToast('No visible drifted nodes');
    }
  }

  function zoomBy(multiplier) {
    if (!cy) return;
    cy.zoom({
      level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * multiplier)),
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
    updateZoomLabel();
  }

  function updateZoomLabel() {
    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl && cy) zoomEl.textContent = `${Math.round(cy.zoom() * 100)}%`;
  }

  function search(rawQuery, options = {}) {
    if (!cy) return;
    const query = String(rawQuery || '').trim().toLowerCase();
    if (!options.preserveQuery) lastSearch = query;

    if (!query) {
      lastSearch = '';
      applyVisibility({ layout: false });
      return;
    }

    const visible = new Set();
    const matched = cy.nodes().filter((node) => {
      const data = node.data();
      return [data.label, data.id, data.path, data.summary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    matched.forEach((node) => {
      addWithAncestors(visible, node);
      addWithDescendants(visible, node);
    });

    cy.startBatch();
    cy.nodes().forEach((node) => {
      const show = visible.has(node.id());
      node.style('display', show ? 'element' : 'none');
      node.toggleClass('faded', !matched.contains(node) && show);
    });
    cy.edges().forEach((edge) => {
      const show = visible.has(edge.source().id()) && visible.has(edge.target().id());
      edge.style('display', show ? 'element' : 'none');
      edge.toggleClass('faded', !matched.contains(edge.source()) && !matched.contains(edge.target()));
    });
    cy.endBatch();

    if (matched.length) {
      cy.animate({ fit: { eles: matched, padding: 86 } }, { duration: 220 });
    }
    updateCounts();
    renderMinimap();
  }

  function updateCounts() {
    if (!cy) return;
    const counts = { green: 0, yellow: 0, red: 0, pending: 0 };
    let visibleCount = 0;

    cy.nodes().forEach((node) => {
      if (nodeType(node) === 'block') return;
      const grade = normalizedGrade(node);
      counts[grade] = (counts[grade] || 0) + 1;
      if (node.style('display') !== 'none' && !node.isParent()) visibleCount++;
    });

    Object.entries(counts).forEach(([grade, count]) => {
      const el = document.getElementById(`count-${grade}`);
      if (el) el.textContent = count;
    });

    const visibleEl = document.getElementById('visible-node-count');
    if (visibleEl) visibleEl.textContent = visibleCount;


    const totalEl = document.getElementById('node-count');
    if (totalEl) totalEl.textContent = `${cy.nodes().length} nodes`;
  }

  function updateEmptyState() {
    const empty = document.getElementById('canvas-empty-state');
    if (!empty || !cy) return;
    empty.hidden = cy.nodes().length > 0;
  }

  function renderMinimap() {
    const container = document.getElementById('minimap-content');
    if (!container || !cy) return;

    const nodes = cy.nodes().filter((node) => node.style('display') !== 'none' && isCodeLike(node));
    if (!nodes.length) {
      container.innerHTML = '';
      return;
    }

    const positions = nodes.map((node) => node.position());
    const minX = Math.min(...positions.map((p) => p.x));
    const maxX = Math.max(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxY = Math.max(...positions.map((p) => p.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    container.innerHTML = '';
    nodes.forEach((node) => {
      const pos = node.position();
      const dot = document.createElement('span');
      dot.className = 'minimap-dot';
      dot.style.left = `${((pos.x - minX) / width) * 100}%`;
      dot.style.top = `${((pos.y - minY) / height) * 100}%`;
      dot.style.background = getGradeColor(normalizedGrade(node));
      container.appendChild(dot);
    });
  }

  function showTooltip(node, eventOrPosition) {
    if (!tooltip) return;
    const data = node.data();
    const grade = normalizedGrade(node);
    const score = data.S_final ?? data.score;
    const childCount = node.children().length;
    const expandHint = childCount ? `<div class="tooltip-hint">Click to ${expandedNodes.has(node.id()) ? 'collapse' : 'expand'} ${childCount} children</div>` : '';

    tooltip.innerHTML = `
      <div class="tooltip-title">${escapeHtml(data.label || node.id())}</div>
      <div class="tooltip-meta">${escapeHtml(data.type || 'node')} · ${escapeHtml(data.path || data.id || '')}</div>
      <div class="tooltip-grade">
        <div class="grade-dot" style="background: ${getGradeColor(grade)}"></div>
        ${grade.toUpperCase()} · ${score != null ? Math.round(Number(score) * 100) + '%' : '--'}
      </div>
      ${expandHint}
    `;

    const x = eventOrPosition?.clientX ?? eventOrPosition?.x ?? 24;
    const y = eventOrPosition?.clientY ?? eventOrPosition?.y ?? 24;
    tooltip.style.left = `${x + 14}px`;
    tooltip.style.top = `${y + 14}px`;
    tooltip.classList.add('visible');
  }

  function hideTooltip() {
    tooltip?.classList.remove('visible');
  }

  function getGradeColor(grade) {
    return (GRADE[grade] || GRADE.pending).border;
  }

  function updateGrade(nodeId, grade, score, payload = {}) {
    if (!cy) return;
    const node = cy.getElementById(nodeId);
    if (!node.length) return;

    node.data({
      ...node.data(),
      ...payload,
      grade,
      score,
      S_final: payload.S_final ?? score,
    });
    applyGradeStyle(node);
    node.connectedEdges().forEach(updateEdgeHeat);
    applyVisibility({ layout: false });
    window.dispatchEvent(new CustomEvent('node-data-updated', { detail: node.data() }));
  }

  function injectDirectoryNodes(nodesList, existingNodesList = []) {
    const allNodes = [...nodesList, ...existingNodesList];
    const fileNodes = allNodes.filter(n => n.type === 'file' || !n.type);
    
    const directoryIds = new Set();
    for (const fileNode of fileNodes) {
      const parts = (fileNode.path || fileNode.id || '').split('/');
      if (parts.length > 1) {
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          directoryIds.add(current);
        }
      }
    }
    
    const existingDirs = new Set(allNodes.filter(n => n.type === 'directory').map(n => n.id));
    const dirNodes = [];
    
    for (const dirId of directoryIds) {
      if (!existingDirs.has(dirId)) {
        const parts = dirId.split('/');
        const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;
        dirNodes.push({
          id: dirId,
          label: parts[parts.length - 1],
          type: 'directory',
          path: dirId,
          parent: parent,
          parentRef: parent,
          grade: 'pending',
          score: null
        });
      }
    }
    
    // Set parent field for incoming file nodes
    const mappedNodes = nodesList.map(node => {
      if (node.type === 'file' || !node.type) {
        const parts = (node.path || node.id || '').split('/');
        if (parts.length > 1) {
          const parentId = parts.slice(0, -1).join('/');
          return {
            ...node,
            parent: parentId,
            parentRef: parentId
          };
        }
      }
      return node;
    });
    
    return [...dirNodes, ...mappedNodes];
  }

  function normalizeNode(rawNode, knownIds, localNodes) {
    const parentVal = rawNode.parent || rawNode.parentRef;
    let parentCandidate = rawNode.path ? rawNode.path.split('/').slice(0, -1).join('/') : undefined;
    const hasParentCandidate = parentCandidate && (knownIds.has(parentCandidate) || localNodes?.some((node) => node.id === parentCandidate));
    
    const finalParent = parentVal || (hasParentCandidate ? parentCandidate : undefined);
    
    return {
      ...rawNode,
      label: nodeLabel(rawNode),
      grade: rawNode.grade || 'pending',
      parentRef: finalParent,
      parent: finalParent,
    };
  }

  function applyDiff(diff) {
    if (!cy || !diff) return;
    const normalizedDiff = Array.isArray(diff)
      ? {
          nodes: diff.filter((item) => item && item.id && !(item.source && item.target)),
          edges: diff.filter((item) => item && item.source && item.target),
        }
      : diff;
      
    const existingNodes = cy.nodes().map(n => n.data());
    const nodes = injectDirectoryNodes(Array.isArray(normalizedDiff.nodes) ? normalizedDiff.nodes : [], existingNodes);
    const edges = Array.isArray(normalizedDiff.edges) ? normalizedDiff.edges : [];

    cy.startBatch();
    const knownIds = new Set(cy.nodes().map((node) => node.id()));
    
    // Include directories in knownIds
    nodes.forEach(n => knownIds.add(n.id));

    const sortedNodes = [...nodes].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return 0;
    });

    let hasNewNode = false;
    sortedNodes.forEach((rawNode) => {
      const data = normalizeNode(rawNode, knownIds, sortedNodes);
      const existing = cy.getElementById(data.id);
      if (existing.length) existing.data({ ...existing.data(), ...data });
      else {
        cy.add({ group: 'nodes', data });
        hasNewNode = true;
      }
      knownIds.add(data.id);
    });

    let hasNewEdge = false;
    edges.forEach((edge) => {
      if (!knownIds.has(edge.source) || !knownIds.has(edge.target)) return;
      const id = edge.id || `${edge.source}__${edge.target}`;
      const existing = cy.getElementById(id);
      if (existing.length) existing.data({ ...existing.data(), ...edge, id });
      else {
        cy.add({ group: 'edges', data: { ...edge, id } });
        hasNewEdge = true;
      }
    });
    cy.endBatch();

    applyVisibility({ layout: hasNewNode || hasNewEdge });
    window.dispatchEvent(new CustomEvent('codexmap:graph-hydrated', {
      detail: { nodeCount: cy.nodes().length },
    }));
  }

  function update(state) {
    if (!state || !Array.isArray(state.nodes)) return;
    if (!cy) {
      pendingState = state;
      return;
    }

    const processedNodes = injectDirectoryNodes(state.nodes);
    const nodeIds = new Set(processedNodes.map((node) => node.id));
    const sortedNodes = [...processedNodes].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return 0;
    });

    cy.startBatch();
    cy.elements().remove();
    cy.add(sortedNodes.map((rawNode) => ({
      group: 'nodes',
      data: normalizeNode(rawNode, nodeIds, sortedNodes),
    })));
    cy.add((state.edges || [])
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({
        group: 'edges',
        data: { ...edge, id: edge.id || `${edge.source}__${edge.target}` },
      })));
    cy.endBatch();

    applyVisibility({ layout: true });
    window.dispatchEvent(new CustomEvent('codexmap:graph-hydrated', {
      detail: { nodeCount: state.nodes.length },
    }));
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function focusNodes(nodeIds) {
    if (!cy || !nodeIds || !nodeIds.length) return;
    const targets = cy.nodes().filter(node => nodeIds.includes(node.id()));
    if (targets.length) {
      cy.animate({ fit: { eles: targets, padding: 86 } }, { duration: 260 });
      cy.elements().removeClass('selected');
      targets.addClass('selected');
    }
  }

  function getIncidentTargets() {
    if (!cy) return [];
    const files = new Map();
    cy.nodes().forEach(node => {
      if (node.data('type') === 'directory' || node.data('syntheticRoot') || node.isParent()) return;
      
      const grade = node.data('grade') || 'pending';
      const score = node.data('score') ?? node.data('S_final') ?? 1.0;
      
      const isRed = grade === 'red' || score < 0.40;
      const isCriticalYellow = grade === 'yellow' && score < 0.45;
      
      if (isRed || isCriticalYellow) {
        let owningFile = node;
        let parentRef = node.data('parentRef') || node.data('parent');
        while (parentRef && parentRef !== '__codexmap_root__') {
          const parent = cy.getElementById(parentRef);
          if (parent.length && parent.data('type') === 'file') {
            owningFile = parent;
            break;
          }
          parentRef = parent.length ? (parent.data('parentRef') || parent.data('parent')) : null;
        }
        
        const fileId = owningFile.id();
        if (!files.has(fileId)) {
          files.set(fileId, {
            targetId: fileId,
            label: owningFile.data('label') || fileId.split('/').pop(),
            path: owningFile.data('path') || fileId,
            worstScore: score,
            redCount: 0,
            criticalYellowCount: 0,
            issueCount: 0,
            repairStatus: owningFile.data('repairStatus') || null
          });
        }
        
        const fileGroup = files.get(fileId);
        if (score < fileGroup.worstScore) {
          fileGroup.worstScore = score;
        }
        if (isRed) {
          fileGroup.redCount++;
        } else {
          fileGroup.criticalYellowCount++;
        }
        fileGroup.issueCount++;
      }
    });
    
    return Array.from(files.values());
  }

  function getRepairTargetForNode(nodeId) {
    if (!cy) return nodeId;
    const node = cy.getElementById(nodeId);
    if (!node.length) return nodeId;
    
    const type = node.data('type');
    if (type === 'function' || type === 'block' || type === 'logic_block') {
      const path = node.data('path');
      if (path) return path;
    }
    
    let parentRef = node.data('parentRef') || node.data('parent');
    while (parentRef && parentRef !== '__codexmap_root__') {
      const parent = cy.getElementById(parentRef);
      if (parent.length && parent.data('type') === 'file') {
        return parent.id();
      }
      parentRef = parent.length ? (parent.data('parentRef') || parent.data('parent')) : null;
    }
    return nodeId;
  }

  function getRiskyRepairTargetsForNode(nodeId) {
    return [getRepairTargetForNode(nodeId)];
  }

  function isRepairEligibleData(nodeData) {
    const grade = nodeData.grade || 'pending';
    const score = nodeData.S_final ?? nodeData.score ?? 1.0;
    return grade === 'red' || (grade === 'yellow' && score < 0.45);
  }

  function markRepairState(nodeId, status, payload = {}) {
    if (!cy) return;
    const node = cy.getElementById(nodeId);
    if (!node.length) return;
    
    node.data('repairStatus', status);
    if (payload.error) {
      node.data('repairError', payload.error);
    }
    
    if (status === 'queued' || status === 'healing' || status === 'pending') {
      node.style({
        'border-style': 'dashed',
        'border-color': '#d4850a',
        'border-width': 3
      });
    } else if (status === 'failed') {
      node.style({
        'border-style': 'double',
        'border-color': '#ef4444',
        'border-width': 3
      });
    } else {
      applyGradeStyle(node);
    }
  }

  function applyRepairQueue(queueData) {
    if (!cy || !queueData || !Array.isArray(queueData.queue)) return;
    queueData.queue.forEach(entry => {
      if (entry && entry.nodeId) {
        markRepairState(entry.nodeId, entry.status, entry);
      }
    });
  }

  return {
    init,
    update,
    applyDiff,
    updateGrade,
    setViewMode,
    search,
    fitVisible,
    fitDrifted,
    focusNodes,
    getIncidentTargets,
    getRiskyRepairTargetsForNode,
    getRepairTargetForNode,
    isRepairEligibleData,
    markRepairState,
    applyRepairQueue,
    getCy: () => cy,
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  window.CodexGraph.init();
});
