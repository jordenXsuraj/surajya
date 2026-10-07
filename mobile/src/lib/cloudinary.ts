// Cloudinary serves resized, recompressed images when a transformation is put right after
// "/upload/". The API stores the original URLs, so the app asks for a size that fits the screen.
//
//   https://res.cloudinary.com/demo/image/upload/v1/nexus/x.jpg
//   → https://res.cloudinary.com/demo/image/upload/w_720,q_auto,f_auto/v1/nexus/x.jpg

type Options = { width?: number };

const HOST = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;

export function cloudinaryUrl(
  url: string | null | undefined,
  { width = 720 }: Options = {},
): string {
  if (!url) return '';
  const match = url.match(HOST);
  if (!match) return url; // not a Cloudinary image: leave untouched
  const prefix = match[0];
  const rest = url.slice(prefix.length);
  const transform = `w_${Math.round(width)},q_auto,f_auto`;
  // Already sized by us (or the same transformation is there): don't stack another one
  if (rest.startsWith(transform + '/')) return url;
  return `${prefix}${transform}/${rest}`;
}
