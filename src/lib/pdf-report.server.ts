// Server-side PDF renderer. Uses jsPDF (pure JS) inside the Workers runtime.
// Replace with a passthrough of fpdf2's bytes when the real backend lands.
import { jsPDF } from "jspdf";
import type { StructuredReport } from "@/services/api";

export function renderReportPdf(report: StructuredReport): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const heading = (text: string) => {
    ensure(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(text, margin, y);
    y += 18;
  };
  const body = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensure(14);
      doc.text(line, margin, y);
      y += 14;
    }
  };
  const bullets = (items: string[]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, maxWidth - 14) as string[];
      lines.forEach((line, i) => {
        ensure(14);
        doc.text(i === 0 ? `\u2022 ${line}` : `  ${line}`, margin, y);
        y += 14;
      });
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Maai clinical record", margin, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Generated ${new Date(report.generated_at).toLocaleString()}`, margin, y);
  y += 18;

  heading("Patient");
  const p = report.patient;
  body(
    [
      `Name: ${p.name}`,
      p.dob ? `Date of birth: ${p.dob}` : null,
      p.sex ? `Sex: ${p.sex}` : null,
      p.clinician ? `Clinician: ${p.clinician}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  y += 6;

  heading("Patient summary");
  body(report.patient_summary);
  y += 6;

  heading("Key findings");
  bullets(report.key_findings);
  y += 6;

  heading("Risk indicators");
  bullets(report.risk_indicators);
  y += 6;

  heading("Recommendations");
  bullets(report.recommendations);
  y += 6;

  heading("Follow-up actions");
  bullets(report.follow_up_actions);
  y += 6;

  const s = report.socrates;
  const socratesRows: [string, string | null][] = [
    ["Site", s.site],
    ["Onset", s.onset],
    ["Character", s.character],
    ["Radiation", s.radiation],
    ["Associations", s.associations],
    ["Time course", s.time_course],
    ["Exacerbating / relieving", s.exacerbating_relieving],
    ["Severity", s.severity],
  ];
  heading("SOCRATES pain assessment");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(110);
  ensure(12);
  doc.text(
    "Site · Onset · Character · Radiation · Associations · Time course · Exacerbating/relieving · Severity",
    margin,
    y,
  );
  y += 14;
  doc.setTextColor(40);
  for (const [label, value] of socratesRows) {
    const text = value ?? "Not described";
    const lines = doc.splitTextToSize(`${label}: ${text}`, maxWidth) as string[];
    doc.setFont("helvetica", value ? "normal" : "italic");
    doc.setFontSize(11);
    doc.setTextColor(value ? 40 : 140);
    for (const line of lines) {
      ensure(14);
      doc.text(line, margin, y);
      y += 14;
    }
  }
  doc.setTextColor(40);
  y += 6;

  if (report.clinical_terms.length) {
    heading("Extracted clinical terms");
    body(report.clinical_terms.join(", "));
    y += 6;
  }

  const buffer = doc.output("arraybuffer");
  return new Uint8Array(buffer);
}