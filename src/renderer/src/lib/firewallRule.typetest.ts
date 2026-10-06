/**
 * A compile-time test, like api/serverActionBody.typetest.ts: nothing runs or imports it, and `npm run typecheck`
 * compiles it. Each `@ts-expect-error` is a rule the type must reject; if the type is loosened (to `any`, a plain
 * `string`, a generic that accepts any object), the directive becomes unused and the typecheck fails.
 *
 * It covers the types. That a function really takes them is covered by scripts/check-typed-seams.mjs.
 */
import type { components } from '@shared/api/schema'
import type { FwRule } from './firewallMatrix'
import { toRuleRequest, readImportedRules, type TemplateRule } from './firewallRules'
import { fetchFirewallRules, useUpdateFirewallRulesMutation } from '../api/queries'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// Rules the reference defines are accepted.
export const accepted: FwRule[] = [
  { action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], destination_ports: ['22'], description: 'ssh' },
  { action: 'drop', protocol: 'all', source_addresses: ['203.0.113.0/24'], destination_addresses: ['0.0.0.0/0'] }
]

// @ts-expect-error `destination_port` is not a field; the reference calls it `destination_ports`
export const wrongPortsField: FwRule = { action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], destination_port: ['22'] }

// @ts-expect-error `http` is not a protocol; the reference has all, icmp, tcp and udp
export const wrongProtocol: FwRule = { action: 'accept', protocol: 'http', source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'] }

// @ts-expect-error `allow` is not an action; the reference has accept and drop
export const wrongAction: FwRule = { action: 'allow', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'] }

// @ts-expect-error `source_addresses` is required
export const missingSource: FwRule = { action: 'accept', protocol: 'tcp', destination_addresses: ['0.0.0.0/0'] }

// A rule built for writing is checked too: this used to take any object, so a misspelled optional field went through.
export const written: FwRule = toRuleRequest({ action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'] })
// @ts-expect-error `descripton` is not a field; the reference calls it `description`
export const misspelledOptional = toRuleRequest({ action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], descripton: 'ssh' })

// What is read, validated and stored is the reference's own rule, not `any` or a plain string.
export type ReadIsTheReferenceRule = Expect<Equal<Awaited<ReturnType<typeof fetchFirewallRules>>, FwRule[]>>
export type ImportedIsTheReferenceRule = Expect<Equal<NonNullable<ReturnType<typeof readImportedRules>['rules']>[number], components['schemas']['AdvancedFirewallRuleRequest']>>
export type TemplateActionIsTheEnum = Expect<Equal<TemplateRule['action'], FwRule['action']>>
export type TemplateProtocolIsTheEnum = Expect<Equal<TemplateRule['protocol'], FwRule['protocol']>>
export type WriteTakesTheReferenceRule = Expect<Equal<Parameters<ReturnType<typeof useUpdateFirewallRulesMutation>['mutate']>[0], FwRule[]>>
