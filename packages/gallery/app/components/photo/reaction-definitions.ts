export const REACTION_DEFINITIONS = [
  {
    id: 'like',
    iconName: 'fluent-emoji-flat:thumbs-up',
    labelKey: 'viewer.reaction.like',
  },
  {
    id: 'love',
    iconName: 'fluent-emoji-flat:red-heart',
    labelKey: 'viewer.reaction.love',
  },
  {
    id: 'amazing',
    iconName: 'fluent-emoji-flat:smiling-face-with-heart-eyes',
    labelKey: 'viewer.reaction.amazing',
  },
  {
    id: 'funny',
    iconName: 'fluent-emoji-flat:face-with-tears-of-joy',
    labelKey: 'viewer.reaction.funny',
  },
  {
    id: 'wow',
    iconName: 'fluent-emoji-flat:face-with-open-mouth',
    labelKey: 'viewer.reaction.wow',
  },
  {
    id: 'sad',
    iconName: 'fluent-emoji-flat:crying-face',
    labelKey: 'viewer.reaction.sad',
  },
  {
    id: 'fire',
    iconName: 'fluent-emoji-flat:fire',
    labelKey: 'viewer.reaction.fire',
  },
  {
    id: 'sparkle',
    iconName: 'fluent-emoji-flat:sparkles',
    labelKey: 'viewer.reaction.sparkle',
  },
] as const

export type ReactionId = (typeof REACTION_DEFINITIONS)[number]['id']

export const REACTION_ICON_MAP: Record<ReactionId, string> = Object.fromEntries(
  REACTION_DEFINITIONS.map((reaction) => [reaction.id, reaction.iconName]),
) as Record<ReactionId, string>
