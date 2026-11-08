/** Pure validation shared by Node bootstrap and Worker deployment tooling. */
export function validateAppSecret(secret, message) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error(message)
  return secret
}
