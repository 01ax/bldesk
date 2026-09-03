/**
 * Advanced (hypervisor-level) server features, as the web panel presents them.
 *
 * `GET /v2/servers/{id}/available_advanced_features` returns everything the
 * platform can toggle - nine entries for a Windows server, including
 * `local-rtc`, `qemu-guest-agent` and `uefi-boot`. The web panel exposes only a
 * subset to customers, and shows `cloud-init` only where it means something.
 * Listing the raw slugs offered operator-level switches with no explanation of
 * what they do.
 */
export interface FeatureDescriptor {
  slug: string
  label: string
  hint: string
  /** Only meaningful on Linux images; the web panel hides it on Windows. */
  linuxOnly?: boolean
}

/** Customer-facing features, in the order the web panel lists them. */
export const CUSTOMER_FEATURES: FeatureDescriptor[] = [
  { slug: 'emulated-hyperv', label: 'Enable HyperV extensions', hint: 'Recommended for Windows' },
  { slug: 'emulated-devices', label: 'Enable Emulated devices', hint: 'IDE HDD and Intel E1000 NIC' },
  { slug: 'driver-disk', label: 'Attach Windows driver CD', hint: 'Use with System Recovery' },
  {
    slug: 'cloud-init',
    label: 'Enable Cloud-Init Datasource',
    hint: 'Provides a datasource for the cloud-init service.',
    linuxOnly: true
  },
  {
    slug: 'emulated-tpm',
    label: 'Enable TPM v1.2',
    hint: 'Provides an emulated TPM v1.2 device to your Cloud Server. Warning: the TPM state is not backed up'
  },
  { slug: 'unset-uuid', label: 'Disable BIOS UUID', hint: 'Disables the unique ID used to identify the Cloud Server' }
]

const isWindows = (distribution?: string | null): boolean => /windows/i.test(distribution || '')

/** The features to show for a server, given what the platform offers for it. */
export function visibleFeatures(available: string[], distribution?: string | null): FeatureDescriptor[] {
  const offered = new Set(available)
  return CUSTOMER_FEATURES.filter(
    (f) => offered.has(f.slug) && !(f.linuxOnly && isWindows(distribution))
  )
}

/**
 * The full array to send with `change_advanced_features`.
 *
 * That action replaces the whole set, so anything enabled but not shown - an
 * operator-level flag, or `cloud-init` on a Windows server - has to be carried
 * through explicitly. Sending only the visible selection would silently switch
 * those off the first time a customer saved this form.
 */
export function mergeHiddenFeatures(
  selectedVisible: string[],
  currentlyEnabled: string[],
  shown: FeatureDescriptor[]
): string[] {
  const shownSlugs = new Set(shown.map((f) => f.slug))
  const preserved = currentlyEnabled.filter((f) => !shownSlugs.has(f))
  return Array.from(new Set([...selectedVisible, ...preserved]))
}

/**
 * `pc_i440fx_7point2point1` -> `pc-i440fx-7.2.1`.
 *
 * The API spells machine types for a JSON enum; the panel shows the QEMU name.
 * Rendering the raw value produced "7point2point1", which reads as a typo.
 */
export function formatMachineType(slug: string): string {
  return slug.replace(/_/g, '-').replace(/point/g, '.')
}
