import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { AccountProfile, StoredVaultData } from '../shared/ipc-types'

function getVaultFilePath(): string {
  try {
    return join(app.getPath('userData'), 'vault.enc')
  } catch {
    return join(process.env.HOME || '/tmp', '.bldesk_vault.enc')
  }
}

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
      const vaultPath = getVaultFilePath()
      if (!existsSync(vaultPath)) {
        return { activeProfileId: null, profiles: [] }
      }
      const raw = readFileSync(vaultPath, 'utf8')
      return JSON.parse(raw) as EncryptedVaultFile
    } catch (err) {
      console.error('[VaultManager] Failed to read vault file:', err)
      return { activeProfileId: null, profiles: [] }
    }
  }

  private static writeRawVault(data: EncryptedVaultFile): void {
    try {
      const vaultPath = getVaultFilePath()
      writeFileSync(vaultPath, JSON.stringify(data, null, 2), 'utf8')
    } catch (err) {
      console.error('[VaultManager] Failed to write vault file:', err)
    }
  }

  private static encryptToken(token: string): string {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(token)
        return buffer.toString('hex')
      }
    } catch (err) {
      console.warn('[VaultManager] safeStorage encryption failed, falling back:', err)
    }
    // Fallback if safeStorage not available
    return Buffer.from(token, 'utf8').toString('base64')
  }

  private static decryptToken(encryptedHex: string): string {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedHex, 'hex')
        return safeStorage.decryptString(buffer)
      }
    } catch (err) {
      console.warn('[VaultManager] safeStorage decryption failed, falling back:', err)
    }
    try {
      return Buffer.from(encryptedHex, 'base64').toString('utf8')
    } catch {
      return encryptedHex
    }
  }

  public static getProfiles(): Omit<AccountProfile, 'token'>[] {
    const vault = this.readRawVault()
    return vault.profiles.map(({ encryptedToken: _, ...rest }) => rest)
  }

  public static getActiveProfile(): AccountProfile | null {
    const vault = this.readRawVault()
    if (vault.profiles.length === 0) return null

    let activeRecord = vault.profiles.find((p) => p.id === vault.activeProfileId)
    if (!activeRecord) {
      activeRecord = vault.profiles.find((p) => p.isDefault) || vault.profiles[0]
    }

    if (!activeRecord) return null

    const decryptedToken = this.decryptToken(activeRecord.encryptedToken)
    return {
      id: activeRecord.id,
      name: activeRecord.name,
      email: activeRecord.email,
      token: decryptedToken,
      isDefault: activeRecord.isDefault,
      createdAt: activeRecord.createdAt
    }
  }

  public static getProfileToken(profileId: string): string | null {
    const vault = this.readRawVault()
    const record = vault.profiles.find((p) => p.id === profileId)
    if (!record) return null
    return this.decryptToken(record.encryptedToken)
  }

  public static saveProfile(profile: { name: string; token: string; email?: string; isDefault?: boolean }): {
    success: boolean
    profileId: string
    error?: string
  } {
    try {
      const vault = this.readRawVault()
      const newId = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      const encrypted = this.encryptToken(profile.token)

      const newRecord: EncryptedProfileRecord = {
        id: newId,
        name: profile.name,
        email: profile.email,
        encryptedToken: encrypted,
        isDefault: profile.isDefault ?? (vault.profiles.length === 0),
        createdAt: new Date().toISOString()
      }

      if (newRecord.isDefault || vault.profiles.length === 0) {
        vault.profiles.forEach((p) => (p.isDefault = false))
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
    const exists = vault.profiles.some((p) => p.id === profileId)
    if (!exists) return { success: false }

    vault.activeProfileId = profileId
    this.writeRawVault(vault)
    return { success: true }
  }

  public static deleteProfile(profileId: string): { success: boolean } {
    const vault = this.readRawVault()
    vault.profiles = vault.profiles.filter((p) => p.id !== profileId)
    if (vault.activeProfileId === profileId) {
      vault.activeProfileId = vault.profiles.length > 0 ? vault.profiles[0].id : null
    }
    this.writeRawVault(vault)
    return { success: true }
  }
}
