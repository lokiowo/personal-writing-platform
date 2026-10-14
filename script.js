/* ============================================================
   我的小小世界 — 脚本
   ============================================================ */

// ==============================
//  工具函数
// ==============================

/** 获取今日日期字符串 YYYY-MM-DD（本地时间） */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** 生成唯一 ID */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/** 统计中文字数 + 英文单词数 */
function countWords(text) {
  if (!text) return 0;
  // 中文：每个汉字计 1 字
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  // 英文单词
  const words = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  // 其他非空白非标点字符
  const other = (text.match(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s.,!?;:'"()\[\]{}，。！？；：""''（）、【】《》…—\-\/\\@#$%^&*+=~`|<>]/g) || []).length;
  return cjk + words + other;
}

/** 将富文本 HTML 转为纯文本（用于字数统计与导出） */
function htmlToText(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.innerText || div.textContent || '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return y + '-' + m + '-' + day + ' ' + h + ':' + min;
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(function () { el.remove(); }, 2500);
}

// ==============================
//  确认对话框
// ==============================
function confirmDialog(msg) {
  return new Promise(function (resolve) {
    var overlay = document.getElementById('modalOverlay');
    document.getElementById('modalMsg').textContent = msg;
    overlay.classList.remove('hidden');

    function cleanup() {
      overlay.classList.add('hidden');
      document.getElementById('modalCancel').removeEventListener('click', onCancel);
      document.getElementById('modalConfirm').removeEventListener('click', onConfirm);
    }
    function onCancel() { cleanup(); resolve(false); }
    function onConfirm() { cleanup(); resolve(true); }

    document.getElementById('modalCancel').addEventListener('click', onCancel);
    document.getElementById('modalConfirm').addEventListener('click', onConfirm);
  });
}

// ==============================
//  localStorage 读写
// ==============================
function loadData(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('读取 ' + key + ' 失败:', e);
    return fallback;
  }
}

function saveData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('保存 ' + key + ' 失败:', e);
    showToast('保存失败，可能存储空间不足');
  }
}

// ==============================
//  全局数据
// ==============================
var articles = loadData('pw_articles', []);
var writingRecords = loadData('pw_writing_records', {});   // { "YYYY-MM-DD": 字数 }
var checkInRecords = loadData('pw_checkin_records', {});    // { "YYYY-MM-DD": true }
var settings = loadData('pw_settings', { dailyGoal: 2000 });
var pointsData = loadData('pw_points', { total: 0, redeemed: [] }); // { total, redeemed: ["giftName", ...] }

var currentArticleId = null;       // 当前正在编辑的文章 ID
var currentChapterIdx = 0;         // 当前章节索引
var wordCountBeforeEdit = 0;       // 开始编辑时的字数，用于追踪增量
var lastSavedContent = '';         // 上次保存的内容快照
var saveTimer = null;              // 自动保存定时器

// ==============================
//  导航系统
// ==============================
function switchView(viewName) {
  // 离开编辑器前，先保存尚未自动保存的内容，避免切换视图时丢失
  var prev = document.querySelector('.view.active');
  if (prev && prev.id === 'view-editor' && viewName !== 'editor') {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (currentArticleId) autoSave();
  }

  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  var target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-links a').forEach(function (a) { a.classList.remove('active'); });
  var link = document.querySelector('.nav-links a[data-view="' + viewName + '"]');
  if (link) link.classList.add('active');

  // 关闭移动端菜单
  document.getElementById('navLinks').classList.remove('open');

  // 页面渲染
  if (viewName === 'home') renderHome();
  if (viewName === 'editor') renderEditor();
  if (viewName === 'story') { if (typeof swOnViewEnter === 'function') swOnViewEnter(); }
  if (viewName === 'checkin') renderCheckin();
  if (viewName === 'stats') renderStats();
}

// 导航点击事件
document.querySelectorAll('[data-view]').forEach(function (el) {
  el.addEventListener('click', function (e) {
    e.preventDefault();
    var viewName = el.getAttribute('data-view');
    switchView(viewName);

    // 首页快捷按钮中的「开始写作」还需要新建文章
    if (el.getAttribute('data-action') === 'new') {
      createNewArticle();
    }
  });
});

// 移动端菜单
document.getElementById('navToggle').addEventListener('click', function () {
  document.getElementById('navLinks').classList.toggle('open');
});

// ==============================
//  字数统计逻辑
// ==============================

/** 获取当天写作记录的字数 */
function getTodayWordCount() {
  return writingRecords[todayStr()] || 0;
}

/** 记录当天新增字数 */
function addTodayWords(delta) {
  if (delta <= 0) return;
  var today = todayStr();
  writingRecords[today] = (writingRecords[today] || 0) + delta;
  saveData('pw_writing_records', writingRecords);
}

/** 获取本月累计字数 */
function getMonthWordCount() {
  var d = new Date();
  var year = d.getFullYear();
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var prefix = year + '-' + month + '-';
  var total = 0;
  Object.keys(writingRecords).forEach(function (date) {
    if (date.startsWith(prefix)) {
      total += writingRecords[date];
    }
  });
  return total;
}

/** 获取累计总字数 */
function getTotalWordCount() {
  var total = 0;
  Object.keys(writingRecords).forEach(function (date) {
    total += writingRecords[date];
  });
  return total;
}

