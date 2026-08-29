// Shared HTML-escaping helper used when interpolating untrusted (DB/user) data
// into an `innerHTML` template. Call esc() on ANY value that originates from a
// user, a database record, or a loaded JSON layout before embedding it in HTML
// to prevent DOM-based XSS.
export function esc(value: unknown): string {
    const s = value == null ? '' : String(value);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}

// Alias kept for readability / API stability.
export { esc as escapeHtml };
