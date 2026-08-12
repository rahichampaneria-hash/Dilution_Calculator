/* =========================================================================
   CALCULATION ENGINE
   Pure functions only — no DOM access. Safe to unit test / reuse elsewhere.
   Shared by index.html, dilution.html, stock-solution.html, plate-map.html, msd-plate.html.
   ========================================================================= */

// Conversion factors relative to the base unit of each concentration "family".
// Molar family base unit = M. Mass/volume family base unit = mg/mL.
// Molar and mass-based units cannot be converted into each other without a
// molecular weight — see convertConcentrationFlexible() below for that bridge.
const MOLAR_FACTORS = { 'nM': 1e-9, 'µM': 1e-6, 'mM': 1e-3, 'M': 1 };
const MASS_FACTORS = { 'pg/mL': 1e-9, 'ng/mL': 1e-6, 'µg/mL': 1e-3, 'mg/mL': 1 };

// Conversion factors relative to the base volume unit (mL).
const VOLUME_FACTORS = { 'µL': 0.001, 'mL': 1, 'L': 1000 };

/**
 * Returns which "family" a concentration unit belongs to: 'molar' or 'mass'.
 */
function concentrationFamily(unit) {
  if (MOLAR_FACTORS.hasOwnProperty(unit)) return 'molar';
  if (MASS_FACTORS.hasOwnProperty(unit)) return 'mass';
  throw new Error(`Unrecognized concentration unit: ${unit}`);
}

/**
 * Converts a concentration value from one unit to another.
 * Throws if the two units belong to different families (molar vs. mass-based).
 * Use convertConcentrationFlexible() if a molecular weight is available to
 * bridge between families.
 */
function convertConcentration(value, fromUnit, toUnit) {
  const fromFamily = concentrationFamily(fromUnit);
  const toFamily = concentrationFamily(toUnit);
  if (fromFamily !== toFamily) {
    throw new Error(
      `Cannot convert between "${fromUnit}" and "${toUnit}" — molar (nM, µM, mM, M) and mass-based ` +
      `(ng/mL, µg/mL, mg/mL) concentration units require a molecular weight to convert. ` +
      `Please use units from the same family for both concentrations, or enter a molecular weight if this form supports it.`
    );
  }
  const factors = fromFamily === 'molar' ? MOLAR_FACTORS : MASS_FACTORS;
  const baseValue = value * factors[fromUnit];
  return baseValue / factors[toUnit];
}

/**
 * Converts a concentration value from one unit to another, bridging between
 * molar and mass-based unit families when a molecular weight (g/mol) is
 * supplied. Same-family conversions ignore the molecular weight entirely.
 * 1 mg/mL numerically equals 1 g/L, so M = (mg/mL) / MW and mg/mL = M * MW.
 */
function convertConcentrationFlexible(value, fromUnit, toUnit, mwGramsPerMol) {
  const fromFamily = concentrationFamily(fromUnit);
  const toFamily = concentrationFamily(toUnit);

  if (fromFamily === toFamily) {
    return convertConcentration(value, fromUnit, toUnit);
  }

  const mw = parseFloat(mwGramsPerMol);
  if (!isFinite(mw) || mw <= 0) {
    throw new Error(
      `Cannot convert between "${fromUnit}" and "${toUnit}" — molar and mass-based concentration units require ` +
      `a molecular weight to convert. Enter the compound's molecular weight (g/mol) to convert automatically.`
    );
  }

  if (fromFamily === 'molar') {
    const molarBase = convertConcentration(value, fromUnit, 'M'); // mol/L
    const massBase = molarBase * mw; // mg/mL
    return convertConcentration(massBase, 'mg/mL', toUnit);
  }
  const massBase = convertConcentration(value, fromUnit, 'mg/mL');
  const molarBase = massBase / mw; // M
  return convertConcentration(molarBase, 'M', toUnit);
}

/**
 * Converts a volume value from one unit to another (µL, mL, L).
 */
function convertVolume(value, fromUnit, toUnit) {
  if (!VOLUME_FACTORS.hasOwnProperty(fromUnit) || !VOLUME_FACTORS.hasOwnProperty(toUnit)) {
    throw new Error(`Unrecognized volume unit.`);
  }
  const baseValue = value * VOLUME_FACTORS[fromUnit];
  return baseValue / VOLUME_FACTORS[toUnit];
}

/**
 * Picks a human-friendly display unit + value for a concentration, given its
 * value expressed in the base unit of its family ('M' for molar, 'mg/mL' for mass).
 */
function chooseConcentrationUnit(baseValue, family) {
  const order = family === 'molar'
    ? [['M', 1], ['mM', 1e-3], ['µM', 1e-6], ['nM', 1e-9]]
    : [['mg/mL', 1], ['µg/mL', 1e-3], ['ng/mL', 1e-6], ['pg/mL', 1e-9]];
  for (const [unit, factor] of order) {
    if (baseValue >= factor) {
      return { value: baseValue / factor, unit };
    }
  }
  // Smaller than the smallest unit — still show it in the smallest unit available.
  const [unit, factor] = order[order.length - 1];
  return { value: baseValue / factor, unit };
}

/**
 * Picks a human-friendly display unit + value for a volume, given its value
 * expressed in the base unit (mL).
 */
function chooseVolumeUnit(mlValue) {
  if (mlValue >= 1000) return { value: mlValue / 1000, unit: 'L' };
  if (mlValue >= 1) return { value: mlValue, unit: 'mL' };
  return { value: mlValue * 1000, unit: 'µL' };
}

/**
 * Rounds a number to a sensible number of significant figures for display,
 * avoiding long floating point tails, NaN, or bare scientific notation for
 * everyday values.
 */
function formatNumber(num) {
  if (!isFinite(num)) return '—';
  if (num === 0) return '0';
  const abs = Math.abs(num);
  if (abs >= 0.001 && abs < 1e6) {
    // Round to 4 significant figures, then strip trailing zeros.
    const rounded = parseFloat(num.toPrecision(4));
    return rounded.toString();
  }
  return num.toExponential(3);
}

/**
 * Simple dilution calculation (C1V1 = C2V2).
 * params: { c1, c1Unit, c2, c2Unit, v2, v2Unit } — all numeric values as numbers.
 * Returns: { v1Value, v1Unit, diluentValue, diluentUnit }
 * Throws Error with a user-friendly message on invalid input.
 */
function simpleDilution(params) {
  const { c1, c1Unit, c2, c2Unit, v2, v2Unit } = params;

  if (!isFinite(c1) || c1 <= 0) throw new Error('Stock concentration (C1) must be a positive number.');
  if (!isFinite(c2) || c2 <= 0) throw new Error('Desired final concentration (C2) must be a positive number.');
  if (!isFinite(v2) || v2 <= 0) throw new Error('Final volume (V2) must be a positive number.');

  const c2InC1Units = convertConcentration(c2, c2Unit, c1Unit);

  if (c2InC1Units > c1) {
    throw new Error('Final concentration cannot exceed stock concentration. Choose a lower C2 or a higher C1.');
  }

  const v1 = (c2InC1Units * v2) / c1; // in v2Unit
  const diluent = v2 - v1; // in v2Unit

  const v1InMl = convertVolume(v1, v2Unit, 'mL');
  const diluentInMl = convertVolume(diluent, v2Unit, 'mL');

  const v1Display = chooseVolumeUnit(v1InMl);
  const diluentDisplay = chooseVolumeUnit(diluentInMl);

  return {
    v1Value: v1Display.value,
    v1Unit: v1Display.unit,
    diluentValue: diluentDisplay.value,
    diluentUnit: diluentDisplay.unit
  };
}

