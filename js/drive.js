/* drive.js — GitHub Gist API 연동 */

const Drive = {
  _onSuccess: null,
  _onError  : null,

  /* ── 초기화 ─────────────────────────────────── */

  async initGapi() {},

  initGis(onSuccess, onError) {
    this._onSuccess = onSuccess;
    this._onError   = onError;
    if (this.isAuthorized()) {
      onSuccess && onSuccess({});
    } else {
      onError && onError({ error: 'not_configured' });
    }
  },

  /* ── 로그인 / 로그아웃 ───────────────────────── */

  signIn() { this._showSettingsModal(); },

  signOut() {
    localStorage.removeItem('github_pat');
    localStorage.removeItem('github_gist_id');
  },

  isAuthorized() {
    return !!(localStorage.getItem('github_pat') && localStorage.getItem('github_gist_id'));
  },

  /* ── Sync: Pull (Gist → App) ────────────────── */

  async pullFromDrive() {
    const pat    = localStorage.getItem('github_pat');
    const gistId = localStorage.getItem('github_gist_id');
    const taskFile = localStorage.getItem('task_db_filename') || 'tasksdb.md';

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept'       : 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) throw new Error(`Gist 읽기 실패: ${res.status}`);

    const data = await res.json();
    return {
      tasks : data.files[taskFile]   ?.content ?? '',
      habits: data.files['habitdb.md']?.content ?? '## habits\n\n## weekly_record\n',
    };
  },

  /* ── Sync: Push (App → Gist) ────────────────── */

  async pushToDrive(tasksMd, habitsMd) {
    const pat    = localStorage.getItem('github_pat');
    const gistId = localStorage.getItem('github_gist_id');
    const taskFile = localStorage.getItem('task_db_filename') || 'tasksdb.md';

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method : 'PATCH',
      headers: {
        'Authorization': `token ${pat}`,
        'Accept'       : 'application/vnd.github.v3+json',
        'Content-Type' : 'application/json',
      },
      body: JSON.stringify({
        files: {
          [taskFile]    : { content: tasksMd  },
          'habitdb.md'  : { content: habitsMd },
        },
      }),
    });
    if (!res.ok) throw new Error(`Gist 쓰기 실패: ${res.status}`);
  },

  /* ── 설정 모달 ──────────────────────────────── */

  _showSettingsModal() {
    if (document.getElementById('gist-settings-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'gist-settings-modal';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.5)',
    ].join(';');

    overlay.innerHTML = `
      <div style="
        background:var(--bg, #fff);
        color:var(--text, #111);
        border-radius:16px;
        padding:28px 24px;
        width:calc(100% - 48px);
        max-width:360px;
        display:flex;
        flex-direction:column;
        gap:16px;
        box-shadow:0 8px 32px rgba(0,0,0,0.2);
      ">
        <h3 style="margin:0;font-size:18px;">GitHub Gist 연결</h3>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:13px;font-weight:600;">🔑 Personal Access Token</label>
          <input id="gist-input-pat" type="password" placeholder="ghp_..."
            style="
              padding:10px 12px;
              border:1px solid var(--border, #ddd);
              border-radius:8px;
              font-size:14px;
              background:var(--input-bg, #f5f5f5);
              color:var(--text, #111);
              outline:none;
            ">
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:13px;font-weight:600;">📁 Gist ID</label>
          <input id="gist-input-id" type="text" placeholder="abc123def456..."
            style="
              padding:10px 12px;
              border:1px solid var(--border, #ddd);
              border-radius:8px;
              font-size:14px;
              background:var(--input-bg, #f5f5f5);
              color:var(--text, #111);
              outline:none;
            ">
        </div>

        <div style="display:flex;gap:10px;">
          <button id="gist-btn-save" style="
            flex:1;
            padding:12px;
            border:none;
            border-radius:10px;
            background:var(--accent, #4f46e5);
            color:#fff;
            font-size:15px;
            font-weight:600;
            cursor:pointer;
          ">연결하기</button>
          <button id="gist-btn-cancel" style="
            padding:12px 18px;
            border:1px solid var(--border, #ddd);
            border-radius:10px;
            background:transparent;
            color:var(--text, #111);
            font-size:15px;
            cursor:pointer;
          ">취소</button>
        </div>

        <p id="gist-error-msg" style="margin:0;font-size:12px;color:#e53e3e;display:none;"></p>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('gist-btn-cancel').addEventListener('click', () => {
      this._hideSettingsModal();
    });

    document.getElementById('gist-btn-save').addEventListener('click', async () => {
      const pat    = document.getElementById('gist-input-pat').value.trim();
      const gistId = document.getElementById('gist-input-id').value.trim();
      const errEl  = document.getElementById('gist-error-msg');

      if (!pat || !gistId) {
        errEl.textContent = '두 항목 모두 입력해주세요.';
        errEl.style.display = 'block';
        return;
      }

      const saveBtn = document.getElementById('gist-btn-save');
      saveBtn.textContent = '확인 중...';
      saveBtn.disabled = true;

      try {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
          headers: {
            'Authorization': `token ${pat}`,
            'Accept'       : 'application/vnd.github.v3+json',
          },
        });
        if (!res.ok) throw new Error(`연결 실패 (${res.status})`);

        localStorage.setItem('github_pat', pat);
        localStorage.setItem('github_gist_id', gistId);
        this._hideSettingsModal();
        this._onSuccess && this._onSuccess({});
      } catch (e) {
        errEl.textContent = `연결 오류: ${e.message}`;
        errEl.style.display = 'block';
        saveBtn.textContent = '연결하기';
        saveBtn.disabled = false;
      }
    });
  },

  _hideSettingsModal() {
    const el = document.getElementById('gist-settings-modal');
    if (el) el.remove();
  },
};
