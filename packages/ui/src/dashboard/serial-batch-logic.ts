// ════════════════════════════════════════════════════════════════════════════
// SERIAL NUMBER & BATCH NUMBER LOGIC RULES ENGINE
// Configurable per Plant, with Code Segment Inclusions/Exclusions, Delimiters,
// Sequence Length & Padding, Start Numbers, Live Previews, and Unique Identity.
// ════════════════════════════════════════════════════════════════════════════

import { getMasterData, MasterDataOption } from './master-data';
import { ProductRecord, SerializedUnit } from './product-manager';
import { supabaseService } from '../supabase';

export type SerialSegmentType =
    | 'custom_prefix'
    | 'plant'
    | 'vendor'
    | 'financial_year'
    | 'month'
    | 'category'
    | 'group'
    | 'sku'
    | 'color'
    | 'sequence';

export type BatchSegmentType =
    | 'custom_prefix'
    | 'plant'
    | 'vendor'
    | 'financial_year'
    | 'month'
    | 'category'
    | 'group'
    | 'shift'
    | 'sequence';

export interface SerialNumberLogicRule {
    id: string;
    plant: string; // 'KSPL' | 'KGPL' | 'KBPL' | 'ALL'
    ruleName: string;
    delimiter: string; // '-' | '/' | '_' | '.' | '' (none)
    customPrefix: string;
    customSuffix: string;
    sequencePadding: number; // e.g. 4 -> "0001", 5 -> "00001", 6 -> "000001"
    sequenceStartNumber: number; // e.g. 1
    currentSequence: number;
    resetFrequency: 'never' | 'yearly' | 'monthly' | 'daily' | 'per_product';
    fixedTotalLength?: number;
    inclusions: {
        includeCustomPrefix: boolean;
        includePlant: boolean;
        includeVendor: boolean;
        includeFinancialYear: boolean;
        includeMonth: boolean;
        includeCategory: boolean;
        includeGroup: boolean;
        includeSku: boolean;
        includeColor: boolean;
    };
    /** Individual zero-pad width per master-code segment (falls back to sequencePadding). */
    segmentPadding?: Partial<Record<SerialSegmentType, number>>;
    segmentOrder: SerialSegmentType[];
    updatedAt: string;
}

export interface BatchNumberLogicRule {
    id: string;
    plant: string; // 'KSPL' | 'KGPL' | 'KBPL' | 'ALL'
    ruleName: string;
    delimiter: string; // '-' | '/' | '_' | '' (none)
    customPrefix: string; // e.g. "BAT" or "LOT"
    customSuffix: string;
    sequencePadding: number; // e.g. 3 -> "001", 4 -> "0001"
    sequenceStartNumber: number; // e.g. 1
    currentSequence: number;
    resetFrequency: 'never' | 'yearly' | 'monthly' | 'daily';
    fixedTotalLength?: number;
    inclusions: {
        includeCustomPrefix: boolean;
        includePlant: boolean;
        includeVendor: boolean;
        includeFinancialYear: boolean;
        includeMonth: boolean;
        includeCategory: boolean;
        includeGroup: boolean;
        includeShift: boolean;
    };
    /** Individual zero-pad width per master-code segment (falls back to sequencePadding). */
    segmentPadding?: Partial<Record<BatchSegmentType, number>>;
    segmentOrder: BatchSegmentType[];
    updatedAt: string;
}

const STORAGE_KEY_SERIAL_RULES = 'qrlayout_logic_serial_rules_v1';
const STORAGE_KEY_BATCH_RULES = 'qrlayout_logic_batch_rules_v1';
const STORAGE_KEY_SERIALS = 'qrlayout_db_serials_v2';