/**
 * Serial dilution series calculation with a constant dilution factor at every step.
 * params: { stock, stockUnit, dilutionFactor, steps, stepVolume, stepVolumeUnit }
 * Returns: array of row objects:
 *   { step, concValue, concUnit, concBaseValue, transferValue, transferUnit, diluentValue, diluentUnit, factor }
 * concBaseValue is the concentration in the family's base unit (M or mg/mL) — useful for charting.
 * Throws Error with a user-friendly message on invalid input.
 */
function serialDilution(params) {
  const { stock, stockUnit, dilutionFactor, steps, stepVolume, stepVolumeUnit } = params;

  if (!isFinite(stock) || stock <= 0) throw new Error('Stock concentration must be a positive number.');
  if (!isFinite(dilutionFactor) || dilutionFactor < 1) throw new Error('Dilution factor must be 1 or greater.');
  if (dilutionFactor > 1e9) throw new Error('Dilution factor is too large (max 1e9).');
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('Number of steps must be a positive whole number.');
  if (steps > 100) throw new Error('Please enter 100 or fewer steps so the results stay readable.');
  if (!isFinite(stepVolume) || stepVolume <= 0) throw new Error('Volume per step must be a positive number.');

  const family = concentrationFamily(stockUnit);
  const baseUnit = family === 'molar' ? 'M' : 'mg/mL';
  const stockBase = convertConcentration(stock, stockUnit, baseUnit);

  const transferVol = stepVolume / dilutionFactor; // in stepVolumeUnit, constant per step
  const diluentVol = stepVolume - transferVol; // in stepVolumeUnit

  const transferInMl = convertVolume(transferVol, stepVolumeUnit, 'mL');
  const diluentInMl = convertVolume(diluentVol, stepVolumeUnit, 'mL');
  const transferDisplay = chooseVolumeUnit(transferInMl);
  const diluentDisplay = chooseVolumeUnit(diluentInMl);

  const rows = [];
  for (let i = 1; i <= steps; i++) {
    const concBase = stockBase / Math.pow(dilutionFactor, i);
    const concDisplay = chooseConcentrationUnit(concBase, family);
    rows.push({
      step: i,
      concValue: concDisplay.value,
      concUnit: concDisplay.unit,
      concBaseValue: concBase,
      transferValue: transferDisplay.value,
      transferUnit: transferDisplay.unit,
      diluentValue: diluentDisplay.value,
      diluentUnit: diluentDisplay.unit,
      factor: dilutionFactor
    });
  }
  return rows;
}

/**
 * Serial dilution series calculation where each step can use its own dilution
 * factor. Step count is derived from factors.length, so there's no separate
 * "number of steps" field to keep in sync.
 * params: { stock, stockUnit, factors: number[], stepVolume, stepVolumeUnit }
 * Returns: same row shape as serialDilution().
 * Throws Error with a user-friendly message on invalid input.
 */
function serialDilutionVariable(params) {
  const { stock, stockUnit, factors, stepVolume, stepVolumeUnit } = params;

  if (!isFinite(stock) || stock <= 0) throw new Error('Stock concentration must be a positive number.');
  if (!Array.isArray(factors) || factors.length === 0) {
    throw new Error('Enter at least one dilution factor (comma-separated, one per step).');
  }
  if (factors.length > 100) throw new Error('Please enter 100 or fewer steps so the results stay readable.');
  factors.forEach((f, idx) => {
    if (!isFinite(f) || f < 1) throw new Error(`The dilution factor for step ${idx + 1} must be a number ≥ 1.`);
    if (f > 1e9) throw new Error(`The dilution factor for step ${idx + 1} is too large (max 1e9).`);
  });
  if (!isFinite(stepVolume) || stepVolume <= 0) throw new Error('Volume per step must be a positive number.');

  const family = concentrationFamily(stockUnit);
  const baseUnit = family === 'molar' ? 'M' : 'mg/mL';
  let concBase = convertConcentration(stock, stockUnit, baseUnit);

  const rows = [];
  for (let i = 0; i < factors.length; i++) {
    const factor = factors[i];
    concBase = concBase / factor;

    const transferVol = stepVolume / factor;
    const diluentVol = stepVolume - transferVol;
    const transferInMl = convertVolume(transferVol, stepVolumeUnit, 'mL');
    const diluentInMl = convertVolume(diluentVol, stepVolumeUnit, 'mL');
    const transferDisplay = chooseVolumeUnit(transferInMl);
    const diluentDisplay = chooseVolumeUnit(diluentInMl);
    const concDisplay = chooseConcentrationUnit(concBase, family);

    rows.push({
      step: i + 1,
      concValue: concDisplay.value,
      concUnit: concDisplay.unit,
      concBaseValue: concBase,
      transferValue: transferDisplay.value,
      transferUnit: transferDisplay.unit,
      diluentValue: diluentDisplay.value,
      diluentUnit: diluentDisplay.unit,
      factor: factor
    });
  }
  return rows;
}

/**
 * Secondary (intermediate) stock solution planner.
 *
 * When diluting straight from a concentrated primary stock down to a very low
 * target concentration would require pipetting an impractically small volume,
 * the standard fix is to make an intermediate ("secondary") stock first, then
 * dilute that down to the final concentration — keeping every transfer in a
 * practical pipetting range.
 *
 * Implemented as a thin orchestrator around the already-verified
 * simpleDilution() — called once (direct case) or twice (two-stage case)
 * rather than duplicating its transfer/diluent math.
 *
 * params: {
 *   c1, c1Unit,                                 primary stock concentration
 *   c2, c2Unit,                                 target (final) concentration
 *   finalVolume, finalVolumeUnit,                volume of final working solution to prepare
 *   intermediateVolume, intermediateVolumeUnit,  volume of secondary stock to prepare
 *   minPipetteVolume, minPipetteVolumeUnit,      smallest volume you're comfortable pipetting
 *   mwGramsPerMol                                optional, needed only if c1Unit/c2Unit are in different families
 * }
 *
 * Returns either:
 *   { mode: 'direct', v1Value, v1Unit, diluentValue, diluentUnit }
 * or:
 *   { mode: 'two-stage', secondaryStockConcValue, secondaryStockConcUnit,
 *     transfer1Value, transfer1Unit, diluent1Value, diluent1Unit,
 *     transfer2Value, transfer2Unit, diluent2Value, diluent2Unit, warnings: string[] }
 *
 * Throws Error with a user-friendly message on invalid input.
 */
