import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Match, MatchEvent, MatchResult } from '../types/sigd';

export interface ExportTablePayload {
  title: string;
  subtitle?: string;
  organizationName?: string;
  organizationLogoUrl?: string;
  fileName: string;
  headers: string[];
  rows: (string | number)[][];
}

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
  doc.text(payload.title, 36, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(payload.organizationName || 'SIGD — Sistema Integral de Gestión Deportiva', 36, 20);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, pageWidth - 14, 13, {
    align: 'right',
  });
  if (payload.subtitle) {
    doc.text(payload.subtitle, pageWidth - 14, 20, { align: 'right' });
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
    margin: { left: 14, right: 14 },
  });

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
  const {
    match,
    result,
    events,
    tournamentName,
    categoryName,
    homeTeamName,
    awayTeamName,
    homeTeamLogoUrl,
    awayTeamLogoUrl,
    fieldName,
    refereeName,
    playerNames,
    teamNames,
    organizationName,
    organizationLogoUrl,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const [logoDataUrl, homeLogoDataUrl, awayLogoDataUrl] = await Promise.all([
    loadImageAsPngDataUrl(organizationLogoUrl),
    loadImageAsPngDataUrl(homeTeamLogoUrl),
    loadImageAsPngDataUrl(awayTeamLogoUrl),
  ]);

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
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`ACTA DIGITAL OFICIAL — PARTIDO #${match.matchNumber}`, 40, 13.5);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${tournamentName} · ${categoryName}`, 40, 20.5);
  if (organizationName) {
    doc.setFontSize(8);
    doc.text(organizationName, 40, 26.5);
  }
  doc.setFontSize(9);
  doc.text(`Estado: ${result?.validationStatus?.toUpperCase() || match.status}`, pageWidth - 14, 20.5, {
    align: 'right',
  });

  // Match summary block
  doc.setTextColor(15, 23, 42);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 40, pageWidth - 28, 30, 3, 3, 'F');

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
  const hScore = result?.homeScore ?? match.homeScore ?? 0;
  const aScore = result?.awayScore ?? match.awayScore ?? 0;
  doc.text(`${homeTeamName}   ${hScore} - ${aScore}   ${awayTeamName}`, pageWidth / 2, 52, {
    align: 'center',
    maxWidth: pageWidth - 80,
  });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Fecha: ${match.date}  |  Hora: ${match.time}  |  Cancha: ${fieldName}  |  Árbitro: ${refereeName}`,
    pageWidth / 2,
    64,
    { align: 'center', maxWidth: pageWidth - 36 }
  );

  // Period scores
  let currentY = 78;
  if (result?.periodScores && result.periodScores.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Periodo', homeTeamName, awayTeamName]],
      body: result.periodScores.map((ps) => [ps.period, ps.home, ps.away]),
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8.5 },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // Events table
  const eventRows = events
    .slice()
    .sort((a, b) => a.minute - b.minute)
    .map((ev) => [
      `${ev.minute}'`,
      ev.eventType.toUpperCase(),
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
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  if (result?.observations) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones del Árbitro:', 14, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(result.observations, pageWidth - 28), 14, currentY + 6);
  }

  doc.save(`Acta_Partido_${match.matchNumber}.pdf`);
}
