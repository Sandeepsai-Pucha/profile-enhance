// src/utils/downloadPDF.ts
// ─────────────────────────
// Generate and download a candidate match report PDF using jsPDF.

import jsPDF from "jspdf";
import type { CandidateMatchResult } from "../types";

type RGB = [number, number, number];

const PRIMARY: RGB = [15, 23, 42];    // #0F172A
const BLUE: RGB    = [30, 58, 138];   // blue-900
const GREEN: RGB   = [21, 128, 61];   // green-700
const RED: RGB     = [185, 28, 28];   // red-700
const AMBER: RGB   = [180, 83, 9];    // amber-700
const GRAY: RGB    = [100, 116, 139]; // slate-500
const LIGHT: RGB   = [241, 245, 249]; // slate-100

function setColor(doc: jsPDF, rgb: RGB) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setFill(doc: jsPDF, rgb: RGB) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

export function downloadCandidatePDF(
  candidate: CandidateMatchResult,
  jdTitle: string,
) {
  const doc    = new jsPDF({ unit: "mm", format: "a4" });
  const PAGE_W = 210;
  const MARGIN = 14;
  const RIGHT  = PAGE_W - MARGIN; // 196mm — right safe edge
  const BODY_W = RIGHT - MARGIN;  // 182mm — usable body width
  let y = 0;

  // ── helpers ───────────────────────────────────────────────────

  function addPage() {
    doc.addPage();
    y = MARGIN;
  }

  function checkY(needed: number) {
    if (y + needed > 282) addPage();
  }

  // Colored header bar — no emoji (helvetica doesn't support them)
  function sectionHeader(title: string, color: RGB = BLUE) {
    checkY(14);
    setFill(doc, color);
    doc.rect(MARGIN, y, BODY_W, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(doc, [255, 255, 255]);
    doc.text(title.toUpperCase(), MARGIN + 3, y + 5);
    y += 11;
  }

  // Draw a single pill badge; returns width consumed
  function pill(text: string, x: number, py: number, fill: RGB, textColor: RGB): number {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    const w = doc.getTextWidth(text) + 5;
    setFill(doc, fill);
    doc.roundedRect(x, py - 3.2, w, 5, 1.5, 1.5, "F");
    setColor(doc, textColor);
    doc.text(text, x + 2.5, py);
    return w + 1.5;
  }

  // Render a list of skill pills, wrapping to the next line when needed
  function pillRow(skills: string[], fill: RGB, textColor: RGB, lineH = 8) {
    let px = MARGIN;
    for (const skill of skills) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      const w = doc.getTextWidth(skill) + 5 + 1.5;
      if (px + w > RIGHT) {
        px = MARGIN;
        y += lineH;
        checkY(lineH);
      }
      pill(skill, px, y, fill, textColor);
      px += w;
    }
    y += lineH;
  }

  const r     = candidate.parsed_resume;
  const score = Math.round(candidate.match_score);

  // ════════════════════════════════════════════════════════════
  //  HEADER BAR
  // ════════════════════════════════════════════════════════════
  setFill(doc, PRIMARY);
  doc.rect(0, 0, PAGE_W, 30, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  setColor(doc, [255, 255, 255]);
  doc.text("Resume Match Report", MARGIN, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, [148, 163, 184]);
  const jdDisplay = jdTitle.length > 68 ? jdTitle.slice(0, 68) + "..." : jdTitle;
  doc.text(jdDisplay, MARGIN, 22);

  // Score circle (top-right)
  const scoreColor: RGB =
    score >= 80 ? [21, 128, 61] : score >= 60 ? [180, 83, 9] : [185, 28, 28];
  const cx = RIGHT - 13;
  setFill(doc, scoreColor);
  doc.circle(cx, 15, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  setColor(doc, [255, 255, 255]);
  doc.text(`${score}`, cx, 17, { align: "center" });
  doc.setFontSize(6.5);
  doc.text("/ 100", cx, 22, { align: "center" });

  y = 37;

  // ════════════════════════════════════════════════════════════
  //  CANDIDATE INFO
  // ════════════════════════════════════════════════════════════
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setColor(doc, PRIMARY);
  doc.text(r.name, MARGIN, y);
  y += 7;

  const roleLine = [
    r.current_role,
    r.experience_years ? `${r.experience_years} yrs exp` : "",
  ].filter(Boolean).join("  |  ");
  if (roleLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(doc, GRAY);
    doc.text(roleLine, MARGIN, y, { maxWidth: BODY_W });
    y += 5.5;
  }

  const contactLine = [r.email, r.phone].filter(Boolean).join("   |   ");
  if (contactLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setColor(doc, GRAY);
    doc.text(contactLine, MARGIN, y, { maxWidth: BODY_W });
    y += 5;
  }

  if (r.education) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(doc, GRAY);
    doc.text(`Education: ${r.education}`, MARGIN, y, { maxWidth: BODY_W });
    y += 5;
  }

  // Experience match badge
  const expLabel = candidate.experience_match || "";
  if (expLabel) {
    const expFill: RGB =
      expLabel === "Good fit" ? [220, 252, 231] :
      expLabel === "Over-qualified" ? [224, 242, 254] : [254, 243, 199];
    const expText: RGB =
      expLabel === "Good fit" ? [21, 128, 61] :
      expLabel === "Over-qualified" ? [3, 105, 161] : [180, 83, 9];
    pill(expLabel, MARGIN, y, expFill, expText);
    y += 9;
  }

  // AI Summary — CRITICAL: set font BEFORE splitTextToSize
  if (candidate.ai_summary) {
    checkY(16);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    const summaryLines = doc.splitTextToSize(candidate.ai_summary, BODY_W - 8);
    const boxH = summaryLines.length * 5 + 7;
    checkY(boxH);
    setFill(doc, LIGHT);
    doc.rect(MARGIN, y - 2, BODY_W, boxH, "F");
    setColor(doc, [71, 85, 105]);
    doc.text(summaryLines, MARGIN + 4, y + 4);
    y += boxH + 5;
  }

  // ════════════════════════════════════════════════════════════
  //  MATCHED SKILLS
  // ════════════════════════════════════════════════════════════
  if (candidate.matched_skills.length > 0) {
    sectionHeader(`Matched Skills (${candidate.matched_skills.length})`, [21, 128, 61]);
    pillRow(candidate.matched_skills, [220, 252, 231], GREEN);
    y += 3;
  }

  // ════════════════════════════════════════════════════════════
  //  SKILLS TO DEVELOP
  // ════════════════════════════════════════════════════════════
  if (candidate.missing_skills.length > 0) {
    sectionHeader(`Skills to Develop (${candidate.missing_skills.length})`, [185, 28, 28]);
    pillRow(candidate.missing_skills, [254, 226, 226], RED);
    y += 3;
  }

  // ════════════════════════════════════════════════════════════
  //  IMPROVEMENT SUGGESTIONS
  // ════════════════════════════════════════════════════════════
  if (candidate.improvement_suggestions.length > 0) {
    sectionHeader("Resume Improvement Suggestions", AMBER);

    candidate.improvement_suggestions.forEach((s, i) => {
      // Set font size BEFORE splitTextToSize — otherwise split widths won't match rendered widths
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const textX  = MARGIN + 9; // indent for number badge
      const textW  = RIGHT - textX;
      const lines  = doc.splitTextToSize(s, textW);
      const blockH = lines.length * 5 + 4;
      checkY(blockH + 2);

      // Number circle
      setFill(doc, [254, 243, 199]);
      doc.circle(MARGIN + 3.5, y + 1.5, 3.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      setColor(doc, AMBER);
      doc.text(`${i + 1}`, MARGIN + 3.5, y + 2.5, { align: "center" });

      // Suggestion text (font already set above)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      setColor(doc, [92, 64, 5]);
      doc.text(lines, textX, y);
      y += blockH;
    });
    y += 4;
  }

  // ════════════════════════════════════════════════════════════
  //  SAMPLE INTERVIEW QUESTIONS
  // ════════════════════════════════════════════════════════════
  const questions = candidate.interview_questions || [];
  if (questions.length > 0) {
    sectionHeader("Sample Interview Questions", PRIMARY);

    // Group by difficulty
    const grouped: Record<string, typeof questions> = {};
    for (const q of questions) {
      const diff = q.difficulty || "General";
      if (!grouped[diff]) grouped[diff] = [];
      grouped[diff].push(q);
    }

    const diffOrder = ["Easy", "Medium", "Hard", "General"];
    const presentDiffs = diffOrder.filter((d) => grouped[d]);
    for (const d of Object.keys(grouped)) {
      if (!presentDiffs.includes(d)) presentDiffs.push(d);
    }

    for (const diff of presentDiffs) {
      const qs = grouped[diff];
      if (!qs?.length) continue;

      // Difficulty label
      checkY(12);
      const diffFill: RGB =
        diff === "Easy"   ? [220, 252, 231] :
        diff === "Medium" ? [254, 243, 199] :
        diff === "Hard"   ? [254, 226, 226] : [241, 245, 249];
      const diffText: RGB =
        diff === "Easy"   ? GREEN :
        diff === "Medium" ? AMBER :
        diff === "Hard"   ? RED   : GRAY;
      setFill(doc, diffFill);
      doc.rect(MARGIN, y - 3, BODY_W, 6.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      setColor(doc, diffText);
      doc.text(diff, MARGIN + 3, y + 1.5);
      y += 9;

      qs.forEach((q, qi) => {
        // Set font BEFORE splitTextToSize
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        const fullText = `Q${qi + 1}.  ${q.question}`;
        const lines    = doc.splitTextToSize(fullText, BODY_W - 2);
        const blockH   = lines.length * 5 + (q.category ? 5 : 0) + 4;
        checkY(blockH);

        setColor(doc, [30, 41, 59]);
        doc.text(lines, MARGIN + 1, y);
        y += lines.length * 5;

        if (q.category) {
          doc.setFontSize(7.5);
          setColor(doc, GRAY);
          doc.text(`[ ${q.category} ]`, MARGIN + 1, y);
          y += 5;
        }
        y += 4;
      });
      y += 4;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  FOOTER (every page)
  // ════════════════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(doc, [148, 163, 184]);
    doc.line(MARGIN, 288, RIGHT, 288);
    doc.text("Generated by Skillify — For Internal Use Only", MARGIN, 293);
    doc.text(`Page ${p} of ${pageCount}`, RIGHT, 293, { align: "right" });
  }

  // ── save ──────────────────────────────────────────────────────
  const safeName = r.name.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`${safeName}_MatchReport.pdf`);
}
