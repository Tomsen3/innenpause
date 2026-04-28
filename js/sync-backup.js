// ============================================================
// DATEN EXPORT / IMPORT
// ============================================================
function exportiereAllesDaten() {
  const backup = {
    version: 1,
    exportiert_am: new Date().toISOString(),
    exercises: ls('exercises', []),
    checkins:  ls('checkins', {}),
    journal:   ls('journal', {}),
    daily_exercises: ls('daily_exercises', {}),
    daily_summary:   ls('daily_summary', {}),
    daily_suggestions: ls('daily_suggestions', {}),
    exercise_rotation: ls('exercise_rotation', {}),
    app_titel:     localStorage.getItem('app_titel') || 'Innenpause',
    app_untertitel: localStorage.getItem('app_untertitel') || t('app_untertitel_default')
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `achtsamkeit-backup-${heuteString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem('backup_letzter_export', heuteString());
  localStorage.removeItem('backup_erinnerung_datum');
  zeigToast(t('toast_export'));
}

function importiereDaten(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version) throw new Error('Unbekanntes Format');
      if (!confirm(t('confirm_backup_restore'))) return;
      if (data.exercises) lsSet('exercises', data.exercises);
      if (data.checkins)  lsSet('checkins', data.checkins);
      if (data.journal)   lsSet('journal', data.journal);
      if (data.daily_exercises) lsSet('daily_exercises', data.daily_exercises);
      if (data.daily_summary)   lsSet('daily_summary', data.daily_summary);
      if (data.daily_suggestions) lsSet('daily_suggestions', data.daily_suggestions);
      if (data.exercise_rotation) lsSet('exercise_rotation', data.exercise_rotation);
      if (data.app_titel)     localStorage.setItem('app_titel', data.app_titel);
      if (data.app_untertitel) localStorage.setItem('app_untertitel', data.app_untertitel);
      zeigToast(t('toast_import_ok'));
      setTimeout(() => location.reload(), 1500);
    } catch(err) {
      zeigToast(t('toast_import_fehler') + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function loescheAllesDaten() {
  if (!confirm(t('confirm_alles_loeschen_1'))) return;
  if (!confirm(t('confirm_alles_loeschen_2'))) return;
  const lizenz = localStorage.getItem(LIZENZ_KEY); // Lizenz behalten
  localStorage.clear();
  if (lizenz) localStorage.setItem(LIZENZ_KEY, lizenz);
  zeigToast(t('toast_alles_geloescht'));
  setTimeout(() => location.reload(), 1500);
}

// ============================================================
// SYNC-SYSTEM (File System Access API)
// Unterstützt: Chrome/Edge (Desktop + Android)
// Nicht unterstützt: Safari/iPhone → Fallback auf manuellen Export
// ============================================================
const SYNC_UNTERSTUETZT = 'showSaveFilePicker' in window;
let syncFileHandle = null; // Wird nach Auswahl gespeichert (nur Session)

function getSyncInfo() {
  // Metadaten über die zuletzt genutzte Sync-Datei
  try {
    const raw = localStorage.getItem('sync_info');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setSyncInfo(info) {
  localStorage.setItem('sync_info', JSON.stringify(info));
}

function ladeSyncUI() {
  const info = getSyncInfo();
  const statusEl = document.getElementById('sync-datei-status');
  const aktionenEl = document.getElementById('sync-aktionen');
  const letzterEl = document.getElementById('sync-letzter-stand');
  const letzterText = document.getElementById('sync-letzter-text');
  const resetRow = document.getElementById('sync-reset-row');
  if (!statusEl) return;

  if (info) {
    statusEl.textContent = '📄 ' + info.dateiname;
    if (aktionenEl) aktionenEl.style.display = '';
    if (letzterEl) letzterEl.style.display = '';
    if (resetRow) resetRow.style.display = '';
    if (letzterText) {
      const d = info.letzter_sync ? new Date(info.letzter_sync).toLocaleString('de-DE') : '–';
      letzterText.textContent = `Letzter Sync: ${d}`;
    }
  } else {
    statusEl.textContent = t('einst_sync_kein_ort');
    if (aktionenEl) aktionenEl.style.display = 'none';
    if (letzterEl) letzterEl.style.display = 'none';
    if (resetRow) resetRow.style.display = 'none';
  }
}

function zeigeSyncModal_ORIG(modus) {
  const modal = document.getElementById('sync-modal');
  const inhalt = document.getElementById('sync-modal-inhalt');
  if (!modal || !inhalt) return;

  if (!SYNC_UNTERSTUETZT) {
    // Safari / nicht unterstützt → manueller Fallback
    document.getElementById('sync-modal-titel').textContent = '🔄 Synchronisierung';
    inhalt.innerHTML = `
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.5">
        Automatische Synchronisierung ist in diesem Browser nicht verfügbar (z.B. Safari/iPhone).<br><br>
        Du kannst deine Daten manuell sichern und auf anderen Geräten wiederherstellen:
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <button class="btn btn-secondary" onclick="exportiereAllesDaten(); schliesseSyncModal()">
          ↓ Backup herunterladen
        </button>
        <button class="btn btn-secondary" onclick="schliesseSyncModal(); document.getElementById('import-file').click()">
          ↑ Backup einspielen
        </button>
      </div>
      <button class="btn btn-primary btn-block" onclick="schliesseSyncModal()">Schließen</button>`;
    modal.classList.add('open');
    return;
  }

  if (modus === 'einrichten') {
    document.getElementById('sync-modal-titel').textContent = '🔄 Sync einrichten';
    inhalt.innerHTML = `
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.5">
        Wähle einen Speicherort für deine Sync-Datei – am besten in einem Cloud-Ordner (OneDrive, Google Drive, Dropbox).
      </div>
      <div style="background:var(--bg2);border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:var(--text2);line-height:1.6">
        <strong>So funktioniert es:</strong><br>
        1. Speicherort einmalig festlegen<br>
        2. Nach jeder Nutzung \"↑ Speichern\" drücken<br>
        3. Auf anderem Gerät: App öffnen → \"↓ Laden\"<br>
        4. Deine Daten sind überall verfügbar ✓
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <button class="btn btn-primary" onclick="syncDateiNeuErstellen()">
          📁 Neuen Speicherort wählen
        </button>
        <button class="btn btn-secondary" onclick="syncDateiOeffnen()">
          📂 Vorhandene Sync-Datei öffnen
        </button>
      </div>
      <button class="btn btn-secondary btn-block" onclick="schliesseSyncModal()">Abbrechen</button>`;
  }
  modal.classList.add('open');
}

function syncZuruecksetzen() {
  if (!confirm(t('confirm_sync_reset'))) return;
  localStorage.removeItem('sync_info');
  localStorage.removeItem('sync_erinnerung_datum');
  syncFileHandle = null;
  ladeSyncUI();
  zeigToast('✓ Sync zurückgesetzt');
}

function schliesseSyncModal() {
  document.getElementById('sync-modal')?.classList.remove('open');
}

async function syncDateiNeuErstellen() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'innenpause-sync.json',
      types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }]
    });
    syncFileHandle = handle;
    setSyncInfo({ dateiname: handle.name, letzter_sync: null });
    // Sofort speichern
    await syncSchreibeDatei(handle);
    schliesseSyncModal();
    ladeSyncUI();
    zeigToast(t('toast_sync_erstellt'));
  } catch(e) {
    if (e.name !== 'AbortError') zeigToast(t('toast_sync_fehler_erstellen'));
  }
}

async function syncDateiOeffnen() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }]
    });
    syncFileHandle = handle;
    setSyncInfo({ dateiname: handle.name, letzter_sync: new Date().toISOString() });
    // Sofort laden
    await syncLeseDatei(handle);
    schliesseSyncModal();
    ladeSyncUI();
    zeigToast(t('toast_sync_geladen_ok'));
  } catch(e) {
    if (e.name !== 'AbortError') zeigToast(t('toast_sync_fehler_oeffnen'));
  }
}

async function syncSchreibeDatei(handle) {
  const backup = {
    version: 1,
    exportiert_am: new Date().toISOString(),
    sync_geraet: navigator.userAgent.includes('Mobile') ? 'Mobil' : 'Desktop',
    exercises:         ls('exercises', []),
    checkins:          ls('checkins', {}),
    journal:           ls('journal', {}),
    daily_exercises:   ls('daily_exercises', {}),
    daily_summary:     ls('daily_summary', {}),
    daily_suggestions: ls('daily_suggestions', {}),
    exercise_rotation: ls('exercise_rotation', {}),
  };
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(backup, null, 2));
  await writable.close();
  const info = getSyncInfo() || {};
  info.letzter_sync = new Date().toISOString();
  setSyncInfo(info);
}

async function syncLeseDatei(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data.version) throw new Error('Ungültiges Format');
  if (data.exercises)         lsSet('exercises', data.exercises);
  if (data.checkins)          lsSet('checkins', data.checkins);
  if (data.journal)           lsSet('journal', data.journal);
  if (data.daily_exercises)   lsSet('daily_exercises', data.daily_exercises);
  if (data.daily_summary)     lsSet('daily_summary', data.daily_summary);
  if (data.daily_suggestions) lsSet('daily_suggestions', data.daily_suggestions);
  if (data.exercise_rotation) lsSet('exercise_rotation', data.exercise_rotation);
  const info = getSyncInfo() || {};
  info.letzter_sync = new Date().toISOString();
  setSyncInfo(info);
}

async function syncSpeichern() {
  if (!SYNC_UNTERSTUETZT) { exportiereAllesDaten(); return; }
  try {
    if (!syncFileHandle) {
      // Kein Handle in dieser Session → Nutzer informieren und Datei neu wählen lassen
      const info = getSyncInfo();
      const dateiname = info ? info.dateiname : 'innenpause-sync.json';
      // Hinweis anzeigen (nicht blockierend, nur Toast)
      zeigToast(t('toast_sync_datei_waehlen'));
      // showSaveFilePicker erlaubt Schreiben in bestehende oder neue Datei
      const handle = await window.showSaveFilePicker({
        suggestedName: dateiname,
        types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }]
      });
      syncFileHandle = handle;
      setSyncInfo({ dateiname: handle.name, letzter_sync: null });
    }
    await syncSchreibeDatei(syncFileHandle);
    ladeSyncUI();
    zeigToast(t('toast_sync_gespeichert'));
  } catch(e) {
    if (e.name !== 'AbortError') zeigToast(t('toast_sync_fehler_speichern'));
  }
}

async function syncLaden() {
  if (!SYNC_UNTERSTUETZT) {
    document.getElementById('import-file').click();
    return;
  }
  try {
    if (!syncFileHandle) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }]
      });
      syncFileHandle = handle;
      setSyncInfo({ dateiname: handle.name, letzter_sync: null });
    }
    await syncLeseDatei(syncFileHandle);
    ladeSyncUI();
    zeigToast(t('toast_sync_laden_ok'));
    setTimeout(() => location.reload(), 1500);
  } catch(e) {
    if (e.name !== 'AbortError') zeigToast(t('toast_sync_fehler_laden'));
  }
}

// Start-Erinnerung
function zeigeSyncErinnerung_ORIG() {
  const info = getSyncInfo();
  if (!info) return; // Kein Sync eingerichtet → keine Erinnerung
  // Max. 1x pro Tag erinnern
  const heute = heuteString();
  const letzteErinnerung = localStorage.getItem('sync_erinnerung_datum');
  if (letzteErinnerung === heute) return;
  localStorage.setItem('sync_erinnerung_datum', heute);

  const el = document.getElementById('sync-erinnerung');
  const infoEl = document.getElementById('sync-erinnerung-info');
  if (!el) return;
  if (infoEl && info.letzter_sync) {
    const d = new Date(info.letzter_sync).toLocaleString('de-DE');
    infoEl.textContent = t('sync_datei_prefix') + info.dateiname + ' · ' + t('sync_letzter_prefix') + d;
  }
  el.style.display = 'flex';
}

function schliesseSyncErinnerung() {
  document.getElementById('sync-erinnerung').style.display = 'none';
}

async function syncLadenUndSchliesse() {
  schliesseSyncErinnerung();
  await syncLaden();
}

async function syncSpeichernUndSchliesse() {
  schliesseSyncErinnerung();
  await syncSpeichern();
}
