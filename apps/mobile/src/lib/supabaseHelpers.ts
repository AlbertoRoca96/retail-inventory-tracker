import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { supabase } from './supabase';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  blob?: Blob | null;
  assetId?: string | null;
};

export async function getSignedStorageUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60 * 60 * 24 * 7
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds, { download: false });
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[storage] signed url failed', bucket, path, error);
    }
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** Upload a single avatar image and return a public URL */
export async function uploadAvatarAndGetPublicUrl(
  uid: string,
  file: PhotoLike,
  bucket = 'avatars'
): Promise<{ path: string; publicUrl: string | null } | null> {
  if (!file?.uri) return null;
  if (!uid) throw new Error('uploadAvatar requires a user id');

  const ext = (file.fileName?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}/avatar.${ext}`;
  return uploadFileToStorage({
    bucket: bucket || 'avatars',
    path,
    photo: file,
  });
}

function guessFileExtension(nameOrPath?: string | null) {
  if (!nameOrPath) return '';
  const match = /\.([a-zA-Z0-9]+)$/.exec(nameOrPath);
  return match ? match[1] : '';
}

function guessMimeType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return null;
}

async function ensureLocalFileUri(photo: PhotoLike) {
  if (!photo?.uri) {
    throw new Error('uploadFileToStorage requires a uri');
  }

  let candidate = photo.uri;

  if ((candidate.startsWith('ph://') || candidate.startsWith('assets-library://')) && photo.assetId) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(photo.assetId, { shouldDownloadFromNetwork: true });
      if (info?.localUri) {
        candidate = info.localUri;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[storage upload] asset info lookup failed', error);
      }
    }
  }

  if (!candidate.startsWith('file://')) {
    const cacheBase = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (cacheBase) {
      const ext = guessFileExtension(photo.fileName || candidate);
      const target = `${cacheBase}upload-${Date.now()}-${Math.random().toString(36).slice(2)}${ext ? `.${ext}` : ''}`;
      try {
        await FileSystem.copyAsync({ from: candidate, to: target });
        candidate = target;
      } catch (error) {
        if (__DEV__) {
          console.warn('[storage upload] copy fallback failed', error);
        }
      }
    }
  }

  return candidate;
}

async function blobFromPhoto(photo: PhotoLike) {
  // If caller already provided a Blob, trust it but guard against empty data
  if (photo.blob) {
    if (photo.blob.size === 0) {
      throw new Error('Selected file appears to be empty');
    }
    return photo.blob;
  }

  const localUri = await ensureLocalFileUri(photo);

  // Expo / RN fetch(localUri) can be flaky and sometimes yield an empty blob.
  // We try it first for efficiency, but we *never* accept a zero-byte result.
  try {
    const response = await fetch(localUri);
    const fetched = await response.blob();
    if (fetched && fetched.size > 0) {
      return fetched;
    }
    if (__DEV__) {
      console.warn('[storage upload] fetched empty blob from', localUri);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[storage upload] fetch blob failed', error);
    }
  }

  // Fallback: read file as base64 via FileSystem and construct a Blob manually.
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) {
    throw new Error('Unable to read image data from local file');
  }
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], {
    type: photo.mimeType || 'application/octet-stream',
  });
  if (blob.size === 0) {
    throw new Error('Image data is empty after file read');
  }
  return blob;
}

export async function uploadFileToStorage({
  bucket,
  path,
  photo,
}: {
  bucket: string;
  path: string;
  photo: PhotoLike;
}): Promise<{ path: string; publicUrl: string | null }> {
  if (!photo?.uri && !photo?.blob) {
    throw new Error('uploadFileToStorage requires a uri or blob');
  }
  const blob = await blobFromPhoto(photo);
  if (!blob || blob.size === 0) {
    throw new Error('Image file is empty; please try selecting a different photo.');
  }
  const guessedType = photo.mimeType || blob.type || guessMimeType(path) || 'application/octet-stream';
  if (__DEV__) {
    console.log('[storage upload]', bucket, path, guessedType, blob.size);
  }
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: guessedType,
  });
  if (error) {
    if (__DEV__) {
      console.warn('[storage upload] failed', bucket, path, error);
    }
    throw error;
  }
  const publicUrl = await getSignedStorageUrl(bucket, path);
  return { path, publicUrl };
}
