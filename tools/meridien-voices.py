#!/usr/bin/env python3
"""Offline French dialogue export via VoiceStudio (Supertonic-3 or Sherpa-ONNX).

This is a client of the separate VoiceStudio program, not a dependency of the game.
See game/meridien/voice/README.md before re-exporting.
"""
import argparse
import base64
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'game/meridien'
MANIFEST = GAME / 'js/voices.mjs'
SIDECAR = 'backend/engines/supertonic3/sidecar.py'
VOICES = {'ines': ('F3', 0.96), 'noa': ('F1', 1.04), 'aya': ('F4', 0.95)}
PACKS = {
    'donki-lle-voice-multi@0.1.1': 'pe1OCsPhCti+EePT8G6L/jEqTuQV8uF7d0hOlyYHVGF3WSBbR+P7ffF3cNDEP/arF2OWlmbRFvbNAUmUGtAJBw==',
    'donki-lle-voice-multi-2@0.1.1': 'bVgNjfBfSGHl45+OTYNY9eI4qWQOa1PKlnCCWWGLiK6+w8BlhRqZI62am01bQ4F4tQkPI7AZsJXilUer1ZZR6A==',
    'donki-lle-voice-multi-3@0.1.1': 'nwNCbKbkSovvloXo7n649d4IbDdl76RpdC4om6PFBKKK6VtEU5w0sMSOazjmUcBQsT8QcXlJ6oyO1s//NqnvRA==',
}
SPEED = {'sillage-03': 0.91, 'sillage-04': 1.0, 'marees-02': 0.98, 'marees-03': 0.93}
# Load only a supplied offline model. VoiceStudio itself still handles all
# synthesis, normalization of language and the binary wire protocol.
LAUNCH = '''
import importlib.util, sys
import numpy as np
np.random.seed(54199)
spec = importlib.util.spec_from_file_location('voicestudio_sidecar', sys.argv[1])
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
if sys.argv[2]:
    from supertonic import TTS
    def load_local(_):
        if s._tts is None:
            s._tts = TTS(model='supertonic-3', model_dir=sys.argv[2], auto_download=False,
                         intra_op_num_threads=2, inter_op_num_threads=1)
        return s._tts
    s._load_tts = load_local
raise SystemExit(s.main([]))
'''


def unpack_sherpa(packs, directory):
    """Read pinned npm data (never import the packaged JS). Convert the
    Sherpa index and styles back to the SDK layout expected by VoiceStudio."""
    import numpy as np

    onnx, voices = directory / 'onnx', directory / 'voice_styles'
    onnx.mkdir(parents=True)
    voices.mkdir()
    with ExitStack() as stack:
        bundles = {}
        for name, integrity in PACKS.items():
            path = packs / ('3sln-' + name.replace('@', '-') + '.tgz')
            with path.open('rb') as handle:
                if hashlib.file_digest(handle, 'sha512').digest() != base64.b64decode(integrity):
                    raise RuntimeError(f'Unexpected digest: {path}')
            bundles[name] = stack.enter_context(tarfile.open(path))
        primary = next(iter(bundles.values()))
        descriptor = primary.extractfile('package/voice.js').read().split(b'export default ', 1)[1]
        blobs = {}
        for name, meta in json.loads(descriptor.strip().removesuffix(b';'))['files'].items():
            blocks = []
            for part in meta['parts']:
                scope, package, member = part.split('/', 2)
                body = bundles[package].extractfile('package/' + member).read().strip()
                if scope != '@3sln' or not body.startswith(b'export default "') or not body.endswith(b'";'):
                    raise RuntimeError(f'Unexpected package member: {part}')
                blocks.append(base64.b64decode(body[len(b'export default "'):-2], validate=True))
            raw = b''.join(blocks)
            if len(raw) != meta['size']:
                raise RuntimeError(f'Incomplete model file: {name}')
            if name in ['vocoder.onnx', 'vector_estimator.onnx', 'text_encoder.onnx', 'duration_predictor.onnx', 'tts.json']:
                (onnx / name).write_bytes(raw)
            else:
                blobs[name] = raw
    index = np.frombuffer(blobs['unicode_indexer.bin'], dtype='<i4')
    (onnx / 'unicode_indexer.json').write_text(json.dumps(index.tolist()))
    voice_data = blobs['voice.bin']
    n, a, b, n2, c, d = struct.unpack_from('<6q', voice_data)
    vectors = np.frombuffer(voice_data, dtype='<f4', offset=48)
    if n != 10 or n2 != 10 or vectors.size != n * (a * b + c * d):
        raise RuntimeError('Unexpected Supertonic style layout.')
    ttl = vectors[:n * a * b].reshape(n, a, b)
    dp = vectors[n * a * b:].reshape(n, c, d)
    # Sherpa's generate_voices_bin.py stacks the ten files alphabetically.
    for i, name in enumerate('F1 F2 F3 F4 F5 M1 M2 M3 M4 M5'.split()):
        (voices / f'{name}.json').write_text(json.dumps({
            'style_ttl': {'dims': [1, a, b], 'data': ttl[i].tolist()},
            'style_dp': {'dims': [1, c, d], 'data': dp[i].tolist()},
        }))


