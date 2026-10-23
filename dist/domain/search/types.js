export const MESSAGE_SEARCH_FILTERS = [
    'all',
    'photo',
    'video',
    'photo_and_video',
    'document',
    'audio',
    'voice_note',
    'voice_and_video_note',
    'animation',
    'url',
    'chat_photo',
    'video_note',
];
export function isMessageSearchFilter(val) {
    return (typeof val === 'string' &&
        MESSAGE_SEARCH_FILTERS.includes(val));
}
