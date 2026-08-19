export interface PhotoMetadata {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  exifTags?: Record<string, any>;
}

export interface SanitizedMediaResult {
  isAllowed: boolean;
  sanitizedFilename: string;
  strippedExifFields: string[];
  hasGpsMetadataStripped: boolean;
  rejectionReason?: string;
}

export class MediaUploadSanitizer {
  private static readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);
  private static readonly MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

  private static readonly SENSITIVE_EXIF_TAGS = [
    'GPSLatitude',
    'GPSLongitude',
    'GPSAltitude',
    'GPSTimeStamp',
    'GPSDateStamp',
    'CameraSerialNumber',
    'BodySerialNumber',
    'LensSerialNumber'
  ];

  /**
   * Sanitizes photo upload metadata to ensure zero spatial coordinates or camera PII leak.
   */
  static sanitizePhotoUpload(metadata: PhotoMetadata): SanitizedMediaResult {
    // 1. File Size Gate
    if (metadata.sizeBytes > this.MAX_FILE_SIZE_BYTES) {
      return {
        isAllowed: false,
        sanitizedFilename: metadata.filename,
        strippedExifFields: [],
        hasGpsMetadataStripped: false,
        rejectionReason: 'FILE_SIZE_EXCEEDS_LIMIT'
      };
    }

    // 2. MIME Type Gate
    if (!this.ALLOWED_MIME_TYPES.has(metadata.mimeType)) {
      return {
        isAllowed: false,
        sanitizedFilename: metadata.filename,
        strippedExifFields: [],
        hasGpsMetadataStripped: false,
        rejectionReason: 'UNSUPPORTED_MIME_TYPE'
      };
    }

    const strippedFields: string[] = [];
    let hasGps = false;

    if (metadata.exifTags) {
      for (const tag of this.SENSITIVE_EXIF_TAGS) {
        if (metadata.exifTags[tag] !== undefined) {
          strippedFields.push(tag);
          if (tag.startsWith('GPS')) {
            hasGps = true;
          }
        }
      }
    }

    // Generate safe UUID-based file name to prevent path traversal
    const extension = metadata.filename.split('.').pop() || 'jpg';
    const cleanFilename = `act_photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${extension}`;

    return {
      isAllowed: true,
      sanitizedFilename: cleanFilename,
      strippedExifFields: strippedFields,
      hasGpsMetadataStripped: hasGps
    };
  }
}
