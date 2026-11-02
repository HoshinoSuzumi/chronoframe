import { h, resolveComponent, computed } from 'vue'
import type { Ref } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Photo } from '@chronoframe/contracts/resources'
import { Icon, UBadge } from '#components'
import ThumbImage from '#gallery/components/ui/ThumbImage.vue'

export function usePhotoTableColumns(options: {
  preview: (photo: Photo) => void
  reactions: Ref<Record<string, Record<string, number>>>
}) {
  const { t: $t } = useI18n()
  const dayjs = useDayjs()
  const locationLabel = useLocationLabel()
  const Rating = resolveComponent('Rating')
  const openImagePreview = options.preview
  const reactionsData = options.reactions
  return computed<TableColumn<Photo>[]>(() => [
    {
      id: 'thumbnailUrl',
      accessorKey: 'thumbnailUrl',
      header: $t('dashboard.photos.table.columns.thumbnail.title'),
      cell: ({ row }) => {
        const url = row.original.thumbnailUrl
        return h(ThumbImage, {
          src: url || row.original.originalUrl || '',
          alt: row.original.title || $t('dashboard.photos.table.thumbnailAlt'),
          key: row.original.id,
          thumbhash: row.original.thumbnailHash || '',
          class: 'size-16 min-w-[100px] object-cover rounded-md shadow',
          onClick: () => openImagePreview(row.original),
          style: { cursor: url ? 'pointer' : 'default' },
        })
      },
      enableHiding: false,
    },
    {
      id: 'id',
      accessorKey: 'id',
      header: $t('dashboard.photos.table.columns.id'),
      enableHiding: false,
    },
    {
      accessorKey: 'title',
      header: $t('dashboard.photos.table.columns.title'),
    },
    {
      accessorKey: 'tags',
      header: $t('dashboard.photos.table.columns.tags'),
      cell: ({ row }) => {
        const tags = row.original.tags
        return h('div', { class: 'flex items-center gap-1' }, [
          tags && tags.length
            ? tags.map((tag) =>
                h(
                  UBadge,
                  {
                    size: 'sm',
                    variant: 'soft',
                    color: 'neutral',
                  },
                  () => tag,
                ),
              )
            : h(
                'span',
                { class: 'text-neutral-400 text-xs' },
                $t('dashboard.photos.table.cells.noTags'),
              ),
        ])
      },
    },
    {
      accessorKey: 'rating',
      header: $t('dashboard.photos.table.columns.rating'),
      cell: ({ row }) => {
        const rating = row.original.exif?.Rating
        return h('div', { class: 'flex items-center' }, [
          rating !== undefined && rating !== null
            ? h(Rating, {
                modelValue: rating,
                readonly: true,
                size: 'xs',
              })
            : h(
                'span',
                { class: 'text-neutral-400 text-xs' },
                $t('dashboard.photos.table.cells.noRating'),
              ),
        ])
      },
    },
    {
      accessorKey: 'isLivePhoto',
      header: $t('dashboard.photos.table.columns.isLivePhoto'),
      cell: ({ row }) => {
        const isLivePhoto = row.original.isLivePhoto
        return h('div', { class: 'flex items-center gap-2' }, [
          isLivePhoto
            ? h('div', { class: 'flex items-center gap-1' }, [
                h(Icon, {
                  name: 'tabler:live-photo',
                  class: 'size-4 text-yellow-600 dark:text-yellow-400',
                }),
                h(
                  'span',
                  {
                    class:
                      'text-yellow-600 dark:text-yellow-400 text-xs font-medium',
                  },
                  $t('ui.livePhoto'),
                ),
              ])
            : h(
                'span',
                {
                  class: 'text-neutral-400 text-xs',
                },
                $t('dashboard.photos.table.cells.staticPhoto'),
              ),
        ])
      },
      sortingFn: (rowA, rowB) => {
        const valueA = rowA.original.isLivePhoto ? 1 : 0
        const valueB = rowB.original.isLivePhoto ? 1 : 0
        return valueB - valueA // LivePhoto 优先排序
      },
    },
    {
      accessorKey: 'location',
      header: $t('dashboard.photos.table.columns.location'),
      cell: ({ row }) => {
        const { exif, country } = row.original

        if (!exif?.GPSLongitude && !exif?.GPSLatitude) {
          return h(
            'span',
            { class: 'text-neutral-400 text-xs' },
            $t('dashboard.photos.table.cells.noGps'),
          )
        }

        const location = [
          ...new Set([locationLabel(row.original), country].filter(Boolean)),
        ].join(', ')
        return h(
          'span',
          {
            class: location ? 'text-xs' : 'text-neutral-400 text-xs',
          },
          location || $t('dashboard.photos.table.cells.unknown'),
        )
      },
    },
    {
      accessorKey: 'dateTaken',
      header: $t('dashboard.photos.table.columns.dateTaken'),
      cell: (info) => {
        const date = info.getValue() as string
        return h(
          'span',
          { class: 'font-mono text-xs' },
          date
            ? dayjs(date).format('YYYY-MM-DD HH:mm:ss')
            : $t('dashboard.photos.table.cells.unknown'),
        )
      },
    },
    {
      accessorKey: 'lastModified',
      header: $t('dashboard.photos.table.columns.lastModified'),
      cell: (info) => {
        const date = info.getValue() as string
        return h(
          'span',
          { class: 'font-mono text-xs' },
          date
            ? dayjs(date).format('YYYY-MM-DD HH:mm:ss')
            : $t('dashboard.photos.table.cells.unknown'),
        )
      },
    },
    {
      accessorKey: 'fileSize',
      header: $t('dashboard.photos.table.columns.fileSize'),
      cell: (info) => formatBytes(info.getValue() as number),
    },
    {
      id: 'colorSpace',
      accessorFn: (row) => row.exif?.ColorSpace,
      header: $t('dashboard.photos.table.columns.colorSpace'),
    },
    {
      accessorKey: 'reactions',
      header: $t('dashboard.photos.table.columns.reactions'),
      cell: ({ row }) => {
        const photoId = row.original.id
        const reactions = reactionsData.value[photoId] || {}
        const totalReactions = Object.values(reactions).reduce(
          (sum: number, count) => sum + (count as number),
          0,
        )

        if (totalReactions === 0) {
          return h(
            'span',
            { class: 'text-neutral-400 text-xs' },
            $t('dashboard.photos.table.cells.noReactions'),
          )
        }

        const reactionIcons: Record<string, string> = {
          like: 'fluent-emoji-flat:thumbs-up',
          love: 'fluent-emoji-flat:red-heart',
          amazing: 'fluent-emoji-flat:smiling-face-with-heart-eyes',
          funny: 'fluent-emoji-flat:face-with-tears-of-joy',
          wow: 'fluent-emoji-flat:face-with-open-mouth',
          sad: 'fluent-emoji-flat:crying-face',
          fire: 'fluent-emoji-flat:fire',
          sparkle: 'fluent-emoji-flat:sparkles',
        }

        // 显示前3个有数据的表态
        const topReactions = Object.entries(reactions)
          .filter(([, count]) => (count as number) > 0)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 3)
        const hiddenReactions =
          totalReactions -
          topReactions.reduce((sum, [, count]) => sum + count, 0)

        return h(
          'div',
          { class: 'flex items-center gap-2' },
          [
            ...topReactions.map(([type, count]) =>
              h('div', { class: 'flex items-center gap-0.5' }, [
                h(Icon, {
                  name:
                    reactionIcons[type] ||
                    'fluent-emoji-flat:face-with-tears-of-joy',
                  class: 'size-4',
                  mode: 'svg',
                }),
                h(
                  'span',
                  {
                    class:
                      'text-xs font-medium text-neutral-700 dark:text-neutral-300',
                  },
                  count,
                ),
              ]),
            ),
            hiddenReactions > 0
              ? h(
                  'span',
                  { class: 'text-xs text-neutral-400' },
                  `+${hiddenReactions}`,
                )
              : null,
          ].filter(Boolean),
        )
      },
    },
    {
      id: 'actions',
      accessorKey: 'actions',
      header: $t('dashboard.photos.table.columns.actions'),
      enableHiding: false,
    },
  ])
}
