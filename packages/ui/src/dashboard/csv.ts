// ════════════════════════════════════════════════════════════════════════════
// CSV helpers (no external dependency) — export & import for data tables.
// ════════════════════════════════════════════════════════════════════════════

function csvEscape(v: any): string {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

/** Convert a list of flat objects to a CSV string using `columns` order. */
export function toCSV(rows: Record<string, any>[], columns: { key: string; label: string }[]): string {
    const header = columns.map(c => csvEscape(c.label)).join(',');
    const lines = rows.map(r => columns.map(c => csvEscape(r[c.key])).join(','));
    return [header, ...lines].join('\r\n');
}

/** Trigger a browser download of a CSV/JSON string. */
export function downloadFile(filename: string, content: string, mime = 'text/csv'): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse a CSV string into an array of objects (first row = headers). */
export function parseCSV(text: string): Record<string, any>[] {
    const rows: string[][] = [];
    let cur = '';
    let inQuotes = false;
    const push = (s: string) => { cur += s; };
    const endField = () => { rows.length === 0 ? (rows[0] = rows[0] || []) : null; (rows[rows.length - 1] = rows[rows.length - 1] || []).push(cur); cur = ''; };
    // Simpler tokenizer
    const arr: string[][] = [];
    let row: string[] = [];
    let field = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else q = false;
            } else field += c;
        } else {
            if (c === '"') q = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(field); field = '';
                if (row.length > 1 || (row.length === 1 && row[0] !== '')) arr.push(row);
                row = [];
            } else field += c;
        }
    }
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) arr.push(row);

    if (arr.length < 2) return [];
    const headers = arr[0].map(h => h.trim());
    return arr.slice(1).map(r => {
        const o: Record<string, any> = {};
        headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
        return o;
    });
}

/** Read a file as text (input[type=file]). */
export function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}
