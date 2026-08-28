// ════════════════════════════════════════════════════════════════════════════
// COMPANY BRANDING / WHITE-LABEL PROFILE
// Stored locally and applied app-wide (sidebar, login, favicon). The logo is
// auto-resized to the size the app needs for its badges so it never overflows.
// ════════════════════════════════════════════════════════════════════════════

export interface CompanyProfile {
    companyName: string;
    brandName: string;
    address: string;
    email: string;
    phone: string;
    website?: string;
    logoDataUrl: string;   // square PNG already resized for the app's badges
}

const STORAGE_KEY = 'qrlayout_company_profile_v1';

export const LOGO_SIZE = 128; // px — enough for the 30–36px badges at 3–4x

export function defaultCompanyProfile(): CompanyProfile {
    return {
        companyName: '',
        brandName: 'QR Studio',
        address: '',
        email: '',
        phone: '',
        website: '',
        logoDataUrl: ''
    };
}

export function loadCompanyProfile(): CompanyProfile {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...defaultCompanyProfile(), ...parsed };
        }
    } catch (e) {
        console.warn('Failed loading company profile', e);
    }
    return defaultCompanyProfile();
}

export function saveCompanyProfile(profile: CompanyProfile): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
        console.warn('Failed saving company profile', e);
    }
}

/**
 * Read an image file, resize it to a square of `size`px (centered "contain" on a
 * transparent canvas), and return a PNG data URL. Used to fit the app's logo
 * badge sizes. Falls back to a generic QR tile if the image fails to load.
 */
export function resizeLogoToAppSize(file: File, size: number = LOGO_SIZE): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('Please choose an image file (PNG, JPG, SVG, WEBP).'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read the file.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('That file could not be read as an image.'));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('Canvas not supported.')); return; }
                ctx.clearRect(0, 0, size, size);
                // Fit within the square, centred, preserving aspect ratio.
                const scale = Math.min(size / img.width, size / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });
}

/** Small helper: an <img> markup for the sidebar/auth badge when a logo exists. */
export function logoBadgeHtml(logoDataUrl: string, alt = 'Logo'): string {
    if (!logoDataUrl) return '';
    return `<img src="${logoDataUrl}" alt="${alt}" style="width:100%;height:100%;object-fit:contain;display:block;" />`;
}
