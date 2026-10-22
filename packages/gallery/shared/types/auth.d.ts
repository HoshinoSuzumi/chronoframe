import type { UserSummary } from '@chronoframe/contracts/resources'
declare module '#auth-utils' {
  interface User extends UserSummary {}
}
export {}
