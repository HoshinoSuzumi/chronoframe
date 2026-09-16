<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import type { NeededExif } from '../../../shared/types/photo'
import type { KVData } from './KVRenderer.vue'
import { formatCameraInfo, formatLensInfo } from '~/utils/camera'

interface Props {
  currentPhoto: Photo
  exifData?: NeededExif | null
  onClose?: () => void
}

interface Album {
  id: number
  title: string
  description: string | null
  coverPhotoId: string | null
  createdAt: Date
  updatedAt: Date
}

const dayjs = useDayjs()
const router = useRouter()
const { localizeExif } = useExifLocalization()

const props = defineProps<Props>()

// 获取照片所属的相册
const { data: _albums } = useFetch<Album[]>(
  () => `/api/photos/${props.currentPhoto.id}/albums`,
  {
    watch: [() => props.currentPhoto.id],
  },
)

const albums = computed(() => _albums.value || [])

// 格式化曝光时间
const formatExposureTime = (
  exposureTime: string | number | undefined,
): string => {
  if (!exposureTime) return ''

  let seconds: number

  if (typeof exposureTime === 'string') {
    if (exposureTime.includes('/')) {
      const parts = exposureTime.split('/')
      if (parts.length === 2 && parts[0] && parts[1]) {
        const numerator = parseFloat(parts[0])
        const denominator = parseFloat(parts[1])
        if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
          seconds = numerator / denominator
        } else {
          return exposureTime
        }
      } else {
        return exposureTime
      }
    } else {
      seconds = parseFloat(exposureTime)
      if (isNaN(seconds)) {
        return exposureTime
      }
    }
  } else {
    seconds = exposureTime
  }

  if (seconds >= 1) {
    return `${seconds}s`
  } else {
    const denominator = Math.round(1 / seconds)
    return `1/${denominator}`
  }
}

// 格式化GPS坐标为两行显示
const formatGPSCoordinatesMultiLine = (
  latitude: number,
  longitude: number,
): string => {
  const latDirection = latitude >= 0 ? 'N' : 'S'
  const lngDirection = longitude >= 0 ? 'E' : 'W'

  const latDegrees = Math.abs(latitude)
  const lngDegrees = Math.abs(longitude)

  const latDeg = Math.floor(latDegrees)
  const latMin = Math.floor((latDegrees - latDeg) * 60)
  const latSec = ((latDegrees - latDeg) * 60 - latMin) * 60

  const lngDeg = Math.floor(lngDegrees)
  const lngMin = Math.floor((lngDegrees - lngDeg) * 60)
  const lngSec = ((lngDegrees - lngDeg) * 60 - lngMin) * 60

  return `${latDeg}°${latMin}'${latSec.toFixed(2)}"${latDirection}\n${lngDeg}°${lngMin}'${lngSec.toFixed(2)}"${lngDirection}`
}

const gpsCoordinates = computed(() => {
  // 优先使用数据库中存储的坐标
  if (props.currentPhoto.latitude && props.currentPhoto.longitude) {
    return {
      latitude: props.currentPhoto.latitude,
      longitude: props.currentPhoto.longitude,
    }
  }

  // 如果数据库中没有，尝试从EXIF数据中获取
  if (!props.exifData) return null
  const { GPSLatitude, GPSLongitude } = props.exifData
  if (GPSLatitude && GPSLongitude) {
    return {
      latitude: parseFloat(`${GPSLatitude}`),
      longitude: parseFloat(`${GPSLongitude}`),
    }
  }
  return null
})

