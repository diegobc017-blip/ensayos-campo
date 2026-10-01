export function renderTabs(container, tabs, activeKey, onSelect) {
  container.innerHTML = '';
  container.hidden = false;
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (tab.key === activeKey ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => onSelect(tab.key));
    container.appendChild(btn);
  }
}

export function ocultarTabs(container) {
  container.hidden = true;
  container.innerHTML = '';
}
