/* app.js — 메인 앱 로직 (탭, To-do, Done, Today, 스와이프, 모달) */

/* ── 앱 상태 ─────────────────────────────────── */
const State = {
  tasks     : [],   // 전체 할 일 목록
  habitData : { habits: [], weekly_record: {} },
  calYear   : new Date().getFullYear(),
  calMonth  : new Date().getMonth() + 1, // 1-based
  editTaskId: null, // 편집 중인 task id
  doneFilter: 'all',
};

/* ── DOM 참조 ─────────────────────────────────── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── 앱 시작점 ───────────────────────────────── */
window.addEventListener('load', async () => {
  // 로딩 화면 표시
  showScreen('loading-screen');

  // 1) GAPI 초기화
  setStatus('Google API 초기화 중...');
  await Drive.initGapi();

  // 2) GIS 초기화
  Drive.initGis(
    async () => {
      setStatus('데이터 불러오는 중...');
      await loadData();
      showScreen('main-app');
      initUI();
    },
    (err) => {
      setStatus(`로그인 실패: ${err.error || '알 수 없는 오류'}`);
      $('btn-signin').style.display = 'block';
    }
  );

  // 3) 로그인 버튼
  $('btn-signin').addEventListener('click', () => Drive.signIn());

  setStatus('Google 로그인이 필요합니다');
  $('btn-signin').style.display = 'block';
});

function setStatus(msg) {
  $('loading-status').textContent = msg;
}

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ── 데이터 로드 ─────────────────────────────── */
async function loadData() {
  const { tasks: tasksMd, habits: habitsMd } = await Drive.pullFromDrive();

  State.tasks     = Parser.parseTasks(tasksMd);
  State.habitData = Parser.parseHabits(habitsMd);
  State.habitData = HabitManager.checkDayRollover(State.habitData);
}

/* ── UI 초기화 ───────────────────────────────── */
function initUI() {
  setupTabs();
  setupSyncButtons();
  setupToDoTab();
  setupDoneTab();
  setupHabitTab();
  setupTodayTab();
  setupModals();
  setupGlobalDeleteClose();

  renderTodo();
  renderDone();
  renderHabit();
  renderToday();
  startMidnightWatcher();
}

/* ── 자정 자동 리셋 타이머 ───────────────────── */
function startMidnightWatcher() {
  let _lastDate = Parser.todayStr();

  setInterval(async () => {
    const today = Parser.todayStr();
    if (today === _lastDate) return;
    _lastDate = today;

    State.habitData = HabitManager.checkDayRollover(State.habitData);
    renderHabit();
    drawHabitChart();

    try {
      const tasksMd  = Parser.serializeTasks(State.tasks);
      const habitsMd = Parser.serializeHabits(State.habitData);
      await Drive.pushToDrive(tasksMd, habitsMd);
    } catch (_) {}
  }, 60000);
}

/* ── 탭 전환 ─────────────────────────────────── */
function setupTabs() {
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach(b => b.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');

      if (btn.dataset.tab === 'habit') {
        requestAnimationFrame(() => drawHabitChart());
      }
    });
  });
}

/* ── Sync 버튼 ───────────────────────────────── */
function setupSyncButtons() {
  ['btn-sync', 'btn-sync-done'].forEach(id => {
    $(id)?.addEventListener('click', () => openSyncModal());
  });
}

/* ── To-do 탭 ────────────────────────────────── */
function setupToDoTab() {
  $('btn-add-task').addEventListener('click', () => openTaskModal(null));
  setupSelectFileModal();
}

