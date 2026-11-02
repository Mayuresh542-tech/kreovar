import { EditorStore, Edit } from "./store";
/** One gesture = one undo entry. Escape, lost focus and pointer cancellation roll it back. */
export function pointerEdit(store:EditorStore,move:(event:PointerEvent)=>Edit,onError:(message:string)=>void){
  store.begin();
  function cleanup(){window.removeEventListener("pointermove",update);window.removeEventListener("pointerup",finish);window.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",key);window.removeEventListener("blur",cancel);}
  function update(event:PointerEvent){try{store.preview(move(event));}catch(e){cancel();onError(e instanceof Error?e.message:"Edit failed.");}}
  function finish(){cleanup();store.commit();}
  function cancel(){cleanup();store.cancel();}
  function key(event:KeyboardEvent){if(event.key==="Escape")cancel();}
  window.addEventListener("pointermove",update);window.addEventListener("pointerup",finish,{once:true});window.addEventListener("pointercancel",cancel,{once:true});window.addEventListener("keydown",key);window.addEventListener("blur",cancel,{once:true});
}