export const DEFAULT_SERIAL_RULES: SerialNumberLogicRule[] = [
    {
        id: 'rule-serial-all',
        plant: 'ALL',
        ruleName: 'Standard Enterprise Serial Format (Plant-FY-Month-Seq)',
        delimiter: '-',
        customPrefix: '',
        customSuffix: '',
        sequencePadding: 4,
        sequenceStartNumber: 1,
        currentSequence: 1,
        resetFrequency: 'yearly',
        inclusions: {
            includeCustomPrefix: false,
            includePlant: true,
            includeVendor: false,
            includeFinancialYear: true,
            includeMonth: true,
            includeCategory: true,
            includeGroup: false,
            includeSku: false,
            includeColor: false
        },
        segmentOrder: ['plant', 'financial_year', 'month', 'category', 'sequence'],
        updatedAt: new Date().toISOString()
    },
    {
        id: 'rule-serial-kspl',
        plant: 'KSPL',
        ruleName: 'KSPL Sanitaryware Serial Format',
        delimiter: '-',
        customPrefix: '',
        customSuffix: '',
        sequencePadding: 4,
        sequenceStartNumber: 1,
        currentSequence: 1,
        resetFrequency: 'yearly',
        inclusions: {
            includeCustomPrefix: false,
            includePlant: true,
            includeVendor: false,
            includeFinancialYear: true,
            includeMonth: true,
            includeCategory: true,
            includeGroup: false,
            includeSku: false,
            includeColor: false
        },
        segmentOrder: ['plant', 'financial_year', 'month', 'category', 'sequence'],
        updatedAt: new Date().toISOString()
    },
    {
        id: 'rule-serial-kgpl',
        plant: 'KGPL',
        ruleName: 'KGPL Gailpur Serial Format',
        delimiter: '-',
        customPrefix: '',
        customSuffix: '',
        sequencePadding: 4,
        sequenceStartNumber: 1,
        currentSequence: 1,
        resetFrequency: 'yearly',
        inclusions: {
            includeCustomPrefix: false,
            includePlant: true,
            includeVendor: false,
            includeFinancialYear: true,
            includeMonth: true,
            includeCategory: true,
            includeGroup: false,
            includeSku: false,
            includeColor: false
        },
        segmentOrder: ['plant', 'financial_year', 'month', 'category', 'sequence'],
        updatedAt: new Date().toISOString()
    },
    {
        id: 'rule-serial-kbpl',
        plant: 'KBPL',
        ruleName: 'KBPL Bathware Serial Format',
        delimiter: '-',
        customPrefix: '',
        customSuffix: '',
        sequencePadding: 4,
        sequenceStartNumber: 1,
        currentSequence: 1,
        resetFrequency: 'yearly',
        inclusions: {
            includeCustomPrefix: false,
            includePlant: true,
            includeVendor: false,
            includeFinancialYear: true,
            includeMonth: true,
            includeCategory: true,
            includeGroup: false,
            includeSku: false,
            includeColor: false
        },
        segmentOrder: ['plant', 'financial_year', 'month', 'category', 'sequence'],
        updatedAt: new Date().toISOString()
    }
];

export const DEFAULT_BATCH_RULES: BatchNumberLogicRule[] = [
    {
        id: 'rule-batch-all',
        plant: 'ALL',
        ruleName: 'Standard Lot / Batch Number Format',
        delimiter: '-',
        customPrefix: 'BAT',
        customSuffix: '',
        sequencePadding: 3,
        sequenceStartNumber: 1,
        currentSequence: 1,
        resetFrequency: 'monthly',
        inclusions: {
            includeCustomPrefix: true,
            includePlant: true,
            includeVendor: false,
            includeFinancialYear: true,
            includeMonth: true,
            includeCategory: false,
            includeGroup: false,
            includeShift: false
        },
        segmentOrder: ['custom_prefix', 'plant', 'financial_year', 'month', 'sequence'],
        updatedAt: new Date().toISOString()
    },
    {
        id: 'rule-batch-kspl',
        plant: 'KSPL',
        ruleName: 'KSPL Manufacturing Lot Code',
        delimiter: '-',
        customPrefix: 'BAT',
        customSuffix: '',
        sequencePadding: 3,
        sequenceStartNumber: 1,
        currentSequence: 1,
        resetFrequency: 'monthly',
        inclusions: {
            includeCustomPrefix: true,
            includePlant: true,
            includeVendor: false,
            includeFinancialYear: true,
            includeMonth: true,
            includeCategory: false,
            includeGroup: false,
            includeShift: false
        },
        segmentOrder: ['custom_prefix', 'plant', 'financial_year', 'month', 'sequence'],
        updatedAt: new Date().toISOString()
    }
];