function setupSelectFileModal() {
  const modal = $('modal-select-file');

  $('btn-select-file').addEventListener('click', () => {
    $('input-task-path').value     = localStorage.getItem('task_db_path')     || '';
    $('input-task-filename').value = localStorage.getItem('task_db_filename') || 'tasksdb.md';
    modal.classList.remove('hidden');
  });

  $('btn-close-select-file').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  $('btn-done-select-file').addEventListener('click', async () => {
    const path     = $('input-task-path').value.trim();
    const rawName  = $('input-task-filename').value.trim() || 'tasksdb.md';
    const filename = rawName.endsWith('.md') ? rawName : rawName + '.md';

    // 이전 파일 ID 캐시 제거 (새 파일을 Drive에서 다시 검색하도록)
    const oldFile = localStorage.getItem('task_db_filename') || 'tasksdb.md';
    localStorage.removeItem(`fid_${oldFile.replace('.md', '')}`);

    localStorage.setItem('task_db_path',     path);
    localStorage.setItem('task_db_filename', filename);

    modal.classList.add('hidden');
    showToast('파일 변경 중...');
    try {
      await loadData();
      renderTodo();
      renderDone();
      showToast(`"${filename}" 로드 완료 ✓`);
    } catch (e) {
      showToast('파일 로드 실패: ' + (e.message || '오류'));
    }
  });
}

function renderTodo() {
  const list   = $('todo-list');
  const active = State.tasks.filter(t => !t.done);
  list.innerHTML = '';

  if (active.length === 0) {
    list.innerHTML = '<li style="text-align:center;color:var(--text-muted);padding:32px;font-size:14px;">할 일이 없어요 🎉</li>';
    return;
  }

  active.forEach(task => {
    list.appendChild(makeTaskEl(task, false));
  });
}

/* ── Done 탭 ─────────────────────────────────── */
function setupDoneTab() {
  $('btn-filter').addEventListener('click', () => {
    $('filter-dropdown').classList.toggle('hidden');
  });

  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.doneFilter = btn.dataset.filter;
      $('filter-dropdown').classList.add('hidden');
      renderDone();
    });
  });

  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('#filter-dropdown') && !e.target.closest('#btn-filter')) {
      $('filter-dropdown').classList.add('hidden');
    }
  });
}

function renderDone() {
  const list = $('done-list');
  const done = State.tasks.filter(t => t.done);
  const filtered = filterByDate(done, State.doneFilter);
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = '<li style="text-align:center;color:var(--text-muted);padding:32px;font-size:14px;">완료된 항목이 없어요</li>';
    return;
  }

  filtered.forEach(task => {
    list.appendChild(makeTaskEl(task, true));
  });
}

function filterByDate(tasks, filter) {
  if (filter === 'all' || !filter) return tasks;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasks.filter(t => {
    if (!t.date) return filter === 'all';
    const d = Parser.parseDate(t.date);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);

    const diffDays = Math.round((d - today) / 86400000);
    const diffWeeks = Math.round(diffDays / 7);
    const diffMonths = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());

    switch (filter) {
      case 'today'      : return diffDays === 0;
      case 'next_day'   : return diffDays === 1;
      case 'next_week'  : return diffWeeks === 1 && diffDays >= 0;
      case 'next_month' : return diffMonths === 1;
      case 'next_year'  : return d.getFullYear() - today.getFullYear() === 1;
      case 'last_week'  : return diffWeeks === -1 && diffDays < 0;
      case 'last_month' : return diffMonths === -1;
      case 'last_year'  : return today.getFullYear() - d.getFullYear() === 1;
      default           : return true;
    }
  });
}

/* ── Task 요소 생성 ──────────────────────────── */
function makeTaskEl(task, isDone) {
  const li = document.createElement('li');
  li.className = 'task-item';
  li.dataset.id = task.id;

  // 체크 + 제목 행
  const row = document.createElement('div');
  row.className = 'task-row';

  const check = document.createElement('div');
  check.className = `task-check${isDone ? ' done' : ''}`;
  check.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTask(task.id);
  });

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  // 편집 (long press)
  let pressTimer = null;
  row.addEventListener('pointerdown', () => {
    pressTimer = setTimeout(() => { openTaskModal(task); li.classList.remove('open'); }, 600);
  });
  row.addEventListener('pointerup',   () => clearTimeout(pressTimer));
  row.addEventListener('pointermove', () => clearTimeout(pressTimer));

  // 탭 → 상세 + 삭제 버튼 토글
  row.addEventListener('click', (e) => {
    if (e.target.closest('.task-check')) return;
    $$('.task-item.open').forEach(el => { if (el !== li) el.classList.remove('open'); });
    li.classList.toggle('open');
  });

  row.appendChild(check);
  row.appendChild(title);

  // 상세 정보 + 삭제 버튼 (함께 펼쳐짐)
  const detail = document.createElement('div');
  detail.className = 'task-detail';

  const detailContent = document.createElement('div');
  detailContent.className = 'task-detail-content';
  if (task.date || task.time || task.pin || task.note) {
    detailContent.innerHTML = buildDetailHTML(task);
  }

  const delBtn = document.createElement('div');
  delBtn.className = 'task-delete-btn';
  delBtn.innerHTML = '🗑 삭제';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  detail.appendChild(detailContent);
  detail.appendChild(delBtn);
  li.appendChild(row);
  li.appendChild(detail);

  return li;
}

