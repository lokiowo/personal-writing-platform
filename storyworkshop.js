/* ============================================================
   故事工坊 — Story Workshop Module
   运行于 script.js 之后，依赖其全局工具函数
   ============================================================ */

// ==============================
//  数据与状态
// ==============================
var swData = loadData('pw_story_data', { projects: [] });
var swLayout = loadData('pw_story_layout', {});
var swCurrentProjectId = null;
var swCurrentTab = 'inspiration';

// Mind map state
var mmSelectedNodeId = null;
var mmPanX = 0, mmPanY = 0, mmScale = 1;
var mmDraggingNode = null, mmDragStartX = 0, mmDragStartY = 0;
var mmPanning = false;
var mmNodeMoved = false;

// Outline state
var olSelectedId = null;
var olExpanded = {};

// Plot card state
var pcSelectedId = null;

// Character state
var chSelectedId = null;
var chEditedRelId = null;

// Timeline state
var tlSelectedId = null;

// ==============================
//  工具函数
// ==============================
function swSaveData() {
  saveData('pw_story_data', swData);
}

function swSaveLayout() {
  saveData('pw_story_layout', swLayout);
}

function swGetProject() {
  if (!swCurrentProjectId) return null;
  for (var i = 0; i < swData.projects.length; i++) {
    if (swData.projects[i].id === swCurrentProjectId) return swData.projects[i];
  }
  return null;
}

function swGetProjectList() {
  return swData.projects.map(function(p) {
    return { id: p.id, name: p.name, status: p.status };
  });
}

function swCreateProject(name, description) {
  var now = new Date().toISOString();
  var project = {
    id: uid(),
    name: name || '未命名作品',
    description: description || '',
    status: '构思中',
    createdAt: now,
    updatedAt: now,
    inspirations: [],
    mindmapNodes: [],
    outlineNodes: [],
    plotCards: [],
    characters: [],
    relations: [],
    timelineEvents: []
  };
  swData.projects.push(project);
  swSaveData();
  return project;
}

function swEditProject(id, updates) {
  var proj = null;
  for (var i = 0; i < swData.projects.length; i++) {
    if (swData.projects[i].id === id) { proj = swData.projects[i]; break; }
  }
  if (!proj) return;
  if (updates.name !== undefined) proj.name = updates.name;
  if (updates.description !== undefined) proj.description = updates.description;
  if (updates.status !== undefined) proj.status = updates.status;
  proj.updatedAt = new Date().toISOString();
  swSaveData();
}

function swDeleteProject(id) {
  confirmDialog('确定要删除此作品吗？作品内所有灵感、导图、大纲、情节、人物和时间线数据都将被删除，此操作不可恢复。').then(function(ok) {
    if (!ok) return;
    swData.projects = swData.projects.filter(function(p) { return p.id !== id; });
    if (swCurrentProjectId === id) swCurrentProjectId = null;
    swSaveData();
    swRenderProjectSelect();
    swOnViewEnter();
    showToast('作品已删除');
  });
}

// ==============================
//  项目管理 UI
// ==============================
function swRenderProjectSelect() {
  var sel = document.getElementById('swProjectSelect');
  if (!sel) return;
  // 先清空再重建
  while (sel.options.length > 0) { sel.remove(0); }
  var opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '请选择或创建作品...';
  sel.appendChild(opt0);
  for (var i = 0; i < swData.projects.length; i++) {
    var p = swData.projects[i];
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + ' (' + p.status + ')';
    if (p.id === swCurrentProjectId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function swOnProjectSelect() {
  var sel = document.getElementById('swProjectSelect');
  swCurrentProjectId = sel.value || null;
  swOnViewEnter();
}

function swRefreshAllPanels() {
  if (swCurrentTab === 'inspiration') swRenderInspirations();
  else if (swCurrentTab === 'mindmap') swRenderMindmap();
  else if (swCurrentTab === 'outline') swRenderOutline();
  else if (swCurrentTab === 'plotcards') swRenderPlotCards();
  else if (swCurrentTab === 'characters') swRenderCharacters();
  else if (swCurrentTab === 'timeline') swRenderTimeline();
}

// ==============================
//  子标签切换
// ==============================
function swSwitchTab(tabName) {
  swCurrentTab = tabName;
  // Update tab active states
  var tabs = document.querySelectorAll('.sw-tab');
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    if (t.getAttribute('data-swt') === tabName) t.classList.add('active');
    else t.classList.remove('active');
  }
  // Show the correct panel
  var panels = document.querySelectorAll('.sw-panel');
  for (var j = 0; j < panels.length; j++) {
    var p = panels[j];
    if (p.id === 'swp-' + tabName) p.classList.add('active');
    else p.classList.remove('active');
  }
  swRefreshAllPanels();
}

// ==============================
//  灵感面板
// ==============================
function swRenderInspirations() {
  var proj = swGetProject();
  var listEl = document.getElementById('inspList');
  var emptyEl = document.getElementById('inspEmpty');
  if (!proj) { listEl.innerHTML = ''; emptyEl.style.display = 'block'; return; }

  var search = (document.getElementById('inspSearch').value || '').toLowerCase();
  var filterType = document.getElementById('inspFilterType').value;
  var filterStatus = document.getElementById('inspFilterStatus').value;

  var items = proj.inspirations.slice();
  if (search) {
    items = items.filter(function(i) {
      return (i.title && i.title.toLowerCase().indexOf(search) !== -1) ||
             (i.content && i.content.toLowerCase().indexOf(search) !== -1);
    });
  }
  if (filterType) items = items.filter(function(i) { return i.type === filterType; });
  if (filterStatus) items = items.filter(function(i) { return i.status === filterStatus; });

  // Sort by updatedAt desc
  items.sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });

  if (items.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  var typeLabels = { idea: '想法', dialogue: '对话', plot: '情节设想', question: '人物问题', world: '世界观', other: '其他' };
  var statusLabels = { pending: '待整理', adopted: '已采用', alternative: '备选方案', discarded: '已舍弃' };
  var statusColors = { pending: '#c9b99a', adopted: '#7d9b76', alternative: '#7b9ec7', discarded: '#c7a0a0' };

  var html = '';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var color = statusColors[item.status] || '#c9b99a';
    var tags = (item.tags || []).map(function(t) { return '<span class="insp-tag">' + escapeHtml(t) + '</span>'; }).join('');

    html += '<div class="insp-card" data-id="' + item.id + '">';
    html += '<div class="insp-card-header">';
    html += '<span class="insp-type-badge">' + (typeLabels[item.type] || item.type) + '</span>';
    html += '<span class="insp-status-badge" style="background:' + color + '">' + (statusLabels[item.status] || item.status) + '</span>';
    html += '</div>';
    html += '<div class="insp-card-title">' + escapeHtml(item.title || '无标题') + '</div>';
    html += '<div class="insp-card-content">' + escapeHtml((item.content || '').substring(0, 200)) + '</div>';
    if (tags) html += '<div class="insp-card-tags">' + tags + '</div>';
    if (item.linkedPlotId) html += '<div class="insp-card-link">已关联情节</div>';
    if (item.linkedOutlineId) html += '<div class="insp-card-link">已关联大纲</div>';
    html += '<div class="insp-card-actions">';
    html += '<button class="btn btn-sm btn-outline insp-btn-conv-plot" data-id="' + item.id + '">转情节</button>';
    html += '<button class="btn btn-sm btn-outline insp-btn-conv-outline" data-id="' + item.id + '">转大纲</button>';
    html += '<button class="btn btn-sm btn-outline insp-btn-conv-mm" data-id="' + item.id + '">转导图</button>';
    html += '<button class="btn btn-sm btn-outline insp-btn-link-plot" data-id="' + item.id + '">关联情节</button>';
    html += '<button class="btn btn-sm btn-outline insp-btn-edit" data-id="' + item.id + '">编辑</button>';
    html += '<button class="btn btn-sm btn-danger insp-btn-delete" data-id="' + item.id + '">删除</button>';
    html += '</div></div>';
  }
  listEl.innerHTML = html;

  // Bind events
  var cards = listEl.querySelectorAll('.insp-btn-edit');
  for (var k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function() { swEditInspiration(this.getAttribute('data-id')); });
  }
  cards = listEl.querySelectorAll('.insp-btn-delete');
  for (k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function() { swDeleteInspiration(this.getAttribute('data-id')); });
  }
  cards = listEl.querySelectorAll('.insp-btn-conv-plot');
  for (k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function() { swConvertInspToPlot(this.getAttribute('data-id')); });
  }
  cards = listEl.querySelectorAll('.insp-btn-conv-outline');
  for (k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function() { swConvertInspToOutline(this.getAttribute('data-id')); });
  }
  cards = listEl.querySelectorAll('.insp-btn-conv-mm');
  for (k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function() { swConvertInspToMindmap(this.getAttribute('data-id')); });
  }
  cards = listEl.querySelectorAll('.insp-btn-link-plot');
  for (k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function() { swLinkInspToPlot(this.getAttribute('data-id')); });
  }
}

function swQuickAddInspiration() {
  var proj = swGetProject();
  if (!proj) { showToast('请先选择作品'); return; }
  var input = document.getElementById('inspQuickInput');
  var content = (input.value || '').trim();
  if (!content) { showToast('请输入灵感内容'); return; }
  var type = document.getElementById('inspQuickType').value;
  var tagsStr = (document.getElementById('inspQuickTags').value || '').trim();
  var tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];
  var now = new Date().toISOString();
  var item = {
    id: uid(), title: '', content: content, type: type, tags: tags,
    status: 'pending', linkedPlotId: null, linkedOutlineId: null, createdAt: now, updatedAt: now
  };
  proj.inspirations.push(item);
  swSaveData();
  input.value = '';
  document.getElementById('inspQuickTags').value = '';
  swRenderInspirations();
  showToast('灵感已保存');
}

function swEditInspiration(id) {
  var proj = swGetProject();
  if (!proj) return;
  var item = null;
  for (var i = 0; i < proj.inspirations.length; i++) {
    if (proj.inspirations[i].id === id) { item = proj.inspirations[i]; break; }
  }
  if (!item) return;

  // Build a simple in-place edit overlay on the card
  var row = document.querySelector('.insp-card[data-id="' + id + '"]');
  if (!row) return;

  var title = prompt('编辑灵感标题：', item.title || '');
  if (title === null) return;
  var status = prompt('状态 (pending/adopted/alternative/discarded)：', item.status);
  if (status === null) return;
  var type = prompt('类型 (idea/dialogue/plot/question/world/other)：', item.type);
  if (type === null) return;

  item.title = title;
  if (status) item.status = status;
  if (type) item.type = type;
  item.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderInspirations();
  showToast('灵感已更新');
}

function swDeleteInspiration(id) {
  var proj = swGetProject();
  if (!proj) return;
  var item = null;
  for (var i = 0; i < proj.inspirations.length; i++) {
    if (proj.inspirations[i].id === id) { item = proj.inspirations[i]; break; }
  }
  if (!item) return;
  confirmDialog('确定删除灵感「' + (item.title || item.content.substring(0, 20)) + '」吗？').then(function(ok) {
    if (!ok) return;
    proj.inspirations = proj.inspirations.filter(function(x) { return x.id !== id; });
    swSaveData();
    swRenderInspirations();
    showToast('灵感已删除');
  });
}