const formatedExifData = computed<Record<string, KVData[]>>(() => {
  const sections: Record<string, KVData[]> = {}

  // 基本信息
  sections.basicInfo = [
    {
      title: $t('exif.sections.basic'),
      items: [
        props.currentPhoto.storageKey
          ? {
              label: $t('exif.filename'),
              value:
                props.currentPhoto.storageKey.split('/').pop() ||
                props.currentPhoto.storageKey,
              icon: 'tabler:file',
            }
          : null,
        props.currentPhoto.fileSize
          ? {
              label: $t('exif.fileSize'),
              value: formatBytes(props.currentPhoto.fileSize),
              icon: 'tabler:database',
            }
          : null,
        props.currentPhoto.width && props.currentPhoto.height
          ? {
              label: $t('exif.resolution'),
              value: `${props.currentPhoto.width} × ${props.currentPhoto.height}`,
              icon: 'tabler:dimensions',
            }
          : null,
        props.currentPhoto.width && props.currentPhoto.height
          ? {
              label: $t('exif.pixels'),
              value: `${((props.currentPhoto.width * props.currentPhoto.height) / 1000000).toFixed(2)} MP`,
              icon: 'tabler:grid-dots',
            }
          : null,
        props.exifData?.DateTimeOriginal
          ? {
              label: $t('exif.dateTaken.title'),
              value: dayjs(props.exifData.DateTimeOriginal).format('L LT'),
              icon: 'tabler:calendar',
            }
          : null,
        props.exifData?.ColorSpace
          ? {
              label: $t('exif.colorSpace.title'),
              value: localizeExif('colorSpace', props.exifData.ColorSpace),
              icon: 'tabler:palette',
            }
          : null,
        props.exifData?.Artist
          ? {
              label: $t('exif.artist'),
              value: props.exifData.Artist,
              icon: 'tabler:user',
            }
          : null,
        props.exifData?.Copyright
          ? {
              label: $t('exif.copyright'),
              value: props.exifData.Copyright,
              icon: 'tabler:copyright',
            }
          : null,
        props.exifData?.Software
          ? {
              label: $t('exif.software'),
              value: props.exifData.Software,
              icon: 'tabler:app-window',
            }
          : null,
        props.exifData?.tz
          ? {
              label: $t('exif.tz'),
              value: props.exifData.tz,
              icon: 'tabler:world',
            }
          : null,
        props.currentPhoto.country
          ? {
              label: $t('exif.country'),
              value: props.currentPhoto.country,
              icon: 'tabler:map-pin',
            }
          : null,
        props.currentPhoto.city
          ? {
              label: $t('exif.city'),
              value: props.currentPhoto.city,
              icon: 'tabler:building',
            }
          : null,
        props.currentPhoto.latitude && props.currentPhoto.longitude
          ? {
              label: $t('exif.gps.title'),
              value: formatGPSCoordinatesMultiLine(
                props.currentPhoto.latitude,
                props.currentPhoto.longitude,
              ),
              icon: 'tabler:gps',
            }
          : null,
      ],
    },
  ]

  // 拍摄参数
  sections.captureParams = [
    {
      title: $t('exif.sections.shooting.parameters'),
      items: [
        props.exifData?.FocalLengthIn35mmFormat
          ? {
              label: $t('exif.focal.length.actual'),
              value: `${props.exifData.FocalLengthIn35mmFormat}`,
              icon: 'tabler:telescope',
            }
          : null,
        props.exifData?.FNumber
          ? {
              label: $t('exif.aperture'),
              value: `f/${props.exifData.FNumber}`,
              icon: 'tabler:aperture',
            }
          : null,
        props.exifData?.ExposureTime
          ? {
              label: $t('exif.exposure.time'),
              value: formatExposureTime(props.exifData.ExposureTime),
              icon: 'tabler:clock',
            }
          : null,
        props.exifData?.ISO
          ? {
              label: $t('exif.iso'),
              value: props.exifData.ISO.toString(),
              icon: 'tabler:sun-electricity',
            }
          : null,
      ],
    },
  ]

  // 设备信息
  sections.deviceInfo = [
    {
      title: $t('exif.sections.deviceInfomation'),
      items: [
        props.exifData?.Make && props.exifData?.Model
          ? {
              label: $t('exif.camera'),
              value: formatCameraInfo(
                props.exifData.Make,
                props.exifData.Model,
              ),
              icon: 'tabler:camera',
            }
          : null,
        props.exifData?.LensModel
          ? {
              label: $t('exif.lens'),
              value: formatLensInfo(
                props.exifData.LensMake,
                props.exifData.LensModel,
              ),
              icon: 'tabler:focus',
            }
          : null,
        props.exifData?.MaxApertureValue
          ? {
              label: $t('exif.maxAperture'),
              value: `f/${props.exifData.MaxApertureValue}`,
              icon: 'tabler:aperture',
            }
          : null,
        props.exifData?.FocalLength
          ? {
              label: $t('exif.focal.length.actual'),
              value: props.exifData.FocalLength,
              icon: 'tabler:telescope',
            }
          : null,
        props.exifData?.FocalLengthIn35mmFormat
          ? {
              label: $t('exif.focal.length.equivalent'),
              value: props.exifData.FocalLengthIn35mmFormat,
              icon: 'tabler:zoom-in-area',
            }
          : null,
      ],
    },
  ]

  // 拍摄模式
  sections.captureMode = [
    {
      title: $t('exif.sections.shooting.mode'),
      items: [
        props.exifData?.WhiteBalance
          ? {
              label: $t('exif.wb.title'),
              value: localizeExif('whiteBalance', props.exifData.WhiteBalance),
              icon: 'mdi:white-balance-auto',
            }
          : null,
        props.exifData?.WBShiftAB
          ? {
              label: $t('exif.wb.shiftAB'),
              value: `${props.exifData.WBShiftAB}`,
              icon: 'mdi:white-balance-auto',
            }
          : null,
        props.exifData?.WBShiftGM
          ? {
              label: $t('exif.wb.shiftGM'),
              value: `${props.exifData.WBShiftGM}`,
              icon: 'mdi:white-balance-auto',
            }
          : null,
        props.exifData?.WhiteBalanceBias
          ? {
              label: $t('exif.wb.bias'),
              value: `${props.exifData.WhiteBalanceBias}`,
              icon: 'mdi:white-balance-auto',
            }
          : null,
        props.exifData?.WhiteBalanceFineTune
          ? {
              label: $t('exif.wb.fineTune'),
              value: `${props.exifData.WhiteBalanceFineTune}`,
              icon: 'mdi:white-balance-auto',
            }
          : null,
        props.exifData?.ExposureProgram
          ? {
              label: $t('exif.exposure.program'),
              value: localizeExif(
                'exposureProgram',
                props.exifData.ExposureProgram,
              ),
              icon: 'tabler:exposure',
            }
          : null,
        props.exifData?.ExposureMode
          ? {
              label: $t('exif.exposure.mode'),
              value: localizeExif('exposureMode', props.exifData.ExposureMode),
              icon: 'tabler:exposure-filled',
            }
          : null,
        props.exifData?.MeteringMode
          ? {
              label: $t('exif.metering.title'),
              value: localizeExif('meteringMode', props.exifData.MeteringMode),
              icon: 'tabler:focus-auto',
            }
          : null,
        props.exifData?.Flash
          ? {
              label: $t('exif.flash.title'),
              value: localizeExif('flash', props.exifData.Flash),
              icon: 'material-symbols:flash-on-rounded',
            }
          : null,
        props.exifData?.FlashMeteringMode
          ? {
              label: $t('exif.flash.meteringMode'),
              value: localizeExif(
                'meteringMode',
                props.exifData.FlashMeteringMode,
              ),
              icon: 'material-symbols:flash-on-rounded',
            }
          : null,
        props.exifData?.SceneCaptureType
          ? {
              label: $t('exif.scene.captureType'),
              value: localizeExif(
                'sceneCaptureType',
                props.exifData.SceneCaptureType,
              ),
              icon: 'material-symbols:scene',
            }
          : null,
      ],
    },
  ]

  // 技术参数
  sections.technicalParams = [
    {
      title: $t('exif.sections.specification'),
      items: [
        props.exifData?.BrightnessValue
          ? {
              label: $t('exif.brightness.value'),
              value: `${props.exifData.BrightnessValue.toFixed(1)} EV`,
              icon: 'tabler:sun',
            }
          : null,
        props.exifData?.SensingMethod
          ? {
              label: $t('exif.sensing.method'),
              value: localizeExif(
                'sensingMethod',
                props.exifData.SensingMethod,
              ),
              icon: 'tabler:photo-sensor',
            }
          : null,
        props.exifData?.FocalPlaneXResolution &&
        props.exifData?.FocalPlaneYResolution
          ? {
              label: $t('exif.focal.plane.resolution'),
              value: `${props.exifData.FocalPlaneXResolution.toFixed(2)} x ${props.exifData.FocalPlaneYResolution.toFixed(2)}`,
              icon: 'tabler:photo-sensor',
            }
          : null,
      ],
    },
  ]

  return sections
})