function secondaryStockDilution(params) {
  const {
    c1, c1Unit, c2, c2Unit,
    finalVolume, finalVolumeUnit,
    intermediateVolume, intermediateVolumeUnit,
    minPipetteVolume, minPipetteVolumeUnit,
    mwGramsPerMol
  } = params;

  if (!isFinite(c1) || c1 <= 0) throw new Error('Primary stock concentration must be a positive number.');
  if (!isFinite(c2) || c2 <= 0) throw new Error('Target concentration must be a positive number.');
  if (!isFinite(finalVolume) || finalVolume <= 0) throw new Error('Final volume must be a positive number.');
  if (!isFinite(intermediateVolume) || intermediateVolume <= 0) throw new Error('Secondary stock volume must be a positive number.');
  if (!isFinite(minPipetteVolume) || minPipetteVolume <= 0) throw new Error('Minimum pipetting volume must be a positive number.');

  const c2InC1Units = convertConcentrationFlexible(c2, c2Unit, c1Unit, mwGramsPerMol);
  if (c2InC1Units > c1) {
    throw new Error('Target concentration cannot exceed the primary stock concentration.');
  }

  const minPipetteMl = convertVolume(minPipetteVolume, minPipetteVolumeUnit, 'mL');

  // Would a single direct dilution keep the transfer volume practical?
  const directResult = simpleDilution({
    c1, c1Unit,
    c2: c2InC1Units, c2Unit: c1Unit,
    v2: finalVolume, v2Unit: finalVolumeUnit
  });
  const directV1Ml = convertVolume(directResult.v1Value, directResult.v1Unit, 'mL');

  if (directV1Ml >= minPipetteMl) {
    return { mode: 'direct', ...directResult };
  }

  // Not practical directly — split the total dilution factor evenly in log
  // space across two stages: primary → secondary stock → final solution.
  const totalDF = c1 / c2InC1Units;
  const stageDF = Math.sqrt(totalDF);
  const cMidInC1Units = c1 / stageDF;

  const stage1 = simpleDilution({
    c1, c1Unit,
    c2: cMidInC1Units, c2Unit: c1Unit,
    v2: intermediateVolume, v2Unit: intermediateVolumeUnit
  });
  const stage2 = simpleDilution({
    c1: cMidInC1Units, c1Unit,
    c2: c2InC1Units, c2Unit: c1Unit,
    v2: finalVolume, v2Unit: finalVolumeUnit
  });

  const midFamily = concentrationFamily(c1Unit);
  const midBaseUnit = midFamily === 'molar' ? 'M' : 'mg/mL';
  const secondaryDisplay = chooseConcentrationUnit(
    convertConcentration(cMidInC1Units, c1Unit, midBaseUnit),
    midFamily
  );

  const stage1TransferMl = convertVolume(stage1.v1Value, stage1.v1Unit, 'mL');
  const stage2TransferMl = convertVolume(stage2.v1Value, stage2.v1Unit, 'mL');

  const warnings = [];
  if (stage1TransferMl < minPipetteMl) {
    warnings.push('Step 1 transfer volume is still below your minimum pipetting volume — try increasing the secondary stock volume.');
  }
  if (stage2TransferMl < minPipetteMl) {
    warnings.push('Step 2 transfer volume is still below your minimum pipetting volume — try increasing the final volume, or plan a further intermediate stage.');
  }

  return {
    mode: 'two-stage',
    secondaryStockConcValue: secondaryDisplay.value,
    secondaryStockConcUnit: secondaryDisplay.unit,
    transfer1Value: stage1.v1Value,
    transfer1Unit: stage1.v1Unit,
    diluent1Value: stage1.diluentValue,
    diluent1Unit: stage1.diluentUnit,
    transfer2Value: stage2.v1Value,
    transfer2Unit: stage2.v1Unit,
    diluent2Value: stage2.diluentValue,
    diluent2Unit: stage2.diluentUnit,
    warnings
  };
}

/**
 * Builds a log-scale "concentration vs. step" chart as an inline SVG markup
 * string (no DOM access — the caller drops the returned string into a
 * container's innerHTML). Uses CSS custom properties for color so it follows
 * light/dark theme automatically.
 *
 * rows: serialDilution()/serialDilutionVariable() row objects (needs .step,
 *       .concBaseValue, .concValue, .concUnit).
 */
// Compact number formatter for chart axis ticks — short enough to never get
// clipped by the SVG viewBox (unlike formatNumber(), which is tuned for
// full-precision result readouts, not tight axis labels).
function formatAxisTick(num) {
  if (!isFinite(num) || num === 0) return '0';
  const abs = Math.abs(num);
  if (abs >= 0.01 && abs < 1e5) {
    return parseFloat(num.toPrecision(2)).toString();
  }
  return num.toExponential(0); // e.g. "1e-4"
}