function swConvertInspToPlot(inspId) {
  var proj = swGetProject();
  if (!proj) return;
  var item = null;
  for (var i = 0; i < proj.inspirations.length; i++) {
    if (proj.inspirations[i].id === inspId) { item = proj.inspirations[i]; break; }
  }
  if (!item) return;
  // Pick target project
  var targetProj = promptTargetProject(proj);
  if (!targetProj) return;
  var now = new Date().toISOString();
  var card = {
    id: uid(), title: item.title || item.content.substring(0, 30), summary: item.content,
    status: 'draft', tags: (item.tags || []).slice(), linkedCharacters: [], group: '',
    order: 0, cause: '', action: '', result: '', aftermath: '', unresolved: '',
    foreshadowing: '', issues: [], linkedOutlineId: null, createdAt: now, updatedAt: now
  };
  targetProj.plotCards.push(card);
  swSaveData();
  showToast('已转为情节卡片' + (targetProj.id !== proj.id ? ' (目标作品: ' + targetProj.name + ')' : ''));
  if (targetProj.id === proj.id) { swSwitchTab('plotcards'); }
}

function swConvertInspToOutline(inspId) {
  var proj = swGetProject();
  if (!proj) return;
  var item = null;
  for (var i = 0; i < proj.inspirations.length; i++) {
    if (proj.inspirations[i].id === inspId) { item = proj.inspirations[i]; break; }
  }
  if (!item) return;
  var targetProj = promptTargetProject(proj);
  if (!targetProj) return;
  var now = new Date().toISOString();
  var node = {
    id: uid(), title: item.title || item.content.substring(0, 30), summary: item.content,
    detail: '', type: 'scene', status: 'pending', tags: (item.tags || []).slice(),
    parentId: null, order: targetProj.outlineNodes.length, linkedCharacters: [],
    linkedEvents: [], linkedArticleId: null, linkedPlots: [], createdAt: now, updatedAt: now
  };
  targetProj.outlineNodes.push(node);
  swSaveData();
  showToast('已转为大纲节点' + (targetProj.id !== proj.id ? ' (目标作品: ' + targetProj.name + ')' : ''));
  if (targetProj.id === proj.id) { swSwitchTab('outline'); }
}

function swConvertInspToMindmap(inspId) {
  var proj = swGetProject();
  if (!proj) return;
  var item = null;
  for (var i = 0; i < proj.inspirations.length; i++) {
    if (proj.inspirations[i].id === inspId) { item = proj.inspirations[i]; break; }
  }
  if (!item) return;
  var targetProj = promptTargetProject(proj);
  if (!targetProj) return;
  var now = new Date().toISOString();
  var node = {
    id: uid(), title: item.title || item.content.substring(0, 30), content: item.content,
    tags: (item.tags || []).slice(), status: 'idea', children: [], parentId: null,
    collapsed: false, createdAt: now, updatedAt: now
  };
  targetProj.mindmapNodes.push(node);
  swSaveData();
  showToast('已转为导图节点' + (targetProj.id !== proj.id ? ' (目标作品: ' + targetProj.name + ')' : ''));
  if (targetProj.id === proj.id) { swSwitchTab('mindmap'); }
}

function swLinkInspToPlot(inspId) {
  var proj = swGetProject();
  if (!proj) return;
  var item = null;
  for (var i = 0; i < proj.inspirations.length; i++) {
    if (proj.inspirations[i].id === inspId) { item = proj.inspirations[i]; break; }
  }
  if (!item) return;
  if (proj.plotCards.length === 0) { showToast('还没有情节卡片，请先创建'); return; }
  var msg = '选择要关联的情节卡片：\n';
  for (var j = 0; j < proj.plotCards.length; j++) {
    msg += (j + 1) + '. ' + proj.plotCards[j].title + '\n';
  }
  var choice = prompt(msg + '\n输入序号：', '');
  if (!choice) return;
  var idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= proj.plotCards.length) { showToast('无效选择'); return; }
  item.linkedPlotId = proj.plotCards[idx].id;
  item.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderInspirations();
  showToast('已关联到情节：' + proj.plotCards[idx].title);
}

function promptTargetProject(currentProj) {
  if (swData.projects.length <= 1) return currentProj;
  var msg = '选择目标作品：\n';
  for (var i = 0; i < swData.projects.length; i++) {
    msg += (i + 1) + '. ' + swData.projects[i].name + (swData.projects[i].id === currentProj.id ? ' (当前)' : '') + '\n';
  }
  var choice = prompt(msg + '\n输入序号（留空=当前作品）：', '');
  if (!choice) return currentProj;
  var idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= swData.projects.length) return currentProj;
  return swData.projects[idx];
}

// ==============================
//  思维导图面板
// ==============================

function mmGetNodeTree() {
  var proj = swGetProject();
  if (!proj) return [];
  return proj.mindmapNodes.filter(function(n) { return !n.parentId; });
}

function mmFindNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      var found = mmFindNode(node.children[i], id);
      if (found) return found;
    }
  }
  return null;
}

function mmCountLeaves(node) {
  if (!node || !node.children || node.children.length === 0) return 1;
  var count = 0;
  for (var i = 0; i < node.children.length; i++) {
    count += mmCountLeaves(node.children[i]);
  }
  return count;
}

function mmNodeColor(status) {
  var colors = { idea: '#fff8e1', alternative: '#e3f2fd', adopted: '#e8f5e9', discarded: '#fce4ec' };
  return colors[status] || '#fff8e1';
}

function mmNodeStrokeColor(status) {
  var colors = { idea: '#c9b99a', alternative: '#7b9ec7', adopted: '#7d9b76', discarded: '#c7a0a0' };
  return colors[status] || '#c9b99a';
}

// Build a tree from flat nodes
function mmBuildTree(nodes) {
  var map = {};
  var roots = [];
  for (var i = 0; i < nodes.length; i++) {
    map[nodes[i].id] = nodes[i];
    nodes[i].children = nodes[i].children || [];
  }
  for (i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.parentId && map[n.parentId]) {
      map[n.parentId].children = map[n.parentId].children || [];
      if (map[n.parentId].children.indexOf(n) === -1) {
        map[n.parentId].children.push(n);
      }
    } else if (!n.parentId) {
      roots.push(n);
    }
  }
  return roots;
}

function swRenderMindmap() {
  var proj = swGetProject();
  var svg = document.getElementById('mmSvg');
  var info = document.getElementById('mmNodeInfo');
  var editPanel = document.getElementById('mmEditPanel');
  var btnAddChild = document.getElementById('mmBtnAddChild');
  var btnEdit = document.getElementById('mmBtnEditNode');
  var btnDelete = document.getElementById('mmBtnDeleteNode');

  if (!proj || proj.mindmapNodes.length === 0) {
    svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#a099a8" font-size="14">暂无导图节点，点击上方添加中心节点</text>';
    if (info) info.style.display = 'none';
    if (editPanel) editPanel.classList.add('hidden');
    if (btnAddChild) btnAddChild.disabled = true;
    if (btnEdit) btnEdit.disabled = true;
    if (btnDelete) btnDelete.disabled = true;
    return;
  }

  svg.innerHTML = '';
  mmDraw();

  if (mmSelectedNodeId) {
    var proj2 = swGetProject();
    var selNode = null;
    for (var i = 0; i < proj2.mindmapNodes.length; i++) {
      if (proj2.mindmapNodes[i].id === mmSelectedNodeId) { selNode = proj2.mindmapNodes[i]; break; }
    }
    if (selNode) {
      if (info) { info.style.display = 'inline'; info.textContent = '已选: ' + selNode.title; }
      if (btnAddChild) btnAddChild.disabled = false;
      if (btnEdit) btnEdit.disabled = false;
      if (btnDelete) btnDelete.disabled = false;
    } else {
      if (info) info.style.display = 'none';
      if (btnAddChild) btnAddChild.disabled = true;
      if (btnEdit) btnEdit.disabled = true;
      if (btnDelete) btnDelete.disabled = true;
    }
  }

  // Bind SVG events
  bindSvgEvents();
}

function bindSvgEvents() {
  var svg = document.getElementById('mmSvg');
  if (!svg) return;

  svg.onmousedown = function(e) {
    e.preventDefault();
    var rect = svg.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    // Check if clicking on a node
    var target = e.target;
    var nodeGroup = target.closest ? target.closest('[data-mm-id]') : null;
    if (nodeGroup) {
      mmDragStartX = e.clientX;
      mmDragStartY = e.clientY;
      mmDraggingNode = nodeGroup.getAttribute('data-mm-id');
      mmPanning = false;
      mmNodeMoved = false;
      return;
    }

    // Panning
    mmPanning = true;
    mmDragStartX = e.clientX;
    mmDragStartY = e.clientY;
  };

  svg.onmousemove = function(e) {
    if (mmDraggingNode) {
      var dx = e.clientX - mmDragStartX;
      var dy = e.clientY - mmDragStartY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      mmNodeMoved = true;
      var layout = swLayout[mmDraggingNode] || {};
      layout.x = (layout.x || 0) + dx / mmScale;
      layout.y = (layout.y || 0) + dy / mmScale;
      swLayout[mmDraggingNode] = layout;
      swSaveLayout();
      mmDragStartX = e.clientX;
      mmDragStartY = e.clientY;
      swRenderMindmap();
      return;
    }
    if (mmPanning) {
      var dx2 = e.clientX - mmDragStartX;
      var dy2 = e.clientY - mmDragStartY;
      mmPanX += dx2;
      mmPanY += dy2;
      mmDragStartX = e.clientX;
      mmDragStartY = e.clientY;
      swRenderMindmap();
    }
  };

  svg.onmouseup = function(e) {
    if (mmDraggingNode && !mmNodeMoved) {
      // 未发生拖动，视为点击选中
      mmSelectNode(mmDraggingNode);
    }
    mmDraggingNode = null;
    mmPanning = false;
    mmNodeMoved = false;
  };

  svg.onmouseleave = function() {
    mmDraggingNode = null;
    mmPanning = false;
    mmNodeMoved = false;
  };

  svg.onwheel = function(e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    mmScale = Math.max(0.2, Math.min(3, mmScale * delta));
    swRenderMindmap();
  };

  svg.ondblclick = function(e) {
    e.preventDefault();
    if (mmSelectedNodeId) {
      mmEditNode(mmSelectedNodeId);
    }
  };
}

function mmSelectNode(id) {
  mmSelectedNodeId = id;
  swRenderMindmap();

  // Fill edit panel
  var proj = swGetProject();
  var node = null;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) { node = proj.mindmapNodes[i]; break; }
  }
  if (node) {
    document.getElementById('mmEditTitle').value = node.title || '';
    document.getElementById('mmEditNote').value = node.content || '';
    document.getElementById('mmEditStatus').value = node.status || 'idea';
    document.getElementById('mmEditTags').value = (node.tags || []).join(',');
    document.getElementById('mmEditPanel').classList.remove('hidden');
  }
}

function mmDraw() {
  var proj = swGetProject();
  if (!proj) return;
  var svg = document.getElementById('mmSvg');
  if (!svg) return;

  var nodes = proj.mindmapNodes;
  if (nodes.length === 0) return;

  var roots = mmBuildTree(nodes);

  // Draw connections first
  var connectionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  connectionGroup.setAttribute('id', 'mm-connections');
  svg.appendChild(connectionGroup);

  var nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodeGroup.setAttribute('id', 'mm-nodes');
  svg.appendChild(nodeGroup);

  // Draw recursively
  var startX = 300;
  var startY = 40;
  var drawn = {};

  for (var i = 0; i < roots.length; i++) {
    mmDrawTree(roots[i], startX + i * 200, startY, 0, drawn);
  }
}

