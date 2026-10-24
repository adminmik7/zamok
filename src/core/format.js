export function formatIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || '')
}

export function pluralRecords(count) {
  const n = Math.abs(Number(count) || 0)
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} запись`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} записи`
  return `${n} записей`
}