function buildConcentrationChartSVG(rows, opts) {
  const width = (opts && opts.width) || 640;
  const height = (opts && opts.height) || 260;
  const padding = (opts && opts.padding) || 52;

  const valid = (rows || []).filter(r => isFinite(r.concBaseValue) && r.concBaseValue > 0);

  if (valid.length === 0) {
    return '<div class="chart-empty">No data to chart yet.</div>';
  }

  const logs = valid.map(r => Math.log10(r.concBaseValue));
  let minLog = Math.min(...logs);
  let maxLog = Math.max(...logs);
  if (minLog === maxLog) {
    // Single point, or a perfectly flat series — force a visible range.
    minLog -= 0.5;
    maxLog += 0.5;
  }

  const minStep = Math.min(...valid.map(r => r.step));
  const maxStep = Math.max(...valid.map(r => r.step));
  const stepSpan = (maxStep - minStep) || 1;

  const xFor = (step) => padding + ((step - minStep) / stepSpan) * (width - padding * 2);
  const yFor = (log) => height - padding - ((log - minLog) / (maxLog - minLog)) * (height - padding * 2);

  const coords = valid.map(r => [xFor(r.step), yFor(Math.log10(r.concBaseValue))]);

  const polyline = valid.length >= 2
    ? `<polyline points="${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="var(--teal-500)" stroke-width="2.5" />`
    : '';

  const circles = valid.map((r, i) => {
    const [x, y] = coords[i];
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--blue-700)"><title>Step ${r.step}: ${formatNumber(r.concValue)} ${r.concUnit}</title></circle>`;
  }).join('');

  const midLog = (minLog + maxLog) / 2;
  const gridLines = [minLog, midLog, maxLog].map(l => {
    const val = Math.pow(10, l);
    const y = yFor(l).toFixed(1);
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" />` +
      `<text x="${padding - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--muted)">${formatAxisTick(val)}</text>`;
  }).join('');

  const xLabels = valid.map(r => {
    const x = xFor(r.step).toFixed(1);
    return `<text x="${x}" y="${height - padding + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${r.step}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Concentration by step, log scale">` +
    gridLines + polyline + circles + xLabels +
    `<text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">Step</text>` +
    `</svg>`;
}

// Supported plate geometries: rows x cols per format.
const PLATE_FORMATS = {
  '96': { rows: 8, cols: 12 },
  '384': { rows: 16, cols: 24 }
};

/**
 * Converts a 0-indexed row number into its plate row letter (0 -> 'A', 15 -> 'P').
 * Valid for indices 0-15, which covers both the 96-well and 384-well formats.
 */
function rowLetterFromIndex(index) {
  return String.fromCharCode(65 + index);
}

/**
 * Builds a well ID like "A1" or "H12" from 0-indexed row/column numbers.
 */
function wellId(rowIndex, colIndex) {
  return `${rowLetterFromIndex(rowIndex)}${colIndex + 1}`;
}

/**
 * Generates a full plate map for a serial dilution series laid out across a
 * 96-well or 384-well plate.
 *
 * params: {
 *   format: '96' | '384',
 *   direction: 'down' | 'across',      down a column, or across a row
 *   startRow, startCol: number,        0-indexed start well (0,0 = A1)
 *   startConc, startConcUnit: number/string,
 *   dilutionFactor: number,
 *   steps: number,                     TOTAL wells in the lane, INCLUDING the
 *                                       undiluted start well itself: well k=0
 *                                       is startConc unchanged, well k is
 *                                       startConc / dilutionFactor^k. This is
 *                                       deliberately different from
 *                                       serialDilution()'s numbering (which
 *                                       never includes the undiluted stock as
 *                                       a row) — a plate lane visually starts
 *                                       at the stock well itself.
 *   replicateAcrossPlate: boolean      when true, the identical series is
 *                                       stamped into EVERY column (direction
 *                                       'down') or EVERY row (direction
 *                                       'across') of the plate — startCol (or
 *                                       startRow) then only anchors which row
 *                                       (or column) the series runs along.
 * }
 *
 * Returns { format, rows, cols, wells } where wells is EVERY well on the
 * plate (not just assigned ones), in row-major order. Each well is
 * { id, rowIndex, colIndex, state: 'series'|'empty', seriesStep?, concValue?,
 *   concUnit?, concBaseValue? } — the seriesStep/conc* fields are only
 * present when state === 'series'.
 *
 * Throws Error with a user-friendly message on invalid input, including when
 * the requested number of steps doesn't fit in the lane from the start well
 * — this is validated explicitly rather than silently truncated.
 */
function generatePlateMap(params) {
  const {
    format, direction, startRow, startCol,
    startConc, startConcUnit, dilutionFactor, steps, replicateAcrossPlate
  } = params;

  const geometry = PLATE_FORMATS[format];
  if (!geometry) throw new Error('Unrecognized plate format.');
  if (direction !== 'down' && direction !== 'across') throw new Error('Unrecognized plate direction.');

  const { rows, cols } = geometry;

  if (!Number.isInteger(startRow) || startRow < 0 || startRow >= rows ||
      !Number.isInteger(startCol) || startCol < 0 || startCol >= cols) {
    throw new Error('Start well is outside the plate.');
  }

  if (!isFinite(startConc) || startConc <= 0) throw new Error('Starting concentration must be a positive number.');
  if (!isFinite(dilutionFactor) || dilutionFactor < 1) throw new Error('Dilution factor must be 1 or greater.');
  if (dilutionFactor > 1e9) throw new Error('Dilution factor is too large (max 1e9).');
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('Number of steps must be a positive whole number.');

  const laneLength = direction === 'down' ? rows - startRow : cols - startCol;
  if (steps > laneLength) {
    throw new Error(
      `Only ${laneLength} well${laneLength === 1 ? '' : 's'} remain from ${wellId(startRow, startCol)} going ${direction} ` +
      `— reduce the number of steps or change the start well.`
    );
  }

  const family = concentrationFamily(startConcUnit);
  const baseUnit = family === 'molar' ? 'M' : 'mg/mL';
  const stockBase = convertConcentration(startConc, startConcUnit, baseUnit);

  // Precompute each step's concentration once (same lane values regardless
  // of how many times the lane is replicated across the plate).
  const stepConcs = [];
  for (let k = 0; k < steps; k++) {
    const concBase = stockBase / Math.pow(dilutionFactor, k);
    const display = chooseConcentrationUnit(concBase, family);
    stepConcs.push({ concBase, value: display.value, unit: display.unit });
  }

  // Assign lane positions: a Map from "rowIndex,colIndex" -> step index.
  const assigned = new Map();
  const laneCount = replicateAcrossPlate ? (direction === 'down' ? cols : rows) : 1;
  for (let lane = 0; lane < laneCount; lane++) {
    for (let k = 0; k < steps; k++) {
      const r = direction === 'down' ? startRow + k : (replicateAcrossPlate ? lane : startRow);
      const c = direction === 'down' ? (replicateAcrossPlate ? lane : startCol) : startCol + k;
      assigned.set(`${r},${c}`, k);
    }
  }

  const wells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (assigned.has(key)) {
        const k = assigned.get(key);
        const step = stepConcs[k];
        wells.push({
          id: wellId(r, c), rowIndex: r, colIndex: c, state: 'series',
          seriesStep: k + 1, concValue: step.value, concUnit: step.unit, concBaseValue: step.concBase
        });
      } else {
        wells.push({ id: wellId(r, c), rowIndex: r, colIndex: c, state: 'empty' });
      }
    }
  }

  return { format, rows, cols, wells };
}

/**
 * Encodes a sparse array of freeform custom row/column plate labels (only
 * non-empty, non-default entries need to be present — index i corresponds to
 * row/column i) into a compact JSON string suitable for a URL query
 * parameter. Returns '' when there are no overrides at all, so a share link
 * for an unedited plate stays exactly as clean as before this feature
 * existed — buildShareURL() already omits empty-string params.
 */
function encodeLabelOverrides(labels) {
  const overrides = {};
  (labels || []).forEach((label, i) => {
    if (label) overrides[i] = label;
  });
  if (Object.keys(overrides).length === 0) return '';
  return JSON.stringify(overrides);
}

/**
 * Decodes encodeLabelOverrides() output back into a sparse array of length
 * `count`, defaulting every non-overridden index to ''. Tolerant of missing
 * or malformed input — returns an all-empty array rather than throwing,
 * since a broken/tampered label param shouldn't block loading the rest of a
 * shared plan.
 */
function decodeLabelOverrides(json, count) {
  const labels = new Array(count).fill('');
  if (!json) return labels;
  try {
    const overrides = JSON.parse(json);
    Object.keys(overrides).forEach(key => {
      const i = parseInt(key, 10);
      if (Number.isInteger(i) && i >= 0 && i < count) labels[i] = String(overrides[key]);
    });
  } catch (err) {
    // Malformed label param — ignore and fall back to plate defaults (A-H/1-12 etc).
  }
  return labels;
}

/**
 * Encodes a sparse map of freeform per-well notes (wellId -> text, e.g.
 * "B3" -> "1:5 dilution, donor 2") into a compact JSON string for a URL
 * query parameter. This is what lets a well carry its own arbitrary
 * annotation — independent of, and in addition to, whatever computed value
 * (concentration/sample/series step) is already showing in that well — so a
 * plate plan can be hand-annotated the way a wet-lab MLR plan sheet is.
 * Returns '' when there are no notes at all, keeping an unedited plate's
 * share link exactly as clean as before this feature existed.
 */