function mmDrawTree(node, x, y, depth, drawn) {
  if (!node || drawn[node.id]) return;
  var proj = swGetProject();
  if (!proj) return;

  // Use saved layout if exists, otherwise use passed coordinates
  var layout = swLayout[node.id];
  var nx = layout && layout.x !== undefined ? layout.x : x;
  var ny = layout && layout.y !== undefined ? layout.y : y;

  // Update layout
  if (!swLayout[node.id]) {
    swLayout[node.id] = { x: nx, y: ny };
    swSaveLayout();
  }

  var children = node.children || [];
  if (node.collapsed) children = [];

  // Draw node
  mmDrawNodeShape(node, nx, ny);

  // Draw connections to children
  var childCount = children.length;
  for (var i = 0; i < childCount; i++) {
    var child = children[i];
    var childLayout = swLayout[child.id] || {};
    var cx = childLayout.x || nx + (i - (childCount - 1) / 2) * 160;
    var cy = childLayout.y || ny + 100;

    // Draw line
    mmDrawLine(nx, ny + 30, cx, cy);

    // Save child layout
    if (!swLayout[child.id]) {
      swLayout[child.id] = { x: cx, y: cy };
    }

    mmDrawTree(child, cx, cy, depth + 1, drawn);
  }
}

function mmDrawNodeShape(node, nx, ny) {
  var svg = document.getElementById('mmSvg');
  var nodeGroup = svg.getElementById ? svg.getElementById('mm-nodes') : svg.querySelector('#mm-nodes');
  if (!nodeGroup) return;

  var isSelected = mmSelectedNodeId === node.id;
  var fillColor = mmNodeColor(node.status);
  var strokeColor = mmNodeStrokeColor(node.status);
  var text = node.title || '未命名';
  var fontSize = 13;
  var paddingX = 12;
  var paddingY = 6;

  // Estimate text width
  var textWidth = text.length * (fontSize * 0.6) + paddingX * 2;
  var textHeight = 30;

  // Create group
  var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('data-mm-id', node.id);
  g.setAttribute('transform', 'translate(' + mmPanX + ',' + mmPanY + ') scale(' + mmScale + ')');

  // Background
  var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', nx - textWidth / 2);
  rect.setAttribute('y', ny - textHeight / 2);
  rect.setAttribute('width', textWidth);
  rect.setAttribute('height', textHeight);
  rect.setAttribute('rx', 6);
  rect.setAttribute('ry', 6);
  rect.setAttribute('fill', fillColor);
  rect.setAttribute('stroke', isSelected ? '#7d9b76' : strokeColor);
  rect.setAttribute('stroke-width', isSelected ? 2.5 : 1.5);
  rect.style.cursor = 'pointer';
  g.appendChild(rect);

  // Text
  var textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  textEl.setAttribute('x', nx);
  textEl.setAttribute('y', ny + 5);
  textEl.setAttribute('text-anchor', 'middle');
  textEl.setAttribute('fill', '#4a4a5a');
  textEl.setAttribute('font-size', fontSize);
  textEl.setAttribute('font-family', 'sans-serif');
  textEl.textContent = text;
  textEl.style.pointerEvents = 'none';
  g.appendChild(textEl);

  // Collapse button if has children
  if (node.children && node.children.length > 0) {
    var btnX = nx + textWidth / 2 - 2;
    var btnY = ny - textHeight / 2 + 2;
    var btn = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    btn.setAttribute('cx', btnX);
    btn.setAttribute('cy', btnY);
    btn.setAttribute('r', 7);
    btn.setAttribute('fill', '#e8e0d0');
    btn.setAttribute('stroke', strokeColor);
    btn.setAttribute('stroke-width', 1);
    btn.style.cursor = 'pointer';
    btn.onmousedown = function(e) { e.stopPropagation(); };
    btn.onclick = function(e) { e.stopPropagation(); mmToggleCollapse(node.id); };
    g.appendChild(btn);

    var signText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    signText.setAttribute('x', btnX);
    signText.setAttribute('y', btnY + 4);
    signText.setAttribute('text-anchor', 'middle');
    signText.setAttribute('fill', '#666');
    signText.setAttribute('font-size', 10);
    signText.textContent = node.collapsed ? '+' : '-';
    signText.style.pointerEvents = 'none';
    g.appendChild(signText);
  }

  nodeGroup.appendChild(g);
}

function mmDrawLine(x1, y1, x2, y2) {
  var svg = document.getElementById('mmSvg');
  var connGroup = svg.getElementById ? svg.getElementById('mm-connections') : svg.querySelector('#mm-connections');
  if (!connGroup) return;

  var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', 'translate(' + mmPanX + ',' + mmPanY + ') scale(' + mmScale + ')');

  var midX = (x1 + x2) / 2;
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  var d = 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + midX + ' ' + x2 + ',' + midX + ' ' + x2 + ',' + y2;
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#d0c8b8');
  path.setAttribute('stroke-width', 1.2);
  g.appendChild(path);

  connGroup.appendChild(g);
}

function mmAddRoot() {
  var proj = swGetProject();
  if (!proj) { showToast('请先选择作品'); return; }
  var title = prompt('输入中心节点标题：', '中心主题');
  if (!title) return;
  var now = new Date().toISOString();
  var node = {
    id: uid(), title: title, content: '', tags: [], status: 'idea',
    children: [], parentId: null, collapsed: false, createdAt: now, updatedAt: now
  };
  proj.mindmapNodes.push(node);
  swSaveData();
  mmAutoLayout();
  mmSelectedNodeId = node.id;
  swRenderMindmap();
  showToast('已添加中心节点');
}

function mmAddChild() {
  if (!mmSelectedNodeId) { showToast('请先选择一个节点'); return; }
  var title = prompt('输入子节点标题：', '新节点');
  if (!title) return;
  var proj = swGetProject();
  if (!proj) return;
  var now = new Date().toISOString();
  var node = {
    id: uid(), title: title, content: '', tags: [], status: 'idea',
    children: [], parentId: mmSelectedNodeId, collapsed: false, createdAt: now, updatedAt: now
  };
  proj.mindmapNodes.push(node);
  swSaveData();
  mmAutoLayout();
  swRenderMindmap();
  showToast('已添加子节点');
}

function mmDeleteNode(id) {
  if (!id) return;
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) { node = proj.mindmapNodes[i]; break; }
  }
  if (!node) return;
  confirmDialog('确定删除节点「' + node.title + '」及其所有子节点吗？').then(function(ok) {
    if (!ok) return;

    // Collect all descendants
    var toDelete = [id];
    var queue = [id];
    while (queue.length > 0) {
      var pid = queue.pop();
      for (var i = 0; i < proj.mindmapNodes.length; i++) {
        if (proj.mindmapNodes[i].parentId === pid) {
          toDelete.push(proj.mindmapNodes[i].id);
          queue.push(proj.mindmapNodes[i].id);
        }
      }
    }

    proj.mindmapNodes = proj.mindmapNodes.filter(function(n) { return toDelete.indexOf(n.id) === -1; });
    if (mmSelectedNodeId === id) mmSelectedNodeId = null;
    swSaveData();
    mmAutoLayout();
    swRenderMindmap();
    showToast('节点已删除');
  });
}

function mmEditNode(id) {
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) { node = proj.mindmapNodes[i]; break; }
  }
  if (!node) return;
  mmSelectedNodeId = id;
  document.getElementById('mmEditTitle').value = node.title || '';
  document.getElementById('mmEditNote').value = node.content || '';
  document.getElementById('mmEditStatus').value = node.status || 'idea';
  document.getElementById('mmEditTags').value = (node.tags || []).join(',');
  document.getElementById('mmEditPanel').classList.remove('hidden');
}

function mmSaveNode() {
  if (!mmSelectedNodeId) return;
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === mmSelectedNodeId) { node = proj.mindmapNodes[i]; break; }
  }
  if (!node) return;
  node.title = document.getElementById('mmEditTitle').value || '未命名';
  node.content = document.getElementById('mmEditNote').value || '';
  node.status = document.getElementById('mmEditStatus').value;
  var tagsStr = (document.getElementById('mmEditTags').value || '').trim();
  node.tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];
  node.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderMindmap();
  showToast('节点已保存');
}

function mmToggleCollapse(id) {
  var proj = swGetProject();
  if (!proj) return;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) {
      proj.mindmapNodes[i].collapsed = !proj.mindmapNodes[i].collapsed;
      break;
    }
  }
  swSaveData();
  swRenderMindmap();
}

function mmCopySubtree(id) {
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) { node = proj.mindmapNodes[i]; break; }
  }
  if (!node) return;

  var idMap = {};
  function deepCopy(src) {
    var now = new Date().toISOString();
    var newNode = {
      id: uid(), title: src.title + ' (副本)', content: src.content,
      tags: (src.tags || []).slice(), status: src.status,
      children: [], parentId: src.parentId, collapsed: false,
      createdAt: now, updatedAt: now
    };
    idMap[src.id] = newNode;
    proj.mindmapNodes.push(newNode);
    if (src.children) {
      for (var i = 0; i < src.children.length; i++) {
        deepCopy(src.children[i]);
      }
    }
    return newNode;
  }

  var copy = deepCopy(node);
  // Fix parent references
  for (var k = 0; k < proj.mindmapNodes.length; k++) {
    var n = proj.mindmapNodes[k];
    if (n.id === copy.id) continue;
    if (idMap[n.parentId]) n.parentId = idMap[n.parentId].id;
  }
  // Copy's parentId same as original
  copy.parentId = node.parentId;

  swSaveData();
  mmAutoLayout();
  swRenderMindmap();
  showToast('子树已复制');
}

function mmConvertToPlot(id) {
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) { node = proj.mindmapNodes[i]; break; }
  }
  if (!node) return;
  var now = new Date().toISOString();
  var card = {
    id: uid(), title: node.title, summary: node.content, status: 'draft',
    tags: (node.tags || []).slice(), linkedCharacters: [], group: '', order: 0,
    cause: '', action: '', result: '', aftermath: '', unresolved: '',
    foreshadowing: '', issues: [], linkedOutlineId: null, createdAt: now, updatedAt: now
  };
  proj.plotCards.push(card);
  swSaveData();
  showToast('已转为情节卡片');
}

function mmConvertToOutline(id) {
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) { node = proj.mindmapNodes[i]; break; }
  }
  if (!node) return;
  var now = new Date().toISOString();
  var olNode = {
    id: uid(), title: node.title, summary: node.content, detail: '',
    type: 'scene', status: 'pending', tags: (node.tags || []).slice(),
    parentId: null, order: proj.outlineNodes.length, linkedCharacters: [],
    linkedEvents: [], linkedArticleId: null, linkedPlots: [], createdAt: now, updatedAt: now
  };
  proj.outlineNodes.push(olNode);
  swSaveData();
  showToast('已转为大纲节点');
}

function mmLinkInspiration(id) {
  var proj = swGetProject();
  if (!proj) return;
  if (proj.inspirations.length === 0) { showToast('还没有灵感条目'); return; }
  var msg = '选择要关联的灵感：\n';
  for (var j = 0; j < proj.inspirations.length; j++) {
    msg += (j + 1) + '. ' + (proj.inspirations[j].title || proj.inspirations[j].content.substring(0, 30)) + '\n';
  }
  var choice = prompt(msg + '\n输入序号：', '');
  if (!choice) return;
  var idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= proj.inspirations.length) { showToast('无效选择'); return; }
  // Add inspiration tag to node
  for (var i = 0; i < proj.mindmapNodes.length; i++) {
    if (proj.mindmapNodes[i].id === id) {
      var inspTag = '灵感:' + proj.inspirations[idx].title;
      if (!proj.mindmapNodes[i].tags) proj.mindmapNodes[i].tags = [];
      if (proj.mindmapNodes[i].tags.indexOf(inspTag) === -1) {
        proj.mindmapNodes[i].tags.push(inspTag);
      }
      break;
    }
  }
  swSaveData();
  showToast('已关联灵感');
}

