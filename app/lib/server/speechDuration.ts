import {Input,BufferSource,ALL_FORMATS} from 'mediabunny';
import {MAX_VIDEO_SECONDS} from '../editor/limits';
export async function speechDuration(bytes:Buffer,signal:AbortSignal){
 signal.throwIfAborted();const input=new Input({source:new BufferSource(new Uint8Array(bytes)),formats:ALL_FORMATS});
 try{const track=await input.getPrimaryAudioTrack();if(!track)throw new Error('No audio track.');const seconds=await track.computeDuration();signal.throwIfAborted();if(!Number.isFinite(seconds)||seconds<=0||seconds>MAX_VIDEO_SECONDS)throw new Error('Unsupported audio duration.');return Math.ceil(seconds);}finally{input.dispose();}
}