// ──────────────────────────────────────────────────────────────────────────────
// STORAGE HELPERS
// ──────────────────────────────────────────────────────────────────────────────

export function loadSerialLogicRules(): SerialNumberLogicRule[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SERIAL_RULES);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.warn('Failed loading serial logic rules', e);
    }
    return [...DEFAULT_SERIAL_RULES];
}

export function saveSerialLogicRules(rules: SerialNumberLogicRule[]): void {
    localStorage.setItem(STORAGE_KEY_SERIAL_RULES, JSON.stringify(rules));
}

export function getSerialLogicRule(plant: string): SerialNumberLogicRule {
    const rules = loadSerialLogicRules();
    return rules.find(r => r.plant.toUpperCase() === plant.toUpperCase()) ||
        rules.find(r => r.plant === 'ALL') ||
        DEFAULT_SERIAL_RULES[0];
}

export function saveSerialLogicRule(rule: SerialNumberLogicRule): void {
    const rules = loadSerialLogicRules();
    const idx = rules.findIndex(r => r.id === rule.id || (r.plant === rule.plant && rule.plant !== 'CUSTOM'));
    rule.updatedAt = new Date().toISOString();
    if (idx >= 0) {
        rules[idx] = rule;
    } else {
        rules.push(rule);
    }
    saveSerialLogicRules(rules);
}

export function loadBatchLogicRules(): BatchNumberLogicRule[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_BATCH_RULES);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.warn('Failed loading batch logic rules', e);
    }
    return [...DEFAULT_BATCH_RULES];
}

export function saveBatchLogicRules(rules: BatchNumberLogicRule[]): void {
    localStorage.setItem(STORAGE_KEY_BATCH_RULES, JSON.stringify(rules));
}

export function getBatchLogicRule(plant: string): BatchNumberLogicRule {
    const rules = loadBatchLogicRules();
    return rules.find(r => r.plant.toUpperCase() === plant.toUpperCase()) ||
        rules.find(r => r.plant === 'ALL') ||
        DEFAULT_BATCH_RULES[0];
}

export function saveBatchLogicRule(rule: BatchNumberLogicRule): void {
    const rules = loadBatchLogicRules();
    const idx = rules.findIndex(r => r.id === rule.id || (r.plant === rule.plant && rule.plant !== 'CUSTOM'));
    rule.updatedAt = new Date().toISOString();
    if (idx >= 0) {
        rules[idx] = rule;
    } else {
        rules.push(rule);
    }
    saveBatchLogicRules(rules);
}

// ──────────────────────────────────────────────────────────────────────────────
// RESOLVE MASTER CODES (Serial Codes & Batch Codes from Master Tables)
// ──────────────────────────────────────────────────────────────────────────────

export function resolvePlantCode(plant: string, forBatch = false): string {
    const plants = getMasterData('plant');
    const key = String(plant || '').toUpperCase();
    // Match by code, associated plant code, OR by label/name — because a plant
    // master may store its unique numeric id in `code` and the human name in `label`.
    const match = plants.find(p =>
        String(p.code || '').toUpperCase() === key ||
        String(p.plantCode || '').toUpperCase() === key ||
        String(p.label || '').toUpperCase() === key
    );
    if (!match) return key || plant;
    if (forBatch) return match.batchCode || match.code;
    return match.serialCode || match.code;
}

