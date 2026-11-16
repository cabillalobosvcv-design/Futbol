import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Match, MatchEvent, MatchEventType, MatchResult } from '../types/sigd';

export interface ExportTablePayload {
  title: string;
  subtitle?: string;
  organizationName?: string;
  organizationLogoUrl?: string;
  fileName: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface OfficialArchiveMatchItem {
  match: Match;
  result?: MatchResult;
  events: MatchEvent[];
  categoryName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogoUrl?: string;
  awayTeamLogoUrl?: string;
  fieldName: string;
  refereeName: string;
}

export interface OfficialArchiveTableSection {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface OfficialArchivePdfParams {
  fileName: string;
  organizationName: string;
  organizationLogoUrl?: string;
  tournamentName: string;
  seasonName?: string;
  scopeLabel: string;
  summaryMetrics: { label: string; value: string | number }[];
  statSections: OfficialArchiveTableSection[];
  matchSheets: OfficialArchiveMatchItem[];
  playerNames: Record<string, string>;
  teamNames: Record<string, string>;
  generatedBy?: string;
}

const EVENT_TYPE_PDF_LABELS: Record<MatchEventType, string> = {
  gol: 'GOL',
  penal: 'PENAL',
  autogol: 'AUTOGOL',
  asistencia: 'ASISTENCIA',
  amarilla: 'T. AMARILLA',
  roja: 'T. ROJA',
  sustitucion: 'SUSTITUCIÓN',
  participacion: 'PARTICIPACIÓN',
};

async function loadImageAsPngDataUrl(url?: string): Promise<string | null> {
  const cleanUrl = url?.trim();
  if (!cleanUrl) return null;

  const renderImgToPng = (src: string, useCors: boolean): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      const timer = window.setTimeout(() => resolve(null), 5000);

      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const w = img.naturalWidth || img.width || 160;
          const h = img.naturalHeight || img.height || 160;
          const maxDim = 200;
          const scale = Math.min(maxDim / w, maxDim / h, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };

      img.src = src;
    });

