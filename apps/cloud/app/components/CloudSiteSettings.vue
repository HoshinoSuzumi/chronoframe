<script setup lang="ts">
import {
  MAX_SOCIAL_LINKS,
  parseSocialLinks,
  socialLinkIdentity,
  resolveSocialPlatform,
} from '@chronoframe/contracts/social-links'
const { t } = useI18n()

const props = defineProps<{ siteId: number }>()
const context = useEntryContext()
const {
  data,
  error: loadError,
  refresh,
} = await useFetch(`/api/sites/${props.siteId}/settings`, {
  key: `site-settings-${props.siteId}`,
})
const name = ref(data.value?.site.name ?? '')
const profile = reactive({
  title: data.value?.site.title ?? '',
  slogan: data.value?.site.slogan ?? '',
  author: data.value?.site.author ?? '',
  avatarUrl: data.value?.site.avatarUrl ?? '',
})
const homeHeaderLayout = ref<'embedded' | 'fixed'>(
  data.value?.site.presentation.homeHeaderLayout ?? 'embedded',
)
const socialDraft = ref(
  Array.from(
    { length: MAX_SOCIAL_LINKS },
    (_, i) => data.value?.site.presentation.socialLinks.links[i] ?? '',
  ),
)
const socialErrors = computed(() => {
  const seen = new Set<string>()
  return socialDraft.value.map((value) => {
    if (!value.trim()) return ''
    try {
      const identity = socialLinkIdentity(value.trim())
      if (seen.has(identity)) return t('cloud.presentation.duplicate')
      seen.add(identity)
      return ''
    } catch {
      return t('cloud.presentation.invalid')
    }
  })
})
function socialLabel(value: string) {
  try {
    return resolveSocialPlatform(value.trim()).label
  } catch {
    return ''
  }
}
const iconError = ref(''),
  iconBusy = ref(false)
