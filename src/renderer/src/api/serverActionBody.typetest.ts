/**
 * A compile-time test: nothing runs this file and nothing imports it. `npm run typecheck`
 * compiles it, and fails if `ServerActionBody` stops being tied to the generated spec types.
 *
 * Each `@ts-expect-error` below is a body the type must reject. If the type is ever loosened
 * (to `any`, `Record<string, unknown>`, a cast), the line stops being an error, the directive
 * becomes unused, and the typecheck fails. Remove this file if the check is no longer wanted.
 *
 * It covers the types and the hooks that are exported. The functions that are not exported (`handleAction`,
 * `executeAction`) are covered by scripts/check-typed-seams.mjs.
 */
import { useServerActionMutation, useServerActionWithHandoff, useServerDiagnosticMutation, type ServerActionBody, type SubmittableActionBody, type UnpublishedActionBody } from './queries'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// The three hooks that send an action body take the spec's body (setting one back to `any` makes these false).
export type ActionMutationTakesSubmittable = Expect<Equal<Parameters<ReturnType<typeof useServerActionMutation>['mutate']>[0]['actionPayload'], SubmittableActionBody>>
export type HandoffTakesSpecBody = Expect<Equal<Parameters<ReturnType<typeof useServerActionWithHandoff>['mutate']>[0], ServerActionBody>>
export type DiagnosticTakesSpecBody = Expect<Equal<Parameters<ReturnType<typeof useServerDiagnosticMutation>['mutate']>[0], ServerActionBody>>

// Bodies the spec defines are accepted.
export const accepted: ServerActionBody[] = [
  { type: 'rename', name: 'web-01' },
  { type: 'add_disk', size_gigabytes: 20 },
  { type: 'resize_disk', disk_id: 7, size_gigabytes: 40 },
  { type: 'change_partner', partner_server_id: 12 },
  { type: 'power_off' }
]

// @ts-expect-error `partner_id` is not a field; the spec calls it `partner_server_id` (#123)
export const wrongPartnerField: ServerActionBody = { type: 'change_partner', partner_id: 12 }

// @ts-expect-error `size` is not a field; the spec calls it `size_gigabytes` (#124)
export const wrongDiskSizeField: ServerActionBody = { type: 'add_disk', size: 20 }

// @ts-expect-error a field the action requires is missing
export const missingRequiredField: ServerActionBody = { type: 'rename' }

// @ts-expect-error an action the spec does not list
export const unknownAction: ServerActionBody = { type: 'not_a_real_action' }

// The one recorded exception (AGENTS.md, "Accepted exceptions", #129) is named, not allowed by loosening the type.
// @ts-expect-error not in the public reference, so not a `ServerActionBody`
export const rescueIsNotASpecBody: ServerActionBody = { type: 'enable_rescue_mode' }
export const rescueIsSubmittable: SubmittableActionBody = { type: 'enable_rescue_mode' }
export const rescueIsTheNamedException: UnpublishedActionBody = { type: 'enable_rescue_mode' }

// The union the hooks and `handleAction` take must not become a way around the check either.
// @ts-expect-error neither a spec action nor the named exception
export const submittableRejectsUnknownAction: SubmittableActionBody = { type: 'not_a_real_action' }
// @ts-expect-error the exception covers one action only, not every action
export const unpublishedIsOnlyRescue: UnpublishedActionBody = { type: 'reboot' }