  try {
    if (cleanUrl.startsWith('data:image/')) {
      return await renderImgToPng(cleanUrl, false);
    }

    const direct = await renderImgToPng(cleanUrl, true);
    if (direct) return direct;

    const resp = await fetch(cleanUrl, { mode: 'cors' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      return await renderImgToPng(objUrl, false);
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

function createImageCache() {
  const cache = new Map<string, Promise<string | null>>();
  return (url?: string): Promise<string | null> => {
    const clean = url?.trim();
    if (!clean) return Promise.resolve(null);
    const existing = cache.get(clean);
    if (existing) return existing;
    const promise = loadImageAsPngDataUrl(clean);
    cache.set(clean, promise);
    return promise;
  };
}

function getLastTableFinalY(doc: jsPDF, fallbackY: number): number {
  const typed = doc as unknown as { lastAutoTable?: { finalY?: number } };
  return typed.lastAutoTable?.finalY ?? fallbackY;
}

function applyOfficialFooters(doc: jsPDF, leftFooter: string): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(leftFooter, 14, pageHeight - 8, { maxWidth: pageWidth - 65 });
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
  }
}

function drawMatchSheetContent(params: {
  doc: jsPDF;
  item: OfficialArchiveMatchItem;
  tournamentName: string;
  organizationName?: string;
  logoDataUrl: string | null;
  homeLogoDataUrl: string | null;
  awayLogoDataUrl: string | null;
  playerNames: Record<string, string>;
  teamNames: Record<string, string>;
}): void {
  const {
    doc,
    item,
    tournamentName,
    organizationName,
    logoDataUrl,
    homeLogoDataUrl,
    awayLogoDataUrl,
    playerNames,
    teamNames,
  } = params;
  const { match, result, events, categoryName, homeTeamName, awayTeamName, fieldName, refereeName } = item;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(10, 25, 47);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(22, 163, 74);
  doc.rect(0, 32, pageWidth, 2.5, 'F');

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 6, 20, 20, 2.5, 2.5, 'F');
    doc.addImage(logoDataUrl, 'PNG', 15, 7, 18, 18);
  } else {
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(14, 6, 20, 20, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SIGD', 24, 18, { align: 'center' });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`ACTA DIGITAL OFICIAL — PARTIDO #${match.matchNumber}`, 40, 13.5);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Jornada ${match.roundNumber} · ${tournamentName} · ${categoryName}`, 40, 20.5, {
    maxWidth: pageWidth - 95,
  });
  if (organizationName) {
    doc.setFontSize(8);
    doc.text(organizationName, 40, 26.5, { maxWidth: pageWidth - 95 });
  }
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Estado: ${result?.validationStatus?.toUpperCase() || match.status.toUpperCase()}`, pageWidth - 14, 15, {
    align: 'right',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Folio: ACT-${match.matchNumber}-${match.date}`, pageWidth - 14, 21.5, {
    align: 'right',
  });

  const hScore = result?.homeScore ?? match.homeScore ?? 0;
  const aScore = result?.awayScore ?? match.awayScore ?? 0;
  const hasPenalties =
    hScore === aScore &&
    result?.penaltyHomeScore !== undefined &&
    result?.penaltyAwayScore !== undefined;
  const penaltyWinnerLabel =
    result?.penaltyWinnerTeamId === match.homeTeamId
      ? homeTeamName
      : result?.penaltyWinnerTeamId === match.awayTeamId
        ? awayTeamName
        : '';

  // Match summary block
  doc.setTextColor(15, 23, 42);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 40, pageWidth - 28, hasPenalties ? 36 : 30, 3, 3, 'F');

  if (homeLogoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(18, 44, 16, 16, 2, 2, 'F');
    doc.addImage(homeLogoDataUrl, 'PNG', 19, 45, 14, 14);
  }
  if (awayLogoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - 34, 44, 16, 16, 2, 2, 'F');
    doc.addImage(awayLogoDataUrl, 'PNG', pageWidth - 33, 45, 14, 14);
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${homeTeamName}   ${hScore} - ${aScore}   ${awayTeamName}`, pageWidth / 2, 52, {
    align: 'center',
    maxWidth: pageWidth - 80,
  });
  if (hasPenalties) {
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9);
    doc.text(
      `Tanda de Penales (Punto Extra): ${result?.penaltyHomeScore} - ${result?.penaltyAwayScore}${
        penaltyWinnerLabel ? ` · Ganador: ${penaltyWinnerLabel}` : ''
      }`,
      pageWidth / 2,
      59,
      { align: 'center', maxWidth: pageWidth - 76 }
    );
    doc.setTextColor(15, 23, 42);
  }
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Fecha: ${match.date}  |  Hora: ${match.time}  |  Cancha: ${fieldName}  |  Árbitro: ${refereeName}`,
    pageWidth / 2,
    hasPenalties ? 70 : 64,
    { align: 'center', maxWidth: pageWidth - 36 }
  );

  let currentY = hasPenalties ? 84 : 78;
  if (result?.periodScores && result.periodScores.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Periodo', homeTeamName, awayTeamName]],
      body: result.periodScores.map((ps) => [ps.period, ps.home, ps.away]),
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8.5 },
      margin: { left: 14, right: 14, bottom: 20 },
    });
    currentY = getLastTableFinalY(doc, currentY + 20) + 8;
  }

  const eventRows = events
    .slice()
    .sort((a, b) => a.minute - b.minute)
    .map((ev) => [
      `${ev.minute}'`,
      EVENT_TYPE_PDF_LABELS[ev.eventType] || ev.eventType.toUpperCase(),
      teamNames[ev.teamId] || ev.teamId,
      playerNames[ev.playerId] || ev.playerId,
      ev.goalType || (ev.isStarter ? 'Titular' : ev.minutesPlayed ? `${ev.minutesPlayed} min` : '-'),
    ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Min', 'Incidencia / Evento', 'Equipo', 'Jugador', 'Detalle']],
    body: eventRows.length > 0 ? eventRows : [['-', 'Sin incidencias registradas', '-', '-', '-']],
    headStyles: { fillColor: [10, 25, 47] },
    styles: { fontSize: 8.5 },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  currentY = getLastTableFinalY(doc, currentY + 25) + 8;
  if (result?.observations) {
    const obsLines = doc.splitTextToSize(result.observations, pageWidth - 28);
    const neededObsHeight = 12 + obsLines.length * 4.5;
    if (currentY + neededObsHeight > pageHeight - 44) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Observaciones del Árbitro:', 14, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(obsLines, 14, currentY + 5.5);
    currentY += 8 + obsLines.length * 4.5;
  }

  // Formal Official Archive Signatures Block
  if (currentY + 28 > pageHeight - 16) {
    doc.addPage();
    currentY = 24;
  }
  const sigY = Math.max(currentY + 12, pageHeight - 42);
  const colW = (pageWidth - 40) / 3;
  const sigTitles = ['Árbitro Central', 'Capitán / Rep. Local', 'Coordinación / Archivo Oficial'];
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  sigTitles.forEach((label, idx) => {
    const x1 = 14 + idx * (colW + 6);
    const x2 = x1 + colW;
    doc.line(x1, sigY, x2, sigY);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(label, (x1 + x2) / 2, sigY + 4.5, { align: 'center' });
  });
}

export function exportToExcel(payload: ExportTablePayload): void {
  const wb = XLSX.utils.book_new();
  const headerMeta = [
    [payload.organizationName || 'SIGD — Sistema Integral de Gestión Deportiva'],
    [payload.title],
    [payload.subtitle || `Generado: ${new Date().toLocaleString('es-MX')}`],
    [],
    payload.headers,
    ...payload.rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(headerMeta);
  ws['!cols'] = payload.headers.map((h) => ({ wch: Math.max(14, h.length + 6) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, `${payload.fileName}.xlsx`);
}

export async function exportToPdf(payload: ExportTablePayload): Promise<void> {
  const doc = new jsPDF({ orientation: payload.headers.length > 7 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoDataUrl = await loadImageAsPngDataUrl(payload.organizationLogoUrl);

  // Institutional Navy Header Banner
  doc.setFillColor(10, 25, 47); // #0A192F
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(37, 99, 235); // #2563EB electric accent stripe
  doc.rect(0, 28, pageWidth, 2, 'F');

  // Official Organization Logo or SIGD fallback badge
  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 6, 16, 16, 2.5, 2.5, 'F');
    doc.addImage(logoDataUrl, 'PNG', 15, 7, 14, 14);
  } else {
    doc.setFillColor(22, 163, 74); // emerald pitch accent
    doc.roundedRect(14, 6, 16, 16, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SIGD', 22, 16, { align: 'center' });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(payload.title, 36, 13, { maxWidth: pageWidth - 95 });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(payload.organizationName || 'SIGD — Sistema Integral de Gestión Deportiva', 36, 20, {
    maxWidth: pageWidth - 95,
  });
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, pageWidth - 14, 13, {
    align: 'right',
  });
  if (payload.subtitle) {
    doc.text(payload.subtitle, pageWidth - 14, 20, { align: 'right', maxWidth: 65 });
  }

  autoTable(doc, {
    startY: 36,
    head: [payload.headers],
    body: payload.rows,
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [17, 37, 69],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  applyOfficialFooters(
    doc,
    `${payload.organizationName || 'SIGD'} · ${payload.title} · Emitido ${new Date().toLocaleDateString('es-MX')}`
  );
  doc.save(`${payload.fileName}.pdf`);
}

export async function exportMatchSheetPdf(params: {
  match: Match;
  result?: MatchResult;
  events: MatchEvent[];
  tournamentName: string;
  categoryName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogoUrl?: string;
  awayTeamLogoUrl?: string;
  fieldName: string;
  refereeName: string;
  playerNames: Record<string, string>;
  teamNames: Record<string, string>;
  organizationName?: string;
  organizationLogoUrl?: string;
}): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait' });
  const [logoDataUrl, homeLogoDataUrl, awayLogoDataUrl] = await Promise.all([
    loadImageAsPngDataUrl(params.organizationLogoUrl),
    loadImageAsPngDataUrl(params.homeTeamLogoUrl),
    loadImageAsPngDataUrl(params.awayTeamLogoUrl),
  ]);

  drawMatchSheetContent({
    doc,
    item: {
      match: params.match,
      result: params.result,
      events: params.events,
      categoryName: params.categoryName,
      homeTeamName: params.homeTeamName,
      awayTeamName: params.awayTeamName,
      homeTeamLogoUrl: params.homeTeamLogoUrl,
      awayTeamLogoUrl: params.awayTeamLogoUrl,
      fieldName: params.fieldName,
      refereeName: params.refereeName,
    },
    tournamentName: params.tournamentName,
    organizationName: params.organizationName,
    logoDataUrl,
    homeLogoDataUrl,
    awayLogoDataUrl,
    playerNames: params.playerNames,
    teamNames: params.teamNames,
  });

  applyOfficialFooters(
    doc,
    `${params.organizationName || 'SIGD'} · Acta Oficial Partido #${params.match.matchNumber}`
  );
  doc.save(`Acta_Partido_${params.match.matchNumber}.pdf`);
}

export async function exportOfficialArchivePdf(params: OfficialArchivePdfParams): Promise<void> {
  const {
    fileName,
    organizationName,
    organizationLogoUrl,
    tournamentName,
    seasonName,
    scopeLabel,
    summaryMetrics,
    statSections,
    matchSheets,
    playerNames,
    teamNames,
    generatedBy,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const getCachedLogo = createImageCache();

  // Preload organization logo & all unique team crests in parallel
  const uniqueUrls = new Set<string>();
  if (organizationLogoUrl) uniqueUrls.add(organizationLogoUrl);
  matchSheets.forEach((ms) => {
    if (ms.homeTeamLogoUrl) uniqueUrls.add(ms.homeTeamLogoUrl);
    if (ms.awayTeamLogoUrl) uniqueUrls.add(ms.awayTeamLogoUrl);
  });
  await Promise.all(Array.from(uniqueUrls).map((u) => getCachedLogo(u)));

  const logoDataUrl = await getCachedLogo(organizationLogoUrl);
  const nowStr = new Date().toLocaleDateString('es-MX');
  const nowTimeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  // Cover / Official Archive Header Banner
  doc.setFillColor(10, 25, 47);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 38, pageWidth, 2.5, 'F');

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 8, 22, 22, 2.5, 2.5, 'F');
    doc.addImage(logoDataUrl, 'PNG', 15, 9, 20, 20);
  } else {
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(14, 8, 22, 22, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SIGD', 25, 21, { align: 'center' });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('EXPEDIENTE DE ARCHIVO OFICIAL', 42, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${tournamentName}${seasonName ? ` · ${seasonName}` : ''}`, 42, 23, {
    maxWidth: pageWidth - 95,
  });
  doc.setFontSize(8.5);
  doc.text(`${organizationName} · ${scopeLabel}`, 42, 29.5, {
    maxWidth: pageWidth - 95,
  });

  doc.setFontSize(8.5);
  doc.text(`Fecha: ${nowStr}`, pageWidth - 14, 16, { align: 'right' });
  doc.text(`Hora: ${nowTimeStr}`, pageWidth - 14, 22, { align: 'right' });
  if (generatedBy) {
    doc.setFontSize(7.5);
    doc.text(`Emite: ${generatedBy}`, pageWidth - 14, 28.5, { align: 'right', maxWidth: 55 });
  }

  // Executive Summary Cards
  let currentY = 47;
  if (summaryMetrics.length > 0) {
    const gap = 4;
    const cols = Math.min(summaryMetrics.length, 4);
    const cardW = (pageWidth - 28 - gap * (cols - 1)) / cols;
    summaryMetrics.slice(0, 4).forEach((m, idx) => {
      const x = 14 + idx * (cardW + gap);
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(x, currentY, cardW, 18, 2, 2, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(m.label.toUpperCase(), x + 4, currentY + 6, { maxWidth: cardW - 8 });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(10, 25, 47);
      doc.text(String(m.value), x + 4, currentY + 14);
    });
    currentY += 25;
  }

  // Statistical Tables Sections
  statSections.forEach((section) => {
    if (currentY > pageHeight - 52) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 25, 47);
    doc.text(section.title, 14, currentY);
    if (section.subtitle) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(section.subtitle, pageWidth - 14, currentY, { align: 'right' });
    }
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      head: [section.headers],
      body:
        section.rows.length > 0
          ? section.rows
          : [[...section.headers.map((_, i) => (i === 0 ? 'Sin registros disponibles' : '-'))]],
      styles: {
        fontSize: section.headers.length > 9 ? 7.5 : 8,
        cellPadding: 2.4,
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [17, 37, 69],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });

    currentY = getLastTableFinalY(doc, currentY + 24) + 10;
  });

  // Official Certification Block at the end of Statistics Summary
  if (statSections.length > 0) {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 24;
    }
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.35);
    const sigWidth = (pageWidth - 40) / 2;
    doc.line(14, currentY + 14, 14 + sigWidth, currentY + 14);
    doc.line(pageWidth - 14 - sigWidth, currentY + 14, pageWidth - 14, currentY + 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Coordinación Deportiva / Estadística', 14 + sigWidth / 2, currentY + 19, {
      align: 'center',
    });
    doc.text('Vo. Bo. Dirección / Archivo Oficial', pageWidth - 14 - sigWidth / 2, currentY + 19, {
      align: 'center',
    });
  }

  // Dedicated Printable Pages for Every Match Sheet
  for (let idx = 0; idx < matchSheets.length; idx += 1) {
    const sheet = matchSheets[idx];
    const shouldAddPage = statSections.length > 0 || summaryMetrics.length > 0 || idx > 0;
    if (shouldAddPage) {
      doc.addPage();
    }

    const [homeLogoDataUrl, awayLogoDataUrl] = await Promise.all([
      getCachedLogo(sheet.homeTeamLogoUrl),
      getCachedLogo(sheet.awayTeamLogoUrl),
    ]);

    drawMatchSheetContent({
      doc,
      item: sheet,
      tournamentName,
      organizationName,
      logoDataUrl,
      homeLogoDataUrl,
      awayLogoDataUrl,
      playerNames,
      teamNames,
    });
  }

  applyOfficialFooters(
    doc,
    `Archivo Oficial · ${organizationName} · ${tournamentName} (${nowStr})`
  );
  doc.save(`${fileName}.pdf`);
}
