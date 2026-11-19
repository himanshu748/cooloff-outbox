# Local test video (not bundled)

This development input and its numeric regression fixture are inherited from
Breathlines. No video is bundled. Prerecorded-input checks are not a substitute
for Himanshu's live webcam submission recording.

## 45-second CC-licensed input

- **Local MP4:** `/home/ubuntu/research/breathlines-face-45s.mp4`
- **Chromium fake-camera input:** `/home/ubuntu/research/breathlines-face-45s.y4m`
- Source: **Jimmy Wales on Collective Intelligence**, interview by **Dan Gillmor,
  Center for Citizen Media**, from the Internet Archive:
  <https://archive.org/details/DanGillmor_CenterforCitizenMediaJimmyWalesonCollectiveIntelligence>
- Original download:
  <https://archive.org/download/DanGillmor_CenterforCitizenMediaJimmyWalesonCollectiveIntelligence/JimmyWales.mp4>
- License, verified in the Archive item's `metadata.licenseurl`:
  **[CC BY-NC-SA 2.5](https://creativecommons.org/licenses/by-nc-sa/2.5/)**.
  Attribution: Dan Gillmor, Center for Citizen Media, _Jimmy Wales on Collective
  Intelligence_. Changes: excerpted 00:30–01:15, audio removed, transcoded to
  H.264 MP4 and scaled Y4M. Derivatives retain CC BY-NC-SA 2.5. No endorsement
  by the interviewer or interviewee is implied.
- This is a **noncommercial test asset**, not MIT-licensed. Development screenshots
  containing this footage are separately shared under CC BY-NC-SA 2.5 with this attribution.
  Do not redistribute it in a commercial product; obtain a suitable separately
  licensed recording for that use.
- Stationary indoor seated interview, predominantly frontal face and even
  lighting. It includes natural speech/head motion, and is only 320×240 with
  visible compression. It is useful for exercising the file/fake-camera path,
  **not** a physiological accuracy benchmark. A keyed SmartSpectra 3.5.0 run
  with paced playback and Mesa lavapipe completed with confident pulse,
  breathing rate, expression and arterial waveform readings. Every validation
  event in that earlier Breathlines MP4 run was code 0 (`kOk`, “Hold still and record”), not a motion warning.
  45s is too short for confidence-gated HRV.

Cool-off Outbox's Y4M smoke completed with confident pulse/breathing/expression
and arterial-trace readings: 17 exhales, 5 double-blink gestures, no sustained eye
closures. Validation included both code 0 and code 7 (chest framing). These are
SDK/heuristic outputs, not physiological ground truth. The Electron check also
used a 30fps Y4M resampling of the same 45-second MP4 to leave room above the
SDK's 25fps requirement; frames were duplicated, not signals fabricated.

### Numeric regression excerpt

`test/real-signals.json` contains rounded chest waveform values from the first
20 seconds and the first 100 stable pairs of derived eye-openness ratios from
that run. It contains no frames or face coordinates. Attribution and
**CC BY-NC-SA 2.5** terms above apply to this derived fixture, separately from
the application's MIT license. SDK detection counts are regression baselines,
not independently annotated physiological ground truth; no thresholds were
tuned to this interview clip.

Reproduce outside the repository:

```sh
curl -L --fail -o ~/research/jimmy-wales-interview.mp4 \
  'https://archive.org/download/DanGillmor_CenterforCitizenMediaJimmyWalesonCollectiveIntelligence/JimmyWales.mp4'
ffmpeg -ss 30 -i ~/research/jimmy-wales-interview.mp4 -t 45 -an \
  -c:v libx264 -crf 18 -pix_fmt yuv420p ~/research/breathlines-face-45s.mp4
ffmpeg -i ~/research/breathlines-face-45s.mp4 -an \
  -vf 'scale=640:480,fps=25' -pix_fmt yuv420p ~/research/breathlines-face-45s.y4m
```
