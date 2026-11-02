import type {EditorJsonOptions} from './radoxService';
import type {FootageFrame} from '../editor/footageContext';
/** Optional extra observations are deliberately absent from the Claude contract. */
export type EditorFallbackOptions=EditorJsonOptions&{fallbackFootageFrames?:FootageFrame[]};
