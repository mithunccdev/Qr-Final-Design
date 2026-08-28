import { StickerPrinter, StickerLayout } from 'qrlayout-core';
import type { SheetPreset } from './print-sheet-presets';
import jsPDF from 'jspdf';

export interface RenderSheetOptions {
    sheetPreset: SheetPreset;
    showCutMarks?: boolean;
    showBorderOutlines?: boolean;
    showNumberBadge?: boolean;
    startOffset?: number; // Starting label slot (0-indexed)
    dpi?: number;
}

export class BatchSheetRenderer {
    private printer: StickerPrinter;

    constructor() {
        this.printer = new StickerPrinter();
    }

    /**
     * Renders a single label to an HTMLCanvasElement
     */
    public async renderSingleLabel(
        layout: StickerLayout,
        data: Record<string, any>,
        targetCanvas?: HTMLCanvasElement
    ): Promise<HTMLCanvasElement> {
        const canvas = targetCanvas || document.createElement('canvas');
        await this.printer.renderToCanvas(layout, data, canvas);
        return canvas;
    }

    /**
     * Calculates the total number of physical sheets needed given the dataset and sheet preset
     */
    public calculateSheetCount(datasetLength: number, preset: SheetPreset, startOffset = 0): number {
        const labelsPerSheet = preset.cols * preset.rows;
        if (labelsPerSheet <= 0) return 1;
        const totalSlotsNeeded = datasetLength + startOffset;
        return Math.max(1, Math.ceil(totalSlotsNeeded / labelsPerSheet));
    }