/** 获取文章全部章节的总字数 */
function getArticleWordCount(article) {
  if (!article) return 0;
  if (article.isSeries && article.chapters) {
    return article.chapters.reduce(function (sum, ch) { return sum + countWords(htmlToText(ch.content || '')); }, 0);
  }
  return countWords(htmlToText(article.content || ''));
}

/** 获取当前章节内容 */
function getCurrentChapterContent(article) {
  if (!article) return '';
  if (article.isSeries && article.chapters && article.chapters.length > 0) {
    var idx = Math.min(currentChapterIdx, article.chapters.length - 1);
    return article.chapters[idx].content || '';
  }
  return article.content || '';
}

/** 判断是否为系列文章 */
function isSeries(article) {
  return article && article.isSeries === true;
}

// ==============================
//  编辑器 —— 字数追踪
// ==============================

function startEditTracking(article) {
  // 记录开始编辑时的总字数
  wordCountBeforeEdit = getArticleWordCount(article);
  lastSavedContent = getCurrentChapterContent(article);
}

function recordEditDelta(article) {
  // 计算当前内容与上次保存内容的字数差
  var currentContent = getCurrentChapterContent(article);
  var currentWords = countWords(htmlToText(currentContent));
  var lastWords = countWords(htmlToText(lastSavedContent));

  // 只有当前字数超过之前记录时才计入新增
  var delta = currentWords - lastWords;
  if (delta > 0) {
    addTodayWords(delta);
  }
  // 更新快照
  lastSavedContent = currentContent;
}

// ==============================
//  编辑器核心
// ==============================