function mmExportPng() {
  var svg = document.getElementById('mmSvg');
  if (!svg) return;

  // Clone SVG and set dimensions
  var clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  var bbox = svg.getBoundingClientRect();
  var width = bbox.width || 800;
  var height = bbox.height || 600;

  var svgData = new XMLSerializer().serializeToString(clone);
  var svgBlob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
    svgData.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '') + '</svg>'],
    { type: 'image/svg+xml;charset=utf-8' });

  var url = URL.createObjectURL(svgBlob);
  var canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  var ctx = canvas.getContext('2d');
  var img = new Image();

  img.onload = function() {
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob(function(blob) {
      var pngUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = pngUrl;
      a.download = '思维导图_' + todayStr() + '.png';
      a.click();
      URL.revokeObjectURL(pngUrl);
      showToast('PNG 已导出');
    }, 'image/png');
  };

  img.src = url;
}

function mmAutoLayout() {
  var proj = swGetProject();
  if (!proj) return;
  var nodes = proj.mindmapNodes;
  if (nodes.length === 0) return;

  var roots = mmBuildTree(nodes);
  var startX = 300;
  var startY = 30;

  function layoutTree(node, x, y) {
    swLayout[node.id] = { x: x, y: y };
    var children = node.children || [];
    if (children.length === 0) return;
    var childY = y + 100;
    var totalWidth = (children.length - 1) * 180;
    var startChildX = x - totalWidth / 2;
    for (var i = 0; i < children.length; i++) {
      var cx = startChildX + i * 180;
      layoutTree(children[i], cx, childY);
    }
  }

  for (var i = 0; i < roots.length; i++) {
    layoutTree(roots[i], startX + i * 250, startY);
  }
  swSaveLayout();
}

// ==============================
//  大纲面板
// ==============================
function swRenderOutline() {
  var proj = swGetProject();
  var treeEl = document.getElementById('outlineTree');
  var emptyEl = document.getElementById('olEmpty');

  if (!proj || proj.outlineNodes.length === 0) {
    treeEl.innerHTML = '';
    emptyEl.style.display = 'block';
    document.getElementById('olBtnAddChild').disabled = true;
    document.getElementById('olBtnAddSibling').disabled = true;
    document.getElementById('olBtnEdit').disabled = true;
    document.getElementById('olBtnDelete').disabled = true;
    document.getElementById('olBtnCopy').disabled = true;
    return;
  }

  emptyEl.style.display = 'none';

  var search = (document.getElementById('olSearch').value || '').toLowerCase();
  var filterStatus = document.getElementById('olFilterStatus').value;

  // Filter
  var filtered = proj.outlineNodes.slice();
  if (filterStatus) {
    var matchingIds = {};
    // Include children of matching nodes
    for (var i = 0; i < filtered.length; i++) {
      if (filtered[i].status === filterStatus) {
        matchingIds[filtered[i].id] = true;
      }
    }
    filtered = filtered.filter(function(n) {
      return matchingIds[n.id] || matchingIds[n.parentId];
    });
  }
  if (search) {
    filtered = filtered.filter(function(n) {
      return (n.title && n.title.toLowerCase().indexOf(search) !== -1) ||
             (n.summary && n.summary.toLowerCase().indexOf(search) !== -1);
    });
  }

  // Build root nodes
  var roots = filtered.filter(function(n) { return !n.parentId; });
  roots.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

  treeEl.innerHTML = '';
  for (var r = 0; r < roots.length; r++) {
    var el = olRenderNode(roots[r], 0, filtered);
    treeEl.appendChild(el);
  }

  if (olSelectedId) {
    document.getElementById('olBtnAddChild').disabled = false;
    document.getElementById('olBtnAddSibling').disabled = false;
    document.getElementById('olBtnEdit').disabled = false;
    document.getElementById('olBtnDelete').disabled = false;
    document.getElementById('olBtnCopy').disabled = false;
  }
}

function olRenderNode(node, depth, allNodes) {
  var div = document.createElement('div');
  div.className = 'ol-node';
  div.setAttribute('data-ol-id', node.id);
  div.style.paddingLeft = (depth * 24) + 'px';

  var isSelected = olSelectedId === node.id;
  var isExpanded = olExpanded[node.id] !== false; // default expanded

  var typeLabels = { act: '幕', chapter: '章', scene: '场景', beat: '节拍', other: '其他' };
  var statusLabels = { pending: '待写', writing: '写作中', done: '已完成' };
  var statusColors = { pending: '#c9b99a', writing: '#7b9ec7', done: '#7d9b76' };

  var children = allNodes.filter(function(n) { return n.parentId === node.id; });
  children.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
  var hasChildren = children.length > 0;

  var header = document.createElement('div');
  header.className = 'ol-node-header' + (isSelected ? ' selected' : '');
  header.style.borderLeftColor = statusColors[node.status] || '#c9b99a';

  var expandIcon = '<span class="ol-expand-icon">' + (hasChildren ? (isExpanded ? '▼' : '▶') : '　') + '</span>';
  var typeBadge = '<span class="ol-type-badge">' + (typeLabels[node.type] || node.type) + '</span>';
  var statusBadge = '<span class="ol-status-badge" style="background:' + (statusColors[node.status] || '#c9b99a') + '">' + (statusLabels[node.status] || node.status) + '</span>';

  header.innerHTML = expandIcon + typeBadge + statusBadge + ' <span class="ol-node-title">' + escapeHtml(node.title || '未命名') + '</span>';

  header.addEventListener('click', function() { olSelectNode(node.id); });

  var expandEl = header.querySelector('.ol-expand-icon');
  if (hasChildren) {
    expandEl.style.cursor = 'pointer';
    expandEl.addEventListener('click', function(e) { e.stopPropagation(); olToggleExpand(node.id); });
  }

  div.appendChild(header);

  // Children
  if (hasChildren && isExpanded) {
    for (var i = 0; i < children.length; i++) {
      var childEl = olRenderNode(children[i], depth + 1, allNodes);
      div.appendChild(childEl);
    }
  }

  return div;
}

function olSelectNode(id) {
  olSelectedId = id;
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.outlineNodes.length; i++) {
    if (proj.outlineNodes[i].id === id) { node = proj.outlineNodes[i]; break; }
  }
  if (!node) return;

  // Fill edit panel
  document.getElementById('olEditTitle').value = node.title || '';
  document.getElementById('olEditType').value = node.type || 'scene';
  document.getElementById('olEditSummary').value = node.summary || '';
  document.getElementById('olEditDetail').value = node.detail || '';
  document.getElementById('olEditStatus').value = node.status || 'pending';
  document.getElementById('olEditTags').value = (node.tags || []).join(',');
  document.getElementById('olEditPanel').classList.remove('hidden');

  // Populate article dropdown
  var artSel = document.getElementById('olEditArticle');
  artSel.innerHTML = '<option value="">无</option>';
  for (var j = 0; j < articles.length; j++) {
    var selected = (node.linkedArticleId === articles[j].id) ? ' selected' : '';
    artSel.innerHTML += '<option value="' + articles[j].id + '"' + selected + '>' + escapeHtml(articles[j].title) + '</option>';
  }

  swRenderOutline();
}

function olAddNode(parentId, type) {
  var proj = swGetProject();
  if (!proj) { showToast('请先选择作品'); return; }

  var title = prompt('输入节点标题：', type === 'chapter' ? '新章节' : '新节点');
  if (!title) return;

  var now = new Date().toISOString();
  var maxOrder = 0;
  for (var i = 0; i < proj.outlineNodes.length; i++) {
    if (proj.outlineNodes[i].parentId === parentId) {
      maxOrder = Math.max(maxOrder, proj.outlineNodes[i].order || 0);
    }
  }

  var node = {
    id: uid(), title: title, summary: '', detail: '', type: type || 'scene',
    status: 'pending', tags: [], parentId: parentId, order: maxOrder + 1,
    linkedCharacters: [], linkedEvents: [], linkedArticleId: null,
    linkedPlots: [], createdAt: now, updatedAt: now
  };
  proj.outlineNodes.push(node);
  swSaveData();
  olSelectedId = node.id;
  olExpanded[parentId] = true;
  swRenderOutline();
  showToast('节点已添加');
}

function olEditNode(id) {
  olSelectNode(id);
}

function olSaveNode() {
  if (!olSelectedId) return;
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.outlineNodes.length; i++) {
    if (proj.outlineNodes[i].id === olSelectedId) { node = proj.outlineNodes[i]; break; }
  }
  if (!node) return;
  node.title = document.getElementById('olEditTitle').value || '未命名';
  node.type = document.getElementById('olEditType').value;
  node.summary = document.getElementById('olEditSummary').value || '';
  node.detail = document.getElementById('olEditDetail').value || '';
  node.status = document.getElementById('olEditStatus').value;
  var tagsStr = (document.getElementById('olEditTags').value || '').trim();
  node.tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];
  node.linkedArticleId = document.getElementById('olEditArticle').value || null;
  node.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderOutline();
  showToast('大纲节点已保存');
}

function olDeleteNode(id) {
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.outlineNodes.length; i++) {
    if (proj.outlineNodes[i].id === id) { node = proj.outlineNodes[i]; break; }
  }
  if (!node) return;
  confirmDialog('确定删除大纲节点「' + node.title + '」及其所有子节点吗？').then(function(ok) {
    if (!ok) return;
    var toDelete = [id];
    var queue = [id];
    while (queue.length > 0) {
      var pid = queue.pop();
      for (var i = 0; i < proj.outlineNodes.length; i++) {
        if (proj.outlineNodes[i].parentId === pid) {
          toDelete.push(proj.outlineNodes[i].id);
          queue.push(proj.outlineNodes[i].id);
        }
      }
    }
    proj.outlineNodes = proj.outlineNodes.filter(function(n) { return toDelete.indexOf(n.id) === -1; });
    if (olSelectedId === id) olSelectedId = null;
    swSaveData();
    swRenderOutline();
    showToast('大纲节点已删除');
  });
}

function olCopySubtree(id) {
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.outlineNodes.length; i++) {
    if (proj.outlineNodes[i].id === id) { node = proj.outlineNodes[i]; break; }
  }
  if (!node) return;

  var idMap = {};
  var now = new Date().toISOString();
  function deepCopy(src) {
    var copy = {
      id: uid(), title: src.title + ' (副本)', summary: src.summary, detail: src.detail,
      type: src.type, status: 'pending', tags: (src.tags || []).slice(),
      parentId: src.parentId, order: src.order, linkedCharacters: (src.linkedCharacters || []).slice(),
      linkedEvents: (src.linkedEvents || []).slice(), linkedArticleId: src.linkedArticleId,
      linkedPlots: (src.linkedPlots || []).slice(), createdAt: now, updatedAt: now
    };
    idMap[src.id] = copy.id;
    proj.outlineNodes.push(copy);

    var children = proj.outlineNodes.filter(function(n) { return n.parentId === src.id; });
    for (var j = 0; j < children.length; j++) {
      var childCopy = deepCopy(children[j]);
      childCopy.parentId = copy.id;
    }
    return copy;
  }

  var copy = deepCopy(node);
  if (node.parentId) copy.parentId = node.parentId;
  else copy.parentId = null;

  swSaveData();
  swRenderOutline();
  showToast('子树已复制');
}

