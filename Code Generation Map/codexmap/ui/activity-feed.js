/**
 * ui/activity-feed.js — Agent Activity Feed implementation
 * Manages the scrolling log of agent events in the sidebar.
 */
window.ActivityFeed = (function() {
  const MAX_ENTRIES = 12;
  const colors = {
    'cartographer': '#5B76FE',
    'broadcaster': '#A5A8B5',
    'sentinel': '#00B473',
    'generator': '#746019',
    'error': '#600000',
    'info': '#5B76FE'
  };

  function addEntry(payload) {
    const container = document.getElementById('agent-logs-container');
    if (!container) return;

    // Remove empty placeholder if it exists
    const placeholder = container.querySelector('.feed-empty');
    if (placeholder) placeholder.remove();

    const entry = document.createElement('div');
    entry.className = 'feed-entry noto';
    
    const agent = (payload.agent || 'system').toLowerCase();
    const action = payload.action || payload.msg || payload.message || payload.log || 'Processing...';
    const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
    const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const dotColor = colors[agent] || colors['info'];

    entry.innerHTML = `
      <div class="feed-dot" style="background-color: ${dotColor}"></div>
      <div class="feed-content">
        <div class="feed-header">
          <span class="feed-agent" style="color: ${dotColor}">${agent.toUpperCase()}</span>
          <span class="feed-time">${timeStr}</span>
        </div>
        <div class="feed-msg ${agent === 'error' ? 'text-red-400' : ''}">${action}</div>
      </div>
    `;

    container.insertBefore(entry, container.firstChild);

    // Keep only last N entries
    while (container.children.length > MAX_ENTRIES) {
      container.removeChild(container.lastChild);
    }
  }

  function clear() {
    const container = document.getElementById('agent-logs-container');
    if (container) container.innerHTML = '';
  }

  return {
    addEntry,
    clear
  };
})();