function createNewArticle() {
  // 新建前先保存当前文章
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (currentArticleId) {
    autoSave();
  }
  var article = {
    id: uid(),
    title: '未命名文章',
    content: '',
    isSeries: false,
    chapters: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  articles.unshift(article);
  saveArticles();
  selectArticle(article.id);
  switchView('editor');
  showToast('已创建新文章');
}

function saveArticles() {
  saveData('pw_articles', articles);
}

function selectArticle(id) {
  // 切换文章前先保存当前文章的待保存内容
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (currentArticleId && currentArticleId !== id) {
    autoSave();
  }
  currentArticleId = id;
  currentChapterIdx = 0;
  renderEditor();
}

function getArticleById(id) {
  return articles.find(function (a) { return a.id === id; }) || null;
}

function deleteArticle(id) {
  var article = getArticleById(id);
  if (!article) return;
  confirmDialog('确定要删除「' + article.title + '」吗？此操作不可恢复。').then(function (confirmed) {
    if (!confirmed) return;
    articles = articles.filter(function (a) { return a.id !== id; });
    saveArticles();
    if (currentArticleId === id) {
      currentArticleId = null;
    }
    renderEditor();
    renderStats();
    showToast('已删除');
  });
}

function renameArticle(id) {
  var article = getArticleById(id);
  if (!article) return;
  var newTitle = prompt('请输入新标题：', article.title);
  if (newTitle && newTitle.trim()) {
    article.title = newTitle.trim();
    article.updatedAt = new Date().toISOString();
    saveArticles();
    renderEditor();
    showToast('已重命名');
  }
}

function exportTxt(article) {
  if (!article) return;
  var text = '';
  if (article.isSeries && article.chapters) {
    article.chapters.forEach(function (ch, i) {
      text += '第' + (i + 1) + '章 ' + ch.title + '\n\n' + htmlToText(ch.content) + '\n\n';
    });
  } else {
    text = article.title + '\n\n' + htmlToText(article.content);
  }
  var blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (article.title || '导出') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('已导出 TXT');
}

// ---- 章节操作 ----
function addChapter(articleId) {
  var article = getArticleById(articleId);
  if (!article) return;
  if (!article.isSeries) {
    // 将现有内容转为章节
    article.isSeries = true;
    article.chapters = [{ title: '第1章', content: article.content || '' }];
    article.content = '';
    currentChapterIdx = 0;
  }
  var chNum = article.chapters.length + 1;
  article.chapters.push({ title: '第' + chNum + '章', content: '' });
  currentChapterIdx = article.chapters.length - 1;
  article.updatedAt = new Date().toISOString();
  saveArticles();
  renderEditor();
}

function deleteChapter(articleId, chIdx) {
  var article = getArticleById(articleId);
  if (!article || !article.chapters) return;
  if (article.chapters.length <= 1) {
    showToast('至少保留一个章节');
    return;
  }
  confirmDialog('确定删除「' + article.chapters[chIdx].title + '」吗？').then(function (ok) {
    if (!ok) return;
    article.chapters.splice(chIdx, 1);
    if (currentChapterIdx >= article.chapters.length) {
      currentChapterIdx = article.chapters.length - 1;
    }
    article.updatedAt = new Date().toISOString();
    saveArticles();
    renderEditor();
  });
}

// ==============================
//  编辑器渲染
// ==============================
function renderEditor() {
  var article = getArticleById(currentArticleId);
  var listEl = document.getElementById('articleList');
  var sidebarHint = document.getElementById('sidebarHint');
  var editorEmpty = document.getElementById('editorEmpty');
  var editorWorkspace = document.getElementById('editorWorkspace');
  var searchTerm = (document.getElementById('articleSearch').value || '').toLowerCase();

  // 文章列表
  var filtered = articles;
  if (searchTerm) {
    filtered = articles.filter(function (a) { return a.title.toLowerCase().indexOf(searchTerm) !== -1; });
  }
  listEl.innerHTML = '';
  filtered.forEach(function (a) {
    var li = document.createElement('li');
    li.className = (a.id === currentArticleId) ? 'active' : '';
    li.setAttribute('data-article-id', a.id);
    li.innerHTML = '<span class="al-title">' + escapeHtml(a.title) + '</span><span class="al-count">' + getArticleWordCount(a) + '字</span>';
    li.addEventListener('click', function () { selectArticle(a.id); });
    listEl.appendChild(li);
  });

  if (filtered.length === 0) {
    sidebarHint.classList.remove('hidden');
  } else {
    sidebarHint.classList.add('hidden');
  }

  // 是否有选中的文章
  if (!article) {
    editorEmpty.classList.remove('hidden');
    editorWorkspace.classList.add('hidden');
    return;
  }

  editorEmpty.classList.add('hidden');
  editorWorkspace.classList.remove('hidden');

  // 初始化编辑追踪
  startEditTracking(article);

  // 标题
  document.getElementById('editorTitle').value = article.title;

  // 章节
  var chapterBar = document.getElementById('chapterBar');
  var chapterTabs = document.getElementById('chapterTabs');
  var addChapterBtn = document.getElementById('btnAddChapter');

  if (article.isSeries && article.chapters && article.chapters.length > 0) {
    chapterBar.style.display = 'flex';
    chapterTabs.innerHTML = '';
    article.chapters.forEach(function (ch, i) {
      var tab = document.createElement('span');
      tab.className = 'chapter-tab' + (i === currentChapterIdx ? ' active' : '');
      var titleText = ch.title || '第' + (i + 1) + '章';
      tab.innerHTML = escapeHtml(titleText) + (article.chapters.length > 1 ? '<span class="ch-del" data-idx="' + i + '">×</span>' : '');
      tab.querySelector('.ch-del') && tab.querySelector('.ch-del').addEventListener('click', function (e) {
        e.stopPropagation();
        deleteChapter(article.id, parseInt(this.getAttribute('data-idx')));
      });
      tab.addEventListener('click', function () {
        // 切换章节前先保存当前章节未保存的内容，避免丢失
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (currentArticleId) autoSave();
        currentChapterIdx = i;
        renderEditor();
      });
      chapterTabs.appendChild(tab);
    });
  } else {
    chapterBar.style.display = 'flex';
    chapterTabs.innerHTML = '<span class="chapter-tab active">正文</span>';
  }

  // 正文
  var content = getCurrentChapterContent(article);
  document.getElementById('editorContent').innerHTML = content;

  // 更新状态
  updateEditorStatus(article);

  // 同步工具栏按钮状态
  syncToolbarState();
}

function updateEditorStatus(article) {
  var el = document.getElementById('editorContent');
  var content = (el && (el.innerText || el.textContent)) || '';
  var wc = countWords(content);
  document.getElementById('editorWordCount').textContent = wc + ' 字';
  document.getElementById('editorLastModified').textContent = '修改于 ' + formatDate(article ? article.updatedAt : '');
}

// ==============================
//  编辑器事件
// ==============================

// 自动保存
function autoSave() {
  var article = getArticleById(currentArticleId);
  if (!article) return;

  var title = document.getElementById('editorTitle').value.trim();
  var content = document.getElementById('editorContent').innerHTML;

  article.title = title || '未命名文章';
  article.updatedAt = new Date().toISOString();

  if (article.isSeries && article.chapters && article.chapters.length > 0) {
    var idx = Math.min(currentChapterIdx, article.chapters.length - 1);
    article.chapters[idx].content = content;
  } else {
    article.content = content;
  }

  // 记录字数增量
  recordEditDelta(article);
  saveArticles();

  document.getElementById('editorSaveStatus').textContent = '已保存';
  updateEditorStatus(article);

  // 同步更新侧边栏列表中的对应条目
  updateSidebarItem(article);
}

/** 只更新侧边栏中指定文章条目，避免整体重渲染 */
function updateSidebarItem(article) {
  var items = document.querySelectorAll('.article-list li');
  items.forEach(function (li) {
    // 通过 data-id 属性匹配
    if (li.getAttribute('data-article-id') === article.id) {
      var titleEl = li.querySelector('.al-title');
      var countEl = li.querySelector('.al-count');
      if (titleEl) titleEl.textContent = article.title;
      if (countEl) countEl.textContent = getArticleWordCount(article) + '字';
    }
  });
}

function triggerAutoSave() {
  document.getElementById('editorSaveStatus').textContent = '正在保存...';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(autoSave, 800);
}

// 编辑区输入监听
document.getElementById('editorContent').addEventListener('input', function () {
  updateEditorStatus(getArticleById(currentArticleId));
  triggerAutoSave();
});

document.getElementById('editorTitle').addEventListener('input', function () {
  triggerAutoSave();
});

// 文章搜索
document.getElementById('articleSearch').addEventListener('input', function () {
  renderEditor();
});

// 按钮事件
document.getElementById('btnNewArticle').addEventListener('click', createNewArticle);
document.getElementById('btnDeleteArticle').addEventListener('click', function () {
  if (currentArticleId) deleteArticle(currentArticleId);
});
document.getElementById('btnRenameArticle').addEventListener('click', function () {
  if (currentArticleId) renameArticle(currentArticleId);
});
document.getElementById('btnExportTxt').addEventListener('click', function () {
  var article = getArticleById(currentArticleId);
  if (article) exportTxt(article);
});
document.getElementById('btnAddChapter').addEventListener('click', function () {
  if (currentArticleId) addChapter(currentArticleId);
});

// ==============================
//  字体样式（作用于选中文本，避免“牵一发而动全身”）
// ==============================
function setEditorStyle(cmd, value) {
  var editor = document.getElementById('editorContent');
  if (!editor) return;
  restoreEditorRange();
  editor.focus();

  if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline') {
    document.execCommand(cmd);
  } else if (cmd === 'fontName') {
    wrapSelectionWithStyle({ fontFamily: fontFamilyCss(value) });
  } else if (cmd === 'fontSize') {
    wrapSelectionWithStyle({ fontSize: value });
  }

  syncToolbarState();
  updateEditorStatus(getArticleById(currentArticleId));
  triggerAutoSave();
}

