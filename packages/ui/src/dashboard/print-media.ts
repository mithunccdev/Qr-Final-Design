// ════════════════════════════════════════════════════════════════════════════
// PRINT MEDIA & PRINTER SUPPORT
// Real-world label printer families with the paper/roll (media) sizes each
// supports. Grounded in label-printer technology: direct thermal vs thermal
// transfer (wax / wax-resin / resin ribbons), desktop rolls up to ~4 in wide,
// industrial rolls up to ~8 in, plus A4/Letter sticker sheets for laser/inkjet.
// ════════════════════════════════════════════════════════════════════════════

export type PrinterId =
    | 'zebra-desktop'
    | 'zebra-industrial'
    | 'brother-ql'
    | 'dymo'
    | 'rollo-munbyn'
    | 'sheet-a4';

export type MediaType =
    | 'Direct Thermal'
    | 'Thermal Transfer'
    | 'Direct / Thermal Transfer'
    | 'Die-cut Roll'
    | 'Continuous Roll'
    | 'Fanfold / Tag'
    | 'Sticker Sheet';

export type PageSize = 'Roll' | 'A4' | 'Letter';

export interface PrinterTypeDef {
    id: PrinterId;
    vendor: string;
    name: string;
    dpiLabel: string;
    maxWidthIn: number;      // max media width the printer accepts
    ribbonNote: string;      // thermal transfer ribbon requirement, if any
    defaultDpi: 203 | 300 | 600;
    description: string;
}

export interface LabelMediaDef {
    id: string;
    name: string;            // human-friendly label
    printerTypes: PrinterId[];
    mediaType: MediaType;
    pageSize: PageSize;
    labelWidthMm: number;
    labelHeightMm: number;
    rollWidthMm?: number;    // for roll stock (label + liner width)
    gapMm?: number;          // label gap for die-cut rolls
    cols?: number;           // grid for sheet media (default 1)
    rows?: number;
}

export const PRINTER_TYPES: PrinterTypeDef[] = [
    {
        id: 'zebra-desktop',
        vendor: 'Zebra',
        name: 'Zebra Desktop (ZP450 / ZD420 / ZD421 / GK420)',
        dpiLabel: '203 dpi · 8 dots/mm',
        maxWidthIn: 4,
        ribbonNote: 'Direct thermal, or thermal transfer with wax/wax-resin ribbon',
        defaultDpi: 203,
        description: 'Light-to-medium duty desktop label printer for rolls up to 4" wide (100 mm). Great for shipping, retail and inventory labels.'
    },
    {
        id: 'zebra-industrial',
        vendor: 'Zebra',
        name: 'Zebra Industrial (ZT410 / ZT411 / ZT230)',
        dpiLabel: '203 / 300 / 600 dpi',
        maxWidthIn: 8,
        ribbonNote: 'Thermal transfer (wax / wax-resin / resin) for durable labels',
        defaultDpi: 300,
        description: 'Heavy-duty industrial printer for rolls up to 8" wide. High-res 300/600 dpi for small, dense QR codes and durable vinyl/PVC media.'
    },
    {
        id: 'brother-ql',
        vendor: 'Brother',
        name: 'Brother QL (QL-820NWB / QL-1110NWB / QL-1050)',
        dpiLabel: '300 dpi',
        maxWidthIn: 4,
        ribbonNote: 'Dedicated DK roll cartridges (die-cut & continuous)',
        defaultDpi: 300,
        description: 'Desktop label printer using Brother DK label rolls — die-cut addresses and badges plus continuous tape. Common in offices, retail and safety labeling.'
    },
    {
        id: 'dymo',
        vendor: 'DYMO',
        name: 'DYMO LabelWriter (450 / 4XL / 550)',
        dpiLabel: '300 dpi',
        maxWidthIn: 4,
        ribbonNote: 'Direct thermal label rolls',
        defaultDpi: 300,
        description: 'Compact direct-thermal label printer for addresses, shipping (4×6 on 4XL), file folders and small barcodes.'
    },
    {
        id: 'rollo-munbyn',
        vendor: 'Rollo / MUNBYN / iDPRT',
        name: 'Rollo · MUNBYN · iDPRT (Thermal)',
        dpiLabel: '203 dpi',
        maxWidthIn: 4,
        ribbonNote: 'Direct thermal only',
        defaultDpi: 203,
        description: 'Affordable generic 203 dpi direct-thermal printers for 4×6 shipping labels and 3×2 / 2×1 barcodes.'
    },
    {
        id: 'sheet-a4',
        vendor: 'Generic',
        name: 'A4 / Letter Laser & Inkjet Printer',
        dpiLabel: '600 dpi (print)',
        maxWidthIn: 8.5,
        ribbonNote: 'Sticker sheets — no ribbon',
        defaultDpi: 300,
        description: 'Ordinary office laser/inkjet printer using A4 (210 × 297 mm) or US Letter (8.5 × 11 in) pre-cut sticker sheets.'
    }
];

