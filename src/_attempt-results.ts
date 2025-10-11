import type { SelectableAttemptResult } from './channel-api.js'

export const attemptNotOk: SelectableAttemptResult<never> = { ok: false }

export const attemptOkUndefined: SelectableAttemptResult<undefined> = 
    { ok: true, value: undefined }
