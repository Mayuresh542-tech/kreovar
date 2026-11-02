import type {EditorProject} from "./model";
import type {EditorStore} from "./store";
/** Commit the reviewed document itself, never rerun nondeterministic editing operations. */
export function commitReviewedEdit(store:EditorStore,before:EditorProject,reviewed:EditorProject){
 if(store.interacting||store.getSnapshot()!==before)throw new Error("Your timeline changed. Generate a fresh plan before applying it.");
 if(reviewed.id!==before.id||reviewed.revision!==before.revision)throw new Error("This preview targets a different project revision.");
 store.execute(current=>{
  if(current!==before)throw new Error("Your timeline changed. Generate a fresh plan.");
  return reviewed;
 });
}