    /**
     * Renders an entire sheet to a canvas element at a specified DPI
     */
    public async renderSheetToCanvas(
        sheetIndex: number,
        layout: StickerLayout,
        dataset: Record<string, any>[],
        selectedIndices: Set<number>,
        options: RenderSheetOptions
    ): Promise<HTMLCanvasElement> {
        const { sheetPreset, showCutMarks = true, showBorderOutlines = true, showNumberBadge = true, startOffset = 0, dpi = 96 } = options;
        const dpmm = dpi / 25.4;

        const sheetWidthPx = Math.round(sheetPreset.paperWidthMm * dpmm);
        const sheetHeightPx = Math.round(sheetPreset.paperHeightMm * dpmm);

        const canvas = document.createElement('canvas');
        canvas.width = sheetWidthPx;
        canvas.height = sheetHeightPx;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        // Draw Paper Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);

        const labelsPerSheet = sheetPreset.cols * sheetPreset.rows;
        const sheetStartSlot = sheetIndex * labelsPerSheet;

        // Render each slot on this sheet
        for (let row = 0; row < sheetPreset.rows; row++) {
            for (let col = 0; col < sheetPreset.cols; col++) {
                const slotIndexOnSheet = row * sheetPreset.cols + col;
                const globalSlotIndex = sheetStartSlot + slotIndexOnSheet;
                const dataIndex = globalSlotIndex - startOffset;

                // Calculate slot coordinates in mm
                const labelXmm = sheetPreset.marginLeftMm + col * (sheetPreset.labelWidthMm + sheetPreset.gapXMm);
                const labelYmm = sheetPreset.marginTopMm + row * (sheetPreset.labelHeightMm + sheetPreset.gapYMm);

                const labelXpx = Math.round(labelXmm * dpmm);
                const labelYpx = Math.round(labelYmm * dpmm);
                const labelWpx = Math.round(sheetPreset.labelWidthMm * dpmm);
                const labelHpx = Math.round(sheetPreset.labelHeightMm * dpmm);

                // Cut marks & boundaries
                if (showBorderOutlines) {
                    ctx.save();
                    ctx.strokeStyle = '#e2e8f0';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.strokeRect(labelXpx + 0.5, labelYpx + 0.5, labelWpx - 1, labelHpx - 1);
                    ctx.restore();
                }

                if (showCutMarks) {
                    this.drawCutMarks(ctx, labelXpx, labelYpx, labelWpx, labelHpx);
                }

                // Check if this slot has a valid record that is enabled
                if (dataIndex >= 0 && dataIndex < dataset.length) {
                    const isSelected = selectedIndices.has(dataIndex);
                    const record = dataset[dataIndex];

                    if (isSelected && record) {
                        // Render label to offscreen canvas
                        const labelCanvas = document.createElement('canvas');
                        await this.printer.renderToCanvas(layout, record, labelCanvas);
                        ctx.drawImage(labelCanvas, labelXpx, labelYpx, labelWpx, labelHpx);

                        // Optional small badge index
                        if (showNumberBadge) {
                            ctx.save();
                            ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
                            ctx.font = `${Math.max(9, Math.round(3 * dpmm))}px sans-serif`;
                            ctx.textBaseline = 'top';
                            ctx.fillText(`#${dataIndex + 1}`, labelXpx + 4, labelYpx + 3);
                            ctx.restore();
                        }
                    } else if (!isSelected) {
                        // Dimmed placeholder for skipped label
                        ctx.save();
                        ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
                        ctx.fillRect(labelXpx, labelYpx, labelWpx, labelHpx);
                        ctx.fillStyle = '#94a3b8';
                        ctx.font = `${Math.max(10, Math.round(3.5 * dpmm))}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`[SKIPPED #${dataIndex + 1}]`, labelXpx + labelWpx / 2, labelYpx + labelHpx / 2);
                        ctx.restore();
                    }
                } else if (globalSlotIndex < startOffset) {
                    // Offset empty slot
                    ctx.save();
                    ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
                    ctx.fillRect(labelXpx, labelYpx, labelWpx, labelHpx);
                    ctx.fillStyle = '#cbd5e1';
                    ctx.font = `${Math.max(9, Math.round(3 * dpmm))}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('• OFFSET •', labelXpx + labelWpx / 2, labelYpx + labelHpx / 2);
                    ctx.restore();
                }
            }
        }

        return canvas;
    }

    private drawCutMarks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
        const markLen = 6;
        ctx.save();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 0.75;
        // Top-Left
        ctx.beginPath();
        ctx.moveTo(x - markLen, y); ctx.lineTo(x, y);
        ctx.moveTo(x, y - markLen); ctx.lineTo(x, y);
        // Top-Right
        ctx.moveTo(x + w, y); ctx.lineTo(x + w + markLen, y);
        ctx.moveTo(x + w, y - markLen); ctx.lineTo(x + w, y);
        // Bottom-Left
        ctx.moveTo(x - markLen, y + h); ctx.lineTo(x, y + h);
        ctx.moveTo(x, y + h); ctx.lineTo(x, y + h + markLen);
        // Bottom-Right
        ctx.moveTo(x + w, y + h); ctx.lineTo(x + w + markLen, y + h);
        ctx.moveTo(x + w, y + h); ctx.lineTo(x + w, y + h + markLen);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Generates a multi-page PDF of the entire sheet batch
     */
    public async exportBatchPDF(
        layout: StickerLayout,
        dataset: Record<string, any>[],
        selectedIndices: Set<number>,
        options: RenderSheetOptions,
        onProgress?: (current: number, total: number) => void
    ): Promise<jsPDF> {
        const { sheetPreset } = options;
        const totalSheets = this.calculateSheetCount(dataset.length, sheetPreset, options.startOffset);

        const pdf = new jsPDF({
            orientation: sheetPreset.paperWidthMm > sheetPreset.paperHeightMm ? 'l' : 'p',
            unit: 'mm',
            format: [sheetPreset.paperWidthMm, sheetPreset.paperHeightMm]
        });

        for (let s = 0; s < totalSheets; s++) {
            if (s > 0) {
                pdf.addPage([sheetPreset.paperWidthMm, sheetPreset.paperHeightMm], sheetPreset.paperWidthMm > sheetPreset.paperHeightMm ? 'l' : 'p');
            }

            if (onProgress) onProgress(s + 1, totalSheets);

            // Render high-res sheet canvas at 300 DPI for crisp vector-like print quality
            const sheetCanvas = await this.renderSheetToCanvas(s, layout, dataset, selectedIndices, {
                ...options,
                dpi: 300
            });

            const imgData = sheetCanvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, sheetPreset.paperWidthMm, sheetPreset.paperHeightMm);
        }

        return pdf;
    }

    /**
     * Generates a single ZPL payload for all selected records
     */
    public generateBatchZPL(
        layout: StickerLayout,
        dataset: Record<string, any>[],
        selectedIndices: Set<number>,
        dpi: 203 | 300 | 600 = 203
    ): string {
        const activeData = dataset.filter((_, idx) => selectedIndices.has(idx));
        const zplList = this.printer.exportToZPL(layout, activeData, { dpi });
        return zplList.join('\n\n');
    }
}
