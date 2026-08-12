# Dilution Toolkit

A free, static set of lab calculators for molecular biology work — dilutions, stock solution planning, and plate layout — that runs entirely in the browser with no backend, no accounts, and no data leaving the page.

**Live**: [rahichampaneria-hash.github.io/Dilution_Calculator](https://rahichampaneria-hash.github.io/Dilution_Calculator/)

## Tools

- **Dilution Calculator** (`dilution.html`) — Simple C1V1=C2V2 dilutions and multi-step serial dilution series, with molecular-weight bridging between molar and mass-based units, variable per-step dilution factors, and a log-scale concentration chart.
- **Secondary Stock Solution Planner** (`stock-solution.html`) — Designs a two-stage dilution when going straight from a primary stock to a low target concentration would mean pipetting an unmeasurably small volume.
- **Plate Map Generator** (`plate-map.html`) — Lays out a serial dilution series across a 96- or 384-well plate, with freeform row/column headers and per-well notes for planning layouts beyond a single dilution series.
- **MSD Plate Planner** (`msd-plate.html`) — Lays out an MSD (Meso Scale Discovery) 96-well plate: a standard curve plus uploaded samples (CSV or Excel), following conventional MSD assay setup, with the same freeform labeling as the Plate Map Generator.
- **Home** (`index.html`) — Landing page linking to all four tools.

Every tool supports CSV export, shareable links that reproduce an exact calculation, local calculation history, and dark mode.

## How it was built

This project was built iteratively with AI assistance (Claude), from an initial single-file dilution calculator through to the current five-page suite. Architecture, conventions, and testing notes for anyone continuing the work are documented in `CLAUDE.md`.

## Deployment

The site is fully static — plain HTML/CSS/vanilla JS, zero build step, zero framework, zero backend (the one exception is an optional CDN script, SheetJS, used only by the MSD Plate Planner's Excel upload; everything else needs no external service at all). To deploy:

1. **Netlify Drop** — go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the whole project folder onto the page. Takes a few seconds, gives you a live URL immediately.
2. **GitHub Pages** — push (or upload) the project folder to a GitHub repository, then enable Pages in the repository settings (Settings → Pages → Deploy from branch), pointing at the branch and root folder. This is how the live copy above is hosted, at no cost.
3. **Vercel** or any other static host works the same way — there's nothing to configure, just upload the folder as-is.

No environment variables, build commands, or server configuration are needed for any of these.

## Validation

The core dilution math (`shared.js`) has been hand-checked against real lab calculations, not just unit-tested against itself:

- **Simple dilution**: C1 = 10 mM → C2 = 1 mM in 5 mL final volume → 500 µL of stock + 4.5 mL of diluent. ✓
- **Serial dilution**: 1 mM stock, 10-fold per step, 5 steps → 100 µM / 10 µM / 1 µM / 100 nM / 10 nM. ✓
- **Secondary stock planner**: the same 10 mM → 1 mM / 5 mL case (no secondary stock needed) reproduces the simple-dilution result exactly. ✓
- **MSD standard curve**: default 7-point, 4-fold curve from a 10,000 pg/mL top calibrator was additionally cross-checked against the published calibrator tables in three real MSD kit product inserts (Human Angiopoietin-2, Human Myeloperoxidase, and the Human Cytokine Ultra-Sensitive kit format) — the tool's output matches each kit's real published values exactly, including a kit that uses a non-default 3-fold (rather than 4-fold) dilution scheme.

These checks are re-run after any change to `shared.js` — see the "Regression-check worked examples" section of `CLAUDE.md` for the full list and sources.

## No accounts, no backend, no data storage

Every calculation happens in your browser. Nothing is uploaded anywhere, including uploaded sample files on the MSD Plate Planner (Excel parsing happens client-side too). Calculation history and your dark-mode preference are stored only in your own browser's `localStorage`.
