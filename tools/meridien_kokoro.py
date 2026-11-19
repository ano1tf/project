"""Offline Sherpa-ONNX/Kokoro setup for VoiceStudio's French Inès export."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import tarfile

PACKS = {
    'kokoro-q8-shards-1.0.0.tgz': 'KoJQ203LxUOFrHAm12mu+hRmvqTmOcCgz61OVgTxmxX4isWaufLCF6kYz+QwOzVFYGNS62HHJWBHUbhzeoR43g==',
    'kokoro-js-1.2.1.tgz': 'oq0HZJWis3t8lERkMJh84WLU86dpYD0EuBPtqYnLlQzyFP1OkyBRDcweAqCfhNOpltyN9j/azp1H6uuC47gShw==',
}
VOCAB_HASH = '5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f'
SPEAKER = 'ff_siwis'
# (Delivery speed, pause after beat in seconds). The last beat has no extra pause.
DIRECTION = {
    'sillage-01': ((0.93, 0.24), (1.02, 0.23), (0.95, 0)),
    'sillage-03': ((1.04, 0.18), (0.98, 0.25), (1.03, 0.28), (0.95, 0)),
    'sillage-05': ((1.01, 0.17), (1.04, 0.18), (1.01, 0)),
}


def kokoro_backend(studio: Path, packs: Path, vocab: Path, directory: Path):
    import espeakng_loader
    import onnx
    import sherpa_onnx as sherpa

    cfg = vocab.read_bytes()
    if hashlib.sha256(cfg).hexdigest() != VOCAB_HASH:
        raise RuntimeError(f'Unexpected Kokoro vocabulary: {vocab}')
    tokens = directory / 'tokens.txt'
    tokens.write_text(''.join(f'{k} {v}\n' for k, v in json.loads(cfg)['vocab'].items()), encoding='utf-8')
    weights, voice = directory / 'model.onnx', directory / 'voices.bin'
    for name, digest in PACKS.items():
        archive = packs / name
        with archive.open('rb') as f:
            if hashlib.file_digest(f, 'sha512').digest() != base64.b64decode(digest):
                raise RuntimeError(f'Unexpected digest: {archive}')
        with tarfile.open(archive, 'r:gz') as tar:
            if name.startswith('kokoro-q8'):
                with weights.open('wb') as f:
                    for i in range(6):
                        f.write(tar.extractfile(f'package/kokoro-q8.part{i}.bin').read())
            else:
                voice.write_bytes(tar.extractfile(f'package/voices/{SPEAKER}.bin').read())
    # Sherpa reads Kokoro's speaker layout and phonemizer from ONNX metadata.
    # No operators or weights are changed.
    graph = onnx.load(weights)
    onnx.helper.set_model_props(graph, {
        'model_type': 'kokoro', 'language': 'French', 'has_espeak': '1',
        'sample_rate': '24000', 'version': '2', 'voice': 'fr',
        'style_dim': '510,1,256', 'n_speakers': '1', 'id2speaker': f'0->{SPEAKER}',
        'speaker2id': f'{SPEAKER}->0', 'speaker_names': SPEAKER,
    })
    onnx.save(graph, weights)
    del graph

    sys.path.insert(0, str(studio / 'backend'))
    from services.tts_backend import SherpaOnnxBackend

    backend = SherpaOnnxBackend()
    # This VoiceStudio revision builds a VITS-only config. Give its adapter an
    # initialized Kokoro instance instead; generate() is shared by both models.
    backend._tts = sherpa.OfflineTts(sherpa.OfflineTtsConfig(
        model=sherpa.OfflineTtsModelConfig(
            kokoro=sherpa.OfflineTtsKokoroModelConfig(
                model=str(weights), voices=str(voice), tokens=str(tokens),
                data_dir=espeakng_loader.get_data_path(), lang='fr',
            ),
            num_threads=2, provider='cpu',
        ),
    ))
    return backend


def ines_take(backend, line):
    import numpy as np

    text = line['text'].rstrip('.')
    phrases = text.split('. ')
    direction = DIRECTION[line['id']]
    rate = backend.sample_rate
    if len(phrases) != len(direction) or rate != 24000:
        raise RuntimeError(f'Missing direction for {line["id"]} / {rate} Hz')
    parts = []
    for phrase, (speed, pause) in zip(phrases, direction):
        punctuation = '…' if phrase == 'Noa' else '.'
        pcm = np.asarray(backend.generate(phrase + punctuation, speaker_id=0, speed=speed)).reshape(-1)
        loud = np.flatnonzero(np.abs(pcm) > max(0.006, 0.026 * np.max(np.abs(pcm), initial=0)))
        if not loud.size or not np.isfinite(pcm).all():
            raise RuntimeError(f'Invalid take: {phrase}')
        pcm = pcm[max(0, loud[0] - rate // 28):min(pcm.size, loud[-1] + rate // 16)].copy()
        edges = rate // 140
        pcm[:edges] *= np.linspace(0, 1, edges)
        pcm[-edges:] *= np.linspace(1, 0, edges)
        parts.extend((pcm, np.zeros(round(pause * rate), dtype=np.float32)))
    return np.concatenate(parts), rate