function buildDetailHTML(task) {
  const rows = [];
  if (task.date) rows.push(badge('Date', Parser.formatDateDisplay(task.date)));
  if (task.time) rows.push(badge('Time', task.time));
  if (task.pin)  rows.push(badge('Pin',  task.pin));
  if (task.note) rows.push(badge('Note', task.note));
  return rows.join('');
}

function badge(label, val) {
  return `<div class="task-detail-row">
    <span class="task-detail-badge">${label}</span>
    <span class="task-detail-val">${_escHtml(val)}</span>
  </div>`;
}

/* ── 탭으로 Habit 삭제 버튼 토글 ───────────────────── */
function setupTapDelete(row, li, itemSelector) {
  row.addEventListener('click', (e) => {
    if (e.target.closest('.habit-check'))      return;
    if (e.target.closest('.habit-name'))       return;
    if (e.target.closest('.habit-delete-btn')) return;

    const isOpen = li.classList.contains('show-delete');
    $$('.habit-item.show-delete').forEach(el => el.classList.remove('show-delete'));
    if (!isOpen) li.classList.add('show-delete');
  });
}

/* 화면 다른 곳 탭 시 닫기 */
function setupGlobalDeleteClose() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.task-item')) {
      $$('.task-item.open').forEach(el => el.classList.remove('open'));
    }
    if (!e.target.closest('.habit-item')) {
      $$('.habit-item.show-delete').forEach(el => el.classList.remove('show-delete'));
    }
  });
}

/* ── Task CRUD ───────────────────────────────── */
function toggleTask(id) {
  const task = State.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  renderTodo();
  renderDone();
  showToast(task.done ? '완료로 이동했어요 ✓' : '할 일로 돌아왔어요');
}

function deleteTask(id) {
  State.tasks = State.tasks.filter(t => t.id !== id);
  renderTodo();
  renderDone();
  renderToday();
  showToast('삭제했어요');
}

/* ── Task 모달 ───────────────────────────────── */
function openTaskModal(task) {
  State.editTaskId = task ? task.id : null;
  $('modal-task-title').textContent = task ? '할 일 편집' : '할 일 추가';
  $('task-input-title').value = task?.title ?? '';
  $('task-input-date').value  = task?.date  ?? '';
  $('task-input-time').value  = task?.time  ?? '';
  $('task-input-pin').value   = task?.pin   ?? '';
  $('task-input-note').value  = task?.note  ?? '';
  $('modal-task').classList.remove('hidden');
  $('task-input-title').focus();
}

function closeTaskModal() {
  $('modal-task').classList.add('hidden');
  State.editTaskId = null;
}

function saveTask() {
  const title = $('task-input-title').value.trim();
  if (!title) { showToast('할 일 제목을 입력해주세요'); return; }

  const payload = {
    title,
    date: $('task-input-date').value  || null,
    time: $('task-input-time').value.trim()  || null,
    pin : $('task-input-pin').value.trim()   || null,
    note: $('task-input-note').value.trim()  || null,
  };

  if (State.editTaskId) {
    const idx = State.tasks.findIndex(t => t.id === State.editTaskId);
    if (idx !== -1) Object.assign(State.tasks[idx], payload);
    showToast('수정했어요');
  } else {
    State.tasks.unshift({ id: Parser._uid ? Parser._uid() : Date.now().toString(), done: false, ...payload });
    showToast('추가했어요 ✓');
  }

  closeTaskModal();
  renderTodo();
  renderDone();
  renderToday();
}

