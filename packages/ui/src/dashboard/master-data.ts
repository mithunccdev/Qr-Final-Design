// ════════════════════════════════════════════════════════════════════════════
// MASTER DATA — Plants, Product Categories, Product Groups, Color/Finish,
// Warranty. Each option has a unique `code` (the id) used by dropdowns, so
// products store the code and resolve labels at render time. Persisted to
// Supabase (`master_data` table) with a localStorage offline cache.
// ════════════════════════════════════════════════════════════════════════════

export type MasterDataType = 'plant' | 'vendor' | 'financial_year' | 'month' | 'category' | 'group' | 'color' | 'warranty' | 'variable' | 'serial_logic' | 'batch_logic';

export interface MasterDataOption {
    code: string;           // unique id used in dropdowns / stored on products
    label: string;          // human-readable display
    type: MasterDataType;
    // Plant code (numeric plant code for plants, or associated plant code for vendors):
    plantCode?: string;
    // Financial Year Structure (e.g. 'April to March', 'January to December', etc.):
    fyStructure?: string;
    // Code for Serial Number & Code for Batch Number:
    serialCode?: string;
    batchCode?: string;
    // Variable-only default value:
    defaultValue?: string;
}

export const FY_STRUCTURE_OPTIONS = [
    { value: 'April to March', label: 'April to March (Apr – Mar)' },
    { value: 'January to December', label: 'January to December (Jan – Dec)' },
    { value: 'July to June', label: 'July to June (Jul – Jun)' },
    { value: 'October to September', label: 'October to September (Oct – Sep)' }
];

const STORAGE_KEY = 'qrlayout_master_data_v1';

const DEFAULT_DATA: MasterDataOption[] = [
    // Plants (with plantCode, serialCode, batchCode)
    { code: 'KSPL', label: 'KSPL', type: 'plant', plantCode: '8600', serialCode: 'K', batchCode: 'KS' },
    { code: 'KGPL', label: 'KGPL', type: 'plant', plantCode: '8800', serialCode: 'G', batchCode: 'KG' },
    { code: 'KBPL', label: 'KBPL', type: 'plant', plantCode: '8500', serialCode: 'B', batchCode: 'KB' },
    // Vendors (mapped to Plant Code, with serialCode, batchCode)
    { code: 'VEN-KSPL-01', label: 'Apex Bath Fittings Pvt Ltd', type: 'vendor', plantCode: '8600', serialCode: 'V1', batchCode: 'VB1' },
    { code: 'VEN-KGPL-01', label: 'Sunrise Polymers & Sanitary', type: 'vendor', plantCode: '8800', serialCode: 'V2', batchCode: 'VB2' },
    { code: 'VEN-KBPL-01', label: 'Royal Ceramics & Allied', type: 'vendor', plantCode: '8500', serialCode: 'V3', batchCode: 'VB3' },
    // Financial Years (with fyStructure, serialCode, batchCode)
    { code: '2024-25', label: 'FY 2024-2025', type: 'financial_year', fyStructure: 'April to March', serialCode: '24', batchCode: 'F24' },
    { code: '2025-26', label: 'FY 2025-2026', type: 'financial_year', fyStructure: 'April to March', serialCode: '25', batchCode: 'F25' },
    { code: '2026-27', label: 'FY 2026-2027', type: 'financial_year', fyStructure: 'April to March', serialCode: '26', batchCode: 'F26' },
    { code: '2027-28', label: 'FY 2027-2028', type: 'financial_year', fyStructure: 'April to March', serialCode: '27', batchCode: 'F27' },
    // Months (Standard 12 Calendar Months)
    { code: '01', label: 'January', type: 'month', serialCode: '01', batchCode: 'M01' },
    { code: '02', label: 'February', type: 'month', serialCode: '02', batchCode: 'M02' },
    { code: '03', label: 'March', type: 'month', serialCode: '03', batchCode: 'M03' },
    { code: '04', label: 'April', type: 'month', serialCode: '04', batchCode: 'M04' },
    { code: '05', label: 'May', type: 'month', serialCode: '05', batchCode: 'M05' },
    { code: '06', label: 'June', type: 'month', serialCode: '06', batchCode: 'M06' },
    { code: '07', label: 'July', type: 'month', serialCode: '07', batchCode: 'M07' },
    { code: '08', label: 'August', type: 'month', serialCode: '08', batchCode: 'M08' },
    { code: '09', label: 'September', type: 'month', serialCode: '09', batchCode: 'M09' },
    { code: '10', label: 'October', type: 'month', serialCode: '10', batchCode: 'M10' },
    { code: '11', label: 'November', type: 'month', serialCode: '11', batchCode: 'M11' },
    { code: '12', label: 'December', type: 'month', serialCode: '12', batchCode: 'M12' },
    // Product categories (with serialCode, batchCode)
    { code: 'faucet', label: 'Faucets & Fittings', type: 'category', serialCode: 'FC', batchCode: 'BFC' },
    { code: 'sanitaryware', label: 'Sanitaryware & Bathware', type: 'category', serialCode: 'SW', batchCode: 'BSW' },
    { code: 'retail', label: 'Retail & Shelf Tags', type: 'category', serialCode: 'RT', batchCode: 'BRT' },
    // Product groups (with serialCode, batchCode)
    { code: 'shower', label: 'Showers & Overheads', type: 'group', serialCode: 'SH', batchCode: 'BSH' },
    { code: 'mixer', label: 'Mixers & Faucets', type: 'group', serialCode: 'MX', batchCode: 'BMX' },
    { code: 'washbasin', label: 'Washbasins', type: 'group', serialCode: 'WB', batchCode: 'BWB' },
    // Color / finish
    { code: 'W', label: 'W — White', type: 'color' },
    { code: 'CP', label: 'CP — Chrome Plated', type: 'color' },
    { code: 'RG', label: 'RG — Rose Gold', type: 'color' },
    { code: 'MB', label: 'MB — Matte Black', type: 'color' },
    // Warranty
    { code: '1 Year', label: '1 Year', type: 'warranty' },
    { code: '5 Years', label: '5 Years', type: 'warranty' },
    { code: '10 Years', label: '10 Years', type: 'warranty' }
];

