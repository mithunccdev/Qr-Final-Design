// ════════════════════════════════════════════════════════════════════════════
// Lightweight i18n — English / Hindi / Gujarati for the app chrome (nav, auth,
// settings). Language is stored in localStorage and applied on reload.
// ════════════════════════════════════════════════════════════════════════════

export type Lang = 'en' | 'hi' | 'gu';
export const LANGS: { key: Lang; label: string }[] = [
    { key: 'en', label: 'English' },
    { key: 'hi', label: 'हिन्दी' },
    { key: 'gu', label: 'ગુજરાતી' }
];

const STORAGE_KEY_LANG = 'qrlayout_lang';

const dict: Record<string, Record<string, string>> = {
    en: {
        'app.name': 'QR Studio', 'app.tag': 'MY COMPANY',
        'nav.home': 'Home', 'nav.analytics': 'Analytics', 'nav.designer': 'Designer',
        'nav.print': 'Print', 'nav.templates': 'Templates', 'nav.products': 'Products',
        'nav.serials': 'Serial Numbers', 'nav.batches': 'Batch Numbers', 'nav.people': 'People',
        'nav.users': 'Users', 'nav.settings': 'Settings',
        'auth.welcome': 'Welcome back', 'auth.subtitle': 'Sign in to continue to your workspace.',
        'auth.email': 'Email', 'auth.password': 'Password', 'auth.login': 'Sign In to Workspace',
        'auth.title': 'Design once. Print everywhere.', 'auth.desc': 'Label layout, serial tracking, and thermal output in one workspace — PDF, ZPL, and sheet print from the same template.',
        'settings.title': 'Settings', 'settings.subtitle': 'Printer defaults and workspace config'
    },
    hi: {
        'app.name': 'QR स्टूडियो', 'app.tag': 'मेरी कंपनी',
        'nav.home': 'होम', 'nav.analytics': 'विश्लेषण', 'nav.designer': 'डिज़ाइनर',
        'nav.print': 'प्रिंट', 'nav.templates': 'टेम्पलेट', 'nav.products': 'उत्पाद',
        'nav.serials': 'सीरियल नंबर', 'nav.batches': 'बैच नंबर', 'nav.people': 'कर्मचारी',
        'nav.users': 'उपयोगकर्ता', 'nav.settings': 'सेटिंग्स',
        'auth.welcome': 'वापसी पर स्वागत है', 'auth.subtitle': 'अपने कार्यक्षेत्र में जारी रखने के लिए साइन इन करें।',
        'auth.email': 'ईमेल', 'auth.password': 'पासवर्ड', 'auth.login': 'कार्यक्षेत्र में साइन इन करें',
        'auth.title': 'एक बार डिज़ाइन करें। हर जगह प्रिंट करें।', 'auth.desc': 'एक ही कार्यक्षेत्र में लेबल लेआउट, सीरियल ट्रैकिंग और थर्मल आउटपुट — उसी टेम्पलेट से PDF, ZPL और शीट प्रिंट।',
        'settings.title': 'सेटिंग्स', 'settings.subtitle': 'प्रिंटर डिफ़ॉल्ट और कार्यक्षेत्र कॉन्फ़िग'
    },
    gu: {
        'app.name': 'QR સ્ટુડિયો', 'app.tag': 'મારી કંપની',
        'nav.home': 'હોમ', 'nav.analytics': 'વિશ્લેષણ', 'nav.designer': 'ડિઝાઇનર',
        'nav.print': 'પ્રિન્ટ', 'nav.templates': 'ટેમ્પલેટ', 'nav.products': 'ઉત્પાદનો',
        'nav.serials': 'સીરીયલ નંબર', 'nav.batches': 'બેચ નંબર', 'nav.people': 'કર્મચારીઓ',
        'nav.users': 'વપરાશકર્તા', 'nav.settings': 'સેટિંગ્સ',
        'auth.welcome': 'પાછા આવવા બદલ સ્વાગત છે', 'auth.subtitle': 'તમારા કાર્યક્ષેત્રમાં ચાલુ રાખવા સાઇન ઇન કરો.',
        'auth.email': 'ઇમેઇલ', 'auth.password': 'પાસવર્ડ', 'auth.login': 'કાર્યક્ષેત્રમાં સાઇન ઇન કરો',
        'auth.title': 'એકવાર ડિઝાઇન કરો. દરેક જગ્યાએ પ્રિન્ટ કરો.', 'auth.desc': 'એક જ કાર્યક્ષેત્રમાં લેબલ લેઆઉટ, સીરીયલ ટ્રેકિંગ અને થર્મલ આઉટપુટ — એ જ ટેમ્પલેટમાંથી PDF, ZPL અને શીટ પ્રિન્ટ.',
        'settings.title': 'સેટિંગ્સ', 'settings.subtitle': 'પ્રિન્ટર ડિફોલ્ટ્સ અને કાર્યક્ષેત્ર કન્ફિગ'
    }
};

export function getLang(): Lang {
    const l = (localStorage.getItem(STORAGE_KEY_LANG) as Lang) || 'en';
    return LANGS.some(x => x.key === l) ? l : 'en';
}

export function setLang(lang: Lang): void {
    localStorage.setItem(STORAGE_KEY_LANG, lang);
}

export function t(key: string): string {
    const lang = getLang();
    return dict[lang]?.[key] || dict.en[key] || key;
}

/** Apply `data-i18n` translations to the current DOM (used after login render). */
export function applyTranslations(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n!);
    });
    root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle!);
    });
}
