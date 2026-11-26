export const MAX_VIDEO_SECONDS = 300;
export const EXTENDED_MAX_VIDEO_SECONDS = 300;
export function assertVideoDuration(duration: number, maxSeconds = MAX_VIDEO_SECONDS) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Add a clip before exporting.");
  if (duration > maxSeconds) throw new Error(`Videos up to ${maxSeconds} seconds are supported. Trim your timeline before exporting.`);
}

