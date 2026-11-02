import type {EditDecision} from './ai';

export const NATIVE_EDIT_OPERATIONS = [
 'composeCaption','setVisualTreatment','addShape','keyframes','animate','addGraphic','addOverlay','addZoom','clearZooms','rippleCut','applyTextPlacement','appendSequence','applyCaptionTemplate','setAudioDucking','addClip','removeClip','moveClip','trimClip','splitClip','addText','addCaption','addTransition','duplicateClip','changeText','mergeCaptions','changeTrack','setAspectRatio','changeClipProperty'
] as const satisfies readonly EditDecision['op'][];

/** One capability boundary for planner prompts and both execution validators.
 * Custom requests have their own isolated stage; preset stages stay narrow.
 */
export const STAGE_CAPABILITIES:Record<string,{operations:readonly string[];tools:readonly string[]}>= {
 analyzeFootage:{operations:[],tools:[]},
 applyCaptions:{operations:['addCaption','applyCaptionTemplate','composeCaption'],tools:[]},
 planMotionGraphics:{operations:['addGraphic','addShape'],tools:[]},
 findBroll:{operations:['addClip'],tools:['broll','library']},
 applyZooms:{operations:['addZoom'],tools:[]},
 applySoundEffects:{operations:['addClip'],tools:['sfx','library']},
 applyEffects:{operations:['addTransition','changeClipProperty','setAudioDucking'],tools:[]},
 applyRequestedEdits:{operations:NATIVE_EDIT_OPERATIONS,tools:['captions','sfx','library','broll','motion','voiceover','image']}
};