function olToggleExpand(id) {
  olExpanded[id] = olExpanded[id] === false ? true : false;
  swRenderOutline();
}

function olMoveNodeUp(id) {
  olMoveNode(id, -1);
}

function olMoveNodeDown(id) {
  olMoveNode(id, 1);
}

function olMoveNode(id, direction) {
  var proj = swGetProject();
  if (!proj) return;
  var node = null;
  for (var i = 0; i < proj.outlineNodes.length; i++) {
    if (proj.outlineNodes[i].id === id) { node = proj.outlineNodes[i]; break; }
  }
  if (!node) return;
  // Get siblings
  var siblings = [];
  for (var j = 0; j < proj.outlineNodes.length; j++) {
    if (proj.outlineNodes[j].parentId === node.parentId) siblings.push(proj.outlineNodes[j]);
  }
  siblings.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
  var idx = -1;
  for (var k = 0; k < siblings.length; k++) {
    if (siblings[k].id === id) { idx = k; break; }
  }
  if (idx < 0) return;
  var swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  var tmp = siblings[idx].order;
  siblings[idx].order = siblings[swapIdx].order;
  siblings[swapIdx].order = tmp;
  siblings[idx].updatedAt = new Date().toISOString();
  siblings[swapIdx].updatedAt = new Date().toISOString();
  swSaveData();
  swRenderOutline();
}

// ==============================
//  情节卡片面板
// ==============================
function swRenderPlotCards() {
  var proj = swGetProject();
  var wallEl = document.getElementById('pcWall');
  var emptyEl = document.getElementById('pcEmpty');

  if (!proj || proj.plotCards.length === 0) {
    wallEl.innerHTML = '';
    emptyEl.style.display = 'block';
    document.getElementById('pcDetailPanel').classList.add('hidden');
    return;
  }
  emptyEl.style.display = 'none';

  var search = (document.getElementById('pcSearch').value || '').toLowerCase();
  var filterStatus = document.getElementById('pcFilterStatus').value;
  var groupBy = document.getElementById('pcGroupBy').value;

  var cards = proj.plotCards.slice();
  if (search) {
    cards = cards.filter(function(c) {
      return (c.title && c.title.toLowerCase().indexOf(search) !== -1) ||
             (c.summary && c.summary.toLowerCase().indexOf(search) !== -1);
    });
  }
  if (filterStatus) cards = cards.filter(function(c) { return c.status === filterStatus; });

  var html = '';
  var statusLabels = { draft: '构思', outlined: '已大纲', writing: '写作中', done: '已完成' };
  var statusColors = { draft: '#c9b99a', outlined: '#7b9ec7', writing: '#e8c97a', done: '#7d9b76' };

  if (groupBy === 'status') {
    var groups = {};
    var order = ['draft', 'outlined', 'writing', 'done'];
    for (var g = 0; g < order.length; g++) {
      var groupCards = cards.filter(function(c) { return c.status === order[g]; });
      if (groupCards.length > 0) {
        html += '<div class="pc-group"><h5>' + (statusLabels[order[g]] || order[g]) + ' (' + groupCards.length + ')</h5>';
        for (var h = 0; h < groupCards.length; h++) {
          html += renderPlotCardHtml(groupCards[h], statusLabels, statusColors);
        }
        html += '</div>';
      }
    }
  } else if (groupBy === 'chapter') {
    var chapGroups = {};
    for (var c = 0; c < cards.length; c++) {
      var key = cards[c].group || '未分组';
      if (!chapGroups[key]) chapGroups[key] = [];
      chapGroups[key].push(cards[c]);
    }
    var keys = Object.keys(chapGroups).sort();
    for (var ki = 0; ki < keys.length; ki++) {
      var kk = keys[ki];
      html += '<div class="pc-group"><h5>' + escapeHtml(kk) + ' (' + chapGroups[kk].length + ')</h5>';
      for (var hi = 0; hi < chapGroups[kk].length; hi++) {
        html += renderPlotCardHtml(chapGroups[kk][hi], statusLabels, statusColors);
      }
      html += '</div>';
    }
  } else {
    cards.sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
    for (var ci = 0; ci < cards.length; ci++) {
      html += renderPlotCardHtml(cards[ci], statusLabels, statusColors);
    }
  }

  wallEl.innerHTML = html;

  // Bind click events
  var items = wallEl.querySelectorAll('.pc-card');
  for (var bi = 0; bi < items.length; bi++) {
    items[bi].addEventListener('click', function() {
      pcSelectCard(this.getAttribute('data-pc-id'));
    });
  }
}

function renderPlotCardHtml(card, statusLabels, statusColors) {
  var color = statusColors[card.status] || '#c9b99a';
  var isSelected = pcSelectedId === card.id;
  return '<div class="pc-card' + (isSelected ? ' selected' : '') + '" data-pc-id="' + card.id + '" ' +
    'style="border-left: 3px solid ' + color + '">' +
    '<div class="pc-card-status" style="background:' + color + '">' + (statusLabels[card.status] || card.status) + '</div>' +
    '<div class="pc-card-title">' + escapeHtml(card.title || '未命名') + '</div>' +
    '<div class="pc-card-summary">' + escapeHtml((card.summary || '').substring(0, 80)) + '</div>' +
    '</div>';
}

function pcSelectCard(id) {
  pcSelectedId = id;
  var proj = swGetProject();
  if (!proj) return;
  var card = null;
  for (var i = 0; i < proj.plotCards.length; i++) {
    if (proj.plotCards[i].id === id) { card = proj.plotCards[i]; break; }
  }
  if (!card) return;

  document.getElementById('pcEditTitle').value = card.title || '';
  document.getElementById('pcEditSummary').value = card.summary || '';
  document.getElementById('pcEditStatus').value = card.status || 'draft';
  document.getElementById('pcEditTags').value = (card.tags || []).join(',');
  document.getElementById('pcEditCause').value = card.cause || '';
  document.getElementById('pcEditAction').value = card.action || '';
  document.getElementById('pcEditResult').value = card.result || '';
  document.getElementById('pcEditAftermath').value = card.aftermath || '';
  document.getElementById('pcEditUnresolved').value = card.unresolved || '';
  document.getElementById('pcEditForeshadowing').value = card.foreshadowing || '';

  // Character dropdown
  var charSel = document.getElementById('pcEditChars');
  charSel.innerHTML = '';
  for (var j = 0; j < proj.characters.length; j++) {
    var ch = proj.characters[j];
    var sel = (card.linkedCharacters || []).indexOf(ch.id) !== -1 ? ' selected' : '';
    charSel.innerHTML += '<option value="' + ch.id + '"' + sel + '>' + escapeHtml(ch.name) + '</option>';
  }

  // Issues checkboxes
  var issues = card.issues || [];
  var checkboxes = document.querySelectorAll('#pcIssues input[type="checkbox"]');
  for (var k = 0; k < checkboxes.length; k++) {
    checkboxes[k].checked = issues.indexOf(checkboxes[k].value) !== -1;
  }

  document.getElementById('pcDetailPanel').classList.remove('hidden');
  swRenderPlotCards();
}

function pcNewCard() {
  var proj = swGetProject();
  if (!proj) { showToast('请先选择作品'); return; }
  var title = prompt('情节标题：', '新情节');
  if (!title) return;
  var now = new Date().toISOString();
  var card = {
    id: uid(), title: title, summary: '', status: 'draft', tags: [],
    linkedCharacters: [], group: '', order: 0, cause: '', action: '',
    result: '', aftermath: '', unresolved: '', foreshadowing: '',
    issues: [], linkedOutlineId: null, createdAt: now, updatedAt: now
  };
  proj.plotCards.push(card);
  swSaveData();
  pcSelectedId = card.id;
  swRenderPlotCards();
  pcSelectCard(card.id);
  showToast('情节卡片已创建');
}

function pcSaveCard() {
  if (!pcSelectedId) return;
  var proj = swGetProject();
  if (!proj) return;
  var card = null;
  for (var i = 0; i < proj.plotCards.length; i++) {
    if (proj.plotCards[i].id === pcSelectedId) { card = proj.plotCards[i]; break; }
  }
  if (!card) return;

  card.title = document.getElementById('pcEditTitle').value || '未命名';
  card.summary = document.getElementById('pcEditSummary').value || '';
  card.status = document.getElementById('pcEditStatus').value;
  var tagsStr = (document.getElementById('pcEditTags').value || '').trim();
  card.tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];
  card.cause = document.getElementById('pcEditCause').value || '';
  card.action = document.getElementById('pcEditAction').value || '';
  card.result = document.getElementById('pcEditResult').value || '';
  card.aftermath = document.getElementById('pcEditAftermath').value || '';
  card.unresolved = document.getElementById('pcEditUnresolved').value || '';
  card.foreshadowing = document.getElementById('pcEditForeshadowing').value || '';

  // Characters
  var charSel = document.getElementById('pcEditChars');
  card.linkedCharacters = [];
  for (var j = 0; j < charSel.options.length; j++) {
    if (charSel.options[j].selected) card.linkedCharacters.push(charSel.options[j].value);
  }

  // Issues
  card.issues = [];
  var checkboxes = document.querySelectorAll('#pcIssues input[type="checkbox"]');
  for (var k = 0; k < checkboxes.length; k++) {
    if (checkboxes[k].checked) card.issues.push(checkboxes[k].value);
  }

  card.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderPlotCards();
  showToast('情节卡片已保存');
}

function pcDeleteCard(id) {
  var proj = swGetProject();
  if (!proj) return;
  var card = null;
  for (var i = 0; i < proj.plotCards.length; i++) {
    if (proj.plotCards[i].id === id) { card = proj.plotCards[i]; break; }
  }
  if (!card) return;
  confirmDialog('确定删除情节卡片「' + card.title + '」吗？').then(function(ok) {
    if (!ok) return;
    proj.plotCards = proj.plotCards.filter(function(c) { return c.id !== id; });
    if (pcSelectedId === id) pcSelectedId = null;
    swSaveData();
    document.getElementById('pcDetailPanel').classList.add('hidden');
    swRenderPlotCards();
    showToast('情节卡片已删除');
  });
}

function pcLinkToOutline(id) {
  var proj = swGetProject();
  if (!proj) return;
  if (proj.outlineNodes.length === 0) { showToast('还没有大纲节点'); return; }
  var msg = '选择要关联的大纲节点：\n';
  for (var j = 0; j < proj.outlineNodes.length; j++) {
    msg += (j + 1) + '. ' + proj.outlineNodes[j].title + '\n';
  }
  var choice = prompt(msg + '\n输入序号：', '');
  if (!choice) return;
  var idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= proj.outlineNodes.length) { showToast('无效选择'); return; }

  var card = null;
  for (var i = 0; i < proj.plotCards.length; i++) {
    if (proj.plotCards[i].id === id) { card = proj.plotCards[i]; break; }
  }
  if (!card) return;
  card.linkedOutlineId = proj.outlineNodes[idx].id;
  // Also link plot to outline node
  if (proj.outlineNodes[idx].linkedPlots.indexOf(id) === -1) {
    proj.outlineNodes[idx].linkedPlots.push(id);
  }
  card.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderPlotCards();
  showToast('已关联到大纲节点：' + proj.outlineNodes[idx].title);
}