const isMobile = useMediaQuery('(max-width: 768px)')

const onMinimapClick = (photoId: string) => {
  window.open(`/globe?photoId=${photoId}`)
}

const onTagClick = (tag: string) => {
  router.push({
    path: '/',
    query: { tag },
  })
}

const onAlbumClick = (albumId: number) => {
  window.open(`/albums/${albumId}`)
}
</script>

<template>
  <motion.div
    :initial="{
      opacity: 0,
      x: isMobile ? 0 : 80,
      y: isMobile ? 20 : 0,
    }"
    :animate="{
      opacity: 1,
      x: 0,
      y: 0,
    }"
    :exit="{
      opacity: 0,
      x: isMobile ? 0 : 80,
      y: isMobile ? 20 : 0,
    }"
    :transition="{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }"
    class="bg-black/20 dark:bg-black/30 backdrop-blur-xl border-white/10"
    :class="{
      'fixed inset-x-2 bottom-2 max-h-[70vh] border rounded-xl z-50 flex flex-col':
        isMobile,
      'w-80 border-l': !isMobile,
    }"
  >
    <div
      class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0"
    >
      <h3 class="font-black text-white text-ellipsis line-clamp-1">
        {{ currentPhoto.title }}
      </h3>
      <UButton
        v-if="isMobile && onClose"
        icon="tabler:x"
        variant="ghost"
        color="neutral"
        class="text-white"
        size="sm"
        @click="onClose"
      />
    </div>

    <!-- 内容区域 -->
    <div
      class="p-4 space-y-4 flex-1 min-h-0"
      :class="{
        'overflow-y-auto': isMobile,
        'overflow-y-auto max-h-full pb-16': !isMobile,
      }"
    >
      <!-- 照片描述 -->
      <div
        v-if="currentPhoto.description"
        class="text-sm text-white text-justify"
      >
        {{ currentPhoto.description }}
      </div>

      <PhotoMiniMap
        v-if="gpsCoordinates"
        :photo="currentPhoto"
        :latitude="gpsCoordinates?.latitude"
        :longitude="gpsCoordinates?.longitude"
        class="cursor-pointer"
        @click="onMinimapClick(currentPhoto.id)"
      />

      <PhotoKVRenderer
        v-if="formatedExifData.basicInfo"
        :data="formatedExifData.basicInfo"
      />

      <div
        v-if="currentPhoto.exif?.Rating"
        class="flex items-center gap-2 justify-between"
      >
        <h4 class="text-sm font-medium text-white uppercase tracking-wide">
          {{ $t('exif.sections.rating') }}
        </h4>

        <Rating
          :model-value="currentPhoto.exif.Rating"
          readonly
          size="sm"
        />
      </div>

      <!-- 相册 -->
      <div
        v-if="albums && albums.length > 0"
        class="mt-4"
      >
        <h4
          class="text-sm font-medium text-white/90 uppercase tracking-wide mb-2"
        >
          {{ $t('exif.sections.albums') }}
        </h4>
        <div class="space-y-2">
          <div
            v-for="album in albums"
            :key="album.id"
            class="p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
            @click="onAlbumClick(album.id)"
          >
            <p class="text-sm text-white font-medium line-clamp-1">
              {{ album.title }}
            </p>
            <p
              v-if="album.description"
              class="text-xs text-white/60 line-clamp-1"
            >
              {{ album.description }}
            </p>
          </div>
        </div>
      </div>

      <!-- 标签 -->
      <div
        v-if="currentPhoto.tags && currentPhoto.tags.length > 0"
        class="mt-4"
      >
        <h4
          class="text-sm font-medium text-white/90 uppercase tracking-wide mb-2"
        >
          {{ $t('exif.sections.tags') }}
        </h4>
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="tag in currentPhoto.tags"
            :key="tag"
            :label="tag"
            variant="soft"
            size="sm"
            color="neutral"
            class="bg-white/10 text-white cursor-pointer select-none hover:bg-white/20 transition-colors"
            @click="onTagClick(tag)"
          />
        </div>
      </div>
      <PhotoKVRenderer
        v-if="formatedExifData.captureParams"
        :data="formatedExifData.captureParams"
      />

      <div class="space-y-2">
        <h4 class="text-sm font-medium text-white uppercase tracking-wide">
          {{ $t('exif.sections.histogram') }}
        </h4>

        <Histogram
          v-if="currentPhoto.thumbnailUrl"
          :thumbnail-url="currentPhoto.thumbnailUrl"
        />
      </div>

      <PhotoKVRenderer
        v-if="formatedExifData.deviceInfo"
        :data="formatedExifData.deviceInfo"
      />

      <PhotoKVRenderer
        v-if="formatedExifData.captureMode"
        :data="formatedExifData.captureMode"
      />

      <PhotoKVRenderer
        v-if="formatedExifData.technicalParams"
        :data="formatedExifData.technicalParams"
      />
    </div>
  </motion.div>
</template>

<style scoped>
/* 自定义滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>
