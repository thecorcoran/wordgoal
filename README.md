# wordgoal

`wordgoal` is a single-page web app that generates a one-sheet, printable word-count goal tracker. It is meant to be printed on paper and checked off by hand with a pen, not tracked on screen.

## What it does

- **Daily and total goals:** Enter a daily word goal and a total word goal, or check **Unlimited / no total goal**.
- **Cell count logic:**
  - With a total goal, the sheet has `ceil(totalGoal / dailyGoal)` cells. For example, `1,000` words/day and `120,000` total words produces `120` cells.
  - With **Unlimited / no total goal** checked, the sheet has one cell per day for the 12-month span starting at the start date (`365` or `366` cells depending on whether February 29 falls in that span).
- **Two hexagonal layouts:**
  - **Sequential:** Pointy-top hexagons numbered `1` through `N` in an interlocking grid, with no dates. Mark the next cell whenever you complete a daily goal.
  - **Calendar:** Twelve vertical columns (`jan` through `dec`), each with up to 31 flat-top hexagons numbered by day of the month. Dates within your goal span are active; dates outside the span are dimmed. Unmarked cells show missed days.
- **Decorative lettering:** Displays the project title, daily and total counts (for example, `1,000 Words a Day — 120,000 Words`), and session/date summary in a system serif stack with small caps, wide letter-spacing, and thin rules. Position can be **Top**, **Bottom**, or **Side (vertical)**.
- **One US Letter page:** All cells and lettering are scaled to fit on a single US Letter portrait sheet (`8.5 x 11 in` with `0.4 in` margins). On screen, the preview sits on a dark board with gold hexagons; in print, it switches to an ink-friendly white background with black outlines or optional soft gold fills.

## How to run it

Clone or download the repository and open `index.html` directly in a web browser. There is no install step, no build step, and no local server required.

```bash
git clone https://github.com/thecorcoran/wordgoal.git
cd wordgoal
```

Double-click `index.html` (or open it via `file://` in your browser).

Because the project consists of plain static files, it can also be hosted optionally on GitHub Pages (for example, at `https://thecorcoran.github.io/wordgoal` if enabled in the repository settings).

## How to use it

1. Enter a **Project title** (optional).
2. Set your **Daily word goal** and **Total word goal**, or check **Unlimited / no total goal**.
3. Pick a **Start date** (defaults to today; used by Calendar layout and to determine whether the 12-month span is 365 or 366 days).
4. Choose a **Layout**: **Sequential** or **Calendar**.
5. Choose a **Lettering position**: **Top**, **Bottom**, or **Side (vertical)**.
6. Toggle **Print in color (gold fills vs. black-and-white outlines)** as preferred.
7. Watch the live US Letter preview update, then use one of the buttons under **Export single sheet**.
8. Click **Reset defaults** at any time to clear saved settings and restore defaults (`1,000` words/day, `120,000` total words, Sequential, Top, Print in color).

## Export options

All export options output the same single sheet:

- **Print / Save as PDF:** Opens the browser print dialog (`window.print()`) with `@media print` styles that hide the setup panel and print only the sheet. To save a PDF, choose **Save as PDF** as the destination in the print dialog. Recommended print settings:
  - Paper size: **US Letter**
  - Orientation: **Portrait**
  - Scale: **100%**
  - Margins: **Default** (the stylesheet sets `@page { size: letter portrait; margin: 0.4in; }`)
  - **Background graphics:** On if **Print in color** is checked; optional for black-and-white outlines.
- **Download Markdown (.md):** Downloads a `.md` checklist file with the title, goal summary, and one checkbox per cell (`- [ ] 14` for Sequential, or `- [ ] Jan 14` grouped under month headings for Calendar).
- **Download Word (.docx):** Renders the printable sheet (lettering and SVG grid, using print colors) to a 200 DPI PNG via `<canvas>` and embeds it on a single US Letter portrait page using the locally bundled `docx` library (`lib/docx.min.js`). If the `docx` library is unavailable, it falls back to a Word-compatible HTML file saved with a `.doc` extension.

## Limits

- **One-sheet rule:** Output never paginates or spills onto a second page. Everything scales to fit inside the `7.7 x 10.2 in` printable area.
- **Minimum cell size warning:** If the usable interior cell size drops below `0.22 in`, the setup panel displays: *"Too many cells for one sheet. Raise the daily goal, lower the total goal, or switch layout."* The sheet still renders on one page.
- **12-month cap in Calendar layout:** Calendar layout covers at most 12 months (`365` or `366` days). If a finite goal requires more days than that, a warning suggests switching to Sequential layout or raising the daily goal, and only the first 12 months are rendered.

## Project structure

```text
wordgoal/
├── index.html        # App markup, setup panel, and single-page sheet container
├── style.css         # Screen styling, dark preview board, and @media print rules
├── app.js            # Cell count/sizing math, inline SVG rendering, localStorage, and exports
├── lib/
│   └── docx.min.js   # Local UMD build of docx (v8.5.0) for browser .docx generation
├── README.md         # Project documentation
└── LICENSE           # MIT license
```

## Data and privacy

Your last-used form settings are saved only in your browser's `localStorage` under the key `wordgoal_settings_v1`. Nothing is sent to any server, and the app makes no network requests.

## Known limitations

- **Word export is image-based:** The `.docx` export embeds a rasterized 200 DPI PNG of the sheet so it matches the screen/print layout accurately, which means the text and hexagons inside Word are not editable vector shapes. If the `.doc` HTML fallback is triggered, older versions of Word may render margins slightly differently.
- **Browser print dialogs vary:** Some browsers override `@page` margins unless margins are set to Default and Scale is 100%, and some hide gold cell fills unless Background graphics is enabled.
- **No interactive check-off:** Cells are intentionally static for printing on paper; clicking a hexagon does nothing.

## License

MIT. See [LICENSE](LICENSE).
