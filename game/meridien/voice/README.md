# Doublage français de Méridien

Les huit MP3 sont des **voix synthétiques** pour trois personnages fictifs. Aucun clonage ni enregistrement de comédien n’a servi de référence. Les exports utilisent [VoiceStudio](https://github.com/debpalash/VoiceStudio/tree/8f6c113433faa1c39d0584534d7d20f469a2a419) (AGPL-3.0), séparément du jeu. Ni le logiciel de production, ni ses dépendances, ni les poids des modèles ne sont distribués avec le jeu.

| Personnage  | Moteur / profil                   | Direction                                                                 |
| ----------- | --------------------------------- | ------------------------------------------------------------------------- |
| Inès Kader  | Kokoro v1.0 / `ff_siwis` (Sherpa) | Débit conversationnel, prises par groupes de souffle, pauses dirigées.    |
| Noa Vidal   | Supertonic-3 / F1                 | Plus directe, interrogative et nerveuse. Prises de la 0.3 conservées.     |
| Aya Le Guen | Supertonic-3 / F4                 | Plus claire et incisive, rythme de journaliste. Prises de la 0.3 gardées. |

Le café reçoit une légère réflexion d’ambiance. Les pistes représentent environ **38 secondes / 300 Kio**. `../js/voices.mjs` associe chaque piste à sa durée et à une enveloppe d’ouverture de bouche à 20 Hz. Le jeu charge chaque clip au moment de sa réplique, sans synthèse ni dépendance externe. La direction vocale ne garantit pas qu’une voix de synthèse sonne comme une prise humaine.

## Crédits et modèles

- **Inès** : [Hexgrad Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M) et [conversion ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), Apache-2.0. Profil français `ff_siwis`, phonétisation `fr`. La version épinglée de l’adaptateur Sherpa de VoiceStudio ne configure que VITS en standard. L’exporteur lui fournit une instance Kokoro configurée et appelle sa méthode `generate()` ; seuls les MP3 et leurs enveloppes sont embarqués.
- **Noa et Aya** : [Supertone/supertonic-3 – BigScience OpenRAIL-M](https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE), conversion int8 [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models) repaquetée dans les archives npm ci-dessous. Le sidecar utilise le SDK `supertonic==1.3.1` en `fr` et 20 étapes. F1 est accepté par le sidecar même s’il ne figure pas dans la liste courte de l’interface.

## Refaire les exports (facultatif)

Il faut Python 3.11, Node, npm, FFmpeg avec `libmp3lame` et une copie du dépôt de production à la révision suivante :

```sh
git clone https://github.com/debpalash/VoiceStudio.git /tmp/voicestudio
git -C /tmp/voicestudio checkout --detach 8f6c113433faa1c39d0584534d7d20f469a2a419
mkdir -p /tmp/meridien-packs
```

**Inès.** Utiliser l’environnement Python de VoiceStudio (son adaptateur importe PyTorch, mais l’inférence se fait sur CPU avec Sherpa). Depuis la racine du dépôt du jeu, avec cet environnement activé :

```sh
python -m pip install onnx==1.21.0 sherpa-onnx==1.13.8 espeakng-loader==0.2.4
npm pack --ignore-scripts --pack-destination /tmp/meridien-packs \
  kokoro-q8-shards@1.0.0 kokoro-js@1.2.1
gh api 'repos/thewh1teagle/kokoro-onnx/contents/src/kokoro_onnx/config.json?ref=3596b26764286a7de9d90c363e988d50578918e5' \
  -H 'Accept: application/vnd.github.raw+json' > /tmp/meridien-packs/kokoro-config.json
python tools/meridien-voices.py /tmp/voicestudio \
  --kokoro-packs /tmp/meridien-packs --kokoro-vocab /tmp/meridien-packs/kokoro-config.json
```

**Noa et Aya.** Consulter les [conditions de Supertonic-3](https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE) avant utilisation. Cet export ne remplace pas les pistes d’Inès :

```sh
python3 -m venv /tmp/meridien-tts
/tmp/meridien-tts/bin/pip install supertonic==1.3.1 numpy==2.4.6 onnxruntime==1.32.0
npm pack --ignore-scripts --pack-destination /tmp/meridien-packs \
  @3sln/donki-lle-voice-multi@0.1.1 \
  @3sln/donki-lle-voice-multi-2@0.1.1 \
  @3sln/donki-lle-voice-multi-3@0.1.1
/tmp/meridien-tts/bin/python tools/meridien-voices.py /tmp/voicestudio \
  --sherpa-packs /tmp/meridien-packs
```

L’exporteur vérifie les empreintes et lit les archives comme données, sans exécuter leur JavaScript. Il prépare les modèles dans un dossier temporaire. Le dialogue source est dans `../js/data.mjs`. Pour refaire les prises Supertonic avec les poids non quantifiés choisis par VoiceStudio, omettre `--sherpa-packs` dans un environnement autorisé à télécharger le modèle, ou fournir `--model-dir <dossier au format SDK>`.
