/* drive.js — Google Drive API v3 + OAuth 2.0 연동 */

// ⚠️ 아래 CLIENT_ID를 Google Cloud Console에서 발급받은 값으로 교체하세요
const GOOGLE_CLIENT_ID = '589543573197-nadv1atdvjlnrbihq950a3ajnq4t2fdr.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
];

const Drive = {
  _tokenClient : null,
  _gapiReady   : false,
  _authorized  : false,

  /* ── 초기화 ─────────────────────────────────── */

  async initGapi() {
    return new Promise((resolve, reject) => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
          this._gapiReady = true;
          resolve();
        } catch (e) { reject(e); }
      });
    });
  },

  initGis(onSuccess, onError) {
    this._tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope    : SCOPES,
      callback : (resp) => {
        if (resp.error) { onError && onError(resp); return; }
        this._authorized = true;
        onSuccess && onSuccess(resp);
      },
    });
  },

  /* ── 로그인 / 로그아웃 ───────────────────────── */

  signIn() {
    const token = gapi.client.getToken();
    this._tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
  },

  signOut() {
    const token = gapi.client.getToken();
    if (token) {
      google.accounts.oauth2.revoke(token.access_token, () => {});
      gapi.client.setToken(null);
    }
    this._authorized = false;
    localStorage.removeItem('fid_tasksdb');
    localStorage.removeItem('fid_habitdb');
  },

  isAuthorized() { return this._authorized; },

  /* ── 파일 ID 조회 (캐시 포함) ───────────────── */

  async _getFileId(filename) {
    const key    = `fid_${filename.replace('.md', '')}`;
    const cached = localStorage.getItem(key);

    if (cached) {
      // 여전히 Drive에 존재하는지 확인
      try {
        await gapi.client.drive.files.get({ fileId: cached, fields: 'id,trashed' });
        return cached;
      } catch (_) {
        localStorage.removeItem(key);
      }
    }

    // Drive에서 검색
    const res = await gapi.client.drive.files.list({
      q        : `name='${filename}' and trashed=false`,
      fields   : 'files(id,name)',
      spaces   : 'drive',
      pageSize : 1,
    });

    const files = res.result.files || [];
    if (files.length > 0) {
      localStorage.setItem(key, files[0].id);
      return files[0].id;
    }
    return null;
  },

  /* ── 파일 읽기 ──────────────────────────────── */

  async readFile(filename) {
    const fileId = await this._getFileId(filename);
    if (!fileId) return null;

    const res = await gapi.client.drive.files.get({
      fileId,
      alt: 'media',
    });
    return res.body || '';
  },

  /* ── 파일 쓰기 ──────────────────────────────── */

  async writeFile(filename, content) {
    const fileId = await this._getFileId(filename);

    if (fileId) {
      // 기존 파일 업데이트
      await gapi.client.request({
        path   : `/upload/drive/v3/files/${fileId}`,
        method : 'PATCH',
        params : { uploadType: 'media' },
        headers: { 'Content-Type': 'text/markdown; charset=UTF-8' },
        body   : content,
      });
    } else {
      // 파일 없으면 새로 생성 (multipart upload)
      const newId = await this._createFile(filename, content);
      const key   = `fid_${filename.replace('.md', '')}`;
      localStorage.setItem(key, newId);
    }
  },

  async _createFile(filename, content) {
    const boundary = '-------boundary31415926';
    const meta     = JSON.stringify({ name: filename, mimeType: 'text/markdown' });
    const body     = [
      `\r\n--${boundary}\r\n`,
      `Content-Type: application/json\r\n\r\n`,
      meta,
      `\r\n--${boundary}\r\n`,
      `Content-Type: text/markdown; charset=UTF-8\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ].join('');

    const res = await gapi.client.request({
      path   : '/upload/drive/v3/files',
      method : 'POST',
      params : { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body,
    });
    return res.result.id;
  },

  /* ── Sync: Pull (Drive → App) ───────────────── */

  async pullFromDrive() {
    const taskFile = localStorage.getItem('task_db_filename') || 'tasksdb.md';
    const [tasksMd, habitsMd] = await Promise.all([
      this.readFile(taskFile),
      this.readFile('habitdb.md'),
    ]);
    return {
      tasks : tasksMd  ?? '',
      habits: habitsMd ?? '## habits\n\n## weekly_record\n',
    };
  },

  /* ── Sync: Push (App → Drive) ───────────────── */

  async pushToDrive(tasksMd, habitsMd) {
    const taskFile = localStorage.getItem('task_db_filename') || 'tasksdb.md';
    await Promise.all([
      this.writeFile(taskFile, tasksMd),
      this.writeFile('habitdb.md', habitsMd),
    ]);
  },
};
