import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileSocialDraftAfterSave } from '../packages/console/app/utils/socialLinksDraft.ts'

test('unchanged draft adopts the value returned by the server', () => {
  const submittedDraft = ['https://instagram.com/me', '', '', '']
  const savedLinks = ['https://www.instagram.com/me']

  assert.deepEqual(
    reconcileSocialDraftAfterSave(submittedDraft, submittedDraft, savedLinks),
    ['https://www.instagram.com/me', '', '', ''],
  )
})

test('typing during a save stays in the draft after the response', () => {
  const submittedDraft = ['https://instagram.com/me', '', '', '']
  const editedDraft = [
    'https://instagram.com/me',
    'https://github.com/me',
    '',
    '',
  ]

  assert.equal(
    reconcileSocialDraftAfterSave(editedDraft, submittedDraft, [
      'https://www.instagram.com/me',
    ]),
    editedDraft,
  )
})
