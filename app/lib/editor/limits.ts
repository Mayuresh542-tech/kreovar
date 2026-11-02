export const MAX_VIDEO_SECONDS=60;
export function assertVideoDuration(duration:number){if(!Number.isFinite(duration)||duration<=0)throw new Error("Add a clip before exporting.");if(duration>MAX_VIDEO_SECONDS)throw new Error("Videos up to 60 seconds are supported. Trim your timeline before exporting.");}