export function resolveVendorCode(vendor = 'V1', forBatch = false): string {
    const vendors = getMasterData('vendor');
    const key = String(vendor || '').toUpperCase();
    // Match by code, by configured serial/batch code, OR by label/name.
    const match = vendors.find(v =>
        String(v.code || '').toUpperCase() === key ||
        String(v.serialCode || '').toUpperCase() === key ||
        String(v.batchCode || '').toUpperCase() === key ||
        String(v.label || '').toUpperCase().includes(key)
    );
    if (!match) return key || vendor;
    if (forBatch) return match.batchCode || match.code;
    return match.serialCode || match.code;
}

export function resolveFinancialYearCode(date = new Date(), forBatch = false): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    // April to March FY convention:
    const startYr = month >= 4 ? year : year - 1;
    const endYr = startYr + 1;
    const fyCode = `${startYr}-${String(endYr).slice(-2)}`; // e.g. "2026-27"
    
    const fyList = getMasterData('financial_year');
    const match = fyList.find(f => f.code === fyCode || f.code.includes(String(startYr)));
    if (match) {
        return forBatch ? (match.batchCode || String(startYr).slice(-2)) : (match.serialCode || String(startYr).slice(-2));
    }
    return String(startYr).slice(-2);
}

export function resolveMonthCode(date = new Date(), forBatch = false): string {
    const mNum = String(date.getMonth() + 1).padStart(2, '0');
    const months = getMasterData('month');
    const match = months.find(m => m.code === mNum);
    if (match) {
        return forBatch ? (match.batchCode || mNum) : (match.serialCode || mNum);
    }
    return mNum;
}

export function resolveCategoryCode(category: string, forBatch = false): string {
    if (!category) return '';
    const cats = getMasterData('category');
    const match = cats.find(c => c.code.toLowerCase() === category.toLowerCase() || c.label.toLowerCase().includes(category.toLowerCase()));
    if (match) {
        return forBatch ? (match.batchCode || match.code.slice(0, 3).toUpperCase()) : (match.serialCode || match.code.slice(0, 2).toUpperCase());
    }
    return category.slice(0, 2).toUpperCase();
}

export function resolveGroupCode(group: string, forBatch = false): string {
    if (!group) return '';
    const grps = getMasterData('group');
    const match = grps.find(g => g.code.toLowerCase() === group.toLowerCase() || g.label.toLowerCase().includes(group.toLowerCase()));
    if (match) {
        return forBatch ? (match.batchCode || match.code.slice(0, 3).toUpperCase()) : (match.serialCode || match.code.slice(0, 2).toUpperCase());
    }
    return group.slice(0, 2).toUpperCase();
}

export function resolveColorCode(color = 'CP', forBatch = false): string {
    if (!color) return 'CP';
    const colors = getMasterData('color');
    const match = colors.find(c => c.code.toLowerCase() === color.toLowerCase() || c.label.toLowerCase().includes(color.toLowerCase()));
    if (match) {
        return forBatch ? (match.batchCode || match.code) : (match.serialCode || match.code);
    }
    return color.toUpperCase();
}

export interface MasterCodeResolutionSummary {
    plant: { code: string; masterTab: 'plant'; label: string };
    financialYear: { code: string; masterTab: 'financial_year'; label: string };
    month: { code: string; masterTab: 'month'; label: string };
    category: { code: string; masterTab: 'category'; label: string };
    group: { code: string; masterTab: 'group'; label: string };
    vendor: { code: string; masterTab: 'vendor'; label: string };
    color: { code: string; masterTab: 'color'; label: string };
}