function encodeWellNotes(notes) {
  const entries = {};
  Object.keys(notes || {}).forEach(id => {
    if (notes[id]) entries[id] = notes[id];
  });
  if (Object.keys(entries).length === 0) return '';
  return JSON.stringify(entries);
}

/**
 * Decodes encodeWellNotes() output back into a plain wellId -> text object.
 * Tolerant of missing or malformed input — returns {} rather than throwing,
 * since a broken/tampered notes param shouldn't block loading the rest of a
 * shared plan.
 */
function decodeWellNotes(json) {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const notes = {};
    Object.keys(parsed).forEach(id => { notes[id] = String(parsed[id]); });
    return notes;
  } catch (err) {
    return {};
  }
}

/**
 * Generates a full 96-well MSD plate layout: a standard curve (calibrators,
 * optionally with a zero/blank point) starting at a chosen column, plus
 * uploaded samples filling a separate column range.
 *
 * Conventions: a 7-point, 4-fold serial-diluted standard curve plus a zero
 * calibrator, run in duplicate down rows A-H in columns 1-2, is the common
 * lab default — confirmed against MSD's own V-PLEX and Human Cytokine kit
 * product inserts. MSD's own documentation does NOT mandate which columns
 * standards occupy (their blank plate diagrams leave layout to the user), so
 * every one of these numbers is an editable parameter here, never hardcoded.
 *
 * Standard curve concentrations are computed via concentrationFamily/
 * convertConcentration and deliberately kept in ONE FIXED UNIT (the top
 * calibrator's own unit) across every point — matching how MSD's own kit
 * insert tables are written (e.g. 2500, 625, 156, 39... pg/mL, never
 * re-scaled unit-to-unit row by row). chooseConcentrationUnit is
 * intentionally NOT used here for that reason — it would auto-rescale (e.g.
 * turning "10000 pg/mL" into "10 ng/mL"), which would contradict convention.
 *
 * params: {
 *   numStandards: number,        e.g. 7
 *   dilutionFactor: number,      e.g. 4
 *   topCalibrator: number, topCalibratorUnit: string,
 *   includeBlank: boolean,       adds a zero-concentration calibrator point
 *   standardStartCol: number,    0-indexed column the standard block starts at
 *   standardReplicates: number,  columns used for standards (e.g. 2 = duplicate)
 *   samples: Array<{name, concentration, unit}>,  parsed sample list (may be empty)
 *   sampleReplicates: number,    adjacent wells per sample (e.g. 2 = duplicate)
 *   sampleStartCol: number,      0-indexed column samples begin filling from
 * }
 *
 * The standard block occupies columns [standardStartCol, standardStartCol +
 * standardReplicates - 1]. Samples then fill contiguously from sampleStartCol
 * through the last column, on every row — so the only well-defined layout is
 * standards placed entirely to the left of sampleStartCol; this is validated
 * explicitly (see the overlap check below) rather than left to overwrite
 * silently.
 *
 * Returns { rows: 8, cols: 12, wells } — every well on the plate, row-major,
 * each { id, rowIndex, colIndex, type: 'standard'|'sample'|'blank'|'empty',
 *        label, concValue, concUnit, concBaseValue }.
 *
 * Throws Error with a friendly message — never silently truncates or
 * overwrites — when the standard curve doesn't fit the plate's 8 rows, when
 * the standard and sample column ranges overlap, or when samples don't fit
 * the remaining wells.
 */
function generateMsdPlate(params) {
  const {
    numStandards, dilutionFactor, topCalibrator, topCalibratorUnit,
    includeBlank, standardStartCol, standardReplicates, samples, sampleReplicates, sampleStartCol
  } = params;

  const rows = 8, cols = 12;

  if (!Number.isInteger(numStandards) || numStandards <= 0) throw new Error('Number of standard points must be a positive whole number.');
  if (!isFinite(dilutionFactor) || dilutionFactor < 1) throw new Error('Dilution factor must be 1 or greater.');
  if (!isFinite(topCalibrator) || topCalibrator <= 0) throw new Error('Top calibrator concentration must be a positive number.');
  if (!Number.isInteger(standardStartCol) || standardStartCol < 0 || standardStartCol >= cols) throw new Error('Standard start column is outside the plate.');
  if (!Number.isInteger(standardReplicates) || standardReplicates <= 0) throw new Error('Standard replicate count must be a positive whole number.');
  if (standardStartCol + standardReplicates > cols) {
    throw new Error(
      `Standards starting at column ${standardStartCol + 1} with ${standardReplicates} replicate${standardReplicates === 1 ? '' : 's'} ` +
      `would run past column ${cols} — reduce standard replicates or move the start column left.`
    );
  }
  if (!Number.isInteger(sampleReplicates) || sampleReplicates <= 0) throw new Error('Sample replicate count must be a positive whole number.');
  if (!Number.isInteger(sampleStartCol) || sampleStartCol < 0 || sampleStartCol >= cols) throw new Error('Sample start column is outside the plate.');

  // Samples fill contiguously from sampleStartCol to the last column on every
  // row, so the standard block (which always occupies a fixed, contiguous
  // range) must sit entirely to the left of it — otherwise samples would be
  // placed on top of standard wells. Validated explicitly rather than left to
  // silently overwrite.
  const standardEndCol = standardStartCol + standardReplicates - 1; // inclusive, 0-indexed
  if (standardEndCol >= sampleStartCol) {
    throw new Error(
      `Sample start column (${sampleStartCol + 1}) overlaps the standard columns (${standardStartCol + 1}–${standardEndCol + 1}). ` +
      `Move samples to column ${standardEndCol + 2} or later, or reduce standard replicates.`
    );
  }

  const standardRowsNeeded = numStandards + (includeBlank ? 1 : 0);
  if (standardRowsNeeded > rows) {
    const parts = [`${numStandards} standard point${numStandards === 1 ? '' : 's'}`];
    if (includeBlank) parts.push('1 blank');
    throw new Error(
      `${parts.join(' + ')} need ${standardRowsNeeded} rows, but a 96-well plate only has ${rows} rows (A–${rowLetterFromIndex(rows - 1)}) ` +
      `— reduce the number of points, drop the blank, or lower the replicate count.`
    );
  }

  // Standard curve concentrations — fixed unit throughout (see doc comment above).
  const family = concentrationFamily(topCalibratorUnit);
  const baseUnit = family === 'molar' ? 'M' : 'mg/mL';
  const topBase = convertConcentration(topCalibrator, topCalibratorUnit, baseUnit);

  const standardPoints = [];
  for (let k = 0; k < numStandards; k++) {
    const concBase = topBase / Math.pow(dilutionFactor, k);
    const concValue = convertConcentration(concBase, baseUnit, topCalibratorUnit);
    standardPoints.push({ type: 'standard', label: `S${k + 1}`, concValue, concUnit: topCalibratorUnit, concBaseValue: concBase });
  }
  if (includeBlank) {
    standardPoints.push({ type: 'blank', label: 'Blank', concValue: 0, concUnit: topCalibratorUnit, concBaseValue: 0 });
  }

  // Assign wells: a Map from "row,col" -> point data.
  const assigned = new Map();
  standardPoints.forEach((pt, rowIdx) => {
    for (let c = 0; c < standardReplicates; c++) {
      assigned.set(`${rowIdx},${standardStartCol + c}`, pt);
    }
  });

  // Sample placement: fill left-to-right, top-to-bottom, in blocks of
  // sampleReplicates adjacent wells; a sample's replicates are never split
  // across rows, so any leftover columns at the end of a row stay empty.
  //
  // samplesPerRow/maxSamples count SAMPLES (slots), not wells — each slot is
  // sampleReplicates wells wide. Well counts are only ever derived by
  // multiplying a slot count by sampleReplicates exactly once, immediately
  // below, so a "wells" figure is never produced from another wells figure.
  const availableSampleCols = cols - sampleStartCol;
  const samplesPerRow = Math.floor(availableSampleCols / sampleReplicates);
  const maxSamples = samplesPerRow * rows; // capacity in samples (slots)
  const sampleList = samples || [];

  if (sampleList.length > maxSamples) {
    const neededWells = sampleList.length * sampleReplicates;
    const availableWells = maxSamples * sampleReplicates; // slots -> wells, once
    throw new Error(
      `Not enough space: ${sampleList.length} sample${sampleList.length === 1 ? '' : 's'} × ${sampleReplicates} replicate${sampleReplicates === 1 ? '' : 's'} need ${neededWells} wells, ` +
      `but only ${maxSamples} sample slot${maxSamples === 1 ? '' : 's'} (${availableWells} wells) fit in columns ${sampleStartCol + 1}–${cols} (all ${rows} rows).`
    );
  }

  const slotPositions = [];
  for (let r = 0; r < rows; r++) {
    for (let slot = 0; slot < samplesPerRow; slot++) {
      slotPositions.push({ row: r, startCol: sampleStartCol + slot * sampleReplicates });
    }
  }
  sampleList.forEach((sample, i) => {
    const { row, startCol } = slotPositions[i];
    for (let rep = 0; rep < sampleReplicates; rep++) {
      assigned.set(`${row},${startCol + rep}`, { type: 'sample', label: sample.name, concValue: sample.concentration, concUnit: sample.unit, concBaseValue: null });
    }
  });

  const wells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const info = assigned.get(`${r},${c}`);
      if (info) {
        wells.push({ id: wellId(r, c), rowIndex: r, colIndex: c, type: info.type, label: info.label, concValue: info.concValue, concUnit: info.concUnit, concBaseValue: info.concBaseValue });
      } else {
        wells.push({ id: wellId(r, c), rowIndex: r, colIndex: c, type: 'empty', label: '', concValue: 0, concUnit: '', concBaseValue: null });
      }
    }
  }

  return { rows, cols, wells };
}

