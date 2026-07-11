import { put, del } from '@vercel/blob';

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 3 * 1024 * 1024; // 3 Mo — le frontend redimensionne bien en-dessous avant l'envoi

// dataUrl attendu au format "data:image/jpeg;base64,...."
// folder : "avatars" | "shop-items" — sert juste à ranger les fichiers dans le store Blob.
export async function uploadImage({ folder, id, dataUrl, previousUrl }) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!match) {
    throw new Error("Format d'image invalide (jpeg, png ou webp uniquement).");
  }
  const mime = match[1];
  const ext = ALLOWED[mime];
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.length === 0) throw new Error('Image vide.');
  if (buffer.length > MAX_BYTES) throw new Error('Image trop lourde (3 Mo max).');

  const blob = await put(`${folder}/${id}-${Date.now()}.${ext}`, buffer, {
    access: 'public',
    contentType: mime,
    addRandomSuffix: true,
  });

  // On nettoie l'ancien fichier — pas grave si ça échoue (déjà supprimé, etc.)
  if (previousUrl && previousUrl.includes('.blob.vercel-storage.com')) {
    try { await del(previousUrl); } catch { /* silencieux */ }
  }

  return blob.url;
}

export async function deleteImage(url) {
  if (url && url.includes('.blob.vercel-storage.com')) {
    try { await del(url); } catch { /* silencieux */ }
  }
}
