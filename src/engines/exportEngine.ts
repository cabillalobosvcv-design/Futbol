import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Match, MatchEvent, MatchResult } from '../types/sigd';

export interface ExportTablePayload {
  title: string;
  subtitle?: string;
  organizationName?: string;
  fileName: string;
  headers: string[];
  rows: (string | number)[][];
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

export function exportToPdf(payload: ExportTablePayload): void {
  const doc = new jsPDF({ orientation: payload.headers.length > 7 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Institutional Navy Header Banner
  doc.setFillColor(10, 25, 47); // #0A192F
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(37, 99, 235); // #2563EB electric accent stripe
  doc.rect(0, 28, pageWidth, 2, 'F');

  // Crest badge box
  doc.setFillColor(22, 163, 74); // emerald pitch accent
  doc.roundedRect(14, 6, 16, 16, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SIGD', 22, 16, { align: 'center' });

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

export function exportMatchSheetPdf(params: {
  match: Match;
  result?: MatchResult;
  events: MatchEvent[];
  tournamentName: string;
  categoryName: string;
  homeTeamName: string;
  awayTeamName: string;
  fieldName: string;
  refereeName: string;
  playerNames: Record<string, string>;
  teamNames: Record<string, string>;
}): void {
  const {
    match,
    result,
    events,
    tournamentName,
    categoryName,
    homeTeamName,
    awayTeamName,
    fieldName,
    refereeName,
    playerNames,
    teamNames,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 25, 47);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(22, 163, 74);
  doc.rect(0, 32, pageWidth, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(`ACTA DIGITAL OFICIAL — PARTIDO #${match.matchNumber}`, 14, 14);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${tournamentName} · ${categoryName}`, 14, 22);
  doc.text(`Estado: ${result?.validationStatus?.toUpperCase() || match.status}`, pageWidth - 14, 22, {
    align: 'right',
  });

  // Match summary block
  doc.setTextColor(15, 23, 42);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 40, pageWidth - 28, 30, 3, 3, 'F');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const hScore = result?.homeScore ?? match.homeScore ?? 0;
  const aScore = result?.awayScore ?? match.awayScore ?? 0;
  doc.text(`${homeTeamName}   ${hScore} - ${aScore}   ${awayTeamName}`, pageWidth / 2, 52, {
    align: 'center',
  });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Fecha: ${match.date}  |  Hora: ${match.time}  |  Cancha: ${fieldName}  |  Árbitro: ${refereeName}`,
    pageWidth / 2,
    62,
    { align: 'center' }
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
