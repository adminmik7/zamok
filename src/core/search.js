export function matchesQuery(item, query) {
  const text = String(query || '').trim().toLowerCase()
  if (!text) return true

  const values = [
    item.title,
    item.username,
    item.url,
    item.notes,
    item.totpIssuer,
    item.cardHolder,
    item.cardExpiry,
    item.cardNumber,
    item.passportSeries,
    item.passportNumber,
    item.passportIdNumber,
    item.passportIssuedBy,
    item.loyaltyBarcode
  ]
  if (values.some((value) => String(value || '').toLowerCase().includes(text))) return true

  const digits = text.replace(/\D/g, '')
  if (!digits) return false
  return [item.cardNumber, item.loyaltyBarcode].some((value) =>
    String(value || '').replace(/\D/g, '').includes(digits)
  )
}
