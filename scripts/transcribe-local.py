"""Offline speech recognition. Models must already be present on this machine."""
import json
import os
import sys
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
from faster_whisper import WhisperModel

def main():
    model_name = os.environ.get('LOCAL_TRANSCRIPTION_MODEL', 'base')
    if model_name not in ('tiny', 'base', 'small'):
        raise ValueError('Unsupported local transcription model')
    model = WhisperModel(model_name, device='cpu', compute_type='int8', cpu_threads=4, num_workers=1, local_files_only=True)
    segments, info = model.transcribe(sys.argv[1], language=sys.argv[2] if len(sys.argv) > 2 else None, beam_size=3, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
    words, text = [], []
    for segment in segments:
        text.append(segment.text.strip())
        for word in segment.words or []:
            if word.word.strip():
                words.append({'text':word.word.strip(), 'start':word.start, 'end':word.end, 'type':'word'})
    print(json.dumps({'text':' '.join(text), 'words':words, 'language_code':info.language, 'audio_duration_secs':info.duration}, ensure_ascii=True))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Local transcription failed. Check cached model and audio codec.', file=sys.stderr)
        sys.exit(1)
