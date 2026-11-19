/* ==========================================================================
   wordgoal — Printable Word-Count Goal Tracker Generator
   Plain vanilla JavaScript, no modules, no fetch(), works over file://.
   ========================================================================== */

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Constants — US Letter (8.5 x 11 in) with 0.4in margins
  // --------------------------------------------------------------------------

  var STORAGE_KEY = "wordgoal_settings_v1";

  var PAGE_W_IN = 8.5;
  var PAGE_H_IN = 11.0;
  var MARGIN_IN = 0.4;
  var PRINT_W_IN = PAGE_W_IN - MARGIN_IN * 2; // 7.7 in
  var PRINT_H_IN = PAGE_H_IN - MARGIN_IN * 2; // 10.2 in

  var LETTERING_BAND_IN = 1.05;
  var SHEET_GAP_IN = 0.15;
  var MIN_CELL_SIZE_IN = 0.22; // Minimum usable interior size to mark with a pen
  var UNITS_PER_INCH = 100; // SVG user units per inch

  var SVG_NS = "http://www.w3.org/2000/svg";

  var MONTH_LABELS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec"
  ];

  var MONTH_FULL = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  var MONTH_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  // Cached DOM references
  var dom = {};

  // Current computed state (used by export functions)
  var currentState = {
    settings: null,
    cellInfo: null,
    layoutMetrics: null
  };

  // --------------------------------------------------------------------------
  // Date & Formatting Utilities
  // --------------------------------------------------------------------------

  function getTodayISO() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function parseISODate(isoStr) {
    if (!isoStr || typeof isoStr !== "string") {
      isoStr = getTodayISO();
    }
    var parts = isoStr.split("-");
    if (parts.length !== 3) {
      parts = getTodayISO().split("-");
    }
    var y = parseInt(parts[0], 10) || new Date().getFullYear();
    var m = (parseInt(parts[1], 10) || 1) - 1;
    var d = parseInt(parts[2], 10) || 1;
    return new Date(y, m, d);
  }

  function addDays(dateObj, offset) {
    return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + offset);
  }

  /**
   * Returns the number of days in the 12-month span starting at startDate (365 or 366).
   */
  function getDaysInYearFrom(startDate) {
    var y = startDate.getFullYear();
    var m = startDate.getMonth();
    var d = startDate.getDate();
    var startUTC = Date.UTC(y, m, d);
    var endUTC = Date.UTC(y + 1, m, d);
    return Math.round((endUTC - startUTC) / 86400000);
  }

  function formatNumber(n) {
    return Number(n).toLocaleString("en-US");
  }

  function formatShortDate(dateObj) {
    return MONTH_SHORT[dateObj.getMonth()] + " " + dateObj.getDate() + ", " + dateObj.getFullYear();
  }

  function slugifyFilename(title) {
    var base = (title || "wordgoal").trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "wordgoal";
  }

  function getDefaultSettings() {
    return {
      projectTitle: "",
      dailyGoal: 1000,
      totalGoal: 120000,
      unlimited: false,
      startDate: getTodayISO(),
      layout: "sequential",
      letteringPosition: "top",
      printColor: true
    };
  }

  // --------------------------------------------------------------------------
  // Settings Persistence: saveSettings() & loadSettings()
  // --------------------------------------------------------------------------

  /**
   * Saves the current form settings to browser localStorage.
   */
  function saveSettings(settings) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      // Ignore storage quota or private-mode errors
    }
  }

  /**
   * Loads last-used settings from localStorage, falling back to defaults.
   */
  function loadSettings() {
    var defaults = getDefaultSettings();
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaults;
      }
      var parsed = JSON.parse(raw);
      return {
        projectTitle: typeof parsed.projectTitle === "string" ? parsed.projectTitle : defaults.projectTitle,
        dailyGoal: Math.max(1, parseInt(parsed.dailyGoal, 10) || defaults.dailyGoal),
        totalGoal: Math.max(1, parseInt(parsed.totalGoal, 10) || defaults.totalGoal),
        unlimited: Boolean(parsed.unlimited),
        startDate: typeof parsed.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)
          ? parsed.startDate
          : defaults.startDate,
        layout: parsed.layout === "calendar" ? "calendar" : "sequential",
        letteringPosition: ["top", "bottom", "side"].indexOf(parsed.letteringPosition) !== -1
          ? parsed.letteringPosition
          : defaults.letteringPosition,
        printColor: typeof parsed.printColor === "boolean" ? parsed.printColor : defaults.printColor
      };
    } catch (err) {
      return defaults;
    }
  }

  function applySettingsToForm(settings) {
    dom.projectTitle.value = settings.projectTitle;
    dom.dailyGoal.value = settings.dailyGoal;
    dom.totalGoal.value = settings.totalGoal;
    dom.unlimited.checked = settings.unlimited;
    dom.totalGoal.disabled = settings.unlimited;
    dom.startDate.value = settings.startDate;
    dom.layoutSequential.checked = settings.layout === "sequential";
    dom.layoutCalendar.checked = settings.layout === "calendar";
    dom.letteringPosition.value = settings.letteringPosition;
    dom.printColor.checked = settings.printColor;
  }

  function readSettingsFromForm() {
    var dailyRaw = parseInt(dom.dailyGoal.value, 10);
    var totalRaw = parseInt(dom.totalGoal.value, 10);
    var dailyGoal = (!isNaN(dailyRaw) && dailyRaw >= 1) ? dailyRaw : 1;
    var totalGoal = (!isNaN(totalRaw) && totalRaw >= 1) ? totalRaw : 1;

    return {
      projectTitle: dom.projectTitle.value.trim(),
      dailyGoal: dailyGoal,
      totalGoal: totalGoal,
      unlimited: dom.unlimited.checked,
      startDate: dom.startDate.value || getTodayISO(),
      layout: dom.layoutCalendar.checked ? "calendar" : "sequential",
      letteringPosition: dom.letteringPosition.value || "top",
      printColor: dom.printColor.checked
    };
  }

  // --------------------------------------------------------------------------
  // Core Math: computeCellCount() & computeCellSize()
  // --------------------------------------------------------------------------

  /**
   * Computes total cells required and active cells rendered on the sheet.
   * - With total goal: ceil(totalGoal / dailyGoal)
   * - Unlimited: days in the year starting at startDate (365 or 366)
   * - Calendar layout caps active span at 12 months (daysInYear).
   */
  function computeCellCount(settings) {
    var startDateObj = parseISODate(settings.startDate);
    var daysInYear = getDaysInYearFrom(startDateObj);

    if (settings.unlimited) {
      return {
        totalCells: daysInYear,
        activeCells: daysInYear,
        calendarCapped: false,
        daysInYear: daysInYear,
        startDateObj: startDateObj,
        endDateObj: addDays(startDateObj, daysInYear - 1)
      };
    }

    var totalCells = Math.ceil(settings.totalGoal / settings.dailyGoal);
    var calendarCapped = settings.layout === "calendar" && totalCells > daysInYear;
    var activeCells = calendarCapped ? daysInYear : totalCells;

    return {
      totalCells: totalCells,
      activeCells: activeCells,
      calendarCapped: calendarCapped,
      daysInYear: daysInYear,
      startDateObj: startDateObj,
      endDateObj: addDays(startDateObj, activeCells - 1)
    };
  }

  /**
   * Computes available grid dimensions and optimal hexagon size so the entire
   * grid + lettering always fits on one US Letter printable area (7.7 x 10.2 in).
   */
  function computeCellSize(settings, cellInfo) {
    var isSide = settings.letteringPosition === "side";
    var availW = isSide
      ? PRINT_W_IN - LETTERING_BAND_IN - SHEET_GAP_IN
      : PRINT_W_IN;
    var availH = isSide
      ? PRINT_H_IN
      : PRINT_H_IN - LETTERING_BAND_IN - SHEET_GAP_IN;

    if (settings.layout === "calendar") {
      // 12 vertical columns (jan..dec), up to 31 flat-top hexagons per column
      var headerH = 0.28;
      var gridH = availH - headerH;
      var cols = 12;
      var rows = 31;

      var colStep = availW / cols;
      var rowStep = gridH / rows;

      var vGap = 0.018;
      var hGap = 0.06;
      var maxHexH = Math.max(0.06, rowStep - vGap);
      var maxHexW = Math.max(0.06, colStep - hGap);

      // Flat-top hex: width = 2r, height = sqrt(3) * r
      var radius = Math.min(maxHexH / Math.sqrt(3), maxHexW / 2);
      var hexH = Math.sqrt(3) * radius;
      var hexW = 2 * radius;
      var usableSizeIn = hexH * 0.9;

      return {
        layout: "calendar",
        availW: availW,
        availH: availH,
        headerH: headerH,
        cols: cols,
        rows: rows,
        radius: radius,
        hexW: hexW,
        hexH: hexH,
        colStep: colStep,
        rowStep: rowStep,
        usableSizeIn: usableSizeIn,
        tooSmall: usableSizeIn < MIN_CELL_SIZE_IN
      };
    }

    // Sequential layout: pointy-top interlocking honeycomb
    // Choose column count that maximizes hexagon radius inside availW x availH.
    var count = cellInfo.activeCells;
    var gapRatio = 0.12;
    var bestCols = 1;
    var bestRows = count;
    var bestRadius = 0;

    var maxTryCols = Math.min(count, 65);
    for (var c = 1; c <= maxTryCols; c++) {
      var rCount = Math.ceil(count / c);
      var effCols = rCount > 1 ? c + 0.5 : c;
      var unitW = effCols * Math.sqrt(3) * (1 + gapRatio);
      var unitH = (rCount - 1) * 1.5 * (1 + gapRatio) + 2;
      var candidateR = Math.min(availW / unitW, availH / unitH);

      if (candidateR > bestRadius) {
        bestRadius = candidateR;
        bestCols = c;
        bestRows = rCount;
      }
    }

    // Cap maximum radius so very small counts (e.g. 5 cells) remain balanced
    var radiusSeq = Math.min(bestRadius, 0.72);
    var hexWSeq = Math.sqrt(3) * radiusSeq;
    var hexHSeq = 2 * radiusSeq;
    var colStepSeq = hexWSeq * (1 + gapRatio);
    var rowStepSeq = 1.5 * radiusSeq * (1 + gapRatio);

    // Usable interior writing space (~72% of flat-to-flat width after stroke & pen margin)
    var usableSeq = hexWSeq * 0.72;

    return {
      layout: "sequential",
      availW: availW,
      availH: availH,
      cols: bestCols,
      rows: bestRows,
      radius: radiusSeq,
      hexW: hexWSeq,
      hexH: hexHSeq,
      colStep: colStepSeq,
      rowStep: rowStepSeq,
      usableSizeIn: usableSeq,
      tooSmall: usableSeq < MIN_CELL_SIZE_IN
    };
  }

  // --------------------------------------------------------------------------
  // SVG Helpers
  // --------------------------------------------------------------------------

  function createSvgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          el.setAttribute(key, String(attrs[key]));
        }
      }
    }
    return el;
  }

  /**
   * Returns polygon points string for a pointy-top hexagon centered at (cx, cy).
   */
  function pointyHexPoints(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var angle = (Math.PI / 180) * (60 * i - 30);
      var x = cx + r * Math.cos(angle);
      var y = cy + r * Math.sin(angle);
      pts.push(x.toFixed(2) + "," + y.toFixed(2));
    }
    return pts.join(" ");
  }

  /**
   * Returns polygon points string for a flat-top hexagon centered at (cx, cy).
   */
  function flatHexPoints(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var angle = (Math.PI / 180) * (60 * i);
      var x = cx + r * Math.cos(angle);
      var y = cy + r * Math.sin(angle);
      pts.push(x.toFixed(2) + "," + y.toFixed(2));
    }
    return pts.join(" ");
  }

  // --------------------------------------------------------------------------
  // Rendering: renderLettering(), renderSequentialLayout(), renderCalendarLayout()
  // --------------------------------------------------------------------------

  /**
   * Renders the decorative serif lettering band (top, bottom, or side vertical).
   */
  function renderLettering(container, settings, cellInfo) {
    container.innerHTML = "";

    var dailyText = formatNumber(settings.dailyGoal) + " Words a Day";
    var totalText = settings.unlimited
      ? formatNumber(cellInfo.activeCells) + " Days"
      : formatNumber(settings.totalGoal) + " Words";
    var statsLine = dailyText + " \u2014 " + totalText;

    if (settings.projectTitle) {
      var titleEl = document.createElement("div");
      titleEl.className = "lettering-title";
      titleEl.textContent = settings.projectTitle;
      container.appendChild(titleEl);
    }

    var statsEl = document.createElement("div");
    statsEl.className = "lettering-stats";
    statsEl.textContent = statsLine;
    container.appendChild(statsEl);

    var metaEl = document.createElement("div");
    metaEl.className = "lettering-meta";
    if (settings.layout === "calendar") {
      metaEl.textContent =
        formatShortDate(cellInfo.startDateObj) +
        " \u2013 " +
        formatShortDate(cellInfo.endDateObj) +
        " \u00b7 " +
        formatNumber(cellInfo.activeCells) +
        " Days";
    } else {
      metaEl.textContent = formatNumber(cellInfo.activeCells) + " Sessions";
    }
    container.appendChild(metaEl);
  }

  /**
   * Renders Layout B (Sequential): cells numbered 1..N in an interlocking
   * pointy-top honeycomb grid, scaled and centered inside the available area.
   */
  function renderSequentialLayout(container, settings, cellInfo, metrics) {
    container.innerHTML = "";

    var vbW = metrics.availW * UNITS_PER_INCH;
    var vbH = metrics.availH * UNITS_PER_INCH;

    var svg = createSvgEl("svg", {
      viewBox: "0 0 " + vbW.toFixed(1) + " " + vbH.toFixed(1),
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Sequential hexagonal tracker with " + cellInfo.activeCells + " cells"
    });

    var r = metrics.radius * UNITS_PER_INCH;
    var colStep = metrics.colStep * UNITS_PER_INCH;
    var rowStep = metrics.rowStep * UNITS_PER_INCH;
    var hexW = metrics.hexW * UNITS_PER_INCH;

    var count = cellInfo.activeCells;
    var cols = metrics.cols;
    var rows = metrics.rows;

    // Calculate total bounding box of the honeycomb to center it cleanly
    var totalGridW = (cols - 1) * colStep + hexW + (rows > 1 ? colStep * 0.5 : 0);
    var totalGridH = (rows - 1) * rowStep + 2 * r;
    var startX = (vbW - totalGridW) / 2 + hexW / 2;
    var startY = (vbH - totalGridH) / 2 + r;

    var strokeW = Math.max(0.7, Math.min(1.6, r * 0.065));
    var baseFontSize = Math.max(4.8, Math.min(16, r * 0.62));

    var group = createSvgEl("g");

    for (var i = 0; i < count; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var stagger = (row % 2 === 1) ? colStep * 0.5 : 0;

      var cx = startX + col * colStep + stagger;
      var cy = startY + row * rowStep;
      var num = i + 1;

      var poly = createSvgEl("polygon", {
        points: pointyHexPoints(cx, cy, r),
        class: "hex-cell",
        "stroke-width": strokeW.toFixed(2)
      });
      group.appendChild(poly);

      // Slightly shrink font for 3- or 4-digit numbers so they stay inside hex
      var numStr = String(num);
      var digitScale = numStr.length >= 4 ? 0.68 : (numStr.length === 3 ? 0.82 : 1.0);
      var fontSize = Math.max(4.2, baseFontSize * digitScale);

      var text = createSvgEl("text", {
        x: cx.toFixed(2),
        y: cy.toFixed(2),
        class: "hex-label",
        "font-size": fontSize.toFixed(2)
      });
      text.textContent = numStr;
      group.appendChild(text);
    }

    svg.appendChild(group);
    container.appendChild(svg);
  }

  /**
   * Renders Layout A (Calendar): 12 vertical columns (jan..dec), each with
   * up to 31 flat-top hexagons numbered by day of month. Only dates within
   * [startDate, startDate + activeCells - 1] are active; others are dimmed.
   */
  function renderCalendarLayout(container, settings, cellInfo, metrics) {
    container.innerHTML = "";

    var vbW = metrics.availW * UNITS_PER_INCH;
    var vbH = metrics.availH * UNITS_PER_INCH;

    var svg = createSvgEl("svg", {
      viewBox: "0 0 " + vbW.toFixed(1) + " " + vbH.toFixed(1),
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Calendar hexagonal tracker with 12 month columns and " + cellInfo.activeCells + " active days"
    });

    // Build set of active "monthIndex-dayOfMonth" keys
    var activeSet = {};
    for (var k = 0; k < cellInfo.activeCells; k++) {
      var d = addDays(cellInfo.startDateObj, k);
      activeSet[d.getMonth() + "-" + d.getDate()] = true;
    }

    var febDays = cellInfo.daysInYear === 366 ? 29 : 28;
    var daysPerMonth = [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    var headerH = metrics.headerH * UNITS_PER_INCH;
    var colStep = metrics.colStep * UNITS_PER_INCH;
    var rowStep = metrics.rowStep * UNITS_PER_INCH;
    var r = metrics.radius * UNITS_PER_INCH;

    var strokeW = Math.max(0.75, Math.min(1.4, r * 0.08));
    var headerFontSize = Math.max(9.5, Math.min(13.5, colStep * 0.25));
    var dayFontSize = Math.max(6.2, Math.min(11.0, r * 0.68));

    var group = createSvgEl("g");

    for (var m = 0; m < 12; m++) {
      var cx = (m + 0.5) * colStep;

      // Month label at top of column
      var headerText = createSvgEl("text", {
        x: cx.toFixed(2),
        y: (headerH * 0.48).toFixed(2),
        class: "month-header",
        "font-size": headerFontSize.toFixed(2)
      });
      headerText.textContent = MONTH_LABELS[m];
      group.appendChild(headerText);

      var maxDay = daysPerMonth[m];
      for (var day = 1; day <= maxDay; day++) {
        var cy = headerH + (day - 0.5) * rowStep;
        var isActive = Boolean(activeSet[m + "-" + day]);

        var poly = createSvgEl("polygon", {
          points: flatHexPoints(cx, cy, r),
          class: isActive ? "hex-cell" : "hex-cell hex-inactive",
          "stroke-width": strokeW.toFixed(2)
        });
        group.appendChild(poly);

        var label = createSvgEl("text", {
          x: cx.toFixed(2),
          y: cy.toFixed(2),
          class: isActive ? "hex-label" : "hex-label hex-label-inactive",
          "font-size": dayFontSize.toFixed(2)
        });
        label.textContent = String(day);
        group.appendChild(label);
      }
    }

    svg.appendChild(group);
    container.appendChild(svg);
  }

  // --------------------------------------------------------------------------
  // Status Summary, Warnings & Responsive Preview Scaling
  // --------------------------------------------------------------------------

  function updateSummaryAndWarnings(settings, cellInfo, metrics) {
    // Cell summary
    var summaryParts = [];
    summaryParts.push("<strong>" + formatNumber(cellInfo.activeCells) + "</strong> cells");
    if (settings.layout === "calendar" && cellInfo.calendarCapped) {
      summaryParts.push("(capped from " + formatNumber(cellInfo.totalCells) + ")");
    }
    summaryParts.push("\u00b7 " + formatNumber(settings.dailyGoal) + " words/cell");
    summaryParts.push("\u00b7 ~" + metrics.usableSizeIn.toFixed(2) + " in cell size");
    dom.cellSummary.innerHTML = summaryParts.join(" ");

    // Warnings
    dom.warningsContainer.innerHTML = "";
    var warnings = [];

    if (cellInfo.calendarCapped) {
      warnings.push(
        "Calendar layout is capped at 12 months (" + cellInfo.daysInYear + " days). " +
        "Your goal needs " + formatNumber(cellInfo.totalCells) + " days, so only the first 12 months are shown. " +
        "Switch to Sequential layout or raise your daily goal to fit the full span."
      );
    }

    if (metrics.tooSmall) {
      warnings.push(
        "Too many cells for one sheet. Raise the daily goal, lower the total goal, or switch layout."
      );
    }

    for (var i = 0; i < warnings.length; i++) {
      var box = document.createElement("div");
      box.className = "warning-box";
      box.textContent = warnings[i];
      dom.warningsContainer.appendChild(box);
    }
  }

  /**
   * Scales the on-screen 8.5 x 11in Letter preview to fit the available board area.
   */
  function updatePreviewScale() {
    var board = dom.previewBoard;
    if (!board) {
      return;
    }
    var padX = 48;
    var padY = 48;
    var availW = Math.max(260, board.clientWidth - padX);
    var availH = Math.max(340, window.innerHeight - padY);

    // 1in = 96 CSS px
    var sheetWpx = PAGE_W_IN * 96;
    var sheetHpx = PAGE_H_IN * 96;
    var scale = Math.min(availW / sheetWpx, availH / sheetHpx, 0.92);
    scale = Math.max(0.28, scale);

    document.documentElement.style.setProperty("--preview-scale", scale.toFixed(4));
  }

  /**
   * Master render function triggered on any input change.
   */
  function updateAll() {
    var settings = readSettingsFromForm();
    dom.totalGoal.disabled = settings.unlimited;
    saveSettings(settings);

    // Toggle body class for print-in-color mode
    document.body.classList.toggle("print-color", settings.printColor);

    // Toggle lettering position class on sheet
    dom.sheet.classList.remove("lettering-top", "lettering-bottom", "lettering-side");
    dom.sheet.classList.add("lettering-" + settings.letteringPosition);

    var cellInfo = computeCellCount(settings);
    var layoutMetrics = computeCellSize(settings, cellInfo);

    currentState.settings = settings;
    currentState.cellInfo = cellInfo;
    currentState.layoutMetrics = layoutMetrics;

    renderLettering(dom.sheetLettering, settings, cellInfo);

    if (settings.layout === "calendar") {
      renderCalendarLayout(dom.sheetGrid, settings, cellInfo, layoutMetrics);
    } else {
      renderSequentialLayout(dom.sheetGrid, settings, cellInfo, layoutMetrics);
    }

    updateSummaryAndWarnings(settings, cellInfo, layoutMetrics);
    updatePreviewScale();
  }

  // --------------------------------------------------------------------------
  // Export 1: Print / Save as PDF — exportPDF()
  // --------------------------------------------------------------------------

  function exportPDF() {
    window.print();
  }

  // --------------------------------------------------------------------------
  // Export 2: Markdown (.md) — exportMarkdown()
  // --------------------------------------------------------------------------

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function exportMarkdown() {
    var settings = currentState.settings;
    var cellInfo = currentState.cellInfo;
    if (!settings || !cellInfo) {
      return;
    }

    var lines = [];
    var heading = settings.projectTitle || "Word Goal Tracker";
    lines.push("# " + heading);
    lines.push("");
    lines.push("- **Daily word goal:** " + formatNumber(settings.dailyGoal) + " words");
    if (settings.unlimited) {
      lines.push("- **Total word goal:** Unlimited (" + formatNumber(cellInfo.activeCells) + " days)");
    } else {
      lines.push("- **Total word goal:** " + formatNumber(settings.totalGoal) + " words");
    }
    lines.push("- **Layout:** " + (settings.layout === "calendar" ? "Calendar" : "Sequential"));
    if (settings.layout === "calendar") {
      lines.push(
        "- **Span:** " +
        formatShortDate(cellInfo.startDateObj) +
        " to " +
        formatShortDate(cellInfo.endDateObj)
      );
    }
    lines.push("- **Total cells:** " + formatNumber(cellInfo.activeCells));
    lines.push("");

    if (settings.layout === "calendar") {
      var currentMonthKey = "";
      for (var k = 0; k < cellInfo.activeCells; k++) {
        var d = addDays(cellInfo.startDateObj, k);
        var monthKey = d.getFullYear() + "-" + d.getMonth();
        if (monthKey !== currentMonthKey) {
          if (currentMonthKey !== "") {
            lines.push("");
          }
          lines.push("## " + MONTH_FULL[d.getMonth()] + " " + d.getFullYear());
          lines.push("");
          currentMonthKey = monthKey;
        }
        lines.push("- [ ] " + MONTH_SHORT[d.getMonth()] + " " + d.getDate());
      }
    } else {
      lines.push("## Checklist");
      lines.push("");
      for (var i = 1; i <= cellInfo.activeCells; i++) {
        lines.push("- [ ] " + i);
      }
    }

    lines.push("");
    var blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    triggerDownload(blob, slugifyFilename(settings.projectTitle) + "-tracker.md");
  }

  // --------------------------------------------------------------------------
  // Export 3: Word (.docx) — exportDocx()
  // Renders the single-page sheet (lettering + SVG) onto a high-res canvas PNG
  // in ink-friendly print styling, then embeds it into one US Letter .docx page.
  // Falls back to a Word-compatible .doc HTML file if docx library fails.
  // --------------------------------------------------------------------------

  /**
   * Builds a self-contained SVG data URI styled for ink-friendly printing.
   */
  function buildPrintSvgDataUrl(svgEl, printColor) {
    var clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS);

    var styleEl = document.createElementNS(SVG_NS, "style");
    if (printColor) {
      styleEl.textContent =
        ".hex-cell { fill: #f6e9c2; stroke: #9e7b18; stroke-linejoin: round; }" +
        ".hex-cell.hex-inactive { fill: none; stroke: #ded6be; stroke-dasharray: 2 2; }" +
        ".hex-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; fill: #2b220a; text-anchor: middle; dominant-baseline: central; font-weight: 500; }" +
        ".hex-label.hex-label-inactive { fill: #c8bfa6; }" +
        ".month-header { font-family: Georgia, 'Palatino Linotype', serif; fill: #7d5f0f; text-anchor: middle; dominant-baseline: central; font-weight: 600; }";
    } else {
      styleEl.textContent =
        ".hex-cell { fill: none; stroke: #222222; stroke-linejoin: round; }" +
        ".hex-cell.hex-inactive { fill: none; stroke: #d4d4d4; stroke-dasharray: 2 2; }" +
        ".hex-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; fill: #222222; text-anchor: middle; dominant-baseline: central; font-weight: 500; }" +
        ".hex-label.hex-label-inactive { fill: #c0c0c0; }" +
        ".month-header { font-family: Georgia, 'Palatino Linotype', serif; fill: #111111; text-anchor: middle; dominant-baseline: central; font-weight: 600; }";
    }

    clone.insertBefore(styleEl, clone.firstChild);

    var serialized = new XMLSerializer().serializeToString(clone);
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(serialized);
  }

  /**
   * Draws a string with wide letter-spacing onto a Canvas 2D context, centered at (cx, cy).
   */
  function drawSpacedText(ctx, text, cx, cy, letterSpacingPx) {
    var chars = text.split("");
    var totalW = 0;
    for (var i = 0; i < chars.length; i++) {
      totalW += ctx.measureText(chars[i]).width;
      if (i < chars.length - 1) {
        totalW += letterSpacingPx;
      }
    }
    var x = cx - totalW / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (var j = 0; j < chars.length; j++) {
      ctx.fillText(chars[j], x, cy);
      x += ctx.measureText(chars[j]).width + letterSpacingPx;
    }
  }

  /**
   * Renders the full printable sheet (7.7 x 10.2 in) onto a 200 DPI PNG data URL.
   */
  function renderSheetToPngDataUrl(settings, cellInfo) {
    return new Promise(function (resolve, reject) {
      var svgEl = dom.sheetGrid.querySelector("svg");
      if (!svgEl) {
        reject(new Error("Missing sheet SVG"));
        return;
      }

      var dpi = 200;
      var canvasW = Math.round(PRINT_W_IN * dpi); // 1540 px
      var canvasH = Math.round(PRINT_H_IN * dpi); // 2040 px
      var bandPx = Math.round(LETTERING_BAND_IN * dpi);
      var gapPx = Math.round(SHEET_GAP_IN * dpi);

      var canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      var ctx = canvas.getContext("2d");

      // White ink-friendly page background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);

      var ruleColor = settings.printColor ? "#9e7b18" : "#222222";
      var titleColor = "#111111";
      var statsColor = settings.printColor ? "#7d5f0f" : "#111111";
      var metaColor = "#555555";

      var dailyText = formatNumber(settings.dailyGoal) + " WORDS A DAY";
      var totalText = settings.unlimited
        ? formatNumber(cellInfo.activeCells) + " DAYS"
        : formatNumber(settings.totalGoal) + " WORDS";
      var statsLine = dailyText + " \u2014 " + totalText;
      var titleLine = settings.projectTitle ? settings.projectTitle.toUpperCase() : "";
      var metaLine = settings.layout === "calendar"
        ? (formatShortDate(cellInfo.startDateObj) + " \u2013 " + formatShortDate(cellInfo.endDateObj) + " \u00b7 " + formatNumber(cellInfo.activeCells) + " DAYS").toUpperCase()
        : (formatNumber(cellInfo.activeCells) + " SESSIONS").toUpperCase();

      var pos = settings.letteringPosition;
      var gridRect;

      if (pos === "top" || pos === "bottom") {
        var bandY = pos === "top" ? 0 : canvasH - bandPx;
        gridRect = {
          x: 0,
          y: pos === "top" ? bandPx + gapPx : 0,
          w: canvasW,
          h: canvasH - bandPx - gapPx
        };

        // Top & bottom thin rules
        ctx.strokeStyle = ruleColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, bandY + 2);
        ctx.lineTo(canvasW, bandY + 2);
        ctx.moveTo(0, bandY + bandPx - 2);
        ctx.lineTo(canvasW, bandY + bandPx - 2);
        ctx.stroke();

        var midX = canvasW / 2;
        var midY = bandY + bandPx / 2;

        if (titleLine) {
          ctx.fillStyle = titleColor;
          ctx.font = "600 40px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, titleLine, midX, midY - 46, 5);

          ctx.fillStyle = statsColor;
          ctx.font = "400 30px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, statsLine, midX, midY + 4, 5);

          ctx.fillStyle = metaColor;
          ctx.font = "400 20px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, metaLine, midX, midY + 46, 3.5);
        } else {
          ctx.fillStyle = statsColor;
          ctx.font = "400 34px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, statsLine, midX, midY - 16, 5.5);

          ctx.fillStyle = metaColor;
          ctx.font = "400 21px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, metaLine, midX, midY + 30, 3.5);
        }
      } else {
        // Side (vertical-rl along the right edge)
        var bandX = canvasW - bandPx;
        gridRect = {
          x: 0,
          y: 0,
          w: canvasW - bandPx - gapPx,
          h: canvasH
        };

        // Left & right thin vertical rules
        ctx.strokeStyle = ruleColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bandX + 2, 0);
        ctx.lineTo(bandX + 2, canvasH);
        ctx.moveTo(bandX + bandPx - 2, 0);
        ctx.lineTo(bandX + bandPx - 2, canvasH);
        ctx.stroke();

        ctx.save();
        ctx.translate(bandX + bandPx / 2, canvasH / 2);
        ctx.rotate(Math.PI / 2);

        if (titleLine) {
          ctx.fillStyle = titleColor;
          ctx.font = "600 40px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, titleLine, 0, -46, 5);

          ctx.fillStyle = statsColor;
          ctx.font = "400 30px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, statsLine, 0, 4, 5);

          ctx.fillStyle = metaColor;
          ctx.font = "400 20px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, metaLine, 0, 46, 3.5);
        } else {
          ctx.fillStyle = statsColor;
          ctx.font = "400 34px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, statsLine, 0, -16, 5.5);

          ctx.fillStyle = metaColor;
          ctx.font = "400 21px Georgia, 'Palatino Linotype', serif";
          drawSpacedText(ctx, metaLine, 0, 30, 3.5);
        }

        ctx.restore();
      }

      // Load print-styled SVG as an Image and draw into gridRect
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, gridRect.x, gridRect.y, gridRect.w, gridRect.h);
        try {
          var pngUrl = canvas.toDataURL("image/png");
          resolve(pngUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () {
        reject(new Error("Could not rasterize SVG for Word export"));
      };
      img.src = buildPrintSvgDataUrl(svgEl, settings.printColor);
    });
  }

  function dataUrlToUint8Array(dataUrl) {
    var base64 = dataUrl.split(",")[1];
    var binary = window.atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Fallback Word-compatible HTML (.doc) export if docx library fails.
   */
  function exportWordHtmlFallback(settings, pngDataUrl) {
    var title = settings.projectTitle || "wordgoal Tracker";
    var html =
      "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' " +
      "xmlns='http://www.w3.org/TR/REC-html40'>" +
      "<head><meta charset='utf-8'><title>" + title.replace(/</g, "&lt;") + "</title>" +
      "<style>@page { size: 8.5in 11in; margin: 0.4in; } body { margin: 0; padding: 0; }</style>" +
      "</head><body>" +
      "<img src='" + pngDataUrl + "' style='width:7.65in;height:10.1in;display:block;' alt='Word Goal Tracker' />" +
      "</body></html>";

    var blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    triggerDownload(blob, slugifyFilename(settings.projectTitle) + "-tracker.doc");
  }

  /**
   * Generates a single US Letter portrait Word (.docx) file containing the
   * rendered tracker sheet as a full-page image.
   */
  function exportDocx() {
    var settings = currentState.settings;
    var cellInfo = currentState.cellInfo;
    if (!settings || !cellInfo) {
      return;
    }

    var btn = dom.btnExportDocx;
    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating Word file...";

    renderSheetToPngDataUrl(settings, cellInfo)
      .then(function (pngDataUrl) {
        if (!window.docx || !window.docx.Document || !window.docx.Packer) {
          exportWordHtmlFallback(settings, pngDataUrl);
          return;
        }

        var docxLib = window.docx;
        var marginTwip = docxLib.convertInchesToTwip(MARGIN_IN);
        var pageWidthTwip = docxLib.convertInchesToTwip(PAGE_W_IN);
        var pageHeightTwip = docxLib.convertInchesToTwip(PAGE_H_IN);

        // Size image just inside 7.7 x 10.2 in (at 96 DPI) so Word never wraps to page 2
        var imgWidthPx = Math.round(7.65 * 96);
        var imgHeightPx = Math.round(10.12 * 96);

        var doc = new docxLib.Document({
          sections: [
            {
              properties: {
                page: {
                  size: {
                    width: pageWidthTwip,
                    height: pageHeightTwip
                  },
                  margin: {
                    top: marginTwip,
                    right: marginTwip,
                    bottom: marginTwip,
                    left: marginTwip
                  }
                }
              },
              children: [
                new docxLib.Paragraph({
                  alignment: docxLib.AlignmentType.CENTER,
                  spacing: { before: 0, after: 0, line: 240 },
                  children: [
                    new docxLib.ImageRun({
                      data: dataUrlToUint8Array(pngDataUrl),
                      transformation: {
                        width: imgWidthPx,
                        height: imgHeightPx
                      }
                    })
                  ]
                })
              ]
            }
          ]
        });

        return docxLib.Packer.toBlob(doc).then(function (blob) {
          triggerDownload(blob, slugifyFilename(settings.projectTitle) + "-tracker.docx");
        });
      })
      .catch(function (err) {
        console.error("Word export error:", err);
        window.alert("Word export encountered an error. Please try Print / Save as PDF instead.");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = originalLabel;
      });
  }

  // --------------------------------------------------------------------------
  // Initialization & Event Wiring
  // --------------------------------------------------------------------------

  function cacheDom() {
    dom.form = document.getElementById("settings-form");
    dom.projectTitle = document.getElementById("project-title");
    dom.dailyGoal = document.getElementById("daily-goal");
    dom.totalGoal = document.getElementById("total-goal");
    dom.unlimited = document.getElementById("unlimited-goal");
    dom.startDate = document.getElementById("start-date");
    dom.layoutSequential = document.getElementById("layout-sequential");
    dom.layoutCalendar = document.getElementById("layout-calendar");
    dom.letteringPosition = document.getElementById("lettering-position");
    dom.printColor = document.getElementById("print-color");

    dom.cellSummary = document.getElementById("cell-summary");
    dom.warningsContainer = document.getElementById("warnings-container");

    dom.btnExportPdf = document.getElementById("btn-export-pdf");
    dom.btnExportMd = document.getElementById("btn-export-md");
    dom.btnExportDocx = document.getElementById("btn-export-docx");
    dom.btnReset = document.getElementById("btn-reset");

    dom.previewBoard = document.querySelector(".preview-board");
    dom.sheet = document.getElementById("sheet");
    dom.sheetLettering = document.getElementById("sheet-lettering");
    dom.sheetGrid = document.getElementById("sheet-grid");
  }

  function init() {
    cacheDom();

    var initial = loadSettings();
    applySettingsToForm(initial);
    updateAll();

    // Live updates on any form input or change
    dom.form.addEventListener("input", updateAll);
    dom.form.addEventListener("change", updateAll);

    // Export actions
    dom.btnExportPdf.addEventListener("click", exportPDF);
    dom.btnExportMd.addEventListener("click", exportMarkdown);
    dom.btnExportDocx.addEventListener("click", exportDocx);

    // Reset button
    dom.btnReset.addEventListener("click", function () {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        // Ignore storage errors
      }
      var defaults = getDefaultSettings();
      applySettingsToForm(defaults);
      updateAll();
    });

    // Keep preview scaled nicely on window resize
    window.addEventListener("resize", updatePreviewScale);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
