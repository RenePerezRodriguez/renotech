/**
 * Treasury Cloud Functions — Caja + Tesorería v2.
 *
 * Funciones server-side que garantizan atomicidad y validación de roles
 * para operaciones críticas que cruzan colecciones (sessions, accounts, journal_entries).
 */

export { transferAtomic } from './transferAtomic';
export { openSessionAtomic } from './openSessionAtomic';
export { reopenSessionAtomic } from './reopenSessionAtomic';
export { closeSessionAtomic } from './closeSessionAtomic';
export { forceCloseSessionAtomic } from './forceCloseSessionAtomic';
export { acknowledgeBlockedSessionAtomic } from './acknowledgeBlockedSessionAtomic';
export { reverseEntryAtomic } from './reverseEntryAtomic';
