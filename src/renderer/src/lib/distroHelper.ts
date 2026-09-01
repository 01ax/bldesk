import almaLogo from '../assets/logos/alma.svg'
import byoLogo from '../assets/logos/byo.svg'
import centosLogo from '../assets/logos/centos.svg'
import cpanelLogo from '../assets/logos/cpanel.svg'
import debianLogo from '../assets/logos/debian.svg'
import fedoraLogo from '../assets/logos/fedora.svg'
import freebsdLogo from '../assets/logos/freebsd.svg'
import kdeLogo from '../assets/logos/kde.svg'
import kdeneonLogo from '../assets/logos/kdeneon.svg'
import opensuseLogo from '../assets/logos/opensuse.svg'
import rockyLogo from '../assets/logos/rocky.svg'
import ubuntuLogo from '../assets/logos/ubuntu.svg'
import windowsLogo from '../assets/logos/windows.svg'

const distroLogos: Record<string, string> = {
  ubuntu: ubuntuLogo,
  centos: centosLogo,
  'cpanel+whm': cpanelLogo,
  cpanel: cpanelLogo,
  windows: windowsLogo,
  debian: debianLogo,
  fedora: fedoraLogo,
  freebsd: freebsdLogo,
  opensuse: opensuseLogo,
  kde: kdeLogo,
  kdeneon: kdeneonLogo,
  rocky: rockyLogo,
  almalinux: almaLogo,
  alma: almaLogo,
  byo: byoLogo
}

export function logoForDistribution(distribution?: string | null): string {
  if (!distribution) return byoLogo
  const key = distribution.toLowerCase()
  return distroLogos[key] || byoLogo
}