function fontFamilyCss(value) {
  var map = {
    'serif': "'Palatino Linotype', Palatino, 'Songti SC', 'SimSun', Georgia, serif",
    'sans-serif': "'Microsoft YaHei', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
    'monospace': "'Consolas', 'Courier New', 'SF Mono', monospace"
  };
  return map[value] || map.serif;
}

/** 用 span 包裹选中文本，实现局部字体 / 字号 */
function wrapSelectionWithStyle(styleObj) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    showToast('请先选中要修改的文字');
    return;
  }
  var range = sel.getRangeAt(0);
  var span = document.createElement('span');
  Object.keys(styleObj).forEach(function (k) { span.style[k] = styleObj[k]; });

  try {
    range.surroundContents(span);
  } catch (e) {
    // 选区跨越多个元素时，退化为提取再包裹
    var frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }

  // 重新选中结果，便于连续调整
  sel.removeAllRanges();
  var newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.addRange(newRange);
}

/** 根据当前光标/选区状态同步工具栏按钮高亮 */
function syncToolbarState() {
  try {
    setToolBtnActive('btnBold', document.queryCommandState('bold'));
    setToolBtnActive('btnItalic', document.queryCommandState('italic'));
    setToolBtnActive('btnUnderline', document.queryCommandState('underline'));
  } catch (e) { /* 忽略兼容性异常 */ }
}

function setToolBtnActive(id, on) {
  var el = document.getElementById(id);
  if (el) { if (on) el.classList.add('active'); else el.classList.remove('active'); }
}

function saveUserSettings() {
  saveData('pw_settings', settings);
}

// 字体样式按钮
document.getElementById('btnBold').addEventListener('click', function () {
  setEditorStyle('bold');
});
document.getElementById('btnItalic').addEventListener('click', function () {
  setEditorStyle('italic');
});
document.getElementById('btnUnderline').addEventListener('click', function () {
  setEditorStyle('underline');
});
document.getElementById('fontFamily').addEventListener('change', function () {
  setEditorStyle('fontName', this.value);
});
document.getElementById('fontSize').addEventListener('change', function () {
  setEditorStyle('fontSize', this.value);
});

// ==============================
//  记录 / 恢复编辑器选区（点击工具栏按钮不会丢失选中文本）
// ==============================
var savedEditorRange = null;

function saveEditorRange() {
  var editor = document.getElementById('editorContent');
  var sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    savedEditorRange = sel.getRangeAt(0).cloneRange();
  }
}

function restoreEditorRange() {
  var sel = window.getSelection();
  if (savedEditorRange) {
    sel.removeAllRanges();
    sel.addRange(savedEditorRange);
  }
}

// 光标移动时同步按钮状态，并记录选区
document.addEventListener('selectionchange', saveEditorRange);
['keyup', 'mouseup', 'click'].forEach(function (evt) {
  document.getElementById('editorContent').addEventListener(evt, syncToolbarState);
});

// 文章列表切换后刷新
var observer = new MutationObserver(function () { /* 无需额外操作 */ });

// ==============================
//  签到系统
// ==============================

function isCheckedInToday() {
  return checkInRecords[todayStr()] === true;
}

