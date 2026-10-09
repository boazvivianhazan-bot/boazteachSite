/** Israeli local number → international digits ("050-123 4567" → "972501234567"). */
export function intlPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('972')) return d
  if (d.startsWith('0')) return `972${d.slice(1)}`
  return d
}

export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
export const whatsappLink = (phone: string, text?: string) =>
  `https://wa.me/${intlPhone(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`
/** WhatsApp goes to the parent when a parent phone is set, otherwise to the student. */
export const whatsappPhone = (s: { phone: string; parentPhone: string }) => s.parentPhone || s.phone

export const wazeLink = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
