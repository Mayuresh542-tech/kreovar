const types:Record<string,string>={mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",mp3:"audio/mpeg",wav:"audio/wav",m4a:"audio/mp4",ogg:"audio/ogg",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",srt:"application/x-subrip",vtt:"text/vtt",txt:"text/plain"};
export function uploadMime(file:{name:string;type:string}){
 const extension=file.name.split(".").at(-1)?.toLowerCase()||"";
 if(extension==="webm"&&file.type==="audio/webm")return file.type;
 const inferred=types[extension];
 if(!inferred)throw new Error("Unsupported file format. Use MP4, MOV, WebM, MP3, WAV, M4A, OGG, PNG, JPEG, WebP, SRT, VTT or TXT.");
 if(file.type&&file.type!=="application/octet-stream"&&file.type!==inferred&&!(inferred==="audio/wav"&&file.type==="audio/x-wav")&&!["srt","vtt"].includes(extension))throw new Error("The file extension does not match its media type.");
 return inferred;
}