function getStreak() {
  var streak = 0;
  var d = new Date();
  // 从今天往回数
  while (true) {
    var dateStr = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    if (checkInRecords[dateStr]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
    // 安全上限
    if (streak > 1000) break;
  }
  return streak;
}

function getMonthCheckInCount(year, month) {
  var prefix = year + '-' + String(month + 1).padStart(2, '0') + '-';
  var count = 0;
  Object.keys(checkInRecords).forEach(function (date) {
    if (date.startsWith(prefix) && checkInRecords[date]) count++;
  });
  return count;
}

function doCheckin() {
  if (isCheckedInToday()) {
    showToast('今天已经签到过了~');
    return;
  }
  var today = todayStr();
  checkInRecords[today] = true;
  saveData('pw_checkin_records', checkInRecords);

  // 积分：基础10分 + 连续签到额外5分
  var currentStreak = getStreak();
  var bonusPoints = currentStreak > 1 ? 5 : 0;
  var earned = 10 + bonusPoints;
  pointsData.total += earned;
  savePoints();

  var msg = '签到成功！获得 ' + earned + ' 积分';
  if (currentStreak > 1) {
    msg += '（含连续签到额外 +5）';
  }
  showToast(msg);

  renderCheckin();
  renderHome();
}

function savePoints() {
  saveData('pw_points', pointsData);
}

// ==============================
//  签到页渲染
// ==============================
function renderCheckin() {
  var now = new Date();
  document.getElementById('checkinDate').textContent =
    now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';

  if (isCheckedInToday()) {
    document.getElementById('checkinStatus').textContent = '今天已签到，明天继续加油~';
    document.getElementById('btnCheckin').textContent = '已签到';
    document.getElementById('btnCheckin').disabled = true;
  } else {
    document.getElementById('checkinStatus').textContent = '';
    document.getElementById('btnCheckin').textContent = '签到打卡';
    document.getElementById('btnCheckin').disabled = false;
  }

  document.getElementById('checkinStreak').textContent = getStreak();
  document.getElementById('checkinMonthCount').textContent =
    getMonthCheckInCount(now.getFullYear(), now.getMonth());
  document.getElementById('checkinPoints').textContent = pointsData.total;

  renderCalendar(calendarYear, calendarMonth);
  renderGiftList();
}

// 签到按钮
document.getElementById('btnCheckin').addEventListener('click', doCheckin);
document.getElementById('btnHomeCheckin').addEventListener('click', function () {
  doCheckin();
});

// ==============================
//  日历组件
// ==============================
var calendarYear = new Date().getFullYear();
var calendarMonth = new Date().getMonth();

function renderCalendar(year, month) {
  document.getElementById('calMonth').textContent = year + '年 ' + (month + 1) + '月';
  var grid = document.getElementById('calendarGrid');
  var today = todayStr();

  var weekHeaders = ['日', '一', '二', '三', '四', '五', '六'];
  var html = '';
  weekHeaders.forEach(function (d) {
    html += '<div class="cal-day-header">' + d + '</div>';
  });

  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var daysInPrevMonth = new Date(year, month, 0).getDate();

  // 上月末尾
  for (var i = firstDay - 1; i >= 0; i--) {
    var d = daysInPrevMonth - i;
    html += '<div class="cal-day empty other-month">' + d + '</div>';
  }

  // 本月
  for (var day = 1; day <= daysInMonth; day++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var cls = 'cal-day';
    if (checkInRecords[dateStr]) cls += ' checked';
    if (dateStr === today) cls += ' today';
    html += '<div class="' + cls + '">' + day + '</div>';
  }

  // 补齐下月
  var remaining = 7 - (grid.children.length > 7 ? (firstDay + daysInMonth) % 7 : (firstDay + daysInMonth) % 7);
  if (remaining < 7 && remaining > 0) {
    for (var j = 1; j <= remaining; j++) {
      html += '<div class="cal-day empty other-month">' + j + '</div>';
    }
  }

  grid.innerHTML = html;
}

document.getElementById('calPrev').addEventListener('click', function () {
  if (calendarMonth === 0) {
    calendarMonth = 11;
    calendarYear--;
  } else {
    calendarMonth--;
  }
  renderCalendar(calendarYear, calendarMonth);
});

document.getElementById('calNext').addEventListener('click', function () {
  if (calendarMonth === 11) {
    calendarMonth = 0;
    calendarYear++;
  } else {
    calendarMonth++;
  }
  renderCalendar(calendarYear, calendarMonth);
});

// ==============================
//  积分奖励系统
// ==============================
var giftDefaults = [
  { id: uid(), name: '码字达人徽章', cost: 50, icon: '🏆', reveal: '恭喜获得「码字达人徽章」！你已把坚持练成了习惯，日复一日，笔耕不辍。' },
  { id: uid(), name: '一句喜欢的诗', cost: 100, icon: '📖', reveal: '「且将新火试新茶，诗酒趁年华。」—— 苏轼' },
  { id: uid(), name: '一片宁静的风景', cost: 200, icon: '🌿', reveal: '想象一片午后的森林，阳光穿过树叶洒在肩头。你值得这片刻的安宁。' },
  { id: uid(), name: '给自己的一封信', cost: 500, icon: '✨', reveal: '亲爱的自己：谢谢你一直以来的坚持。每一个字都没有白写，每一步都算数。' }
];
var gifts = loadData('pw_gifts', giftDefaults);

function saveGifts() {
  saveData('pw_gifts', gifts);
}

function findGift(id) {
  return gifts.find(function (g) { return g.id === id; }) || null;
}

function renderGiftList() {
  var container = document.getElementById('giftList');
  if (!container) return;

  if (gifts.length === 0) {
    container.innerHTML = '<p class="empty-hint">还没有礼物，点「管理礼物」添加一个吧。</p>';
    return;
  }

  container.innerHTML = gifts.map(function (g) {
    var redeemed = pointsData.redeemed.indexOf(g.name) !== -1;
    var cheap = pointsData.total < g.cost;
    var btnText = redeemed ? '已兑换' : (cheap ? '积分不足' : '兑换');
    var disabled = redeemed || cheap;
    return '<div class="gift-card' + (redeemed ? ' redeemed' : '') + '" data-gift-id="' + g.id + '">' +
      '<span class="gift-icon">' + escapeHtml(g.icon) + '</span>' +
      '<span class="gift-name">' + escapeHtml(g.name) + '</span>' +
      '<span class="gift-cost">' + g.cost + ' 积分</span>' +
      '<button class="btn btn-sm btn-primary gift-btn"' + (disabled ? ' disabled' : '') + '>' + btnText + '</button>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.gift-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = this.closest('.gift-card');
      if (card) redeemGift(card.getAttribute('data-gift-id'));
    });
  });
}

