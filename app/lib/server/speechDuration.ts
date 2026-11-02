import {Input,BufferSource,ALL_FORMATS} from 'mediabunny';
export async function speechDuration(bytes:Buffer,signal:AbortSignal){
 signal.throwIfAborted();const input=new Input({source:new BufferSource(new Uint8Array(bytes)),formats:ALL_FORMATS});
 try{const track=await input.getPrimaryAudioTrack();if(!track)throw new Error('No audio track.');const seconds=await track.computeDuration();signal.throwIfAborted();if(!Number.isFinite(seconds)||seconds<=0||seconds>240)throw new Error('Unsupported audio duration.');return Math.ceil(seconds);}finally{input.dispose();}
}
