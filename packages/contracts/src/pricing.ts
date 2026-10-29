/** Round the discounted minor-unit amount once, using the same basis-point rate sent to the provider. */
export function discountedPrice(amount: number | null, discountBps = 0): number | null {
  return amount === null ? null : Math.floor((amount * (10000 - discountBps) + 5000) / 10000)
}