// ==============================
//  人物面板
// ==============================
function swRenderCharacters() {
  var proj = swGetProject();
  var listEl = document.getElementById('charList');
  var emptyEl = document.getElementById('chEmpty');

  if (!proj || proj.characters.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    var search = (document.getElementById('chSearch').value || '').toLowerCase();
    var chars = proj.characters.slice();
    if (search) {
      chars = chars.filter(function(c) { return c.name.toLowerCase().indexOf(search) !== -1; });
    }
    var html = '';
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var isSelected = chSelectedId === ch.id;
      html += '<div class="ch-card' + (isSelected ? ' selected' : '') + '" data-ch-id="' + ch.id + '">' +
        '<span class="ch-name">' + escapeHtml(ch.name) + '</span>' +
        '<span class="ch-brief">' + escapeHtml((ch.basicInfo || '').substring(0, 30)) + '</span></div>';
    }
    listEl.innerHTML = html;

    var items = listEl.querySelectorAll('.ch-card');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function() {
        chSelect(this.getAttribute('data-ch-id'));
      });
    }
  }

  // Populate character dropdowns for relations
  var relFrom = document.getElementById('chRelFrom');
  var relTo = document.getElementById('chRelTo');
  if (proj) {
    var opts = '';
    for (var k = 0; k < proj.characters.length; k++) {
      var ch2 = proj.characters[k];
      opts += '<option value="' + ch2.id + '">' + escapeHtml(ch2.name) + '</option>';
    }
    if (relFrom) relFrom.innerHTML = opts;
    if (relTo) relTo.innerHTML = opts;
  }

  // Timeline character filter
  var tlChar = document.getElementById('tlFilterChar');
  if (tlChar && proj) {
    tlChar.innerHTML = '<option value="">全部人物</option>';
    for (var l = 0; l < proj.characters.length; l++) {
      tlChar.innerHTML += '<option value="' + proj.characters[l].id + '">' + escapeHtml(proj.characters[l].name) + '</option>';
    }
  }

  // Timeline edit character dropdowns
  var tlEditChars = document.getElementById('tlEditChars');
  if (tlEditChars && proj) {
    tlEditChars.innerHTML = '';
    for (var m = 0; m < proj.characters.length; m++) {
      tlEditChars.innerHTML += '<option value="' + proj.characters[m].id + '">' + escapeHtml(proj.characters[m].name) + '</option>';
    }
  }
  var tlEditPlots = document.getElementById('tlEditPlots');
  if (tlEditPlots && proj) {
    tlEditPlots.innerHTML = '';
    for (var n = 0; n < proj.plotCards.length; n++) {
      tlEditPlots.innerHTML += '<option value="' + proj.plotCards[n].id + '">' + escapeHtml(proj.plotCards[n].title) + '</option>';
    }
  }

  swRenderRelationGraph();
}

function chSelect(id) {
  chSelectedId = id;
  var proj = swGetProject();
  if (!proj) return;
  var ch = null;
  for (var i = 0; i < proj.characters.length; i++) {
    if (proj.characters[i].id === id) { ch = proj.characters[i]; break; }
  }
  if (!ch) return;

  document.getElementById('chEditName').value = ch.name || '';
  document.getElementById('chEditBasic').value = ch.basicInfo || '';
  document.getElementById('chEditAppearance').value = ch.appearance || '';
  document.getElementById('chEditPersonality').value = ch.personality || '';
  document.getElementById('chEditBackground').value = ch.background || '';
  document.getElementById('chEditGoal').value = ch.goal || '';
  document.getElementById('chEditSecret').value = ch.secret || '';
  document.getElementById('chEditGrowth').value = ch.growth || '';
  document.getElementById('chEditNotes').value = ch.notes || '';
  document.getElementById('chEditTags').value = (ch.tags || []).join(',');
  document.getElementById('chDetailPanel').classList.remove('hidden');

  swRenderCharacters();
}

function chNew() {
  var proj = swGetProject();
  if (!proj) { showToast('请先选择作品'); return; }
  var name = prompt('人物姓名：', '新人物');
  if (!name) return;
  var now = new Date().toISOString();
  var ch = {
    id: uid(), name: name, basicInfo: '', appearance: '', personality: '',
    background: '', goal: '', secret: '', growth: '', notes: '', tags: [],
    createdAt: now, updatedAt: now
  };
  proj.characters.push(ch);
  chSelectedId = ch.id;
  swSaveData();
  swRenderCharacters();
  chSelect(ch.id);
  showToast('人物已创建');
}

function chSave() {
  if (!chSelectedId) return;
  var proj = swGetProject();
  if (!proj) return;
  var ch = null;
  for (var i = 0; i < proj.characters.length; i++) {
    if (proj.characters[i].id === chSelectedId) { ch = proj.characters[i]; break; }
  }
  if (!ch) return;

  ch.name = document.getElementById('chEditName').value || '未命名';
  ch.basicInfo = document.getElementById('chEditBasic').value || '';
  ch.appearance = document.getElementById('chEditAppearance').value || '';
  ch.personality = document.getElementById('chEditPersonality').value || '';
  ch.background = document.getElementById('chEditBackground').value || '';
  ch.goal = document.getElementById('chEditGoal').value || '';
  ch.secret = document.getElementById('chEditSecret').value || '';
  ch.growth = document.getElementById('chEditGrowth').value || '';
  ch.notes = document.getElementById('chEditNotes').value || '';
  var tagsStr = (document.getElementById('chEditTags').value || '').trim();
  ch.tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];
  ch.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderCharacters();
  showToast('人物已保存');
}

function chDelete(id) {
  var proj = swGetProject();
  if (!proj) return;
  var ch = null;
  for (var i = 0; i < proj.characters.length; i++) {
    if (proj.characters[i].id === id) { ch = proj.characters[i]; break; }
  }
  if (!ch) return;
  confirmDialog('确定删除人物「' + ch.name + '」及其所有关联关系吗？').then(function(ok) {
    if (!ok) return;
    proj.characters = proj.characters.filter(function(c) { return c.id !== id; });
    proj.relations = proj.relations.filter(function(r) { return r.fromCharId !== id && r.toCharId !== id; });
    if (chSelectedId === id) chSelectedId = null;
    swSaveData();
    swRenderCharacters();
    showToast('人物已删除');
  });
}

function swRenderRelationGraph() {
  var proj = swGetProject();
  var svg = document.getElementById('chRelSvg');
  if (!svg) return;
  if (!proj || proj.characters.length === 0) {
    svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#a099a8" font-size="12">添加人物后显示关系图</text>';
    return;
  }

  var chars = proj.characters;
  var relations = proj.relations;
  var cx = 180, cy = 140, radius = 100;

  var html = '';
  // Draw connections
  for (var i = 0; i < relations.length; i++) {
    var rel = relations[i];
    var fromIdx = -1, toIdx = -1;
    for (var j = 0; j < chars.length; j++) {
      if (chars[j].id === rel.fromCharId) fromIdx = j;
      if (chars[j].id === rel.toCharId) toIdx = j;
    }
    if (fromIdx < 0 || toIdx < 0) continue;
    var angle1 = (2 * Math.PI / chars.length) * fromIdx - Math.PI / 2;
    var angle2 = (2 * Math.PI / chars.length) * toIdx - Math.PI / 2;
    var x1 = cx + radius * Math.cos(angle1);
    var y1 = cy + radius * Math.sin(angle1);
    var x2 = cx + radius * Math.cos(angle2);
    var y2 = cy + radius * Math.sin(angle2);
    html += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="#c9b99a" stroke-width="1.5" data-rel-id="' + rel.id + '" style="cursor:pointer"/>';
    // Label at midpoint
    var mx = (x1 + x2) / 2;
    var my = (y1 + y2) / 2;
    html += '<text x="' + mx + '" y="' + my + '" text-anchor="middle" fill="#a099a8" font-size="9" style="cursor:pointer" data-rel-id="' + rel.id + '">' + escapeHtml(rel.type) + '</text>';
  }

  // Draw character nodes
  for (var k = 0; k < chars.length; k++) {
    var ch = chars[k];
    var angle = (2 * Math.PI / chars.length) * k - Math.PI / 2;
    var x = cx + radius * Math.cos(angle);
    var y = cy + radius * Math.sin(angle);
    var isSelected = chSelectedId === ch.id;
    html += '<circle cx="' + x + '" cy="' + y + '" r="18" fill="' + (isSelected ? '#7d9b76' : '#f5f0e8') +
      '" stroke="' + (isSelected ? '#5a7a54' : '#c9b99a') + '" stroke-width="' + (isSelected ? 2 : 1) +
      '" style="cursor:pointer" data-ch-id="' + ch.id + '"/>';
    html += '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" fill="#4a4a5a" font-size="10" style="pointer-events:none">' + escapeHtml(ch.name.substring(0, 4)) + '</text>';
  }

  svg.innerHTML = html;

  // Bind click events
  var circles = svg.querySelectorAll('circle[data-ch-id]');
  for (var ci = 0; ci < circles.length; ci++) {
    circles[ci].addEventListener('click', function() {
      chSelect(this.getAttribute('data-ch-id'));
    });
  }
  var lines = svg.querySelectorAll('[data-rel-id]');
  for (var li = 0; li < lines.length; li++) {
    lines[li].addEventListener('click', function() {
      var relId = this.getAttribute('data-rel-id');
      chEditRelation(relId);
    });
  }
}

function chEditRelation(id) {
  var proj = swGetProject();
  if (!proj) return;
  chEditedRelId = id;
  var rel = null;
  for (var i = 0; i < proj.relations.length; i++) {
    if (proj.relations[i].id === id) { rel = proj.relations[i]; break; }
  }
  if (!rel) {
    // New relation
    document.getElementById('chRelFrom').value = proj.characters.length > 0 ? proj.characters[0].id : '';
    document.getElementById('chRelTo').value = proj.characters.length > 1 ? proj.characters[1].id : '';
    document.getElementById('chRelType').value = '朋友';
    document.getElementById('chRelDesc').value = '';
    document.getElementById('chRelStatus').value = '当前';
    document.getElementById('chRelNotes').value = '';
    document.getElementById('chBtnDelRel').style.display = 'none';
  } else {
    document.getElementById('chRelFrom').value = rel.fromCharId;
    document.getElementById('chRelTo').value = rel.toCharId;
    document.getElementById('chRelType').value = rel.type;
    document.getElementById('chRelDesc').value = rel.description || '';
    document.getElementById('chRelStatus').value = rel.status || '当前';
    document.getElementById('chRelNotes').value = rel.notes || '';
    document.getElementById('chBtnDelRel').style.display = 'inline-flex';
  }
  document.getElementById('chRelEdit').classList.remove('hidden');
}

function chSaveRelation() {
  var proj = swGetProject();
  if (!proj) return;
  var fromId = document.getElementById('chRelFrom').value;
  var toId = document.getElementById('chRelTo').value;
  if (!fromId || !toId) { showToast('请选择两个人物'); return; }
  if (fromId === toId) { showToast('不能选择同一个人物'); return; }

  var now = new Date().toISOString();
  if (chEditedRelId) {
    // Update existing
    var rel = null;
    for (var i = 0; i < proj.relations.length; i++) {
      if (proj.relations[i].id === chEditedRelId) { rel = proj.relations[i]; break; }
    }
    if (rel) {
      rel.fromCharId = fromId;
      rel.toCharId = toId;
      rel.type = document.getElementById('chRelType').value;
      rel.description = document.getElementById('chRelDesc').value || '';
      rel.status = document.getElementById('chRelStatus').value;
      rel.notes = document.getElementById('chRelNotes').value || '';
      rel.updatedAt = now;
    }
  } else {
    // Create new
    var newRel = {
      id: uid(), fromCharId: fromId, toCharId: toId,
      type: document.getElementById('chRelType').value,
      description: document.getElementById('chRelDesc').value || '',
      status: document.getElementById('chRelStatus').value,
      notes: document.getElementById('chRelNotes').value || '',
      createdAt: now, updatedAt: now
    };
    proj.relations.push(newRel);
  }
  swSaveData();
  swRenderCharacters();
  document.getElementById('chRelEdit').classList.add('hidden');
  chEditedRelId = null;
  showToast('关系已保存');
}