export const LABEL_MEDIA: LabelMediaDef[] = [
    // ── Zebra Desktop (up to 4") ───────────────────────────────────────────────
    { id: 'z-dt-4x6', name: '4 × 6 in Shipping', printerTypes: ['zebra-desktop'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 152.4, rollWidthMm: 104 },
    { id: 'z-dt-4x4', name: '4 × 4 in Parcel', printerTypes: ['zebra-desktop'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 101.6, rollWidthMm: 104 },
    { id: 'z-tt-4x2', name: '4 × 2 in Warehouse', printerTypes: ['zebra-desktop'], mediaType: 'Direct / Thermal Transfer', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 50.8, rollWidthMm: 104 },
    { id: 'z-tt-3x2', name: '3 × 2 in Bin Label', printerTypes: ['zebra-desktop'], mediaType: 'Direct / Thermal Transfer', pageSize: 'Roll', labelWidthMm: 76.2, labelHeightMm: 50.8, rollWidthMm: 80 },
    { id: 'z-tt-3x1', name: '3 × 1 in Shelf', printerTypes: ['zebra-desktop'], mediaType: 'Direct / Thermal Transfer', pageSize: 'Roll', labelWidthMm: 76.2, labelHeightMm: 25.4, rollWidthMm: 80 },
    { id: 'z-tt-2x1', name: '2 × 1 in Barcode', printerTypes: ['zebra-desktop'], mediaType: 'Direct / Thermal Transfer', pageSize: 'Roll', labelWidthMm: 50.8, labelHeightMm: 25.4, rollWidthMm: 54 },
    { id: 'z-tt-2x2', name: '2 × 2 in QR', printerTypes: ['zebra-desktop'], mediaType: 'Direct / Thermal Transfer', pageSize: 'Roll', labelWidthMm: 50.8, labelHeightMm: 50.8, rollWidthMm: 54 },
    { id: 'z-tt-1x1', name: '1 × 1 in Mini Tag', printerTypes: ['zebra-desktop'], mediaType: 'Direct / Thermal Transfer', pageSize: 'Roll', labelWidthMm: 25.4, labelHeightMm: 25.4, rollWidthMm: 28 },
    { id: 'z-tt-225x125', name: '2.25 × 1.25 in SKU', printerTypes: ['zebra-desktop'], mediaType: 'Direct / Thermal Transfer', pageSize: 'Roll', labelWidthMm: 57.15, labelHeightMm: 31.75, rollWidthMm: 60 },

    // ── Zebra Industrial (up to 8") ────────────────────────────────────────────
    { id: 'zi-6x4', name: '6 × 4 in Carton', printerTypes: ['zebra-industrial'], mediaType: 'Thermal Transfer', pageSize: 'Roll', labelWidthMm: 152.4, labelHeightMm: 101.6, rollWidthMm: 152 },
    { id: 'zi-4x6', name: '4 × 6 in Shipping', printerTypes: ['zebra-industrial'], mediaType: 'Thermal Transfer', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 152.4, rollWidthMm: 104 },
    { id: 'zi-tt-4x2', name: '4 × 2 in Bin Label', printerTypes: ['zebra-industrial'], mediaType: 'Thermal Transfer', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 50.8, rollWidthMm: 104 },
    { id: 'zi-tt-3x2', name: '3 × 2 in Inventory', printerTypes: ['zebra-industrial'], mediaType: 'Thermal Transfer', pageSize: 'Roll', labelWidthMm: 76.2, labelHeightMm: 50.8, rollWidthMm: 80 },
    { id: 'zi-tt-2x1', name: '2 × 1 in Asset Tag', printerTypes: ['zebra-industrial'], mediaType: 'Thermal Transfer', pageSize: 'Roll', labelWidthMm: 50.8, labelHeightMm: 25.4, rollWidthMm: 54 },
    { id: 'zi-vinyl-4x6', name: '4 × 6 in Vinyl/PVC (Durable)', printerTypes: ['zebra-industrial'], mediaType: 'Thermal Transfer', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 152.4, rollWidthMm: 104 },

    // ── Brother QL (DK rolls, mm) ──────────────────────────────────────────────
    { id: 'bq-12x29', name: 'DK — 12 × 29 mm (8 labels)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 12, labelHeightMm: 29 },
    { id: 'bq-23x23', name: 'DK — 23 × 23 mm (26 labels)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 23, labelHeightMm: 23 },
    { id: 'bq-62x29', name: 'DK — 62 × 29 mm (Address)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 62, labelHeightMm: 29 },
    { id: 'bq-62x100', name: 'DK — 62 × 100 mm (Shipping)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 62, labelHeightMm: 100 },
    { id: 'bq-38x90', name: 'DK — 38 × 90 mm (File Fold)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 38, labelHeightMm: 90 },
    { id: 'bq-29x42', name: 'DK — 29 × 42 mm (Mulch)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 29, labelHeightMm: 42 },
    { id: 'bq-29x90', name: 'DK — 29 × 90 mm (Price)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 29, labelHeightMm: 90 },
    { id: 'bq-102x51', name: 'DK — 102 × 51 mm (Address)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 102, labelHeightMm: 51 },
    { id: 'bq-102x152', name: 'DK — 102 × 152 mm (4×6)', printerTypes: ['brother-ql'], mediaType: 'Die-cut Roll', pageSize: 'Roll', labelWidthMm: 102, labelHeightMm: 152 },
    { id: 'bq-cont-62', name: 'DK — 62 mm Continuous Tape', printerTypes: ['brother-ql'], mediaType: 'Continuous Roll', pageSize: 'Roll', labelWidthMm: 62, labelHeightMm: 100, rollWidthMm: 62 },

    // ── DYMO LabelWriter ──────────────────────────────────────────────────────
    { id: 'dy-4x6', name: 'LW — 4 × 6 in Shipping', printerTypes: ['dymo'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 152.4, rollWidthMm: 104 },
    { id: 'dy-2x2', name: 'LW — 2 × 2 in Label', printerTypes: ['dymo'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 50.8, labelHeightMm: 50.8, rollWidthMm: 54 },
    { id: 'dy-1x1', name: 'LW — 1 × 1 in Label', printerTypes: ['dymo'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 25.4, labelHeightMm: 25.4, rollWidthMm: 28 },
    { id: 'dy-address', name: 'LW — 2.31 × 7.5 in Address', printerTypes: ['dymo'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 58.7, labelHeightMm: 190.5, rollWidthMm: 62 },

    // ── Rollo / MUNBYN (203 dpi direct thermal) ───────────────────────────────
    { id: 'rm-4x6', name: '4 × 6 in Shipping', printerTypes: ['rollo-munbyn'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 152.4, rollWidthMm: 104 },
    { id: 'rm-4x4', name: '4 × 4 in Parcel', printerTypes: ['rollo-munbyn'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 101.6, labelHeightMm: 101.6, rollWidthMm: 104 },
    { id: 'rm-3x2', name: '3 × 2 in Barcode', printerTypes: ['rollo-munbyn'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 76.2, labelHeightMm: 50.8, rollWidthMm: 80 },
    { id: 'rm-2x1', name: '2 × 1 in Label', printerTypes: ['rollo-munbyn'], mediaType: 'Direct Thermal', pageSize: 'Roll', labelWidthMm: 50.8, labelHeightMm: 25.4, rollWidthMm: 54 },

    // ── A4 / Letter sticker sheets ────────────────────────────────────────────
    { id: 'sh-a4-70x38', name: 'A4 — 70 × 38 mm (24/sheet)', printerTypes: ['sheet-a4'], mediaType: 'Sticker Sheet', pageSize: 'A4', labelWidthMm: 70, labelHeightMm: 37.12, cols: 3, rows: 8 },
    { id: 'sh-a4-95x55', name: 'A4 — 95 × 55 mm Badge (10/sheet)', printerTypes: ['sheet-a4'], mediaType: 'Sticker Sheet', pageSize: 'A4', labelWidthMm: 95, labelHeightMm: 55, cols: 2, rows: 5 },
    { id: 'sh-a4-100x65', name: 'A4 — 100 × 65 mm Tag (8/sheet)', printerTypes: ['sheet-a4'], mediaType: 'Sticker Sheet', pageSize: 'A4', labelWidthMm: 100, labelHeightMm: 65, cols: 2, rows: 4 },
    { id: 'sh-ltr-5160', name: 'Letter — Avery 5160 (30/sheet)', printerTypes: ['sheet-a4'], mediaType: 'Sticker Sheet', pageSize: 'Letter', labelWidthMm: 66.7, labelHeightMm: 25.4, cols: 3, rows: 10 },
    { id: 'sh-ltr-5163', name: 'Letter — Avery 5163 Shipping (10/sheet)', printerTypes: ['sheet-a4'], mediaType: 'Sticker Sheet', pageSize: 'Letter', labelWidthMm: 101.6, labelHeightMm: 50.8, cols: 2, rows: 5 }
];

function getPrinterById(id: PrinterId): PrinterTypeDef {
    return PRINTER_TYPES.find(p => p.id === id) || PRINTER_TYPES[0];
}

export function getMediaForPrinter(printerId: PrinterId): LabelMediaDef[] {
    return LABEL_MEDIA.filter(m => m.printerTypes.includes(printerId));
}

export function getMediaById(id: string): LabelMediaDef | undefined {
    return LABEL_MEDIA.find(m => m.id === id);
}

export function getMediaBySize(widthMm: number, heightMm: number): LabelMediaDef | undefined {
    return LABEL_MEDIA.find(m =>
        Math.abs(m.labelWidthMm - widthMm) < 1.5 &&
        Math.abs(m.labelHeightMm - heightMm) < 1.5
    );
}

export function formatLabelSize(widthMm: number, heightMm: number): string {
    const w = widthMm >= 25 ? widthMm : widthMm.toFixed(2);
    const h = heightMm >= 25 ? heightMm : heightMm.toFixed(2);
    return `${w} × ${h} mm`;
}

export interface ActivePrinterContext {
    printer: PrinterTypeDef;
    media: LabelMediaDef | undefined;
    labelSize: string;
}

export function buildPrinterContext(printerId: PrinterId, mediaId?: string): ActivePrinterContext {
    const printer = getPrinterById(printerId);
    const media = mediaId ? getMediaById(mediaId) : getMediaForPrinter(printerId)[0];
    if (media && !media.printerTypes.includes(printerId)) {
        return { printer, media: undefined, labelSize: '—' };
    }
    return {
        printer,
        media,
        labelSize: media ? formatLabelSize(media.labelWidthMm, media.labelHeightMm) : '—'
    };
}

/** Build a SheetPreset-shaped object from a LabelMediaDef (reuses label dims). */
export function mediaToPresetFields(media: LabelMediaDef): {
    paperSize: PageSize;
    labelWidthMm: number;
    labelHeightMm: number;
    cols: number;
    rows: number;
    gapXMm: number;
    gapYMm: number;
    paperWidthMm: number;
    paperHeightMm: number;
} {
    const isRoll = media.pageSize === 'Roll';
    return {
        paperSize: media.pageSize,
        paperWidthMm: isRoll ? (media.rollWidthMm || media.labelWidthMm) : (media.pageSize === 'A4' ? 210 : 215.9),
        paperHeightMm: isRoll ? (media.labelHeightMm + 10) : (media.pageSize === 'A4' ? 297 : 279.4),
        labelWidthMm: media.labelWidthMm,
        labelHeightMm: media.labelHeightMm,
        cols: media.cols || 1,
        rows: media.rows || 1,
        gapXMm: isRoll ? 0 : (media.gapMm || 0),
        gapYMm: isRoll ? 0 : (media.gapMm || 0)
    };
}
