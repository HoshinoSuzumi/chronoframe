import {
  reserveUploadSource,
  sourceAwareUploadStorage,
} from '../../utils/upload-source'
import { DEFAULT_SITE } from '@chronoframe/core'
import type {
  UploadPreparationResponse,
  PreparedUploadResponse,
} from '@chronoframe/contracts/upload'
import {
  createUploadPreparer,
  DuplicateUploadError,
  CoreError,
} from '@chronoframe/core'
import { useStorageProvider } from '../../utils/useStorageProvider'
import { generateSafePhotoId } from '../../utils/file-utils'
import { settingsManager } from '../../services/settings/settingsManager'
import { prepareUpload } from '../../utils/direct-upload'
import { useDB } from '../../utils/db'
import { createSqliteUploadRepository } from '../../repositories/sqlite-uploads'

export default eventHandler(
  async (event): Promise<UploadPreparationResponse> => {
    const session = await requireUserSession(event)
    const { storageProvider } = useStorageProvider(event)
    const t = await useTranslation(event)
    const body = (await readBody(event)) || {}
    const providerConfig = storageProvider.config
    const mime = useRuntimeConfig(event).upload.mime
    const preparer = createUploadPreparer({
      repository: createSqliteUploadRepository(useDB(), DEFAULT_SITE),
      identifiers: { fromStorageKey: generateSafePhotoId },
      // Self-hosted has no account-wide quota; the per-file policy still applies.
      quota: { assertAllowed: async () => {} },
      prepare: (owner, key, size, contentType, chunked) => {
        reserveUploadSource(key, storageProvider)
        return prepareUpload(
          owner,
          key,
          size,
          contentType,
          sourceAwareUploadStorage(storageProvider),
          chunked,
        )
      },
    })
    try {
      const result = await preparer(String(session.user.id), body, {
        prefix:
          providerConfig && 'prefix' in providerConfig
            ? providerConfig.prefix
            : '',
        maxBytes:
          ((await settingsManager.get<number>(
            'system',
            'upload.maxFileSize',
          )) ?? 256) *
          1024 *
          1024,
        mimeWhitelistEnabled: mime.whitelistEnabled,
        mimeWhitelist: mime.whitelist
          .split(',')
          .map((type: string) => type.trim())
          .filter(Boolean),
        duplicateCheckEnabled:
          (await settingsManager.get<boolean>(
            'system',
            'upload.duplicateCheck.enabled',
          )) ?? true,
        duplicateMode:
          (await settingsManager.get<'warn' | 'block' | 'skip'>(
            'system',
            'upload.duplicateCheck.mode',
          )) ?? 'skip',
      })
      const fileName = body.fileName
      if (result.skipped) {
        return {
          skipped: true,
          duplicate: true,
          existingPhoto: result.existingPhoto,
          fileKey: result.fileKey,
          title: t('upload.duplicate.skip.title'),
          message: t('upload.duplicate.skip.message', { fileName }),
          info: t('upload.duplicate.skip.info', {
            dateTaken:
              result.existingPhoto.dateTaken ||
              t('common.unknown', 'unknown date'),
          }),
        }
      }
      const response: PreparedUploadResponse = {
        signedUrl: result.upload.url,
        upload: result.upload,
        fileKey: result.fileKey,
        expiresIn: 3600,
      }
      if (result.existingPhoto) {
        response.duplicate = true
        response.existingPhoto = result.existingPhoto
        response.warningInfo = {
          title: t('upload.duplicate.warn.title'),
          message: t('upload.duplicate.warn.message', { fileName }),
          warning: t('upload.duplicate.warn.warning'),
          info: t('upload.duplicate.warn.info', {
            title: result.existingPhoto.title || fileName,
            dateTaken:
              result.existingPhoto.dateTaken ||
              t('common.unknown', 'unknown date'),
          }),
        }
      }
      return response
    } catch (error) {
      if (error instanceof DuplicateUploadError)
        throw createError({
          statusCode: 409,
          statusMessage: t('upload.duplicate.block.title'),
          data: {
            duplicate: true,
            existingPhoto: error.existingPhoto,
            title: t('upload.duplicate.block.title'),
            message: t('upload.duplicate.block.message', {
              fileName: body.fileName,
            }),
          },
        })
      if (error instanceof CoreError)
        throw createError({
          statusCode: error.statusCode,
          statusMessage: error.code ? t(error.code) : error.message,
        })
      if ((error as { statusCode?: number }).statusCode) throw error
      logger.chrono.error('Failed to prepare upload:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to prepare upload',
      })
    }
  },
)