async function chooseIcon(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  iconError.value = ''
  if (!file) return
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    iconError.value = t('cloud.messages.chooseAPngJpegOrWebpImageUpTo')
    input.value = ''
    return
  }
  iconBusy.value = true
  try {
    const image = await createImageBitmap(file)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 128
      const drawing = canvas.getContext('2d')!
      const size = Math.min(image.width, image.height)
      drawing.drawImage(
        image,
        (image.width - size) / 2,
        (image.height - size) / 2,
        size,
        size,
        0,
        0,
        128,
        128,
      )
      const value = canvas.toDataURL('image/webp', 0.85)
      if (value.length > 65536)
        throw new Error(t('cloud.messages.iconTooLarge'))
      profile.avatarUrl = value
    } finally {
      image.close()
    }
  } catch {
    iconError.value = t('cloud.messages.thisImageCouldNotBeUsedTryAnotherImage')
  } finally {
    iconBusy.value = false
    input.value = ''
  }
}
const busy = ref(false)
const message = ref('')
const failed = ref(false)
async function reload() {
  await refresh()
  name.value = data.value?.site.name ?? ''
  Object.assign(profile, {
    title: data.value?.site.title ?? '',
    slogan: data.value?.site.slogan ?? '',
    author: data.value?.site.author ?? '',
    avatarUrl: data.value?.site.avatarUrl ?? '',
  })
  homeHeaderLayout.value =
    data.value?.site.presentation.homeHeaderLayout ?? 'embedded'
  socialDraft.value = Array.from(
    { length: MAX_SOCIAL_LINKS },
    (_, i) => data.value?.site.presentation.socialLinks.links[i] ?? '',
  )
  message.value = ''
}
async function save() {
  if (
    !data.value ||
    busy.value ||
    iconBusy.value ||
    socialErrors.value.some(Boolean)
  )
    return
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    const result = await $fetch(`/api/sites/${props.siteId}/settings`, {
      method: 'PATCH',
      body: {
        name: name.value,
        revision: data.value.site.revision,
        published: !!data.value.site.published,
        profile: { ...profile },
        presentation: {
          homeHeaderLayout: homeHeaderLayout.value,
          socialLinks: {
            links: parseSocialLinks({
              links: socialDraft.value.map((v) => v.trim()).filter(Boolean),
            }),
          },
        },
      },
    })
    data.value = { site: { ...result.site, role: data.value.site.role } }
    if (context.value?.siteId === props.siteId)
      context.value = {
        ...context.value,
        name: result.site.name,
        published: !!result.site.published,
      }
    message.value = t('cloud.messages.siteSettingsSaved')
  } catch (cause) {
    failed.value = true
    message.value =
      (cause as { statusCode?: number }).statusCode === 409
        ? t('cloud.messages.thisSiteChangedInAnotherSessionReloadBeforeSaving')
        : t('cloud.messages.settingsCouldNotBeSavedCheckYourAccessAnd')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CfCard class="cf-site-settings">
    <div class="cf-panel-heading">
      <h2>{{ $t('cloud.messages.galleryIdentity') }}</h2>
      <p>{{ $t('cloud.messages.useTheSameTitleAuthorAndIconShownIn') }}</p>
    </div>
    <div
      v-if="loadError"
      role="alert"
      class="cf-notice"
    >
      {{ $t('cloud.messages.settingsCouldNotBeLoaded')
      }}<CfButton
        variant="ghost"
        @click="reload"
        >{{ $t('cloud.messages.reloadSettings') }}</CfButton
      >
    </div>
    <template v-else-if="data">
      <div class="cf-panel-body">
        <form
          v-if="data.site.role === 'admin'"
          class="cf-form"
          @submit.prevent="save()"
        >
          <div class="cf-field">
            <label for="settings-site-name">{{
              $t('cloud.messages.workspaceSiteName')
            }}</label
            ><CfInput
              id="settings-site-name"
              v-model="name"
              required
              maxlength="80"
              :disabled="busy"
            />
          </div>
          <p class="cf-field-hint">
            {{
              $t(
                'cloud.messages.theWorkspaceNameIdentifiesThisSiteInYourConsole',
              )
            }}
          </p>
          <div class="cf-field">
            <label for="gallery-title">{{
              $t('cloud.messages.publicTitle')
            }}</label
            ><CfInput
              id="gallery-title"
              v-model="profile.title"
              maxlength="80"
              :disabled="busy"
              :placeholder="name"
            />
          </div>
          <div class="cf-field">
            <label for="gallery-slogan">{{ $t('cloud.messages.slogan') }}</label
            ><CfInput
              id="gallery-slogan"
              v-model="profile.slogan"
              maxlength="200"
              :disabled="busy"
            />
          </div>
          <div class="cf-field">
            <label for="gallery-author">{{ $t('cloud.messages.author') }}</label
            ><CfInput
              id="gallery-author"
              v-model="profile.author"
              maxlength="80"
              :disabled="busy"
            />
          </div>
          <div class="cf-field cf-icon-field">
            <label for="gallery-icon">{{
              $t('cloud.messages.galleryIcon')
            }}</label
            ><img
              v-if="profile.avatarUrl"
              :src="profile.avatarUrl"
              :alt="$t('cloud.messages.galleryIconPreview')"
              width="64"
              height="64"
              class="cf-gallery-icon"
            /><label
              for="gallery-icon"
              class="cf-icon-picker"
              >{{ $t('cloud.ui.chooseIcon') }}</label
            ><input
              class="cf-icon-file"
              id="gallery-icon"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="busy || iconBusy"
              @change="chooseIcon"
            />
            <p class="cf-field-hint">
              {{ $t('cloud.messages.pngJpegOrWebpUpTo2MibCropped') }}
            </p>
            <CfButton
              v-if="profile.avatarUrl"
              variant="secondary"
              size="sm"
              :disabled="busy || iconBusy"
              @click="profile.avatarUrl = ''"
              >{{ $t('cloud.messages.removeIcon') }}</CfButton
            >
            <p
              v-if="iconError"
              class="cf-error-message"
              role="alert"
            >
              {{ iconError }}
            </p>
          </div>
          <section class="cf-gallery-presentation">
            <h3>{{ $t('cloud.presentation.layout') }}</h3>
            <p class="cf-field-hint">
              {{ $t('cloud.presentation.layoutHelp') }}
            </p>
            <fieldset :disabled="busy">
              <legend class="sr-only">
                {{ $t('cloud.presentation.layout') }}
              </legend>
              <label
                v-for="option in ['embedded', 'fixed'] as const"
                :key="option"
                class="cf-layout-option"
                ><input
                  v-model="homeHeaderLayout"
                  type="radio"
                  name="home-header-layout"
                  :value="option"
                /><span>{{ $t('cloud.presentation.' + option) }}</span></label
              >
            </fieldset>
          </section>
          <section class="cf-gallery-presentation">
            <h3>{{ $t('cloud.presentation.social') }}</h3>
            <p class="cf-field-hint">
              {{
                $t('cloud.presentation.socialHelp', { max: MAX_SOCIAL_LINKS })
              }}
            </p>
            <div
              v-for="(_, index) in socialDraft"
              :key="index"
              class="cf-field"
            >
              <label :for="'social-link-' + index"
                >{{ $t('cloud.presentation.slot', { number: index + 1 })
                }}<small v-if="socialDraft[index] && !socialErrors[index]">
                  · {{ socialLabel(socialDraft[index]!) }}</small
                ></label
              >
              <div class="cf-social-input-row">
                <CfInput
                  :id="'social-link-' + index"
                  v-model="socialDraft[index]"
                  type="url"
                  placeholder="https://…"
                  maxlength="2048"
                  :disabled="busy"
                  :aria-invalid="!!socialErrors[index]"
                  :aria-describedby="
                    socialErrors[index] ? 'social-error-' + index : undefined
                  "
                /><CfButton
                  type="button"
                  variant="ghost"
                  :disabled="busy || !socialDraft[index]"
                  :aria-label="
                    $t('cloud.presentation.clear', { number: index + 1 })
                  "
                  @click="socialDraft[index] = ''"
                  >×</CfButton
                >
              </div>
              <p
                v-if="socialErrors[index]"
                :id="'social-error-' + index"
                role="alert"
                class="cf-error-message"
              >
                {{ socialErrors[index] }}
              </p>
            </div>
          </section>
          <div class="cf-site-actions">
            <CfButton
              type="submit"
              :disabled="
                busy || iconBusy || !name.trim() || socialErrors.some(Boolean)
              "
              >{{
                busy
                  ? $t('cloud.messages.saving')
                  : $t('cloud.messages.saveChanges')
              }}</CfButton
            ><CfButton
              type="button"
              variant="ghost"
              :disabled="busy"
              @click="reload"
              >{{ $t('cloud.messages.reloadSettings') }}</CfButton
            >
          </div>
        </form>
        <p
          v-else
          class="cf-field-hint"
        >
          {{
            $t(
              'cloud.messages.onlyWorkspaceAdministratorsCanChangeTheseSettings',
            )
          }}
        </p>
        <p
          v-if="message"
          :role="failed ? 'alert' : 'status'"
          class="cf-notice"
        >
          {{ message }}
        </p>
      </div>
    </template>
  </CfCard>
</template>
