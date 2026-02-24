export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
  AUDIO = 'audio',
}

export enum MediaPurpose {
  COMMUNITY_LOGO = 'community_logo',
  COMMUNITY_COVER = 'community_cover',
  COURSE_VIDEO = 'course_video',
  CHALLENGE_VIDEO = 'challenge_video',
  DM_ATTACHMENT = 'dm_attachment',
  MANUAL_PAYMENT_PROOF = 'manual_payment_proof',
  WALLET_TOPUP_PROOF = 'wallet_topup_proof',
  PRODUCT_FILE = 'product_file',
  GENERIC = 'generic',
}

export enum MediaVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum MediaAssetStatus {
  UPLOADED = 'uploaded',
  ATTACHED = 'attached',
  ORPHANED = 'orphaned',
  DELETED = 'deleted',
  MISSING = 'missing',
  QUARANTINED = 'quarantined',
}

export type MediaStorageDriver = 'disk' | 's3';

export const PURPOSE_DEFAULT_VISIBILITY: Record<MediaPurpose, MediaVisibility> = {
  [MediaPurpose.COMMUNITY_LOGO]: MediaVisibility.PUBLIC,
  [MediaPurpose.COMMUNITY_COVER]: MediaVisibility.PUBLIC,
  [MediaPurpose.COURSE_VIDEO]: MediaVisibility.PUBLIC,
  [MediaPurpose.CHALLENGE_VIDEO]: MediaVisibility.PUBLIC,
  [MediaPurpose.DM_ATTACHMENT]: MediaVisibility.PRIVATE,
  [MediaPurpose.MANUAL_PAYMENT_PROOF]: MediaVisibility.PRIVATE,
  [MediaPurpose.WALLET_TOPUP_PROOF]: MediaVisibility.PRIVATE,
  [MediaPurpose.PRODUCT_FILE]: MediaVisibility.PUBLIC,
  [MediaPurpose.GENERIC]: MediaVisibility.PUBLIC,
};

export const TYPE_MAX_BYTES: Record<MediaType, number> = {
  [MediaType.IMAGE]: Number(process.env.UPLOAD_MAX_IMAGE_MB || 5) * 1024 * 1024,
  [MediaType.VIDEO]: Number(process.env.UPLOAD_MAX_VIDEO_MB || 500) * 1024 * 1024,
  [MediaType.DOCUMENT]: Number(process.env.UPLOAD_MAX_DOCUMENT_MB || 100) * 1024 * 1024,
  [MediaType.AUDIO]: Number(process.env.UPLOAD_MAX_AUDIO_MB || 20) * 1024 * 1024,
};

export const TYPE_EXTENSIONS: Record<MediaType, string[]> = {
  [MediaType.IMAGE]: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  [MediaType.VIDEO]: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'],
  [MediaType.DOCUMENT]: [
    '.pdf',
    '.doc',
    '.docx',
    '.txt',
    '.rtf',
    '.odt',
    '.zip',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.md',
    '.json',
    '.xml',
    '.csv',
  ],
  [MediaType.AUDIO]: ['.mp3', '.wav', '.ogg', '.aac', '.flac'],
};

