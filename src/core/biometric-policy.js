// Whether the lock screen should raise the biometric prompt by itself.
// Pure so the policy is testable; the app calls it on start, on resume,
// and again when the lock screen is shown.
export function shouldAutoPromptBiometric({ pending, screen, settings, ready, hidden }) {
  if (!pending) return false
  if (screen !== 'unlock') return false
  if (!settings?.biometrics || !ready) return false
  if (hidden) return false
  return true
}