function redeemGift(id) {
  var gift = findGift(id);
  if (!gift) return;

  if (pointsData.redeemed.indexOf(gift.name) !== -1) {
    showToast('你已经兑换过这个礼物了~');
    return;
  }
  if (pointsData.total < gift.cost) {
    showToast('积分不足，继续加油写作和签到吧！');
    return;
  }

  pointsData.total -= gift.cost;
  pointsData.redeemed.push(gift.name);
  savePoints();

  document.getElementById('giftModalContent').innerHTML =
    '<div class="gift-reveal">' + escapeHtml(gift.icon) + '</div>' +
    '<div class="gift-text">' + escapeHtml(gift.reveal || gift.name) + '</div>';
  document.getElementById('giftModal').classList.remove('hidden');

  renderGiftList();
  renderCheckin();
  renderRedeemedGifts();
  showToast('兑换成功！');
}

document.getElementById('giftModalClose').addEventListener('click', function () {
  document.getElementById('giftModal').classList.add('hidden');
});

function renderRedeemedGifts() {
  var container = document.getElementById('redeemedList');
  if (pointsData.redeemed.length === 0) {
    container.innerHTML = '<p class="empty-hint">还没有兑换过礼物。</p>';
    return;
  }
  container.innerHTML = pointsData.redeemed.map(function (name) {
    var gift = gifts.find(function (g) { return g.name === name; });
    var icon = gift ? gift.icon : '🎁';
    return '<div style="display:inline-block;margin:4px 8px;font-size:0.9rem;">' + icon + ' ' + escapeHtml(name) + '</div>';
  }).join('');
}

// ==============================
//  礼物后台：自定义奖励
// ==============================
var gmEditingId = null;

function openGiftManage() {
  gmEditingId = null;
  resetGmForm();
  renderGiftManage();
  document.getElementById('giftManageModal').classList.remove('hidden');
}

function closeGiftManage() {
  document.getElementById('giftManageModal').classList.add('hidden');
  gmEditingId = null;
}

function resetGmForm() {
  document.getElementById('gmName').value = '';
  document.getElementById('gmIcon').value = '';
  document.getElementById('gmCost').value = '';
  document.getElementById('gmReveal').value = '';
  document.getElementById('gmTitle').textContent = '添加新礼物';
  document.getElementById('gmSave').textContent = '保存礼物';
}

function renderGiftManage() {
  var list = document.getElementById('gmList');
  if (gifts.length === 0) {
    list.innerHTML = '<p class="empty-hint">暂无礼物。</p>';
    return;
  }
  list.innerHTML = gifts.map(function (g) {
    return '<div class="gm-item" data-gift-id="' + g.id + '">' +
      '<span class="gm-item-icon">' + escapeHtml(g.icon) + '</span>' +
      '<span class="gm-item-info">' +
        '<strong>' + escapeHtml(g.name) + '</strong>' +
        '<em>' + g.cost + ' 积分</em>' +
      '</span>' +
      '<span class="gm-item-actions">' +
        '<button class="gm-btn gm-edit" data-id="' + g.id + '">编辑</button>' +
        '<button class="gm-btn gm-del" data-id="' + g.id + '">删除</button>' +
      '</span>' +
      '</div>';
  }).join('');

  list.querySelectorAll('.gm-edit').forEach(function (btn) {
    btn.addEventListener('click', function () { gmEdit(this.getAttribute('data-id')); });
  });
  list.querySelectorAll('.gm-del').forEach(function (btn) {
    btn.addEventListener('click', function () { gmDelete(this.getAttribute('data-id')); });
  });
}

function gmEdit(id) {
  var gift = findGift(id);
  if (!gift) return;
  gmEditingId = id;
  document.getElementById('gmName').value = gift.name;
  document.getElementById('gmIcon').value = gift.icon;
  document.getElementById('gmCost').value = gift.cost;
  document.getElementById('gmReveal').value = gift.reveal || '';
  document.getElementById('gmTitle').textContent = '编辑礼物';
  document.getElementById('gmSave').textContent = '保存修改';
}

function gmDelete(id) {
  var gift = findGift(id);
  if (!gift) return;
  confirmDialog('确定删除礼物「' + gift.name + '」吗？').then(function (ok) {
    if (!ok) return;
    gifts = gifts.filter(function (g) { return g.id !== id; });
    saveGifts();
    renderGiftManage();
    renderGiftList();
    renderRedeemedGifts();
    showToast('已删除');
  });
}

function gmSave() {
  var name = document.getElementById('gmName').value.trim();
  var icon = document.getElementById('gmIcon').value.trim() || '🎁';
  var cost = parseInt(document.getElementById('gmCost').value) || 0;
  var reveal = document.getElementById('gmReveal').value.trim();

  if (!name) { showToast('请填写礼物名称'); return; }
  if (cost <= 0) { showToast('请填写正确的积分数'); return; }

  if (gmEditingId) {
    var gift = findGift(gmEditingId);
    if (!gift) return;
    gift.name = name;
    gift.icon = icon;
    gift.cost = cost;
    gift.reveal = reveal;
    showToast('礼物已更新');
  } else {
    gifts.push({ id: uid(), name: name, icon: icon, cost: cost, reveal: reveal });
    showToast('礼物已添加');
  }

  saveGifts();
  gmEditingId = null;
  resetGmForm();
  renderGiftManage();
  renderGiftList();
  renderRedeemedGifts();
}