function chDeleteRelation(id) {
  var proj = swGetProject();
  if (!proj) return;
  confirmDialog('确定删除此关系吗？').then(function(ok) {
    if (!ok) return;
    proj.relations = proj.relations.filter(function(r) { return r.id !== id; });
    swSaveData();
    swRenderCharacters();
    document.getElementById('chRelEdit').classList.add('hidden');
    chEditedRelId = null;
    showToast('关系已删除');
  });
}

// ==============================
//  时间线面板
// ==============================
function swRenderTimeline() {
  var proj = swGetProject();
  var listEl = document.getElementById('tlList');
  var emptyEl = document.getElementById('tlEmpty');

  if (!proj || proj.timelineEvents.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  var filterChar = document.getElementById('tlFilterChar').value;
  var events = tlSortEvents(proj.timelineEvents.slice());

  if (filterChar) {
    events = events.filter(function(e) {
      return (e.characters || []).indexOf(filterChar) !== -1;
    });
  }

  var html = '';
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var isSelected = tlSelectedId === ev.id;
    html += '<div class="tl-event' + (isSelected ? ' selected' : '') + '" data-tl-id="' + ev.id + '">' +
      '<div class="tl-event-time">' + escapeHtml(ev.storyTime || '时间未知') + (ev.uncertain ? ' <small>(不确定)</small>' : '') + '</div>' +
      '<div class="tl-event-title">' + escapeHtml(ev.title || '未命名事件') + '</div>' +
      '<div class="tl-event-desc">' + escapeHtml((ev.description || '').substring(0, 60)) + '</div>' +
      '</div>';
  }

  listEl.innerHTML = html;

  var items = listEl.querySelectorAll('.tl-event');
  for (var j = 0; j < items.length; j++) {
    items[j].addEventListener('click', function() {
      tlSelectEvent(this.getAttribute('data-tl-id'));
    });
  }
}

function tlSortEvents(events) {
  var certain = events.filter(function(e) { return !e.uncertain; });
  var uncertain = events.filter(function(e) { return e.uncertain; });
  certain.sort(function(a, b) {
    return (a.storyTime || '').localeCompare(b.storyTime || '', 'zh');
  });
  return certain.concat(uncertain);
}

function tlSelectEvent(id) {
  tlSelectedId = id;
  var proj = swGetProject();
  if (!proj) return;
  var ev = null;
  for (var i = 0; i < proj.timelineEvents.length; i++) {
    if (proj.timelineEvents[i].id === id) { ev = proj.timelineEvents[i]; break; }
  }
  if (!ev) return;

  document.getElementById('tlEditTitle').value = ev.title || '';
  document.getElementById('tlEditDesc').value = ev.description || '';
  document.getElementById('tlEditTime').value = ev.storyTime || '';
  document.getElementById('tlEditDuration').value = ev.duration || '';
  document.getElementById('tlEditNote').value = ev.notes || '';
  document.getElementById('tlUncertain').checked = ev.uncertain || false;
  document.getElementById('tlEditConstraints').value = (ev.constraints || []).join(',');

  // Characters
  var charSel = document.getElementById('tlEditChars');
  for (var j = 0; j < charSel.options.length; j++) {
    charSel.options[j].selected = (ev.characters || []).indexOf(charSel.options[j].value) !== -1;
  }

  // Plots
  var plotSel = document.getElementById('tlEditPlots');
  for (var k = 0; k < plotSel.options.length; k++) {
    plotSel.options[k].selected = (ev.linkedPlots || []).indexOf(plotSel.options[k].value) !== -1;
  }

  document.getElementById('tlDetailPanel').classList.remove('hidden');
  swRenderTimeline();
}

function tlNewEvent() {
  var proj = swGetProject();
  if (!proj) { showToast('请先选择作品'); return; }
  var title = prompt('事件标题：', '新事件');
  if (!title) return;
  var now = new Date().toISOString();
  var ev = {
    id: uid(), title: title, description: '', storyTime: '', duration: '',
    characters: [], linkedPlots: [], notes: '', uncertain: false,
    constraints: [], createdAt: now, updatedAt: now
  };
  proj.timelineEvents.push(ev);
  swSaveData();
  tlSelectedId = ev.id;
  swRenderTimeline();
  tlSelectEvent(ev.id);
  showToast('时间线事件已创建');
}

function tlSaveEvent() {
  if (!tlSelectedId) return;
  var proj = swGetProject();
  if (!proj) return;
  var ev = null;
  for (var i = 0; i < proj.timelineEvents.length; i++) {
    if (proj.timelineEvents[i].id === tlSelectedId) { ev = proj.timelineEvents[i]; break; }
  }
  if (!ev) return;

  ev.title = document.getElementById('tlEditTitle').value || '未命名';
  ev.description = document.getElementById('tlEditDesc').value || '';
  ev.storyTime = document.getElementById('tlEditTime').value || '';
  ev.duration = document.getElementById('tlEditDuration').value || '';
  ev.notes = document.getElementById('tlEditNote').value || '';
  ev.uncertain = document.getElementById('tlUncertain').checked;

  var charSel = document.getElementById('tlEditChars');
  ev.characters = [];
  for (var j = 0; j < charSel.options.length; j++) {
    if (charSel.options[j].selected) ev.characters.push(charSel.options[j].value);
  }

  var plotSel = document.getElementById('tlEditPlots');
  ev.linkedPlots = [];
  for (var k = 0; k < plotSel.options.length; k++) {
    if (plotSel.options[k].selected) ev.linkedPlots.push(plotSel.options[k].value);
  }

  var constraintsStr = (document.getElementById('tlEditConstraints').value || '').trim();
  ev.constraints = constraintsStr ? constraintsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];

  ev.updatedAt = new Date().toISOString();
  swSaveData();
  swRenderTimeline();
  showToast('时间线事件已保存');

  // Conflict check
  tlCheckConflicts();
}

function tlDeleteEvent(id) {
  var proj = swGetProject();
  if (!proj) return;
  var ev = null;
  for (var i = 0; i < proj.timelineEvents.length; i++) {
    if (proj.timelineEvents[i].id === id) { ev = proj.timelineEvents[i]; break; }
  }
  if (!ev) return;
  confirmDialog('确定删除事件「' + ev.title + '」吗？').then(function(ok) {
    if (!ok) return;
    proj.timelineEvents = proj.timelineEvents.filter(function(e) { return e.id !== id; });
    if (tlSelectedId === id) tlSelectedId = null;
    swSaveData();
    document.getElementById('tlDetailPanel').classList.add('hidden');
    swRenderTimeline();
    showToast('事件已删除');
  });
}

function tlCheckConflicts() {
  var proj = swGetProject();
  if (!proj) return;
  var events = proj.timelineEvents.filter(function(e) { return !e.uncertain; });
  var warnings = [];
  for (var i = 0; i < events.length; i++) {
    for (var j = i + 1; j < events.length; j++) {
      if (events[i].storyTime === events[j].storyTime && events[i].storyTime) {
        // Check if they share characters
        var chars1 = events[i].characters || [];
        var chars2 = events[j].characters || [];
        var shared = false;
        for (var ci = 0; ci < chars1.length; ci++) {
          if (chars2.indexOf(chars1[ci]) !== -1) { shared = true; break; }
        }
        if (shared && events[i].duration && events[j].duration) {
          warnings.push('"' + events[i].title + '" 和 "' + events[j].title + '" 同一时间发生且有共同参与人物。');
        }
      }
    }
  }
  if (warnings.length > 0) {
    showToast('时间线冲突提醒：' + warnings.join(' '));
  }
}

// ==============================
//  导出
// ==============================
function swExportProject() {
  var proj = swGetProject();
  if (!proj) { showToast('请先选择作品'); return; }
  var json = JSON.stringify(proj, null, 2);
  var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '作品_' + (proj.name || '导出') + '_' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('作品已导出');
}

function swExportAll() {
  return {
    projects: swData.projects,
    layout: swLayout
  };
}

// ==============================
//  进入视图时调用
// ==============================
function swOnViewEnter() {
  swRenderProjectSelect();
  var proj = swGetProject();
  if (proj) {
    document.getElementById('swMain').style.display = 'block';
    document.getElementById('swEmpty').style.display = 'none';
    document.getElementById('swTopbarActions').style.display = 'flex';
    document.getElementById('swBtnEditProject').style.display = 'inline-flex';
    document.getElementById('swBtnDelProject').style.display = 'inline-flex';
    document.getElementById('swProjectStatus').textContent = proj.status;
    swRefreshAllPanels();
  } else {
    document.getElementById('swMain').style.display = 'none';
    document.getElementById('swEmpty').style.display = 'block';
    document.getElementById('swTopbarActions').style.display = 'none';
    document.getElementById('swBtnEditProject').style.display = 'none';
    document.getElementById('swBtnDelProject').style.display = 'none';
  }
}