/**
 * Parses already-split tabular rows (array of arrays of cell values — strings
 * or numbers) into a list of { name, concentration, unit }. This is the
 * shared row-level engine behind both parseMsdSampleCsv() (CSV text, split on
 * commas) and the MSD page's Excel upload path (rows read via SheetJS from
 * .xlsx/.xls), so both file types feed generateMsdPlate() the exact same
 * sample-list structure.
 *
 * Tolerant of an optional header row and blank rows. Expected columns are
 * SampleName, Concentration, Unit (Unit is optional — falls back to
 * defaultUnit when a row omits it).
 *
 * sourceLabel customizes error text (e.g. "sample CSV" vs "sample Excel
 * file") so a friendly Error still names the right file type; defaults to
 * "sample file". Throws naming the offending row if a concentration can't be
 * parsed as a number — never silently drops or mis-reads a row.
 */
function parseMsdSampleRows(rows, defaultUnit, sourceLabel) {
  const label = sourceLabel || 'sample file';

  const cleaned = (rows || [])
    .map(r => (r || []).map(c => (c === null || c === undefined) ? '' : String(c).trim()))
    .filter(r => r.some(c => c !== ''));

  if (cleaned.length === 0) throw new Error(`The ${label} is empty.`);

  let startIndex = 0;
  const firstCells = cleaned[0];
  // Only treat row 1 as a header if there's at least one row left afterward —
  // otherwise a single malformed data-only row (no header at all) would be
  // misread as a header and silently discarded instead of raising an error.
  if (firstCells.length >= 2 && isNaN(parseFloat(firstCells[1])) && cleaned.length > 1) {
    startIndex = 1;
  }

  const samples = [];
  for (let i = startIndex; i < cleaned.length; i++) {
    const cells = cleaned[i];
    if (cells.length < 2 || cells[0] === '') {
      throw new Error(`Row ${i + 1} of the ${label} is missing a name or concentration: "${cells.join(', ')}"`);
    }
    const name = cells[0];
    const concentration = parseFloat(cells[1]);
    if (!isFinite(concentration) || concentration < 0) {
      throw new Error(`Row ${i + 1} of the ${label} has an invalid concentration for "${name}": "${cells[1]}"`);
    }
    const unit = (cells[2] && cells[2] !== '') ? cells[2] : defaultUnit;
    samples.push({ name, concentration, unit });
  }
  return samples;
}

/**
 * Parses an uploaded sample CSV into a list of { name, concentration, unit }.
 * Splits CSV text (with basic double-quote escaping for names containing
 * commas) into rows, then hands off to parseMsdSampleRows() for the shared
 * validation/parsing logic. See parseMsdSampleRows() for tolerance details.
 */
function parseMsdSampleCsv(csvText, defaultUnit) {
  const rows = splitCsvText(csvText);
  return parseMsdSampleRows(rows, defaultUnit, 'sample CSV');
}

/**
 * Splits raw CSV text into rows of cells, with basic double-quote escaping
 * for cells containing commas. Blank lines are dropped. Shared by
 * parseMsdSampleCsv() (fixed-column-order path) and readRowsFromCsvText()
 * (spreadsheet-import path below, which lets the caller map columns
 * explicitly instead of assuming a fixed order).
 */
function splitCsvText(csvText) {
  function splitCsvLine(line) {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  }

  const lines = csvText.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l !== '');
  return lines.map(splitCsvLine);
}

/* =========================================================================
   SPREADSHEET IMPORT — messy real-world sheets → a plate plan
   Real lab spreadsheets rarely arrive as a clean 3-column table: the sheet
   that matters is one of several in a workbook, and its columns are wherever
   the person who built it put them (extra notes off to the side, a table
   that doesn't start in column A, and so on — this was built and tested
   against a real multi-sheet lab master workbook). Rather than guess at
   structure, these functions take an explicit column mapping (spreadsheet
   letters, converted to 0-indexed column numbers below) that the DOM-
   adjacent code collects from the user after they preview the sheet — the
   messiness gets resolved by a human pointing at the right columns once,
   not by pattern-matching a header row.
   ========================================================================= */