document.getElementById('btnManageGifts').addEventListener('click', openGiftManage);
document.getElementById('gmSave').addEventListener('click', gmSave);
document.getElementById('gmCancel').addEventListener('click', closeGiftManage);

// ==============================
//  首页渲染
// ==============================
function renderHome() {
  var now = new Date();
  var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  document.getElementById('heroDate').textContent =
    now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + weekDays[now.getDay()];

  var todayWords = getTodayWordCount();
  var monthWords = getMonthWordCount();
  var goal = settings.dailyGoal || 2000;
  var progress = Math.min(100, Math.round((todayWords / goal) * 100));

  document.getElementById('homeTodayWords').textContent = todayWords;
  document.getElementById('homeGoal').textContent = todayWords + ' / ' + goal;
  document.getElementById('homeStreak').textContent = getStreak();
  document.getElementById('homeMonthWords').textContent = monthWords;
  document.getElementById('homeProgress').style.width = progress + '%';
  document.getElementById('homeProgressText').textContent = progress + '%';

  // 最近文章
  var recentList = document.getElementById('homeRecentList');
  var sorted = articles.slice().sort(function (a, b) {
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  }).slice(0, 5);

  if (sorted.length === 0) {
    recentList.innerHTML = '<p class="empty-hint">还没有写过文章，去码字吧。</p>';
  } else {
    recentList.innerHTML = sorted.map(function (a) {
      var wc = getArticleWordCount(a);
      return '<div class="recent-item" data-article-id="' + a.id + '">' +
        '<span class="ri-title">' + escapeHtml(a.title) + '</span>' +
        '<span class="ri-meta">' + wc + '字 · ' + formatDate(a.updatedAt) + '</span></div>';
    }).join('');

    // 点击跳转到编辑
    recentList.querySelectorAll('.recent-item').forEach(function (item) {
      item.addEventListener('click', function () {
        selectArticle(this.getAttribute('data-article-id'));
        switchView('editor');
      });
    });
  }

  // 签到按钮状态
  var checkinBtn = document.getElementById('btnHomeCheckin');
  if (isCheckedInToday()) {
    checkinBtn.textContent = '已签到';
    checkinBtn.disabled = true;
  } else {
    checkinBtn.textContent = '今日签到';
    checkinBtn.disabled = false;
  }

  // 更新积分与礼物
  renderGiftList();
}

// ==============================
//  统计页渲染
// ==============================
function renderStats() {
  var goal = settings.dailyGoal || 2000;
  document.getElementById('dailyGoal').value = goal;

  document.getElementById('statToday').textContent = getTodayWordCount();
  document.getElementById('statMonth').textContent = getMonthWordCount();
  document.getElementById('statTotal').textContent = getTotalWordCount();
  document.getElementById('statArticles').textContent = articles.length;

  drawTrendChart();
  renderWorksTable();
}

// 目标保存
document.getElementById('btnSaveGoal').addEventListener('click', function () {
  var val = parseInt(document.getElementById('dailyGoal').value) || 2000;
  settings.dailyGoal = Math.max(100, val);
  saveUserSettings();
  showToast('目标已保存');
  renderStats();
  renderHome();
});

// ==============================
//  趋势图（SVG）
// ==============================
function drawTrendChart() {
  var svg = document.getElementById('trendChart');
  var data = [];
  var d = new Date();
  for (var i = 6; i >= 0; i--) {
    var date = new Date(d);
    date.setDate(date.getDate() - i);
    var dateStr = date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
    data.push({
      date: (date.getMonth() + 1) + '/' + date.getDate(),
      words: writingRecords[dateStr] || 0
    });
  }

  var maxWords = Math.max.apply(null, data.map(function (d) { return d.words; }).concat([1]));
  var w = 600, h = 200, padL = 40, padR = 20, padT = 20, padB = 40;
  var chartW = w - padL - padR, chartH = h - padT - padB;

  // 背景网格
  var gridHtml = '';
  for (var i = 0; i <= 4; i++) {
    var y = padT + (chartH / 4) * i;
    gridHtml += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y +
      '" stroke="#f0ebe0" stroke-width="1"/>';
    var label = Math.round(maxWords * (1 - i / 4));
    gridHtml += '<text x="' + (padL - 4) + '" y="' + (y + 4) +
      '" text-anchor="end" font-size="10" fill="#a099a8">' + label + '</text>';
  }

  // 折线路径
  var points = data.map(function (d, i) {
    var x = padL + (chartW / (data.length - 1 || 1)) * i;
    var y = padT + chartH - (d.words / maxWords) * chartH;
    return { x: x, y: y };
  });

  var linePath = points.map(function (p, i) {
    return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y;
  }).join(' ');

  // 填充区域
  var areaPath = linePath + ' L' + points[points.length - 1].x + ',' + (padT + chartH) +
    ' L' + points[0].x + ',' + (padT + chartH) + ' Z';

  var svgContent = gridHtml +
    '<path d="' + areaPath + '" fill="rgba(125,155,118,0.12)" stroke="none"/>' +
    '<path d="' + linePath + '" fill="none" stroke="#7d9b76" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

  // 数据点
  points.forEach(function (p) {
    svgContent += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="#7d9b76"/>';
  });

  // X 轴标签
  data.forEach(function (d, i) {
    var x = points[i].x;
    svgContent += '<text x="' + x + '" y="' + (h - 6) + '" text-anchor="middle" font-size="10" fill="#a099a8">' + d.date + '</text>';
  });

  svg.innerHTML = svgContent;
}

