// ============================================================
// PDF-EXPORT
// ============================================================

function oeffrePdfExport() {
  // Öffnet das PDF-Konfigurations-Modal
  const datum = document.getElementById('verlauf-datum').value || heuteString();
  document.getElementById('pdf-von').value = datum;
  document.getElementById('pdf-bis').value = datum;
  document.getElementById('pdf-modal').classList.add('open');
}

function schliessePdfModal() {
  document.getElementById('pdf-modal').classList.remove('open');
}

function startepdfdruck() {
  const von = document.getElementById('pdf-von').value;
  const bis = document.getElementById('pdf-bis').value;
  if (!von || !bis) { zeigeToast('Bitte Von- und Bis-Datum wählen.'); return; }
  if (von > bis) { zeigeToast('Das Von-Datum muss vor dem Bis-Datum liegen.'); return; }

  const mitCheckins    = document.getElementById('pdf-cb-checkins').checked;
  const mitUebungen    = document.getElementById('pdf-cb-uebungen').checked;
  const mitNotizen     = document.getElementById('pdf-cb-notizen').checked;
  const mitAbschluss   = document.getElementById('pdf-cb-abschluss').checked;

  if (!mitCheckins && !mitUebungen && !mitNotizen && !mitAbschluss) {
    zeigeToast('Bitte mindestens einen Inhaltsbereich wählen.');
    return;
  }

  // Datumsbereich aufbauen
  const tage = [];
  let cur = new Date(von + 'T12:00:00');
  const end = new Date(bis + 'T12:00:00');
  while (cur <= end) {
    tage.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const alleCheckins    = ls('checkins', {});
  const alleDailyEx     = ls('daily_exercises', {});
  const alleJournal     = ls('journal', {});
  const alleSummary     = ls('daily_summary', {});
  const alleSuggestions = ls('daily_suggestions', {});
  const alleUebungen    = getUebungen();

  const locale = t('verlauf_datum_locale');
  const optLang = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const optKurz = { month: 'long', day: 'numeric', year: 'numeric' };
  const tzLabels = { morgen: t('pdf_tz_morgen'), mittag: t('pdf_tz_mittag'), abend: t('pdf_tz_abend') };

  // ── DURCHSCHNITTS-BERECHNUNG über den Zeitraum ─────────
  let summen = { stimmung: 0, energie: 0, koerper: 0, verbundenheit: 0, schlaf_qualitaet: 0, schlaf_stunden: 0 };
  let anzahl = { stimmung: 0, energie: 0, koerper: 0, verbundenheit: 0, schlaf_qualitaet: 0, schlaf_stunden: 0 };
  tage.forEach(datum => {
    const tagesDaten = alleCheckins[datum] || {};
    ['morgen', 'mittag', 'abend'].forEach(tz => {
      const ci = tagesDaten[tz];
      if (!ci) return;
      ['stimmung', 'energie', 'koerper', 'verbundenheit'].forEach(k => {
        if (ci[k] != null) { summen[k] += ci[k]; anzahl[k]++; }
      });
      if (tz === 'morgen') {
        if (ci.schlaf_qualitaet != null) { summen.schlaf_qualitaet += ci.schlaf_qualitaet; anzahl.schlaf_qualitaet++; }
        if (ci.schlaf_stunden  != null) { summen.schlaf_stunden  += ci.schlaf_stunden;  anzahl.schlaf_stunden++;  }
      }
    });
  });
  function avg(k) { return anzahl[k] > 0 ? (summen[k] / anzahl[k]).toFixed(1) : null; }
  function balken(wert, max) {
    const pct = Math.round((wert / max) * 100);
    return `<span class="print-balken-wrap"><span class="print-balken-fill" style="width:${pct}%"></span></span>`;
  }

  // Zusammenfassungs-Block (nur wenn Check-ins gewählt und Daten vorhanden)
  let zusammenfassungHtml = '';
  if (mitCheckins) {
    const metriken = [
      ['stimmung', t('pdf_stimmung')], ['energie', t('pdf_energie')],
      ['koerper', t('pdf_koerper')], ['verbundenheit', t('pdf_verbundenheit')],
      ['schlaf_qualitaet', t('pdf_schlaf')], ['schlaf_stunden', t('pdf_schlaf_std')]
    ];
    const zeilen = metriken.map(([k, l]) => {
      const v = avg(k);
      if (v === null) return '';
      if (k === 'schlaf_stunden') return `<div class="print-zeile"><span class="print-zeile-label">${l}</span><span class="print-zeile-wert">${v} h (Ø)</span></div>`;
      return `<div class="print-zeile"><span class="print-zeile-label">${l}</span><span class="print-zeile-wert">${balken(parseFloat(v),10)} ${v}/10 (Ø)</span></div>`;
    }).filter(Boolean).join('');
    if (zeilen) {
      zusammenfassungHtml = `<div class="print-zusammenfassung"><h3>Zeitraum-Durchschnitt (${tage.length} Tag${tage.length !== 1 ? 'e' : ''})</h3>${zeilen}</div>`;
    }
  }

  // ── TAGES-SEKTIONEN ────────────────────────────────────
  let tageSektionen = '';
  let tageMitDaten = 0;

  tage.forEach(datum => {
    const tagesDaten  = alleCheckins[datum]    || {};
    const dailyEx     = alleDailyEx[datum]     || [];
    const journal     = alleJournal[datum]     || [];
    const summary     = alleSummary[datum]     || null;
    const suggestions = alleSuggestions[datum] || {};

    // Vorgeschlagene Übungen: Einträge aus daily_suggestions die NICHT schon in dailyEx sind
    const vorgeschlageneIds = new Set(dailyEx.map(de => de.exerciseId));
    const vorgeschlagene = [];
    ['morgen', 'mittag', 'abend'].forEach(tz => {
      if (suggestions[tz] && suggestions[tz].exerciseId && !vorgeschlageneIds.has(suggestions[tz].exerciseId)) {
        vorgeschlagene.push({ exerciseId: suggestions[tz].exerciseId, tageszeit: tz });
      }
    });

    const hatCheckins  = mitCheckins  && Object.keys(tagesDaten).length > 0;
    const hatUebungen  = mitUebungen  && (dailyEx.length > 0 || vorgeschlagene.length > 0);
    const hatNotizen   = mitNotizen   && journal.length > 0;
    const hatAbschluss = mitAbschluss && summary != null;

    if (!hatCheckins && !hatUebungen && !hatNotizen && !hatAbschluss) return;
    tageMitDaten++;

    const datumText = new Date(datum + 'T12:00:00').toLocaleDateString(locale, optLang);
    let tagHtml = `<div class="print-tag"><h2>📅 ${datumText}</h2>`;

    // ── CHECK-INS ──────────────────────────────────────────
    if (hatCheckins) {
      const tzArr = ['morgen', 'mittag', 'abend'].filter(k => tagesDaten[k]);
      tagHtml += `<div class="print-sektion"><h3>${t('pdf_checkins')}</h3>`;
      tzArr.forEach(tz => {
        const ci = tagesDaten[tz];
        tagHtml += `<div class="print-ci-block"><div class="print-ci-titel">${tzLabels[tz]}</div>`;
        if (tz === 'morgen' && ci.schlaf_qualitaet != null) {
          tagHtml += `<div class="print-zeile"><span class="print-zeile-label">${t('pdf_schlaf')}</span><span class="print-zeile-wert">${balken(ci.schlaf_qualitaet,10)} ${ci.schlaf_qualitaet}/10</span></div>`;
        }
        if (tz === 'morgen' && ci.schlaf_stunden != null) {
          tagHtml += `<div class="print-zeile"><span class="print-zeile-label">${t('pdf_schlaf_std')}</span><span class="print-zeile-wert">${ci.schlaf_stunden} h</span></div>`;
        }
        [['stimmung', t('pdf_stimmung')],['energie', t('pdf_energie')],['koerper', t('pdf_koerper')],['verbundenheit', t('pdf_verbundenheit')]].forEach(([k, l]) => {
          if (ci[k] != null) tagHtml += `<div class="print-zeile"><span class="print-zeile-label">${l}</span><span class="print-zeile-wert">${balken(ci[k],10)} ${ci[k]}/10</span></div>`;
        });
        if (ci.freitext) tagHtml += `<div class="print-text">${ci.freitext}</div>`;
        if (ci.tagesfrage_antwort) tagHtml += `<div class="print-text print-text-klein"><em>${ci.tagesfrage_text}</em><br>${ci.tagesfrage_antwort}</div>`;
        tagHtml += `</div>`;
      });
      tagHtml += `</div>`;
    }

    // ── ÜBUNGEN (erledigt + vorgeschlagen) ─────────────────
    if (hatUebungen) {
      tagHtml += `<div class="print-sektion"><h3>${t('pdf_uebungen')}</h3>`;
      // Manuell hinzugefügte / erledigte
      dailyEx.forEach(de => {
        const u = alleUebungen.find(x => x.id === de.exerciseId);
        const titel = u ? u.titel : '–';
        const status = de.erledigt
          ? `<span class="print-badge print-badge-done">${t('pdf_erledigt')}</span>`
          : `<span class="print-badge">${t('pdf_offen')}</span>`;
        tagHtml += `<div class="print-uebung-zeile"><span class="print-uebung-titel">${titel}</span>${status}`;
        if (de.feedback) {
          const fb = de.feedback;
          if (fb.sterne) tagHtml += ` <span class="print-sterne">${'★'.repeat(fb.sterne)}${'☆'.repeat(5 - fb.sterne)}</span>`;
          if (fb.notiz) tagHtml += `<div class="print-text print-text-klein">${t('pdf_notiz')}: ${fb.notiz}</div>`;
        }
        tagHtml += `</div>`;
      });
      // Vorgeschlagene (nicht explizit hinzugefügt, aber gezeigt)
      vorgeschlagene.forEach(v => {
        const u = alleUebungen.find(x => x.id === v.exerciseId);
        if (!u) return;
        tagHtml += `<div class="print-uebung-zeile print-uebung-vorschlag"><span class="print-uebung-titel">${u.titel}</span><span class="print-badge print-badge-vorschlag">${tzLabels[v.tageszeit]} Vorschlag</span></div>`;
      });
      tagHtml += `</div>`;
    }

    // ── NOTIZBUCH ──────────────────────────────────────────
    if (hatNotizen) {
      tagHtml += `<div class="print-sektion"><h3>${t('pdf_notizbuch')}</h3>`;
      journal.forEach(e => {
        tagHtml += `<div class="print-notiz"><span class="print-notiz-time">${e.time}</span><div class="print-text">${e.text}</div></div>`;
      });
      tagHtml += `</div>`;
    }

    // ── TAGESABSCHLUSS ─────────────────────────────────────
    if (hatAbschluss) {
      tagHtml += `<div class="print-sektion"><h3>${t('pdf_tagesabschluss')}</h3>`;
      if (summary.abschlusstext) tagHtml += `<div class="print-text">${summary.abschlusstext}</div>`;
      if (summary.mitnahme)   tagHtml += `<div class="print-zeile"><span class="print-zeile-label">${t('pdf_mitnahme')}</span><span class="print-zeile-wert">${summary.mitnahme}</span></div>`;
      if (summary.highlight)  tagHtml += `<div class="print-zeile"><span class="print-zeile-label">\u2728 ${t('pdf_highlight')}</span><span class="print-zeile-wert">${summary.highlight}</span></div>`;
      if (summary.dankbarkeit) tagHtml += `<div class="print-zeile"><span class="print-zeile-label">\uD83D\uDE4F ${t('pdf_dankbarkeit')}</span><span class="print-zeile-wert">${summary.dankbarkeit}</span></div>`;
      tagHtml += `</div>`;
    }

    tagHtml += `</div>`; // .print-tag
    tageSektionen += tagHtml;
  });

  if (tageMitDaten === 0) {
    zeigeToast('Keine Daten im gewählten Zeitraum gefunden.');
    return;
  }

  // Zeitraumtext für Header
  const vonText = new Date(von + 'T12:00:00').toLocaleDateString(locale, optKurz);
  const bisText = new Date(bis + 'T12:00:00').toLocaleDateString(locale, optKurz);
  const zeitraumText = von === bis ? vonText : `${vonText} \u2013 ${bisText}`;
  const dateiName = `Innenpause_${von}${von !== bis ? '_bis_' + bis : ''}.pdf`;

  const inhaltsBereiche = [
    mitCheckins  ? t('pdf_checkins')      : '',
    mitUebungen  ? t('pdf_uebungen')      : '',
    mitNotizen   ? t('pdf_notizbuch')     : '',
    mitAbschluss ? t('pdf_tagesabschluss'): ''
  ].filter(Boolean).join(' \u00b7 ');

  const jetzt = new Date().toLocaleDateString(locale, optKurz);

  // ── PRINT-CSS (inline im Blob-Dokument) ────────────────
  const printCSS = `
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #2c2416; background: #fff; margin: 0; padding: 24px 28px; font-size: 13px; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-header { border-bottom: 2.5px solid #7a6d52; padding-bottom: 14px; margin-bottom: 20px; }
    .print-header-logo { font-size: 13px; color: #9e8f7a; margin-bottom: 4px; letter-spacing: 0.5px; }
    .print-header h1 { font-family: Georgia, serif; font-size: 20px; margin: 0 0 5px; color: #2c2416; font-weight: normal; }
    .print-meta { font-size: 11px; color: #9e8f7a; }
    .print-zusammenfassung { background: #f5f0e8; border: 1px solid #d4ccbc; border-radius: 6px; padding: 12px 14px; margin-bottom: 22px; page-break-inside: avoid; }
    .print-zusammenfassung h3 { font-size: 10px; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 1.2px; color: #9e8f7a; margin: 0 0 10px; font-weight: 600; }
    .print-tag { page-break-inside: avoid; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid #e2dace; }
    .print-tag:last-of-type { border-bottom: none; }
    .print-tag h2 { font-family: Georgia, serif; font-size: 15px; font-weight: normal; color: #2c2416; border-bottom: 1px solid #d4ccbc; padding-bottom: 7px; margin-bottom: 12px; }
    .print-sektion { margin-bottom: 12px; }
    .print-sektion h3 { font-size: 10px; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 1.2px; color: #9e8f7a; margin-bottom: 7px; font-weight: 600; }
    .print-ci-block { background: #faf7f2; border: 1px solid #e2dace; border-radius: 6px; padding: 8px 11px; margin-bottom: 7px; page-break-inside: avoid; }
    .print-ci-titel { font-size: 11px; font-weight: 600; color: #6b5f4e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .print-zeile { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px dotted #e2dace; font-size: 12px; }
    .print-zeile:last-child { border-bottom: none; }
    .print-zeile-label { color: #6b5f4e; }
    .print-zeile-wert { display: flex; align-items: center; gap: 6px; font-weight: 500; }
    .print-balken-wrap { display: inline-block; width: 55px; height: 6px; background: #e2dace; border-radius: 3px; vertical-align: middle; overflow: hidden; }
    .print-balken-fill { display: block; height: 100%; background: #7a6d52; border-radius: 3px; }
    .print-text { font-size: 12px; color: #2c2416; line-height: 1.6; background: #f5f0e8; padding: 6px 10px; border-radius: 4px; margin-top: 4px; }
    .print-text-klein { font-size: 11px; color: #6b5f4e; }
    .print-uebung-zeile { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; padding: 5px 0; border-bottom: 1px dotted #e2dace; font-size: 12px; }
    .print-uebung-zeile:last-child { border-bottom: none; }
    .print-uebung-titel { flex: 1; color: #2c2416; }
    .print-uebung-vorschlag .print-uebung-titel { color: #6b5f4e; font-style: italic; }
    .print-sterne { color: #b5956a; letter-spacing: 1px; font-size: 11px; }
    .print-badge { display: inline-block; font-size: 10px; background: #ede7d9; padding: 1px 7px; border-radius: 10px; font-family: Arial, sans-serif; white-space: nowrap; }
    .print-badge-done { background: #d4e8c9; color: #3a6b2a; }
    .print-badge-vorschlag { background: #e8e2d4; color: #7a6d52; }
    .print-notiz { margin-bottom: 7px; }
    .print-notiz-time { font-size: 10px; color: #9e8f7a; margin-bottom: 2px; display: block; }
    .print-footer { font-size: 10px; color: #9e8f7a; font-family: Arial, sans-serif; text-align: center; margin-top: 28px; border-top: 1px solid #d4ccbc; padding-top: 10px; }
  `;

  const vollHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${dateiName.replace('.pdf','')}</title><style>${printCSS}</style></head><body>
    <div class="print-header">
      <div class="print-header-logo">\uD83C\uDF3F Innenpause</div>
      <h1>${zeitraumText}</h1>
      <div class="print-meta">${inhaltsBereiche} &nbsp;&middot;&nbsp; ${tageMitDaten} Tag${tageMitDaten !== 1 ? 'e' : ''} mit Eintr\u00e4gen</div>
    </div>
    ${zusammenfassungHtml}
    ${tageSektionen}
    <div class="print-footer">
      ${t('pdf_erstellt')} Innenpause v${APP_VERSION} &nbsp;${t('pdf_lokal')} &nbsp;&middot;&nbsp; ${jetzt}
    </div> 
<\/body><\/html>`;

  const win = window.open('', '_blank');
  if (!win) {
    zeigeToast('Bitte Pop-ups erlauben, um das PDF zu \u00f6ffnen.');
    return;
  }

  win.document.open();
  win.document.write(vollHtml);
  win.document.close();

  const drucke = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.warn('Druckdialog konnte nicht automatisch geöffnet werden:', e);
    }
  };

  if (win.document.readyState === 'complete') {
    setTimeout(drucke, 150);
  } else {
    win.addEventListener('load', () => setTimeout(drucke, 150), { once: true });
  }

  schliessePdfModal();
}