/* ── Habit 탭 ────────────────────────────────── */
function setupHabitTab() {
  // graph view 버튼 → 차트 전체 토글
  $('btn-graph-view').addEventListener('click', () => {
    const container = $('week-chart-container');
    const btn       = $('btn-graph-view');
    const isCollapsed = container.classList.toggle('collapsed');
    btn.classList.toggle('active', !isCollapsed);
    if (!isCollapsed) {
      requestAnimationFrame(() => drawHabitChart());
    }
  });

  $('btn-add-habit').addEventListener('click', () => {
    $('habit-input-name').value = '';
    $('modal-habit').classList.remove('hidden');
    $('habit-input-name').focus();
  });

  $('btn-habit-add-item').addEventListener('click', addHabitFromInput);
  $('habit-input-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addHabitFromInput();
  });

  $('btn-habit-done').addEventListener('click', () => {
    $('modal-habit').classList.add('hidden');
  });
}

function addHabitFromInput() {
  const name = $('habit-input-name').value.trim();
  if (!name) return;
  State.habitData.habits.push({ id: Date.now().toString(), done: false, name });
  $('habit-input-name').value = '';
  renderHabit();
  showToast(`"${name}" 추가했어요`);
}

function renderHabit() {
  const list = $('habit-list');
  list.innerHTML = '';

  State.habitData.habits.forEach(habit => {
    list.appendChild(makeHabitEl(habit));
  });

  drawHabitChart();
}

function makeHabitEl(habit) {
  const li  = document.createElement('li');
  li.className = 'habit-item';
  li.dataset.id = habit.id;

  const row = document.createElement('div');
  row.className = 'habit-row';

  const check = document.createElement('div');
  check.className = `habit-check${habit.done ? ' done' : ''}`;
  check.addEventListener('click', () => {
    habit.done = !habit.done;
    check.className = `habit-check${habit.done ? ' done' : ''}`;
    drawHabitChart();
  });

  const name = document.createElement('span');
  name.className = 'habit-name';
  name.textContent = habit.name;

  const delBtn = document.createElement('div');
  delBtn.className = 'habit-delete-btn';
  delBtn.textContent = '🗑';
  delBtn.addEventListener('click', () => {
    State.habitData.habits = State.habitData.habits.filter(h => h.id !== habit.id);
    renderHabit();
    showToast('삭제했어요');
  });

  row.appendChild(check);
  row.appendChild(name);
  row.appendChild(delBtn);
  li.appendChild(row);

  setupTapDelete(row, li, '.habit-item');
  return li;
}

function drawHabitChart() {
  const canvas = $('week-chart');
  if (!canvas) return;
  HabitManager.drawChart(canvas, State.habitData);
}

/* ── Today 탭 ────────────────────────────────── */
function setupTodayTab() {
  $('cal-prev').addEventListener('click', () => {
    State.calMonth--;
    if (State.calMonth < 1) { State.calMonth = 12; State.calYear--; }
    renderCalendar();
  });
  $('cal-next').addEventListener('click', () => {
    State.calMonth++;
    if (State.calMonth > 12) { State.calMonth = 1; State.calYear++; }
    renderCalendar();
  });
}

function renderToday() {
  renderBrief();
  renderCalendar();
}

function renderBrief() {
  const today  = Parser.todayStr();
  const todayItems = State.tasks.filter(t => !t.done && t.date === today);
  const undone = State.tasks.filter(t => !t.done);

  const el = $('brief-content');
  const lines = [];

  if (todayItems.length > 0) {
    lines.push(`<p class="brief-item">• 오늘의 일정 (${todayItems.length})</p>`);
    todayItems.forEach(t => {
      lines.push(`<p class="brief-item indent">• ${_escHtml(t.title)}</p>`);
    });
  } else {
    lines.push(`<p class="brief-item" style="color:var(--text-muted)">오늘 마감 일정이 없어요</p>`);
  }

  if (undone.length > 0) {
    lines.push(`<p class="brief-item" style="margin-top:8px">• 미완료 항목 총 ${undone.length}개</p>`);
  }

  el.innerHTML = lines.join('');
}

