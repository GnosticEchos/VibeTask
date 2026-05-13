/** Breaks the axios ↔ auth store cycle: axios calls this; Pinia registers the real handler at bootstrap. */
type UnauthorizedHandler = () => void

let handler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  handler = fn
}

export function notifyUnauthorized(): void {
  handler?.()
}
