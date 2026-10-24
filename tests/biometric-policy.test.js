import { describe, expect, it } from 'vitest'
import { shouldAutoPromptBiometric } from '../src/core/biometric-policy.js'

const base = {
  pending: true,
  screen: 'unlock',
  settings: { biometrics: true },
  ready: true,
  hidden: false
}

describe('biometric auto prompt', () => {
  it('fires on a locked screen with biometrics enabled', () => {
    expect(shouldAutoPromptBiometric(base)).toBe(true)
  })

  it('stays quiet once the prompt was already offered', () => {
    expect(shouldAutoPromptBiometric({ ...base, pending: false })).toBe(false)
  })

  it('does not fire when biometrics are off or unavailable', () => {
    expect(shouldAutoPromptBiometric({ ...base, settings: { biometrics: false } })).toBe(false)
    expect(shouldAutoPromptBiometric({ ...base, ready: false })).toBe(false)
  })

  it('waits until the app is visible and the vault is locked', () => {
    expect(shouldAutoPromptBiometric({ ...base, hidden: true })).toBe(false)
    expect(shouldAutoPromptBiometric({ ...base, screen: 'list' })).toBe(false)
  })
})