/**
 * Converts a spreadsheet column letter ("A", "B", ... "Z", "AA", "AB", ...)
 * to a 0-indexed column number ("A" -> 0, "Z" -> 25, "AA" -> 26). Case-
 * insensitive. Throws a friendly Error for anything that isn't a valid
 * column letter, so a typo in the mapping UI fails clearly rather than
 * silently reading the wrong column.
 */
function spreadsheetColumnToIndex(letter) {
  const s = String(letter || '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(s)) {
    throw new Error(`"${letter}" isn't a valid spreadsheet column letter (expected something like "A", "B", or "AA").`);
  }
  let index = 0;
  for (let i = 0; i < s.length; i++) {
    index = index * 26 + (s.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Converts a 0-indexed column number back to a spreadsheet column letter
 * (0 -> "A", 25 -> "Z", 26 -> "AA"). Used to label preview-table headers.
 */
function indexToSpreadsheetColumn(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Splits raw CSV text into rows for the spreadsheet-import preview/mapping
 * UI. Thin wrapper around splitCsvText() — kept as its own named function so
 * the import UI's "read this file into rows" call reads the same regardless
 * of whether the source was a CSV or (via SheetJS, in the page script) an
 * Excel sheet.
 */
function readRowsFromCsvText(csvText) {
  return splitCsvText(csvText);
}

/**
 * Expands raw spreadsheet rows into a flat list of { label, note } plate-plan
 * entries, one entry per replicate, using a user-supplied column mapping.
 *
 * rows: raw 2D array of cell values (e.g. from a worksheet, or
 *       readRowsFromCsvText()) — not pre-filtered; blank rows are tolerated.
 * mapping: {
 *   labelCol: number,          0-indexed column holding the condition/treatment name (required)
 *   countCol: number|null,     0-indexed column holding a replicate count (optional —
 *                              when omitted, every row is exactly 1 replicate, i.e. the
 *                              sheet already has one row per replicate, as a real plate-plan
 *                              sheet often does)
 *   noteCol: number|null       0-indexed column holding an extra note (e.g. a donor sample
 *                              ID) carried onto every replicate's well as its note
 * }
 * skipRows: number — drop this many non-blank rows from the top (a header row, and/or
 *            any leading rows that aren't real data — e.g. summary/label rows some real
 *            sheets put between the header and where the actual table starts). Left to
 *            the caller to decide rather than guessed, since a heuristic guess is exactly
 *            the kind of silent misfire this whole import path is designed to avoid.
 *
 * Throws a friendly Error naming the offending row for an invalid replicate count, or if
 * nothing usable was found in the mapped label column.
 */
function mapRowsToConditions(rows, mapping, skipRows) {
  const { labelCol, countCol, noteCol } = mapping;

  let cleaned = (rows || [])
    .map(r => (r || []).map(c => (c === null || c === undefined) ? '' : String(c).trim()))
    .filter(r => r.some(c => c !== ''));
  if (skipRows > 0) cleaned = cleaned.slice(skipRows);

  if (cleaned.length === 0) throw new Error('The selected sheet has no data rows in it.');

  const entries = [];
  for (let i = 0; i < cleaned.length; i++) {
    const cells = cleaned[i];
    const label = cells[labelCol];
    if (!label) continue; // Nothing in the label column on this row — skip rather than
                           // error, since a messy real sheet has stray/blank rows amid data.

    let count = 1;
    if (countCol !== null && countCol !== undefined) {
      const raw = cells[countCol];
      if (raw !== undefined && raw !== '') {
        count = parseFloat(raw);
        if (!Number.isInteger(count) || count <= 0) {
          throw new Error(`Row ${i + 1} of the sheet: replicate count "${raw}" for "${label}" must be a positive whole number.`);
        }
      }
    }

    const note = (noteCol !== null && noteCol !== undefined) ? (cells[noteCol] || '') : '';
    for (let k = 0; k < count; k++) {
      entries.push({ label, note });
    }
  }

  if (entries.length === 0) {
    throw new Error(`No rows had anything in column ${indexToSpreadsheetColumn(labelCol)} — double-check the label column letter.`);
  }
  return entries;
}

/**
 * Expands raw spreadsheet rows into { name, concentration, unit } sample
 * entries using a user-supplied column mapping — generalizes
 * parseMsdSampleRows() (which assumes a fixed Name/Concentration/Unit column
 * order starting at column A) to work with a real-world sheet where those
 * columns can be anywhere, in any order, alongside unrelated data (e.g. a
 * real compound-panel sheet whose Condition/Concentration columns aren't
 * contiguous).
 *
 * rows, skipRows: see mapRowsToConditions().
 * mapping: { nameCol, concCol, unitCol } — 0-indexed column numbers; unitCol
 *          may be null/undefined, in which case every row falls back to
 *          defaultUnit exactly like parseMsdSampleCsv() does today.
 *
 * Throws a friendly Error naming the offending row for an invalid concentration.
 */
function mapRowsToSamples(rows, mapping, defaultUnit, skipRows) {
  const { nameCol, concCol, unitCol } = mapping;

  let cleaned = (rows || [])
    .map(r => (r || []).map(c => (c === null || c === undefined) ? '' : String(c).trim()))
    .filter(r => r.some(c => c !== ''));
  if (skipRows > 0) cleaned = cleaned.slice(skipRows);

  if (cleaned.length === 0) throw new Error('The selected sheet has no data rows in it.');

  const samples = [];
  for (let i = 0; i < cleaned.length; i++) {
    const cells = cleaned[i];
    const name = cells[nameCol];
    if (!name) continue; // Stray/blank row in the name column — skip rather than error.

    const concRaw = cells[concCol];
    const concentration = parseFloat(concRaw);
    if (!isFinite(concentration) || concentration < 0) {
      throw new Error(`Row ${i + 1} of the sheet: "${concRaw}" isn't a valid concentration for "${name}".`);
    }

    const unit = (unitCol !== null && unitCol !== undefined && cells[unitCol]) ? cells[unitCol] : defaultUnit;
    samples.push({ name, concentration, unit });
  }

  if (samples.length === 0) {
    throw new Error(`No rows had both a name (column ${indexToSpreadsheetColumn(nameCol)}) and a valid concentration (column ${indexToSpreadsheetColumn(concCol)}) — double-check the column letters.`);
  }
  return samples;
}

/**
 * Lays a flat list of plate-plan entries (see mapRowsToConditions()) onto a
 * 96- or 384-well plate, filling sequentially from a start well in the given
 * direction — down a column (wrapping into the next column once one fills),
 * or across a row (wrapping into the next row) — the same "just keep
 * filling" approach a bench scientist uses when placing a numbered condition
 * list onto a plate. Unlike generatePlateMap()'s single dilution lane, this
 * spans as many columns/rows as the entry list needs.
 *
 * params: {
 *   format: '96' | '384',
 *   direction: 'down' | 'across',
 *   startRow, startCol: number,   0-indexed start well (0,0 = A1)
 *   entries: Array<{ label, note }>
 * }
 *
 * Returns { format, rows, cols, wells } — every well on the plate, row-major,
 * each { id, rowIndex, colIndex, state: 'entry'|'empty', label?, note? }.
 *
 * Throws a friendly Error if the entries don't fit in the wells remaining
 * from the start position onward — never silently truncates the list.
 */
function layoutConditionList(params) {
  const { format, direction, startRow, startCol, entries } = params;

  const geometry = PLATE_FORMATS[format];
  if (!geometry) throw new Error('Unrecognized plate format.');
  if (direction !== 'down' && direction !== 'across') throw new Error('Unrecognized plate direction.');
  const { rows, cols } = geometry;

  if (!Number.isInteger(startRow) || startRow < 0 || startRow >= rows ||
      !Number.isInteger(startCol) || startCol < 0 || startCol >= cols) {
    throw new Error('Start well is outside the plate.');
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('There are no conditions to lay out — check your column mapping picked up some rows.');
  }

  const startIndex = direction === 'down' ? startCol * rows + startRow : startRow * cols + startCol;
  const capacity = rows * cols - startIndex;
  if (entries.length > capacity) {
    throw new Error(
      `${entries.length} wells are needed but only ${capacity} remain on the plate from ${wellId(startRow, startCol)} onward ` +
      `— reduce the number of conditions/replicates, or change the start well.`
    );
  }

  const assigned = new Map();
  for (let i = 0; i < entries.length; i++) {
    const flat = startIndex + i;
    let r, c;
    if (direction === 'down') {
      c = Math.floor(flat / rows);
      r = flat % rows;
    } else {
      r = Math.floor(flat / cols);
      c = flat % cols;
    }
    assigned.set(`${r},${c}`, entries[i]);
  }

  const wells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (assigned.has(key)) {
        const entry = assigned.get(key);
        wells.push({ id: wellId(r, c), rowIndex: r, colIndex: c, state: 'entry', label: entry.label, note: entry.note });
      } else {
        wells.push({ id: wellId(r, c), rowIndex: r, colIndex: c, state: 'empty' });
      }
    }
  }

  return { format, rows, cols, wells };
}

/* =========================================================================
   UTILITIES (DOM-adjacent)
   Small helpers used by the page-specific DOM binding code. Kept separate
   from the pure calculation engine above.
   ========================================================================= */

/**
 * Reads a File as text (used for CSV uploads). Returns a Promise<string>.
 * Shared by msd-plate.html's sample upload and plate-map.html's Condition
 * List import.
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the uploaded file.'));
    reader.readAsText(file);
  });
}

/**
 * Reads a File as an ArrayBuffer (used for Excel uploads, which SheetJS
 * reads from binary). Returns a Promise<ArrayBuffer>.
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the uploaded file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * True if a File's name ends in .xlsx or .xls (case-insensitive) — used to
 * decide whether an upload needs SheetJS (Excel) or can be read as plain
 * text (CSV).
 */
function isExcelFile(file) {
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

/**
 * Parses an uploaded Excel file into a SheetJS workbook object. SheetJS must
 * already be loaded as a global `XLSX` (see the CDN <script> tag on pages
 * that use this — currently msd-plate.html and plate-map.html). Throws a
 * friendly Error, pointing back to CSV, if SheetJS failed to load (e.g.
 * offline) or the file has no worksheets.
 */
async function readWorkbookFromFile(file) {
  if (typeof XLSX === 'undefined') {
    throw new Error('The Excel-reading library failed to load (are you offline?). Please save the file as CSV and upload that instead.');
  }
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The Excel file has no worksheets.');
  }
  return workbook;
}

/**
 * Reads one worksheet of a SheetJS workbook (see readWorkbookFromFile()) into
 * a 2D array of raw cell values, tolerant of blank cells (defval: '').
 *
 * Explicitly forces the read range to start at A1 (row 0, column 0) rather
 * than trusting the sheet's own !ref (its "used range") as SheetJS does by
 * default. A real spreadsheet very often doesn't start its table in column A
 * / row 1 (margins, a title row, extra columns off to the side — exactly
 * the shape of a real lab master sheet), and without this, sheet_to_json()
 * silently reindexes everything relative to wherever the data happens to
 * start — so column index 0 in its output might actually be column B or C
 * of the real sheet. That would make every column letter a user reads off
 * their own spreadsheet (for the mapping fields elsewhere in this app) wrong
 * by however many columns/rows the data is offset. Anchoring to A1 keeps
 * row/column indices in this function's output identical to what the user
 * sees when they open the file themselves.
 */
function readRowsFromWorkbookSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Worksheet "${sheetName}" not found.`);
  let range;
  if (sheet['!ref']) {
    const decoded = XLSX.utils.decode_range(sheet['!ref']);
    range = { s: { r: 0, c: 0 }, e: decoded.e };
  }
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', range });
}

/**
 * Builds a CSV file from an array of rows (each row = array of cell values),
 * with proper quote-escaping, and triggers a browser download.
 */
function downloadCSV(filename, rows) {
  const escapeCell = (val) => {
    const str = String(val);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const csv = rows.map(row => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Builds a shareable URL for the current page encoding the given params.
 * paramsObj: plain object of string/number values; empty/undefined values are omitted.
 */
function buildShareURL(paramsObj) {
  const params = new URLSearchParams();
  Object.keys(paramsObj).forEach(key => {
    const value = paramsObj[key];
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });
  const base = window.location.origin + window.location.pathname;
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Returns a URLSearchParams for the current page's query string.
 */
function parseShareParams() {
  return new URLSearchParams(window.location.search);
}

/**
 * Copies text to the clipboard, with a fallback for contexts where the
 * Clipboard API is unavailable (e.g. non-secure/file:// origins). Returns
 * a Promise<boolean> resolving to whether the copy is believed to have worked.
 */
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch (err) {
    return false;
  }
}

// --- Calculation history (localStorage, capped, fails silently) ---

const HISTORY_KEY = 'dilutionToolkit.history.v1';
const HISTORY_LIMIT = 10;

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function pushHistory(entry) {
  try {
    const list = getHistory();
    const record = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      tool: entry.tool,
      label: entry.label,
      url: entry.url
    };
    list.unshift(record);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch (err) {
    // localStorage unavailable (private browsing, quota, etc.) — fail silently.
  }
}

function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (err) {
    // ignore
  }
}

// --- Dark mode (localStorage + prefers-color-scheme fallback) ---

const THEME_KEY = 'dilutionToolkit.theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

function updateThemeToggleLabel() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  // Label shows the mode a click will switch to, not the current mode.
  btn.textContent = isDark ? 'Light' : 'Dark';
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

/**
 * Wires up the #theme-toggle button (if present on the page) and syncs its
 * icon with whatever theme the inline head-script already applied before
 * first paint. Call once on DOMContentLoaded.
 */
function initTheme() {
  updateThemeToggleLabel();
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (err) {
    // ignore — theme just won't persist this session
  }
  applyTheme(next);
  updateThemeToggleLabel();
}
