export const EDITOR_BUCKET = "editor-media";
export const MAX_EDITOR_FILE = 50 * 1024 * 1024;
export const MAX_PROJECT_MEDIA = 500 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types: Record<string, string> = { "video/mp4":"mp4", "video/webm":"webm", "video/quicktime":"mov", "audio/mpeg":"mp3", "audio/wav":"wav", "audio/x-wav":"wav", "image/png":"png", "image/jpeg":"jpg", "image/webp":"webp" };
export const EDITOR_MIMES = Object.keys(types);
export function editorMediaPath(userId: string, projectId: unknown, assetId: unknown, version: unknown, mime: unknown): string {
  if(typeof projectId!=="string"||!uuid.test(projectId))throw new Error("Save a valid project before syncing originals.");
  if(typeof assetId!=="string"||!/^[a-zA-Z0-9_-]{1,120}$/.test(assetId))throw new Error("Invalid media identifier.");
  if(typeof version!=="string"||!/^[a-f0-9]{32}$/.test(version))throw new Error("Invalid media version.");
  if(typeof mime!=="string"||!types[mime])throw new Error("Unsupported media type.");
  return `${userId}/${projectId}/${assetId}_${version}.${types[mime]}`;
}
export function ownedEditorMediaPath(path: unknown, userId: string, projectId: string): path is string {
  return typeof path==="string"&&uuid.test(projectId)&&path.startsWith(`${userId}/${projectId}/`)&&/^[a-zA-Z0-9_-]{1,120}_[a-f0-9]{32}\.(mp4|webm|mov|mp3|wav|png|jpg|webp)$/.test(path.slice(`${userId}/${projectId}/`.length));
}
export function validateEditorFile(size: unknown, mime: unknown) {
  if(typeof size!=="number"||!Number.isInteger(size)||size<=0||size>MAX_EDITOR_FILE)throw new Error("Cloud originals must be between 1 byte and 50 MB.");
  if(typeof mime!=="string"||!types[mime])throw new Error("Unsupported media type.");
}