def request(pipe, frame):
    body = json.dumps(frame, ensure_ascii=False).encode()
    pipe.write(struct.pack('>I', len(body)) + body)
    pipe.flush()


def receive(pipe):
    header = pipe.read(4)
    if len(header) != 4:
        raise RuntimeError('VoiceStudio stopped before sending a reply.')
    size = struct.unpack('>I', header)[0]
    if not 0 < size < 30_000_000:
        raise RuntimeError(f'Unexpected VoiceStudio frame size: {size}')
    body = pipe.read(size)
    if len(body) != size:
        raise RuntimeError('Incomplete VoiceStudio frame.')
    return json.loads(body)


def decode(clip):
    import numpy as np

    rate = int(clip['sample_rate'])
    samples = np.frombuffer(base64.b64decode(clip['audio_pcm_b64'], validate=True), dtype='<i2').astype(np.float32) / 32768
    return samples, rate


def mix(samples, rate, path, scene):
    import numpy as np

    step = rate // 100
    n = len(samples) // step
    power = np.sqrt(np.mean(samples[:n * step].reshape(n, step) ** 2, axis=1))
    active = np.flatnonzero(power > max(0.0025, power.max() * 0.04))
    if not active.size:
        raise RuntimeError('VoiceStudio returned a silent take.')
    samples = samples[max(0, active[0] - 10) * step:min(n, active[-1] + 16) * step].copy()
    fade = rate // 100
    samples[:fade] *= np.linspace(0, 1, fade)
    samples[-fade:] *= np.linspace(1, 0, fade)
    samples = np.pad(samples, (rate // 9, rate // 7))
    if scene == 'sillage':  # quiet early reflection, not a radio effect
        for delay, gain in ((23, .086), (41, .057), (69, .023)):
            j = round(rate * delay / 1000)
            samples[j:] += samples[:-j] * gain
    loud = np.sqrt(np.mean(samples ** 2))
    samples *= min(0.78 / np.max(np.abs(samples)), 0.082 / loud)
    with wave.open(str(path), 'wb') as f:
        f.setparams((1, 2, rate, 0, 'NONE', ''))
        f.writeframes((samples * 32767).astype('<i2').tobytes())
    # Envelope, 20 samples/s. One hex digit per frame; no audio analysis in-game.
    step = rate // 20
    a = samples[:len(samples) // step * step].reshape(-1, step)
    rms = np.sqrt(np.mean(a * a, axis=1))
    mouth = np.rint(np.clip((rms - .009) * 7.1, 0, 1) ** .72 * 15).astype(int)
    return [round(len(samples) / rate, 3), ''.join(format(v, 'x') for v in mouth)]


def supertonic_takes(sidecar, model_dir, lines):
    with subprocess.Popen(
        [sys.executable, '-c', LAUNCH, str(sidecar), str(model_dir or '')],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, env={**os.environ, 'OPENBLAS_NUM_THREADS': '1'},
    ) as p:
        try:
            ready = receive(p.stdout)
            if ready.get('engine') != 'supertonic3' or ready.get('version') != '1.3.1':
                raise RuntimeError(f'Expected VoiceStudio Supertonic-3 / SDK 1.3.1, got {ready}')
            for scene, line in lines:
                key = line['id']
                voice, speed = VOICES[line['speaker']]
                request(p.stdin, dict(op='synthesize', text=line['text'], voice=voice, lang='fr',
                                      speed=SPEED.get(key, speed), total_steps=20))
                while (clip := receive(p.stdout)).get('op') == 'progress':
                    print(clip, flush=True)
                if clip.get('op') != 'audio':
                    raise RuntimeError(clip.get('message', clip))
                # The unexported F3 takes keep the original SDK seed sequence.
                if line['speaker'] != 'ines':
                    yield scene, key, voice, decode(clip)
            request(p.stdin, {'op': 'shutdown'})
            p.wait(timeout=15)
            if p.returncode:
                raise RuntimeError(f'VoiceStudio exited with status {p.returncode}')
        finally:
            if p.poll() is None:
                p.terminate()
                try:
                    p.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    p.kill()


def node_json(module, binding):
    return json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        f'import {{ {binding} }} from {json.dumps(module.as_uri())}; console.log(JSON.stringify({binding}))',
    ]))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('voicestudio', type=Path, help='Pinned VoiceStudio checkout')
    model = ap.add_mutually_exclusive_group()
    model.add_argument('--model-dir', type=Path, help='Optional local SDK-format Supertonic-3 directory')
    model.add_argument('--sherpa-packs', type=Path, help='Optional directory with the three Supertonic npm .tgz files')
    model.add_argument('--kokoro-packs', type=Path, help='Use the two pinned Kokoro npm .tgz files (Inès only)')
    ap.add_argument('--kokoro-vocab', type=Path, help='Pinned Kokoro config.json for the phoneme vocabulary')
    ap.add_argument('--ffmpeg', default=shutil.which('ffmpeg'), help='Path to FFmpeg with libmp3lame')
    args = ap.parse_args()
    studio = args.voicestudio.resolve()
    sidecar = studio / SIDECAR
    if not args.ffmpeg:
        ap.error('FFmpeg is required.')
    if args.kokoro_packs:
        if not args.kokoro_vocab or not (studio / 'backend/services/tts_backend.py').is_file():
            ap.error('Kokoro requires the VoiceStudio Sherpa adapter and --kokoro-vocab.')
    elif not sidecar.is_file() or (args.model_dir and not args.model_dir.is_dir()):
        ap.error('A VoiceStudio Supertonic sidecar and a valid model directory (if set) are required.')

    scenes = node_json(GAME / 'js/data.mjs', 'SCENES')
    lines = [(scene['id'], line) for scene in scenes for line in scene['lines']]
    metadata = node_json(MANIFEST, 'VOICES') if MANIFEST.exists() else {}
    with tempfile.TemporaryDirectory() as work:
        d = Path(work)
        if args.kokoro_packs:
            from meridien_kokoro import kokoro_backend, ines_take, SPEAKER
            backend = kokoro_backend(studio, args.kokoro_packs, args.kokoro_vocab, d)
            takes = ((scene, line['id'], SPEAKER, ines_take(backend, line))
                     for scene, line in lines if line['speaker'] == 'ines')
        else:
            model_dir = args.model_dir.resolve() if args.model_dir else None
            if args.sherpa_packs:
                model_dir = d / 'supertonic-3'
                unpack_sherpa(args.sherpa_packs, model_dir)
            takes = supertonic_takes(sidecar, model_dir, lines)
        exported = []
        for scene, key, voice, (samples, rate) in takes:
            wav = d / (key + '.wav')
            metadata[key] = mix(samples, rate, wav, scene)
            subprocess.run([args.ffmpeg, '-loglevel', 'error', '-y', '-i', str(wav), '-af',
                            'highpass=f=78,lowpass=f=10000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k',
                            str(d / (key + '.mp3'))], check=True)
            exported.append(key)
            print(key, voice, metadata[key][0], 's', flush=True)
        dest = GAME / 'voice'
        dest.mkdir(exist_ok=True)
        for key in exported:
            shutil.copyfile(d / (key + '.mp3'), dest / (key + '.mp3'))
    ordered = {line['id']: metadata[line['id']] for _, line in lines if line['id'] in metadata}
    MANIFEST.write_text('// Generated by tools/meridien-voices.py. Duration in seconds; mouth cues at 20 Hz.\n'
                        'export const VOICES = ' + json.dumps(ordered, indent=2) + ';\n', encoding='utf-8')


if __name__ == '__main__':
    main()
