import { config } from '../config/env.js';

export function isStorageConfigured() {
  return Boolean(
    config.storage.projectUrl &&
    config.storage.serviceKey &&
    config.storage.bucket
  );
}

export function validateImageFile(file) {
  if (!file) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Use uma extensão JPEG, PNG ou WebP.');
  }
  if (file.size > config.storage.maxFileSize) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }
}

export async function uploadToSupabase(fileName, buffer, contentType) {
  if (!isStorageConfigured()) {
    throw new Error('Configure Supabase Storage no backend antes de enviar arquivos.');
  }

  const bucket = encodeURIComponent(config.storage.bucket);
  const safeName = fileName.split('/').map(encodeURIComponent).join('/');
  const url = `${config.storage.projectUrl}/storage/v1/object/${bucket}/${safeName}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.storage.serviceKey}`,
      apikey: config.storage.serviceKey,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error('O armazenamento remoto não concluiu a operação.');
  }

  return fileName;
}

export async function getSignedUrl(fileName) {
  if (!fileName) return null;
  if (!isStorageConfigured()) return fileName; // Return stored path if storage not configured

  const bucket = encodeURIComponent(config.storage.bucket);
  const safeName = fileName.split('/').map(encodeURIComponent).join('/');

  if (config.storage.isPublic) {
    return `${config.storage.projectUrl}/storage/v1/object/public/${bucket}/${safeName}`;
  }

  const url = `${config.storage.projectUrl}/storage/v1/object/sign/${bucket}/${safeName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.storage.serviceKey}`,
      apikey: config.storage.serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: config.storage.signedUrlTtl }),
  });

  if (!res.ok) {
    return fileName;
  }

  const data = await res.json();
  const signedURL = data?.signedURL;
  if (signedURL && signedURL.startsWith('/')) {
    return `${config.storage.projectUrl}/storage/v1${signedURL}`;
  }
  return signedURL || fileName;
}

export async function deleteFromSupabase(fileName) {
  if (!fileName || !isStorageConfigured()) return;

  const bucket = encodeURIComponent(config.storage.bucket);
  const safeName = fileName.split('/').map(encodeURIComponent).join('/');
  const url = `${config.storage.projectUrl}/storage/v1/object/${bucket}/${safeName}`;

  try {
    await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.storage.serviceKey}`,
        apikey: config.storage.serviceKey,
      },
    });
  } catch (err) {
    console.error('Could not delete file from Supabase Storage:', err);
  }
}

