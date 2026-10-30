import { z } from 'zod'
import { settingsManager } from '../settings/settingsManager'

export const wizardSiteSchema = z.object({
  title: z.string().min(1),
  slogan: z.string().optional(),
  avatarUrl: z.string().optional(),
  author: z.string().optional(),
  homeView: z.enum(['photos', 'albums']).optional(),
  'appearance.theme': z.enum(['light', 'dark', 'system']).optional(),
  'appearance.homeHeaderLayout': z.enum(['embedded', 'fixed']).optional(),
})

export type WizardSiteSettings = z.infer<typeof wizardSiteSchema>

export async function persistWizardSiteSettings(
  site: WizardSiteSettings,
): Promise<void> {
  await settingsManager.set('app', 'title', site.title)
  if (site.slogan) await settingsManager.set('app', 'slogan', site.slogan)
  if (site.avatarUrl)
    await settingsManager.set('app', 'avatarUrl', site.avatarUrl)
  if (site.author) await settingsManager.set('app', 'author', site.author)
  if (site.homeView !== undefined)
    await settingsManager.set('app', 'homeView', site.homeView)
  if (site['appearance.theme'] !== undefined)
    await settingsManager.set(
      'app',
      'appearance.theme',
      site['appearance.theme'],
    )
  if (site['appearance.homeHeaderLayout'] !== undefined)
    await settingsManager.set(
      'app',
      'appearance.homeHeaderLayout',
      site['appearance.homeHeaderLayout'],
    )
}