// ==============================
//  作品管理
// ==============================
function renderWorksTable() {
  var tbody = document.getElementById('worksTableBody');
  var sortBy = document.getElementById('worksSort').value;
  var emptyHint = document.getElementById('worksEmpty');

  if (articles.length === 0) {
    tbody.innerHTML = '';
    emptyHint.classList.remove('hidden');
    return;
  }
  emptyHint.classList.add('hidden');

  var sorted = articles.slice().sort(function (a, b) {
    if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh');
    if (sortBy === 'createdAt') return new Date(b.createdAt) - new Date(a.createdAt);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  tbody.innerHTML = sorted.map(function (a) {
    var wc = getArticleWordCount(a);
    var chapters = a.isSeries && a.chapters ? a.chapters.length : 1;
    return '<tr>' +
      '<td class="title-cell" title="' + escapeHtml(a.title) + '">' + escapeHtml(a.title) + '</td>' +
      '<td>' + wc + '</td>' +
      '<td>' + chapters + '</td>' +
      '<td>' + formatDate(a.createdAt) + '</td>' +
      '<td>' + formatDate(a.updatedAt) + '</td>' +
      '<td>' +
      '<button class="btn btn-sm btn-outline export-one" data-id="' + a.id + '">导出</button> ' +
      '<button class="btn btn-sm btn-outline edit-one" data-id="' + a.id + '">编辑</button> ' +
      '<button class="btn btn-sm btn-danger del-one" data-id="' + a.id + '">删除</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  // 事件绑定
  tbody.querySelectorAll('.export-one').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var article = getArticleById(this.getAttribute('data-id'));
      if (article) exportTxt(article);
    });
  });
  tbody.querySelectorAll('.edit-one').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectArticle(this.getAttribute('data-id'));
      switchView('editor');
    });
  });
  tbody.querySelectorAll('.del-one').forEach(function (btn) {
    btn.addEventListener('click', function () {
      deleteArticle(this.getAttribute('data-id'));
      renderStats();
    });
  });
}

document.getElementById('worksSort').addEventListener('change', function () {
  renderWorksTable();
});

// ==============================
//  JSON 备份 / 恢复
// ==============================
document.getElementById('btnExportAll').addEventListener('click', function () {
  var swBackup = typeof swExportAll === 'function' ? swExportAll() : null;
  var backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    articles: articles,
    writingRecords: writingRecords,
    checkInRecords: checkInRecords,
    settings: settings,
    points: pointsData,
    storyData: swBackup ? swBackup.projects : [],
    storyLayout: swBackup ? swBackup.layout : {}
  };
  var json = JSON.stringify(backup, null, 2);
  var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '写作备份_' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('备份已导出');
});

document.getElementById('btnImportBackup').addEventListener('click', function () {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if (!data || typeof data !== 'object') throw new Error('格式无效');
      if (!Array.isArray(data.articles)) throw new Error('缺少文章数据');

      confirmDialog(
        '即将导入备份数据，当前所有数据将被覆盖。\n\n' +
        '备份包含：' + data.articles.length + ' 篇文章' +
        (data.storyData && data.storyData.length ? '、' + data.storyData.length + ' 个故事作品' : '') + '\n' +
        '备份时间：' + formatDate(data.exportedAt) + '\n\n' +
        '确认继续吗？'
      ).then(function (ok) {
        if (!ok) return;
        articles = data.articles || [];
        writingRecords = data.writingRecords || {};
        checkInRecords = data.checkInRecords || {};
        settings = data.settings || { dailyGoal: 2000 };
        pointsData = data.points || { total: 0, redeemed: [] };

        saveArticles();
        saveData('pw_writing_records', writingRecords);
        saveData('pw_checkin_records', checkInRecords);
        saveUserSettings();
        savePoints();

        // Restore story data if available
        if (data.storyData) {
          saveData('pw_story_data', { projects: data.storyData });
          if (typeof swData !== 'undefined') swData = loadData('pw_story_data', { projects: [] });
        }
        if (data.storyLayout) {
          saveData('pw_story_layout', data.storyLayout);
          if (typeof swLayout !== 'undefined') swLayout = loadData('pw_story_layout', {});
        }

        currentArticleId = null;
        currentChapterIdx = 0;

        var currentView = document.querySelector('.view.active').id.replace('view-', '');
        switchView(currentView);
        showToast('数据已恢复');
      });
    } catch (err) {
      showToast('文件格式错误，无法导入');
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ==============================
//  XSS 防护
// ==============================
function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// ==============================
//  初始化
// ==============================
function init() {
  switchView('home');
  renderRedeemedGifts();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 页面关闭前保存
window.addEventListener('beforeunload', function () {
  if (saveTimer) {
    clearTimeout(saveTimer);
    autoSave();
  }
});

// 定期自动保存（每30秒）
setInterval(function () {
  if (currentArticleId && document.getElementById('editorContent')) {
    var current = document.getElementById('editorContent').innerHTML;
    var article = getArticleById(currentArticleId);
    if (article) {
      var saved = getCurrentChapterContent(article);
      if (current !== saved) {
        autoSave();
      }
    }
  }
}, 30000);

// ==============================
//  键盘快捷键
// ==============================
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    autoSave();
    showToast('已手动保存');
  }
});