// ==============================
//  事件监听设置
// ==============================
function setupAllEventListeners() {
  // Project management
  var projSelect = document.getElementById('swProjectSelect');
  if (projSelect) projSelect.addEventListener('change', swOnProjectSelect);

  var btnNewProj = document.getElementById('swBtnNewProject');
  if (btnNewProj) btnNewProj.addEventListener('click', function() {
    var name = prompt('作品名称：', '新作品');
    if (!name) return;
    var proj = swCreateProject(name.trim(), '');
    swCurrentProjectId = proj.id;
    swRenderProjectSelect();
    var sel = document.getElementById('swProjectSelect');
    sel.value = proj.id;
    swOnViewEnter();
    showToast('作品已创建');
  });

  var btnEditProj = document.getElementById('swBtnEditProject');
  if (btnEditProj) btnEditProj.addEventListener('click', function() {
    var proj = swGetProject();
    if (!proj) return;
    var name = prompt('作品名称：', proj.name);
    if (name === null) return;
    var status = prompt('作品状态 (构思中/写作中/已完成)：', proj.status);
    if (status === null) return;
    var desc = prompt('作品描述（可选）：', proj.description || '');
    if (desc === null) return;
    swEditProject(proj.id, { name: name.trim(), status: status, description: desc });
    swRenderProjectSelect();
    swOnViewEnter();
    showToast('作品信息已更新');
  });

  var btnDelProj = document.getElementById('swBtnDelProject');
  if (btnDelProj) btnDelProj.addEventListener('click', function() {
    if (swCurrentProjectId) swDeleteProject(swCurrentProjectId);
  });

  var btnCreateFirst = document.getElementById('swBtnCreateFirst');
  if (btnCreateFirst) btnCreateFirst.addEventListener('click', function() {
    var name = prompt('作品名称：', '我的第一部作品');
    if (!name) return;
    var proj = swCreateProject(name.trim(), '');
    swCurrentProjectId = proj.id;
    swRenderProjectSelect();
    var sel = document.getElementById('swProjectSelect');
    sel.value = proj.id;
    swOnViewEnter();
    showToast('欢迎来到故事工坊！');
  });

  var btnExportStory = document.getElementById('swBtnExportStory');
  if (btnExportStory) btnExportStory.addEventListener('click', swExportProject);

  // Tab switching
  var tabLinks = document.querySelectorAll('.sw-tab');
  for (var t = 0; t < tabLinks.length; t++) {
    tabLinks[t].addEventListener('click', function(e) {
      e.preventDefault();
      swSwitchTab(this.getAttribute('data-swt'));
    });
  }

  // Inspiration
  var btnQuickSave = document.getElementById('btnInspQuickSave');
  if (btnQuickSave) btnQuickSave.addEventListener('click', swQuickAddInspiration);

  var inspInput = document.getElementById('inspQuickInput');
  if (inspInput) inspInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      swQuickAddInspiration();
    }
  });

  var inspSearch = document.getElementById('inspSearch');
  if (inspSearch) inspSearch.addEventListener('input', swRenderInspirations);

  var inspFilterType = document.getElementById('inspFilterType');
  if (inspFilterType) inspFilterType.addEventListener('change', swRenderInspirations);

  var inspFilterStatus = document.getElementById('inspFilterStatus');
  if (inspFilterStatus) inspFilterStatus.addEventListener('change', swRenderInspirations);

  // Mind map buttons
  var mmBtnAddRoot = document.getElementById('mmBtnAddRoot');
  if (mmBtnAddRoot) mmBtnAddRoot.addEventListener('click', mmAddRoot);

  var mmBtnAddChild = document.getElementById('mmBtnAddChild');
  if (mmBtnAddChild) mmBtnAddChild.addEventListener('click', mmAddChild);

  var mmBtnEdit = document.getElementById('mmBtnEditNode');
  if (mmBtnEdit) mmBtnEdit.addEventListener('click', function() {
    if (mmSelectedNodeId) mmEditNode(mmSelectedNodeId);
  });

  var mmBtnDelete = document.getElementById('mmBtnDeleteNode');
  if (mmBtnDelete) mmBtnDelete.addEventListener('click', function() {
    if (mmSelectedNodeId) mmDeleteNode(mmSelectedNodeId);
  });

  var mmBtnFit = document.getElementById('mmBtnFit');
  if (mmBtnFit) mmBtnFit.addEventListener('click', function() {
    mmAutoLayout();
    swRenderMindmap();
    showToast('布局已重新计算');
  });

  var mmBtnCenter = document.getElementById('mmBtnCenter');
  if (mmBtnCenter) mmBtnCenter.addEventListener('click', function() {
    mmPanX = 0;
    mmPanY = 0;
    mmScale = 1;
    swRenderMindmap();
  });

  var mmBtnExportPng = document.getElementById('mmBtnExportPng');
  if (mmBtnExportPng) mmBtnExportPng.addEventListener('click', mmExportPng);

  var mmBtnSave = document.getElementById('mmBtnSaveNode');
  if (mmBtnSave) mmBtnSave.addEventListener('click', mmSaveNode);

  var mmBtnConvPlot = document.getElementById('mmBtnConvertPlot');
  if (mmBtnConvPlot) mmBtnConvPlot.addEventListener('click', function() {
    if (mmSelectedNodeId) mmConvertToPlot(mmSelectedNodeId);
  });

  var mmBtnConvOutline = document.getElementById('mmBtnConvertOutline');
  if (mmBtnConvOutline) mmBtnConvOutline.addEventListener('click', function() {
    if (mmSelectedNodeId) mmConvertToOutline(mmSelectedNodeId);
  });

  var mmBtnLinkInsp = document.getElementById('mmBtnLinkInsp');
  if (mmBtnLinkInsp) mmBtnLinkInsp.addEventListener('click', function() {
    if (mmSelectedNodeId) mmLinkInspiration(mmSelectedNodeId);
  });

  // Outline buttons
  var olBtnAddRoot = document.getElementById('olBtnAddRoot');
  if (olBtnAddRoot) olBtnAddRoot.addEventListener('click', function() { olAddNode(null, 'chapter'); });

  var olBtnAddChild = document.getElementById('olBtnAddChild');
  if (olBtnAddChild) olBtnAddChild.addEventListener('click', function() {
    if (olSelectedId) olAddNode(olSelectedId, 'scene');
  });

  var olBtnAddSibling = document.getElementById('olBtnAddSibling');
  if (olBtnAddSibling) olBtnAddSibling.addEventListener('click', function() {
    if (!olSelectedId) return;
    var proj = swGetProject();
    if (!proj) return;
    var node = null;
    for (var i = 0; i < proj.outlineNodes.length; i++) {
      if (proj.outlineNodes[i].id === olSelectedId) { node = proj.outlineNodes[i]; break; }
    }
    if (!node) return;
    olAddNode(node.parentId, 'scene');
  });

  var olBtnEdit = document.getElementById('olBtnEdit');
  if (olBtnEdit) olBtnEdit.addEventListener('click', function() {
    if (olSelectedId) olEditNode(olSelectedId);
  });

  var olBtnDelete = document.getElementById('olBtnDelete');
  if (olBtnDelete) olBtnDelete.addEventListener('click', function() {
    if (olSelectedId) olDeleteNode(olSelectedId);
  });

  var olBtnCopy = document.getElementById('olBtnCopy');
  if (olBtnCopy) olBtnCopy.addEventListener('click', function() {
    if (olSelectedId) olCopySubtree(olSelectedId);
  });

  var olBtnSave = document.getElementById('olBtnSave');
  if (olBtnSave) olBtnSave.addEventListener('click', olSaveNode);

  var olSearch = document.getElementById('olSearch');
  if (olSearch) olSearch.addEventListener('input', swRenderOutline);

  var olFilterStatus = document.getElementById('olFilterStatus');
  if (olFilterStatus) olFilterStatus.addEventListener('change', swRenderOutline);

  var olBtnLinkPlot = document.getElementById('olBtnLinkPlot');
  if (olBtnLinkPlot) olBtnLinkPlot.addEventListener('click', function() {
    if (!olSelectedId) return;
    var proj = swGetProject();
    if (!proj) return;
    if (proj.plotCards.length === 0) { showToast('还没有情节卡片'); return; }
    var msg = '选择要关联的情节卡片：\n';
    for (var j = 0; j < proj.plotCards.length; j++) {
      msg += (j + 1) + '. ' + proj.plotCards[j].title + '\n';
    }
    var choice = prompt(msg + '\n输入序号：', '');
    if (!choice) return;
    var idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= proj.plotCards.length) { showToast('无效选择'); return; }
    var node = null;
    for (var i = 0; i < proj.outlineNodes.length; i++) {
      if (proj.outlineNodes[i].id === olSelectedId) { node = proj.outlineNodes[i]; break; }
    }
    if (!node) return;
    if (node.linkedPlots.indexOf(proj.plotCards[idx].id) === -1) {
      node.linkedPlots.push(proj.plotCards[idx].id);
    }
    node.updatedAt = new Date().toISOString();
    swSaveData();
    showToast('已关联情节：' + proj.plotCards[idx].title);
  });

  var olBtnLinkChar = document.getElementById('olBtnLinkChar');
  if (olBtnLinkChar) olBtnLinkChar.addEventListener('click', function() {
    if (!olSelectedId) return;
    var proj = swGetProject();
    if (!proj) return;
    if (proj.characters.length === 0) { showToast('还没有人物档案'); return; }
    var msg = '选择要关联的人物：\n';
    for (var j = 0; j < proj.characters.length; j++) {
      msg += (j + 1) + '. ' + proj.characters[j].name + '\n';
    }
    var choice = prompt(msg + '\n输入序号：', '');
    if (!choice) return;
    var idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= proj.characters.length) { showToast('无效选择'); return; }
    var node = null;
    for (var i = 0; i < proj.outlineNodes.length; i++) {
      if (proj.outlineNodes[i].id === olSelectedId) { node = proj.outlineNodes[i]; break; }
    }
    if (!node) return;
    if (node.linkedCharacters.indexOf(proj.characters[idx].id) === -1) {
      node.linkedCharacters.push(proj.characters[idx].id);
    }
    node.updatedAt = new Date().toISOString();
    swSaveData();
    showToast('已关联人物：' + proj.characters[idx].name);
  });

  // Plot cards
  var pcBtnNew = document.getElementById('pcBtnNew');
  if (pcBtnNew) pcBtnNew.addEventListener('click', pcNewCard);

  var pcSearch = document.getElementById('pcSearch');
  if (pcSearch) pcSearch.addEventListener('input', swRenderPlotCards);

  var pcFilterStatus = document.getElementById('pcFilterStatus');
  if (pcFilterStatus) pcFilterStatus.addEventListener('change', swRenderPlotCards);

  var pcGroupBy = document.getElementById('pcGroupBy');
  if (pcGroupBy) pcGroupBy.addEventListener('change', swRenderPlotCards);

  var pcBtnSave = document.getElementById('pcBtnSave');
  if (pcBtnSave) pcBtnSave.addEventListener('click', pcSaveCard);

  var pcBtnDelete = document.getElementById('pcBtnDelete');
  if (pcBtnDelete) pcBtnDelete.addEventListener('click', function() {
    if (pcSelectedId) pcDeleteCard(pcSelectedId);
  });

  var pcBtnLinkOutline = document.getElementById('pcBtnLinkOutline');
  if (pcBtnLinkOutline) pcBtnLinkOutline.addEventListener('click', function() {
    if (pcSelectedId) pcLinkToOutline(pcSelectedId);
  });

  // Characters
  var chBtnNew = document.getElementById('chBtnNew');
  if (chBtnNew) chBtnNew.addEventListener('click', chNew);

  var chSearch = document.getElementById('chSearch');
  if (chSearch) chSearch.addEventListener('input', swRenderCharacters);

  var chBtnSave = document.getElementById('chBtnSave');
  if (chBtnSave) chBtnSave.addEventListener('click', chSave);

  var chBtnDelete = document.getElementById('chBtnDelete');
  if (chBtnDelete) chBtnDelete.addEventListener('click', function() {
    if (chSelectedId) chDelete(chSelectedId);
  });

  var chBtnAddRel = document.getElementById('chBtnAddRel');
  if (chBtnAddRel) chBtnAddRel.addEventListener('click', function() {
    chEditedRelId = null;
    document.getElementById('chBtnDelRel').style.display = 'none';
    chEditRelation(null);
  });

  var chBtnSaveRel = document.getElementById('chBtnSaveRel');
  if (chBtnSaveRel) chBtnSaveRel.addEventListener('click', chSaveRelation);

  var chBtnDelRel = document.getElementById('chBtnDelRel');
  if (chBtnDelRel) chBtnDelRel.addEventListener('click', function() {
    if (chEditedRelId) chDeleteRelation(chEditedRelId);
  });

  // Timeline
  var tlBtnNew = document.getElementById('tlBtnNew');
  if (tlBtnNew) tlBtnNew.addEventListener('click', tlNewEvent);

  var tlFilterChar = document.getElementById('tlFilterChar');
  if (tlFilterChar) tlFilterChar.addEventListener('change', swRenderTimeline);

  var tlBtnSave = document.getElementById('tlBtnSave');
  if (tlBtnSave) tlBtnSave.addEventListener('click', tlSaveEvent);

  var tlBtnDelete = document.getElementById('tlBtnDelete');
  if (tlBtnDelete) tlBtnDelete.addEventListener('click', function() {
    if (tlSelectedId) tlDeleteEvent(tlSelectedId);
  });
}

// ==============================
//  初始化
// ==============================
function swInit() {
  swRenderProjectSelect();
}

document.addEventListener('DOMContentLoaded', function() {
  swInit();
  setupAllEventListeners();
});