export function getMasterCodesMapping(plant = 'KSPL', forBatch = false): MasterCodeResolutionSummary {
    const now = new Date();
    return {
        plant: {
            code: resolvePlantCode(plant, forBatch),
            masterTab: 'plant',
            label: `Plant Master (${plant})`
        },
        financialYear: {
            code: resolveFinancialYearCode(now, forBatch),
            masterTab: 'financial_year',
            label: 'Financial Year Master'
        },
        month: {
            code: resolveMonthCode(now, forBatch),
            masterTab: 'month',
            label: 'Month Master'
        },
        category: {
            code: resolveCategoryCode('faucet', forBatch),
            masterTab: 'category',
            label: 'Category Master'
        },
        group: {
            code: resolveGroupCode('mixer', forBatch),
            masterTab: 'group',
            label: 'Product Group Master'
        },
        vendor: {
            code: resolveVendorCode('V1', forBatch),
            masterTab: 'vendor',
            label: 'Vendor Master'
        },
        color: {
            code: resolveColorCode('CP', forBatch),
            masterTab: 'color',
            label: 'Color Master'
        }
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// LIVE PREVIEW & CODE GENERATORS
// ──────────────────────────────────────────────────────────────────────────────

export interface SerialContext {
    plant?: string;
    vendor?: string;
    product?: Partial<ProductRecord>;
    date?: Date;
    sequence?: number;
    color?: string;
}

export function generateSerialNumberPreview(rule: SerialNumberLogicRule, ctx: SerialContext = {}): { code: string; length: number; segments: Record<string, string> } {
    const plant = ctx.plant || (rule.plant !== 'ALL' ? rule.plant : 'KSPL');
    const date = ctx.date || new Date();
    const seq = ctx.sequence !== undefined ? ctx.sequence : rule.sequenceStartNumber;
    const prod = ctx.product || { sku: 'FAUC-KS-01', category: 'faucet', group: 'mixer', color: 'CP' };

    const padFor = (key: SerialSegmentType, value: string | number | undefined): string => {
        const width = rule.segmentPadding?.[key] ?? rule.sequencePadding;
        return String(value ?? '').padStart(width, '0');
    };

    const segmentValues: Record<SerialSegmentType, string> = {
        custom_prefix: rule.customPrefix || '',
        plant: padFor('plant', resolvePlantCode(plant, false)),
        vendor: padFor('vendor', resolveVendorCode(ctx.vendor ?? 'V1', false)),
        financial_year: padFor('financial_year', resolveFinancialYearCode(date, false)),
        month: padFor('month', resolveMonthCode(date, false)),
        category: padFor('category', resolveCategoryCode(prod.category || 'faucet', false)),
        group: padFor('group', resolveGroupCode(prod.group || 'mixer', false)),
        sku: padFor('sku', prod.sku ? prod.sku.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : '0001'),
        color: padFor('color', prod.color || ctx.color || 'CP'),
        sequence: padFor('sequence', seq)
    };

    const included = (seg: SerialSegmentType): boolean => {
        switch (seg) {
            case 'sequence': return true;
            case 'custom_prefix': return rule.inclusions.includeCustomPrefix && !!segmentValues.custom_prefix;
            case 'plant': return rule.inclusions.includePlant && !!segmentValues.plant;
            case 'vendor': return rule.inclusions.includeVendor && !!segmentValues.vendor;
            case 'financial_year': return rule.inclusions.includeFinancialYear && !!segmentValues.financial_year;
            case 'month': return rule.inclusions.includeMonth && !!segmentValues.month;
            case 'category': return rule.inclusions.includeCategory && !!segmentValues.category;
            case 'group': return rule.inclusions.includeGroup && !!segmentValues.group;
            case 'sku': return rule.inclusions.includeSku && !!segmentValues.sku;
            case 'color': return rule.inclusions.includeColor && !!segmentValues.color;
            default: return false;
        }
    };

    // Order = the user's configured segmentOrder (re-ordered in the UI), then any
    // other checked/master segment is auto-appended so it always appears in the serial.
    const SERIAL_PRIORITY: SerialSegmentType[] = ['custom_prefix', 'plant', 'vendor', 'financial_year', 'month', 'category', 'group', 'sku', 'color', 'sequence'];
    const activeOrder: SerialSegmentType[] = [];
    for (const seg of rule.segmentOrder) if (!activeOrder.includes(seg)) activeOrder.push(seg);
    for (const seg of SERIAL_PRIORITY) if (!activeOrder.includes(seg) && included(seg)) activeOrder.push(seg);

    const activeParts = activeOrder.filter(included).map(seg => segmentValues[seg]).filter(Boolean);

    let result = activeParts.filter(Boolean).join(rule.delimiter);
    if (rule.customSuffix) {
        result += (rule.delimiter ? rule.delimiter : '') + rule.customSuffix;
    }

    return {
        code: result,
        length: result.length,
        segments: segmentValues
    };
}

export interface BatchContext {
    plant?: string;
    vendor?: string;
    product?: Partial<ProductRecord>;
    date?: Date;
    sequence?: number;
    shift?: string;
}

export function generateBatchNumberPreview(rule: BatchNumberLogicRule, ctx: BatchContext = {}): { code: string; length: number; segments: Record<string, string> } {
    const plant = ctx.plant || (rule.plant !== 'ALL' ? rule.plant : 'KSPL');
    const date = ctx.date || new Date();
    const seq = ctx.sequence !== undefined ? ctx.sequence : rule.sequenceStartNumber;
    const prod = ctx.product || { category: 'faucet', group: 'mixer' };

    const padFor = (key: BatchSegmentType, value: string | number | undefined): string => {
        const width = rule.segmentPadding?.[key] ?? rule.sequencePadding;
        return String(value ?? '').padStart(width, '0');
    };

    const segmentValues: Record<BatchSegmentType, string> = {
        custom_prefix: rule.customPrefix || 'BAT',
        plant: padFor('plant', resolvePlantCode(plant, true)),
        vendor: padFor('vendor', resolveVendorCode(ctx.vendor ?? 'VB1', true)),
        financial_year: padFor('financial_year', resolveFinancialYearCode(date, true)),
        month: padFor('month', resolveMonthCode(date, true)),
        category: padFor('category', resolveCategoryCode(prod.category || 'faucet', true)),
        group: padFor('group', resolveGroupCode(prod.group || 'mixer', true)),
        shift: (ctx.shift || 'A').slice(-1),
        sequence: padFor('sequence', seq)
    };

    const included = (seg: BatchSegmentType): boolean => {
        switch (seg) {
            case 'sequence': return true;
            case 'custom_prefix': return rule.inclusions.includeCustomPrefix && !!segmentValues.custom_prefix;
            case 'plant': return rule.inclusions.includePlant && !!segmentValues.plant;
            case 'vendor': return rule.inclusions.includeVendor && !!segmentValues.vendor;
            case 'financial_year': return rule.inclusions.includeFinancialYear && !!segmentValues.financial_year;
            case 'month': return rule.inclusions.includeMonth && !!segmentValues.month;
            case 'category': return rule.inclusions.includeCategory && !!segmentValues.category;
            case 'group': return rule.inclusions.includeGroup && !!segmentValues.group;
            case 'shift': return rule.inclusions.includeShift && !!segmentValues.shift;
            default: return false;
        }
    };

    const BATCH_PRIORITY: BatchSegmentType[] = ['custom_prefix', 'plant', 'vendor', 'financial_year', 'month', 'category', 'group', 'shift', 'sequence'];
    const activeOrder: BatchSegmentType[] = [];
    for (const seg of rule.segmentOrder) if (!activeOrder.includes(seg)) activeOrder.push(seg);
    for (const seg of BATCH_PRIORITY) if (!activeOrder.includes(seg) && included(seg)) activeOrder.push(seg);

    const activeParts = activeOrder.filter(included).map(seg => segmentValues[seg]).filter(Boolean);

    let result = activeParts.filter(Boolean).join(rule.delimiter);
    if (rule.customSuffix) {
        result += (rule.delimiter ? rule.delimiter : '') + rule.customSuffix;
    }

    return {
        code: result,
        length: result.length,
        segments: segmentValues
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// AUTOMATED UNIQUE SERIAL NUMBER CREATION PIPELINE
// ──────────────────────────────────────────────────────────────────────────────

export function isSerialNumberUnique(serialNumber: string, existingSerials?: SerializedUnit[]): boolean {
    const list = existingSerials || loadExistingSerials();
    return !list.some(s => s.serialNumber.trim().toUpperCase() === serialNumber.trim().toUpperCase());
}

function loadExistingSerials(): SerializedUnit[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SERIALS) || localStorage.getItem('qrlayout_db_serials');
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed reading serials list', e);
    }
    return [];
}

export function generateAutomatedSerials(params: {
    product: ProductRecord;
    quantity: number;
    batchNumber?: string;
    plant?: string;
    startSequence?: number;
    status?: 'In Stock' | 'Quality Passed' | 'Dispatched' | 'Returned';
}): { units: SerializedUnit[]; nextSequence: number } {
    const plant = params.plant || params.product.plant || 'KSPL';
    const rule = getSerialLogicRule(plant);
    const existingList = loadExistingSerials();
    const existingSet = new Set(existingList.map(s => s.serialNumber.trim().toUpperCase()));

    let currentSeq = params.startSequence !== undefined ? params.startSequence : (rule.currentSequence || rule.sequenceStartNumber);
    const generatedUnits: SerializedUnit[] = [];
    const now = new Date();

    for (let i = 0; i < params.quantity; i++) {
        let serial = '';
        let attempts = 0;

        // Guarantee uniqueness:
        while (attempts < 1000) {
            const preview = generateSerialNumberPreview(rule, {
                plant,
                product: params.product,
                date: now,
                sequence: currentSeq,
                color: params.product.color
            });
            serial = preview.code;

            if (!existingSet.has(serial.toUpperCase())) {
                existingSet.add(serial.toUpperCase());
                currentSeq++;
                break;
            }
            currentSeq++;
            attempts++;
        }

        const unit: SerializedUnit = {
            id: `sn-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
            serialNumber: serial,
            productId: params.product.id,
            sku: params.product.sku,
            productTitle: params.product.title,
            category: params.product.category,
            plant,
            group: params.product.group || 'Standard',
            color: params.product.color || 'CP',
            warranty: params.product.warranty || '5 Years',
            price: params.product.price || '₹0.00',
            dp: String(params.product.dp || '0'),
            mrp: String(params.product.mrp || '0'),
            variables: params.product.defaultVariables || {},
            createdAt: now.toISOString(),
            status: params.status || 'In Stock',
            lastPrintedAt: null,
            printCount: 0,
            batchNumber: params.batchNumber || undefined
        } as any;

        generatedUnits.push(unit);
    }

    // Update rule sequence progress
    rule.currentSequence = currentSeq;
    saveSerialLogicRule(rule);
    void persistSerialLogicRulesToDb();

    return { units: generatedUnits, nextSequence: currentSeq };
}

// ──────────────────────────────────────────────────────────────────────────────
// SYNC LOGIC RULES TO THE SHARED DATABASE
//   Stored in the `logic_rules` table so the rule structure (segment order,
//   inclusions, delimiters, sequence settings) is IDENTICAL from any device.
//   localStorage is kept as a fast offline cache; the DB is the source of truth.
// ──────────────────────────────────────────────────────────────────────────────

export async function persistSerialLogicRulesToDb(): Promise<boolean> {
    return supabaseService.saveLogicRules('serial', loadSerialLogicRules());
}

export async function persistBatchLogicRulesToDb(): Promise<boolean> {
    return supabaseService.saveLogicRules('batch', loadBatchLogicRules());
}

/** Load rules from the DB into the local cache. DB wins; falls back silently. */
export async function hydrateSerialLogicRulesFromDb(): Promise<void> {
    const rules = await supabaseService.fetchLogicRules('serial');
    if (rules && rules.length) saveSerialLogicRules(rules);
}

export async function hydrateBatchLogicRulesFromDb(): Promise<void> {
    const rules = await supabaseService.fetchLogicRules('batch');
    if (rules && rules.length) saveBatchLogicRules(rules);
}
