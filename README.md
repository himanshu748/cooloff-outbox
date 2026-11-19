# Cool-off Outbox ✉

**Write it now. Send it cooler.** A local Electron composer that offers a pause
before a heated email or DM becomes somebody else's problem. Not a sentiment
oracle, medical tool, or automatic sender: it is a small piece of intentional
friction, with an escape hatch.

## Try it — no cloning needed

Download your platform's build from [GitHub Releases](https://github.com/himanshu748/cooloff-outbox/releases)
once a release is published: **Linux x64 AppImage**, **Windows x64 portable EXE**,
or **macOS Apple Silicon (arm64) DMG**. Before a release, signed-in GitHub users
can download and unzip artifacts from a successful **Downloadable builds** run
under [Actions](https://github.com/himanshu748/cooloff-outbox/actions/workflows/release.yml).
These builds are unsigned; download only from this repository.

- **Linux:** make the AppImage executable (`chmod +x Cooloff-Outbox-*.AppImage`),
  then open it. Ubuntu 22.04+ / glibc ≥2.35 and the host C++ runtime are required.
  Install a working Vulkan GPU driver (for example `mesa-vulkan-drivers` on
  Ubuntu); `vulkaninfo --summary` should show a device. The bundled Vulkan loader
  is not a GPU driver. If FUSE is unavailable, run the AppImage with
  `--appimage-extract-and-run`. Keep Chromium's sandbox enabled on your own machine.
- **Windows:** run the portable EXE. SmartScreen may warn about an unknown
  publisher: use **More info → Run anyway** only if you trust the download.
  Install current Intel/AMD/NVIDIA graphics drivers with Vulkan support; the
  loader is bundled, not the device driver.
- **macOS:** open the DMG and drag the app to Applications. The app is unsigned
  and not notarized: **right-click → Open**; if macOS still blocks it, review
  **System Settings → Privacy & Security → Open Anyway** for this app only.
  Allow camera access when prompted. The SDK bundles MoltenVK for Metal; no
  separate Vulkan SDK installation is needed. Intel Macs are not supported.

At consent, choose **Use without camera** to try the staged heated example and
its 30-second timer-only pause: no webcam or key required. For live estimates,
[register for a free Presage developer key](https://physiology.presagetech.com/auth/register),
consent, then paste it into the in-app **API key** field. You do **not** need an
environment variable. Camera mode requires the relevant metric authorizations
and network access for the SDK's authentication/model downloads. Estimates are
not medical measurements. Keys stay in the password field/SDK memory for this
run; the app does not save them to disk or a keychain. Quitting clears them.

### Build downloads yourself

After `npm ci`, run `npm run package -- --linux --x64`,
`npm run package -- --win --x64`, or `npm run package -- --mac --arm64` on the
matching OS. Outputs go to `release/`. The full target-specific SDK native
closure is copied outside ASAR under `resources/node_modules/@smartspectra/`,
where the SDK's normal package resolver finds it; Koffi is unpacked too. No
API key is embedded in the download. The SDK's bundled graphs/models are
included; it may download additional models at runtime.

Maintainers can dispatch **Downloadable builds** manually for all three
artifacts (retained for 14 days), or push a `v*` tag to build and attach them to
a GitHub Release. Packaging does not run on PRs. Windows/macOS builds must be
tested on their target OS before claiming camera compatibility.

## Run

Node 20+ (22 recommended), a desktop OS supported by SmartSpectra, and a Presage
developer key with cardio, breathing and face authorization are needed for
camera measurement. No key or camera is needed for timer-only mode.

```sh
npm ci
# Supply SMARTSPECTRA_API_KEY securely in the environment, not in a recorded command.
npm start
```

On Linux install Electron desktop dependencies and `mesa-vulkan-drivers
vulkan-tools` for optional models that require Vulkan. `vulkaninfo --summary`
should identify a working device; Mesa lavapipe can run on a CPU. No CPU-only
SDK constructor switch is documented. Do not put keys in repository files.

Consent comes first. Choose **Use without camera** for timer-only use, or consent,
enter your key (an environment key loads privately), open the composer and
**Prepare camera**. Select/rotate the camera, check readiness, then measure.
Readiness can offer breathing-only mode; that mode cannot establish a full
pulse/breath baseline and heated messages use the timer-only pause.

## The pause, precisely

- To, Subject and Body remain editable. Enter works normally. No text leaves
  the app during composition. **Send** opens a prefilled `mailto:` draft in your
  mail app; you still send there. **Copy** puts a DM/email on the OS clipboard.
- The first 20 seconds with pulse **and** breathing confidence ≥50% establish
  personal median baselines. Gaps pause calibration. Restarting sensing resets
  calibration, not messages. Fresh estimates expire after 3.5 seconds.
- Heat is a transparent **0–100 writing cue**: up to 30 points for pulse above
  baseline (+30 bpm saturates), 25 for breathing (+12/min saturates), 25 for the
  strongest confident angry/contempt/disgust expression, and 45 from local text
  rules. The sum caps at 100. Expression confidence is the SDK's score, not proof
  of an emotion. Only ≥50%-confidence samples influence heat/calibration.
- Text rules: mostly capital letters (at least eight letters), repeated `!?`,
  and a short whole-word English list in `heat.cjs`. Tips are rules, not an LLM.
- **Calm** is below 20; **warm** is 20–39; **heated** is 40+. Both Send and Copy
  move heated messages into Cooling. Unheated messages open/copy immediately.
  During calibration or without a camera, the score uses available expression
  and text cues, not invented physiological baselines.
- A camera-based hold unlocks after **30 continuous seconds below 40**, requiring
  fresh confident pulse and breathing, or **3 minutes maximum**. Missing readings
  reset the below-threshold streak. Stopping the camera retains drafts and the
  maximum-hold escape hatch. It does not claim you have cooled.
- Holds created without a calibrated camera use a **30-second timer-only pause**,
  regardless of estimates. **Send anyway** is available after 10 seconds and
  asks for confirmation. Edit/delete are always available. Edit cancels that
  hold; sending the edited draft evaluates it again. Unlock never sends anything.
- Steam intensity follows each card's heat. The ring's size follows the live
  breathing trace; a gentle light animation optionally suggests 4 seconds in /
  6 out. Breathe comfortably; it is not a target or treatment. Reduced-motion
  preferences disable animations.

## Consent and privacy

Camera frames are processed on-device by SmartSpectra; no microphone is requested.
The SDK contacts Presage for authentication/model downloads and may cache models.
SDK telemetry defaults **off**; consent separately offers diagnostic telemetry.
The app makes no other web requests. Its renderer blocks network connections.

Drafts, keys, baselines and vitals live **in memory only**. No recording, draft
autosave or analytics. Each hold keeps up to 200 heat/rate samples in memory for
its receipt; deleting the card or quitting removes that history. Stop releases camera resources without
deleting drafts; native readiness has no abort API, so Stop honestly waits for
its teardown before showing CAMERA OFF. Clear/delete removes a draft in the
app; quitting deletes all app-held drafts/measurements. Optional **Save totals**
stores only a cooled-message count and cumulative hold seconds in Electron's
user-data `cooled-counter.json`. **Delete counter** removes that file; disabling
the counter alone does not delete prior totals. No messages/vitals enter it.

Copy explicitly shares text with the OS clipboard; other apps/clipboard history
can retain it. Opening mail explicitly shares fields with the configured mail
client, which can save/sync drafts or contact its provider. Those external stores
are outside this app's deletion controls. Nothing is sent automatically. OS
swap/crash collection and third-party SDK/OS caches are outside the app's memory
guarantee. Do not use sensitive test messages or print a key.

Built with **Devin, an AI coding agent**. The app runs **no generative AI** and
sends no message text to an AI service.

## SmartSpectra features used

Pinned `@smartspectra/node-sdk` **3.5.0**. Exact APIs were checked in installed
`js/index.d.ts`, `js/renderer/index.d.ts`, and `js/messages/generated.d.ts`.

| Feature                                                    | Release                                                     | Use                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `checkDeviceReadiness()`                                   | 3.5                                                         | Consent-gated verdict/reason before measuring                                                       |
| `FrameTransform.kNone/kRotate90CW/kRotate180/kRotate90CCW` | 3.5                                                         | `useMediaStream(stream, { frameTransform })`, matching preview                                      |
| `kSustainedLowFrameRate`                                   | 3.5                                                         | Preserve messages, user-initiated lighter restart                                                   |
| Camera discovery / selection                               | 3.4                                                         | Permission-first browser picker and stale-ID fallback; native readiness matches unique camera names |
| Node/Electron SDK bridge                                   | 3.2                                                         | Main/preload isolation and decoded metric events                                                    |
| Arterial waveform / expressions / HRV                      | 3.0                                                         | Pulse trace, expression cues, optional live HRV display                                             |
| Breathing/cardio/face bundles; `useFile`                   | Available in installed 3.5; exact introduction not asserted | Live estimates and file smoke check                                                                 |

[Upstream releases](https://github.com/Presage-Security/SmartSpectra/releases).
Optional arterial/expression processing failures get bounded reduced-metric
retries; generic SDK error 8 cannot identify the failing model reliably, so the
UI discloses which metrics are disabled. Unauthorized metrics are never invented.

## Checks and live demo

```sh
npm test
npm run format:check
npm run build
npm run smoke -- /path/to/face.mp4
```

Smoke needs `SMARTSPECTRA_API_KEY` in its environment, reports confidence counts
and detector events, and exits nonzero on failure. For development only, set
`COOLOFF_FAKE_CAMERA` to an absolute Y4M path before starting Electron. That is
prerecorded input, **not a live participant demo**. Native readiness is
inconclusive for an unmatched fake camera. [Test clip attribution](TEST_VIDEO.md)
and its noncommercial/share-alike terms apply to that input/numeric fixture,
not the MIT application.

[DEV draft](docs/SUBMISSION.md) · [60-second live-webcam shot list](docs/SHOT_LIST.md).
**Himanshu's own live-webcam recording is still required before publication.**
No remote is configured yet; do not treat a placeholder repository URL as live.

## Limits and responsibility

Heat is an unvalidated heuristic, not stress/anxiety measurement or an assessment
of intent. Expressions can be wrong and vary across people; ordinary motion,
lighting, camera placement, speech, exercise, disability and cultural writing
styles affect results. Baseline may never finish with poor confidence. HRV needs
60+ seconds and positive confidence and does not affect heat. Low-confidence
signals are omitted. Timer-only mode remains usable without key/camera. Caps
and the small English word list can misread quotations, acronyms and dialect;
users can always edit, delete or override. This cannot guarantee a message is
kind or prevent harm. Do not rely on it for urgent/safety-critical communication.
Long mailto URLs may exceed mail-client limits; Copy is the fallback.

## Credits

MIT, Himanshu Kumar. Camera lifecycle, readiness, recovery, smoke and testing
plumbing adapted from the same author's MIT **Breathlines** project. No copied
Breathlines demo media is shipped. SDK notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
