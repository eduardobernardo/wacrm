import { phoneVariants, isRecipientNotAllowedError } from '@/lib/whatsapp/phone-utils'

/**
 * Try sending a WhatsApp message across phone-number format variants.
 * Meta sometimes rejects a number in one format but accepts it in
 * another (with/without country code prefix, with/without +).
 * This tries the most common variants in order and returns the first
 * successful result, or throws the last error if all fail.
 *
 * When a "recipient not allowed" error is encountered, the next
 * variant is tried. Any other error is thrown immediately.
 */
export async function sendWithPhoneVariants<T>(
  sendFn: (phone: string) => Promise<T>,
  sanitizedPhone: string,
): Promise<{ result: T; workingPhone: string }> {
  const variants = phoneVariants(sanitizedPhone)
  let workingPhone = sanitizedPhone
  let result: T | undefined
  let lastError: unknown = null

  for (const v of variants) {
    try {
      result = await sendFn(v)
      workingPhone = v
      lastError = null
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isRecipientNotAllowedError(msg)) throw err
      lastError = err
    }
  }
  if (lastError) throw lastError

  return { result: result!, workingPhone }
}
