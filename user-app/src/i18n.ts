/**
 * Minimal i18n for user-app (Thai / English).
 * Usage: import { t, setLang, getLang } from '../i18n'
 */

export type Lang = 'th' | 'en';

const strings: Record<Lang, Record<string, string>> = {
  th: {
    'app.title':            'EVAC',
    'app.subtitle':         'เส้นทางหนีไฟ',
    'building.select':      'เลือกอาคารของคุณ',
    'building.loading':     'กำลังโหลด…',
    'building.error':       'โหลดรายการอาคารไม่สำเร็จ',
    'building.empty':       'ยังไม่มีอาคารในระบบ — ติดต่อเจ้าหน้าที่',
    'building.select.cta':  'เลือกชั้น →',
    'floor.select':         'คุณอยู่ชั้นไหน?',
    'floor.btn':            'ชั้น',
    'floor.loading':        'กำลังโหลดแผนผัง…',
    'floor.error':          'โหลดแผนผังไม่สำเร็จ',
    'route.loading':        'กำลังคำนวณเส้นทาง…',
    'route.none':           'ไม่พบเส้นทาง — ออกทางใกล้ที่สุดทันที',
    'route.title':          'เส้นทางที่แนะนำ',
    'route.via':            'ผ่าน',
    'route.distance':       'ระยะทาง',
    'route.time':           'เวลาประมาณ',
    'route.exit':           'ทางออก',
    'incident.report':      'รายงานเหตุฉุกเฉิน',
    'incident.type.fire':   'ไฟไหม้',
    'incident.type.smoke':  'ควัน',
    'incident.type.crowd':  'ฝูงชนหนาแน่น',
    'incident.btn':         'รายงาน',
    'incident.sending':     'กำลังส่ง…',
    'incident.sent':        'รายงานแล้ว',
    'incident.error':       'ส่งรายงานไม่สำเร็จ',
    'offline.banner':       'ไม่มีสัญญาณ — แสดงข้อมูลที่บันทึกไว้',
    'lang.switch':          'EN',
  },
  en: {
    'app.title':            'EVAC',
    'app.subtitle':         'Evacuation Routes',
    'building.select':      'Select your building',
    'building.loading':     'Loading…',
    'building.error':       'Failed to load buildings',
    'building.empty':       'No buildings registered — contact your safety officer',
    'building.select.cta':  'Select floor →',
    'floor.select':         'Which floor are you on?',
    'floor.btn':            'Floor',
    'floor.loading':        'Loading floor plan…',
    'floor.error':          'Failed to load floor plan',
    'route.loading':        'Calculating route…',
    'route.none':           'No route found — exit via nearest door immediately',
    'route.title':          'Recommended Route',
    'route.via':            'via',
    'route.distance':       'Distance',
    'route.time':           'Est. time',
    'route.exit':           'Exit',
    'incident.report':      'Report Emergency',
    'incident.type.fire':   'Fire',
    'incident.type.smoke':  'Smoke',
    'incident.type.crowd':  'Crowd',
    'incident.btn':         'Report',
    'incident.sending':     'Sending…',
    'incident.sent':        'Reported',
    'incident.error':       'Failed to send report',
    'offline.banner':       'Offline — showing cached data',
    'lang.switch':          'ไทย',
  },
};

let _lang: Lang = (localStorage.getItem('evac-lang') as Lang) || 'th';

export function getLang(): Lang {
  return _lang;
}

export function setLang(lang: Lang): void {
  _lang = lang;
  localStorage.setItem('evac-lang', lang);
  window.dispatchEvent(new CustomEvent('evac-lang-change', { detail: lang }));
}

export function t(key: string, fallback?: string): string {
  return strings[_lang][key] ?? strings['th'][key] ?? fallback ?? key;
}
