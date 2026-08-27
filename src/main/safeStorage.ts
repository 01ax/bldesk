import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { AccountProfile, StoredVaultData } from '../shared/ipc-types'

const VAULT_FILE_PATH = join(app.getPath('userData'), 'vault.enc')

interface EncryptedProfileRecord {
  id: string
  name: string
  encryptedToken: string // hex-encoded encrypted buffer
  email?: string
  isDefault?: boolean
  createdAt: string
}

interface EncryptedVaultFile {
  activeProfileId: string | null
  profiles: EncryptedProfileRecord[]
}

export class VaultManager {
  private static readRawVault(): EncryptedVaultFile {
    try {
      if (!existsSync(VAULT_FILE_PATH)) {
        return { activeProfileId: null, profiles: [] }
      }
      const raw = readFileSync(VAULT_FILE_PATH, 'utf8')
      return JSON.parse(raw) as EncryptedVaultFile
    } catch (err) {
      console.error('[VaultManager] Failed to read vault file:', err)
      return { activeProfileId: null, profiles: [] }
    }
  }

  private static writeRawVault(data: EncryptedVaultFile): void {
    try {
      writeFileSync(VAULT_FILE_PATH, JSON.stringify(data, null, 2), 'utf8')
    } catch (err) {
      console.error('[VaultManager] Failed to write vault file:', err)
    }
  }

  private static encryptToken(token: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = safeStorage.encryptString(token)
      return buffer.toString('hex')
    }
    // Fallback if safeStorage not available on linux without secret service (base64 fallback with warning)
    console.warn('[VaultManager] SafeStorage unavailable, using fallback encoding.')
    return Buffer.from(token, 'utf8').toString('base64')
  }

  private static decryptToken(encryptedHex: string): string {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedHex, 'hex')
        return safeStorage.decryptString(buffer)
      }
      return Buffer.from(encryptedHex, 'base64').toString('utf8')
    } catch (err) {
      console.error('[VaultManager] Failed to decrypt token:', err)
      return ''
    }
  }

  public static getProfiles(): Omit<AccountProfile, 'token'>[] {
    const vault = this.readRawVault()
    return vault.profiles.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      isDefault: p.isDefault,
      createdAt: p.createdAt
    }))
  }

  public static getActiveProfile(): AccountProfile | null {
    const vault = this.readRawVault()
    if (!vault.activeProfileId && vault.profiles.length === 0) {
      return null
    }

    const targetProfile = vault.profiles.find(p => p.id === vault.activeProfileId) || vault.profiles[0]
    if (!targetProfile) return null

    return {
      id: targetProfile.id,
      name: targetProfile.name,
      email: targetProfile.email,
      isDefault: targetProfile.isDefault,
      createdAt: targetProfile.createdAt,
      token: this.decryptToken(targetProfile.encryptedToken)
    }
  }

  public static saveProfile(profile: { name: string; token: string; isDefault?: boolean }): { success: boolean; profileId: string; error?: string } {
    try {
      const vault = this.readRawVault()
      const newId = 'prof_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      const encrypted = this.encryptToken(profile.token)

      const newRecord: EncryptedProfileRecord = {
        id: newId,
        name: profile.name.trim() || 'Default Account',
        encryptedToken: encrypted,
        isDefault: !!profile.isDefault,
        createdAt: new Date().toISOString()
      }

      if (profile.isDefault || vault.profiles.length === 0) {
        vault.profiles.forEach(p => (p.isDefault = false))
        vault.activeProfileId = newId
      }

      vault.profiles.push(newRecord)
      this.writeRawVault(vault)
      return { success: true, profileId: newId }
    } catch (err: any) {
      return { success: false, profileId: '', error: err.message }
    }
  }

  public static setActiveProfile(profileId: string): { success: boolean } {
    const vault = this.readRawVault()
    const exists = vault.profiles.some(p => p.id === profileId)
    if (!exists) return { success: false }

    vault.activeProfileId = profileId
    this.writeRawVault(vault)
    return { success: true }
  }

  public static deleteProfile(profileId: string): { success: boolean } {
    const vault = this.readRawVault()
    vault.profiles = vault.profiles.filter(p => p.id !== profileId)
    if (vault.activeProfileId === profileId) {
      vault.activeProfileId = vault.profiles.length > 0 ? vault.profiles[0].id : null
    }
    this.writeRawVault(vault)
    return { success: true }
  }
}
