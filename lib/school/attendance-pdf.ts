import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DateTime } from "luxon";

export type TeacherAttendancePdfRow = {
  day: string;
  inTime: string;
  outTime: string;
  dutyHours: number;
  workPlace: string;
  remark: string;
};

export type TeacherMonthData = {
  month: string;
  zone: string;
  entries: TeacherAttendancePdfRow[];
  worker: {
    id: string;
    employeeId: string | null;
    name: string | null;
    designation: string | null;
  };
  totalHours: number;
};

async function fetchSchoolLogo(): Promise<string | null> {
  try {
    let res = await fetch("/branding/mhms-logo.png");
    if (!res.ok) res = await fetch("/branding/mtes-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const reader = new FileReader();
    return await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generates an official, print-ready PDF for Teacher Attendance (Single Month, Yearly, or Period)
 */
export async function generateTeacherAttendancePdf({
  monthsData,
  titlePeriod,
  filePrefix = "teacher-attendance",
}: {
  monthsData: TeacherMonthData[];
  titlePeriod: string;
  filePrefix?: string;
}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await fetchSchoolLogo();
  const workerMeta = monthsData[0]?.worker;
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  const drawHeader = (monthLabel: string) => {
    const y = 20;
    if (logo) {
      doc.addImage(logo, "PNG", marginX, y, 42, 42);
    }

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(24, 24, 27);
    doc.text("MUNSHI HABIBULLAH MISSION SCHOOL", centerX, y + 12, { align: "center" });

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Bemathang, Kargil, UT Ladakh - 194103", centerX, y + 24, { align: "center" });
    doc.text("Affiliated to JKBOSE | Managed by Mutahhary Educational Society (MTES)", centerX, y + 34, { align: "center" });

    doc.setDrawColor(210, 210, 215);
    doc.line(marginX, y + 42, pageWidth - marginX, y + 42);

    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(24, 24, 27);
    doc.text("FACULTY & STAFF ATTENDANCE REPORT", centerX, y + 56, { align: "center" });

    const rawDesig = workerMeta?.designation || "Teacher";
    const designationFormatted =
      rawDesig.charAt(0).toUpperCase() + rawDesig.slice(1);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    doc.text(`Teacher Name: ${workerMeta?.name ?? "Teacher"}`, marginX, y + 72);
    doc.text(`Teacher ID: ${workerMeta?.employeeId ?? "—"}`, marginX + 185, y + 72);
    doc.text(`Designation: ${designationFormatted}`, marginX + 345, y + 72);

    const periodDisplay =
      monthLabel === titlePeriod || !titlePeriod
        ? monthLabel
        : `${monthLabel} (Report Period: ${titlePeriod})`;
    doc.text(`Attendance Period: ${periodDisplay}`, marginX, y + 85);

    return y + 96;
  };

  let grandTotalHours = 0;
  let grandPresentDays = 0;
  let grandAbsentDays = 0;
  let grandLeaveDays = 0;

  for (let i = 0; i < monthsData.length; i++) {
    const p = monthsData[i]!;
    if (i > 0) doc.addPage("a4");

    const pMonthParts = p.month.split("-").map(Number);
    const monthLabel =
      pMonthParts.length === 2 && Number.isFinite(pMonthParts[0]) && Number.isFinite(pMonthParts[1])
        ? DateTime.fromObject({ year: pMonthParts[0]!, month: pMonthParts[1]! }).toFormat("LLLL yyyy")
        : p.month;

    const startY = drawHeader(monthLabel);

    let mPresent = 0;
    let mAbsent = 0;
    let mLeave = 0;
    let mSunday = 0;

    const todayInZone = DateTime.now().setZone(p.zone).toISODate()!;
    const tableRows = p.entries.map((r) => {
      const rem = (r.remark || "").toLowerCase();
      const isFuture = r.day > todayInZone;
      let status = "Present";
      if (rem.includes("leave")) {
        status = rem.includes("medical") ? "Medical Leave" : "Casual Leave";
        mLeave++;
      } else if (rem.includes("sunday") || rem.includes("holiday")) {
        status = "Sunday Off";
        mSunday++;
      } else if (isFuture || rem.includes("unmarked") || rem.includes("before")) {
        status = "Unmarked";
      } else if (rem.includes("absent") || (r.inTime === "—" && r.dutyHours === 0)) {
        status = "Absent";
        mAbsent++;
      } else {
        mPresent++;
      }

      const dt = DateTime.fromISO(r.day, { zone: p.zone });
      const dow = dt.isValid ? dt.toFormat("ccc") : "";

      return [
        r.day,
        dow,
        status,
        r.inTime || "—",
        r.outTime || "—",
        r.dutyHours > 0 ? `${r.dutyHours.toFixed(2)} h` : "—",
        r.workPlace || "MHMS Main Campus",
        r.remark || status,
      ];
    });

    const mWorkingDays = mPresent + mAbsent + mLeave;
    const mRate = mWorkingDays > 0 ? Math.round((mPresent / mWorkingDays) * 100) : 0;

    autoTable(doc, {
      startY,
      head: [
        [
          "Date",
          "Day",
          "Status",
          "Punch In",
          "Punch Out",
          "Hours",
          "Campus / Site",
          "Remarks",
        ],
      ],
      body: tableRows,
      foot: [
        [
          {
            content: `Summary: Present: ${mPresent} Days | Absent: ${mAbsent} Days | Approved Leaves: ${mLeave} Days | Total Hours: ${p.totalHours.toFixed(2)} hrs | Attendance Rate: ${mRate}%`,
            colSpan: 8,
          },
        ],
      ],
      showFoot: "lastPage",
      styles: { fontSize: 8, cellPadding: 4.5 },
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      footStyles: {
        fillColor: [240, 243, 246],
        textColor: [20, 20, 20],
        fontStyle: "bold",
        fontSize: 8.5,
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 35 },
        2: { cellWidth: 65, fontStyle: "bold" },
        3: { cellWidth: 55 },
        4: { cellWidth: 55 },
        5: { cellWidth: 45, halign: "center" },
        6: { cellWidth: 95 },
        7: { cellWidth: 105 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 2) {
          const val = String(hookData.cell.raw);
          if (val === "Present") {
            hookData.cell.styles.textColor = [16, 130, 60];
          } else if (val === "Absent") {
            hookData.cell.styles.textColor = [200, 30, 30];
          } else if (val.includes("Leave")) {
            hookData.cell.styles.textColor = [30, 90, 200];
          } else if (val.includes("Sunday")) {
            hookData.cell.styles.textColor = [120, 120, 120];
          } else if (val === "Unmarked") {
            hookData.cell.styles.textColor = [140, 140, 140];
          }
        }
      },
    });

    grandPresentDays += mPresent;
    grandAbsentDays += mAbsent;
    grandLeaveDays += mLeave;
    grandTotalHours += p.totalHours;

    // Signatures at end of month page
    const finalY = (doc as any).lastAutoTable?.finalY ?? 680;
    const sigY = Math.min(finalY + 45, 785);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);

    doc.line(marginX, sigY, marginX + 130, sigY);
    doc.text("Staff / Teacher Signature", marginX, sigY + 12);

    doc.line(pageWidth - marginX - 130, sigY, pageWidth - marginX, sigY);
    doc.text("Principal / Administrator", pageWidth - marginX - 130, sigY + 12);
  }

  // If multi-month (yearly or period range), add Final Consolidated Summary Page
  if (monthsData.length > 1) {
    doc.addPage("a4");
    const y = drawHeader("Consolidated Period Summary");
    const totalWkDays = grandPresentDays + grandAbsentDays + grandLeaveDays;
    const grandRate = totalWkDays > 0 ? Math.round((grandPresentDays / totalWkDays) * 100) : 0;

    autoTable(doc, {
      startY: y,
      head: [["Attendance Performance Metric", "Total Value", "Status / Notes"]],
      body: [
        ["Total Recorded Months", String(monthsData.length), `Export for ${titlePeriod}`],
        ["Total Days Present", `${grandPresentDays} Days`, "Attended roll call on schedule"],
        ["Total Days Absent", `${grandAbsentDays} Days`, "Unexcused absences"],
        ["Approved Leaves Taken", `${grandLeaveDays} Days`, "Casual & Medical leaves approved"],
        ["Total Working Hours", `${grandTotalHours.toFixed(2)} hrs`, "Cumulative on-site duty hours"],
        ["Overall Attendance Rate", `${grandRate}%`, grandRate >= 75 ? "Satisfactory" : "Below Requirement"],
      ],
      styles: { fontSize: 9.5, cellPadding: 6 },
      headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: "bold" },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 400;
    const sigY = Math.min(finalY + 60, 770);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);

    doc.line(marginX, sigY, marginX + 140, sigY);
    doc.text("Staff / Teacher Signature", marginX, sigY + 12);

    doc.line(pageWidth - marginX - 140, sigY, pageWidth - marginX, sigY);
    doc.text("Principal / Administrator", pageWidth - marginX - 140, sigY + 12);
  }

  return doc;
}

/**
 * Generates an official, print-ready PDF for Daily Student Roll Call Attendance
 */
export async function downloadStudentDailyAttendancePdf({
  classId,
  sectionId,
  dateStr,
  students,
  statusMap,
}: {
  classId: string;
  sectionId: string;
  dateStr: string;
  students: Array<{ id: string; rollNo: number; name: string; parentPhone?: string }>;
  statusMap: Record<string, "present" | "absent" | "late">;
}): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await fetchSchoolLogo();
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const y = 20;

  if (logo) {
    doc.addImage(logo, "PNG", marginX, y, 44, 44);
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 24, 27);
  doc.text("MUNSHI HABIBULLAH MISSION SCHOOL", centerX, y + 12, { align: "center" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Bemathang, Kargil, UT Ladakh - 194103", centerX, y + 24, { align: "center" });
  doc.text("Affiliated to JKBOSE | Managed by Mutahhary Educational Society (MTES)", centerX, y + 34, { align: "center" });

  doc.setDrawColor(210, 210, 215);
  doc.line(marginX, y + 42, pageWidth - marginX, y + 42);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 24, 27);
  doc.text("STUDENT DAILY ATTENDANCE ROLL CALL SHEET", centerX, y + 56, { align: "center" });

  const presentCount = students.filter((s) => statusMap[s.id] === "present").length;
  const absentCount = students.filter((s) => statusMap[s.id] === "absent").length;
  const lateCount = students.filter((s) => statusMap[s.id] === "late").length;
  const unmarkedCount = students.filter((s) => !statusMap[s.id]).length;
  const total = students.length;
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);

  doc.text(`Class & Section: ${classId} (${sectionId})`, marginX, y + 72);
  doc.text(`Roll Call Date: ${dateStr}`, marginX + 200, y + 72);
  doc.text(`Total Enrolled: ${total} Students`, marginX + 370, y + 72);

  doc.text(`Present: ${presentCount}`, marginX, y + 86);
  doc.text(`Absent: ${absentCount}`, marginX + 90, y + 86);
  doc.text(`Leave: ${lateCount}`, marginX + 175, y + 86);
  doc.text(`Unmarked: ${unmarkedCount}`, marginX + 250, y + 86);
  doc.text(`Attendance Rate: ${rate}%`, marginX + 370, y + 86);

  const tableRows = students.map((s, idx) => {
    const st = statusMap[s.id];
    const statusText = st === "present" ? "PRESENT" : st === "absent" ? "ABSENT" : st === "late" ? "LEAVE" : "UNMARKED";
    return [
      String(s.rollNo || idx + 1),
      s.name,
      s.parentPhone || "—",
      statusText,
      "",
    ];
  });

  autoTable(doc, {
    startY: y + 98,
    head: [["Roll No.", "Student Name", "Parent Contact", "Status", "Teacher Notes / Remarks"]],
    body: tableRows,
    styles: { fontSize: 8.5, cellPadding: 4.5 },
    headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 50, halign: "center" },
      1: { cellWidth: 165 },
      2: { cellWidth: 100 },
      3: { cellWidth: 80, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 120 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 3) {
        const val = String(hookData.cell.raw);
        if (val === "PRESENT") hookData.cell.styles.textColor = [16, 128, 64];
        else if (val === "ABSENT") hookData.cell.styles.textColor = [200, 30, 30];
        else if (val === "LEAVE" || val === "LATE") hookData.cell.styles.textColor = [190, 110, 0];
        else if (val === "UNMARKED") hookData.cell.styles.textColor = [120, 120, 120];
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 650;
  const sigY = Math.min(finalY + 45, 780);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  doc.line(marginX, sigY, marginX + 140, sigY);
  doc.text("Class Incharge Signature", marginX, sigY + 12);

  doc.line(pageWidth - marginX - 140, sigY, pageWidth - marginX, sigY);
  doc.text("Principal / Headmaster", pageWidth - marginX - 140, sigY + 12);

  doc.save(`MHMS-Student-Attendance-${classId.replace(/\s+/g, "_")}-${sectionId.replace(/\s+/g, "_")}-${dateStr}.pdf`);
}

/**
 * Generates an official, print-ready PDF for Individual Student Monthly Attendance
 */
export async function downloadStudentMonthlyAttendancePdf({
  student,
  classId,
  sectionId,
  monthStr,
  stats,
}: {
  student: { rollNo: number; name: string; parentPhone?: string };
  classId: string;
  sectionId: string;
  monthStr: string;
  stats: {
    totalMarked: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    percent: number;
    history: Record<string, "present" | "absent" | "late">;
  };
}): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await fetchSchoolLogo();
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const y = 20;

  if (logo) {
    doc.addImage(logo, "PNG", marginX, y, 44, 44);
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 24, 27);
  doc.text("MUNSHI HABIBULLAH MISSION SCHOOL", centerX, y + 12, { align: "center" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Bemathang, Kargil, UT Ladakh - 194103", centerX, y + 24, { align: "center" });
  doc.text("Affiliated to JKBOSE | Managed by Mutahhary Educational Society (MTES)", centerX, y + 34, { align: "center" });

  doc.setDrawColor(210, 210, 215);
  doc.line(marginX, y + 42, pageWidth - marginX, y + 42);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 24, 27);
  doc.text("INDIVIDUAL STUDENT MONTHLY ATTENDANCE RECORD", centerX, y + 56, { align: "center" });

  const mParts = monthStr.split("-").map(Number);
  const monthName =
    mParts.length === 2 && Number.isFinite(mParts[0]) && Number.isFinite(mParts[1])
      ? DateTime.fromObject({ year: mParts[0]!, month: mParts[1]! }).toFormat("LLLL yyyy")
      : monthStr;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);

  doc.text(`Student: ${student.name} (Roll #${student.rollNo})`, marginX, y + 72);
  doc.text(`Class & Section: ${classId} (${sectionId})`, marginX + 220, y + 72);
  doc.text(`Contact: ${student.parentPhone || "—"}`, marginX + 380, y + 72);

  doc.text(`Month: ${monthName}`, marginX, y + 86);
  doc.text(`Present: ${stats.presentDays} Days`, marginX + 110, y + 86);
  doc.text(`Absent: ${stats.absentDays} Days`, marginX + 200, y + 86);
  doc.text(`Leave: ${stats.lateDays} Days`, marginX + 290, y + 86);
  doc.text(`Attendance Rate: ${stats.percent}%`, marginX + 380, y + 86);

  const year = mParts[0] || new Date().getFullYear();
  const month = (mParts[1] || 1) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tableRows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${monthStr}-${String(d).padStart(2, "0")}`;
    const dt = DateTime.fromObject({ year, month: month + 1, day: d });
    const isSunday = dt.weekday === 7;
    const st = stats.history[dayStr];
    let statusText = "Unmarked";
    if (st === "present") statusText = "PRESENT";
    else if (st === "absent") statusText = "ABSENT";
    else if (st === "late") statusText = "LEAVE";
    else if (isSunday) statusText = "Sunday Off";

    tableRows.push([
      String(d),
      dayStr,
      dt.toFormat("cccc"),
      statusText,
      st ? `Recorded (${st === "late" ? "LEAVE" : st.toUpperCase()})` : isSunday ? "Weekend Holiday" : "—",
    ]);
  }

  autoTable(doc, {
    startY: y + 98,
    head: [["Day", "Date", "Day of Week", "Attendance Status", "Remarks"]],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 35, halign: "center" },
      1: { cellWidth: 80 },
      2: { cellWidth: 95 },
      3: { cellWidth: 100, fontStyle: "bold" },
      4: { cellWidth: 205 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 3) {
        const val = String(hookData.cell.raw);
        if (val === "PRESENT") hookData.cell.styles.textColor = [16, 128, 64];
        else if (val === "ABSENT") hookData.cell.styles.textColor = [200, 30, 30];
        else if (val === "LEAVE" || val === "LATE") hookData.cell.styles.textColor = [190, 110, 0];
        else if (val === "Sunday Off") hookData.cell.styles.textColor = [120, 120, 120];
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 650;
  const sigY = Math.min(finalY + 45, 780);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  doc.line(marginX, sigY, marginX + 140, sigY);
  doc.text("Class Incharge Signature", marginX, sigY + 12);

  doc.line(pageWidth - marginX - 140, sigY, pageWidth - marginX, sigY);
  doc.text("Principal / Headmaster", pageWidth - marginX - 140, sigY + 12);

  doc.save(`MHMS-Student-${student.rollNo}-${student.name.replace(/\s+/g, "_")}-${monthStr}.pdf`);
}