export function loadMasterData(): MasterDataOption[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                // Ensure any newly added default data types (like month, financial_year, vendor) are seeded
                const existingTypes = new Set(parsed.map((p: any) => p.type));
                const missingDefaults = DEFAULT_DATA.filter(d => !existingTypes.has(d.type));
                if (missingDefaults.length > 0) {
                    const merged = [...parsed, ...missingDefaults];
                    saveMasterData(merged);
                    return merged;
                }
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed loading master data', e);
    }
    return [...DEFAULT_DATA];
}

export function saveMasterData(list: MasterDataOption[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('Failed saving master data', e);
    }
}

export function getMasterData(type: MasterDataType): MasterDataOption[] {
    return loadMasterData().filter(o => o.type === type);
}

export function getPlantByCode(code: string): MasterDataOption | undefined {
    const key = String(code || '').toUpperCase();
    return loadMasterData().find(o => o.type === 'plant' && (
        String(o.code || '').toUpperCase() === key ||
        String(o.plantCode || '').toUpperCase() === key ||
        String(o.label || '').toUpperCase() === key
    ));
}

export function getVendorsByPlant(plantCodeOrCode: string): MasterDataOption[] {
    return loadMasterData().filter(o => o.type === 'vendor' && (o.plantCode === plantCodeOrCode || o.plantCode === getPlantByCode(plantCodeOrCode)?.plantCode));
}

export function masterOptionExists(type: MasterDataType, code: string): boolean {
    return loadMasterData().some(o => o.type === type && o.code.toLowerCase() === code.toLowerCase());
}

export function addMasterData(option: MasterDataOption): boolean {
    if (masterOptionExists(option.type, option.code)) return false;
    const list = loadMasterData();
    list.push(option);
    saveMasterData(list);
    return true;
}

export function updateMasterData(type: MasterDataType, code: string, updates: Partial<MasterDataOption>): boolean {
    const list = loadMasterData();
    const idx = list.findIndex(o => o.type === type && o.code === code);
    if (idx === -1) return false;
    list[idx] = { ...list[idx], ...updates, code: code, type: type };
    saveMasterData(list);
    return true;
}

export function deleteMasterData(type: MasterDataType, code: string): boolean {
    const list = loadMasterData();
    const before = list.length;
    saveMasterData(list.filter(o => !(o.type === type && o.code === code)));
    return list.length < before;
}

export const MASTER_DATA_TYPES: { type: MasterDataType; label: string; icon: string }[] = [
    { type: 'plant', label: 'Plants', icon: '🏭' },
    { type: 'vendor', label: 'Vendors', icon: '🏬' },
    { type: 'financial_year', label: 'Financial Years', icon: '📅' },
    { type: 'month', label: 'Months', icon: '🗓️' },
    { type: 'category', label: 'Product Categories', icon: '🗂️' },
    { type: 'group', label: 'Product Groups', icon: '📦' },
    { type: 'color', label: 'Color / Finish', icon: '🎨' },
    { type: 'warranty', label: 'Warranty', icon: '🛡️' },
    { type: 'variable', label: 'Product Variables & Label Tags', icon: '🏷️' },
    { type: 'serial_logic', label: 'Serial No Logic', icon: '🔢' },
    { type: 'batch_logic', label: 'Batch No Logic', icon: '📦' }
];

/** Replace the local cache with a freshly-fetched DB list (DB is source of truth). */
export function mergeMasterDataFromDb(list: MasterDataOption[]): void {
    if (!Array.isArray(list)) return;
    // Keep a safe default set if the DB is empty, otherwise use DB.
    saveMasterData(list.length > 0 ? list : DEFAULT_DATA);
}