async function renderCalendar() {
  const { calYear: y, calMonth: m } = State;
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  $('cal-month-label').textContent = `${MONTHS[m - 1]}`;

  // 공휴일 로드 (비동기, Drive 로그인 필요)
  try {
    await KoreanCalendar.preload(y, m);
  } catch (_) {}

  const firstDay   = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const today       = new Date();
  const todayStr    = Parser.todayStr();

  const grid = $('calendar-days');
  grid.innerHTML = '';

  // 이전 달 빈 칸
  for (let i = 0; i < firstDay; i++) {
    const prev = new Date(y, m - 1, -firstDay + i + 1);
    grid.appendChild(makeDayEl(prev, true));
  }

  // 이번 달
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m - 1, d);
    grid.appendChild(makeDayEl(date, false));
  }

  // 다음 달 빈 칸 (6주 채우기)
  const total = firstDay + daysInMonth;
  const remain = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remain; d++) {
    const next = new Date(y, m, d);
    grid.appendChild(makeDayEl(next, true));
  }
}

function makeDayEl(date, otherMonth) {
  const y   = date.getFullYear();
  const m   = String(date.getMonth() + 1).padStart(2, '0');
  const d   = String(date.getDate()).padStart(2, '0');
  const str = `${y}-${m}-${d}`;
  const dow = date.getDay();

  const cell = document.createElement('div');
  cell.className = 'cal-day';
  if (otherMonth)                          cell.classList.add('other-month');
  if (str === Parser.todayStr())           cell.classList.add('today');
  if (dow === 0)                           cell.classList.add('sunday');
  if (dow === 6)                           cell.classList.add('saturday');
  if (KoreanCalendar.isHoliday(str))      cell.classList.add('holiday');

  const num = document.createElement('span');
  num.className   = 'cal-day-num';
  num.textContent = date.getDate();
  num.title       = KoreanCalendar.getHolidayName(str) || '';

  cell.appendChild(num);
  return cell;
}

/* ── Sync 모달 ───────────────────────────────── */
function openSyncModal() {
  $('modal-sync').classList.remove('hidden');
}

function closeSyncModal() {
  $('modal-sync').classList.add('hidden');
}

async function syncPull() {
  closeSyncModal();
  showToast('Drive에서 불러오는 중...');
  try {
    await loadData();
    renderTodo();
    renderDone();
    renderHabit();
    renderToday();
    showToast('최신 내용을 불러왔어요 ✓');
  } catch (e) {
    showToast('불러오기 실패: ' + (e.message || '오류'));
  }
}

async function syncPush() {
  closeSyncModal();
  showToast('Drive에 저장 중...');
  try {
    const tasksMd  = Parser.serializeTasks(State.tasks);
    const habitsMd = Parser.serializeHabits(State.habitData);
    await Drive.pushToDrive(tasksMd, habitsMd);
    showToast('Drive에 저장했어요 ✓');
  } catch (e) {
    showToast('저장 실패: ' + (e.message || '오류'));
  }
}

/* ── 모달 공통 설정 ──────────────────────────── */
function setupModals() {
  // Task 모달
  $('btn-task-save').addEventListener('click', saveTask);
  $('btn-task-cancel').addEventListener('click', closeTaskModal);
  $('modal-task').querySelector('.modal-overlay')
    .addEventListener('click', closeTaskModal);
  $('task-input-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveTask();
  });

  // Habit 모달
  $('modal-habit').querySelector('.modal-overlay')
    .addEventListener('click', () => $('modal-habit').classList.add('hidden'));

  // Sync 모달
  $('modal-sync').querySelector('.modal-overlay')
    .addEventListener('click', closeSyncModal);
  $('btn-sync-cancel').addEventListener('click', closeSyncModal);
  $('btn-sync-pull').addEventListener('click', syncPull);
  $('btn-sync-push').addEventListener('click', syncPush);
}

/* ── Toast 알림 ──────────────────────────────── */
let _toastTimer = null;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ── 유틸 ────────────────────────────────────── */
function _escHtml(str) {
  return (str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
