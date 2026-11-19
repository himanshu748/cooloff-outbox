---
title: 'Cool-off Outbox: a little space before Send'
published: false
tags: devchallenge, presagechallenge
---

_This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)_

## What I Built

Cool-off Outbox is an Electron composer for the email or DM you might regret
sending at full speed. Write the message now. If optional camera estimates and
simple text cues suggest a heated moment, it waits in a cooling outbox. Steam
drifts above the card, a breathing ring offers a little room, and the words
remain entirely yours.

This is deliberate friction, not an emotion oracle or a chatbot. It compares
fresh confident pulse and breathing estimates against your own starting
baseline, rather than somebody else's idea of normal. There are no generated
rewrites, accounts, leaderboards or wellness scores. Gentle tips simply suggest
sentence case, fewer punctuation marks or describing an action instead of
labeling a person.

The practical need is ordinary: the expensive reply sent in a five-second
impulse. The creative twist is a temporary outbox that visibly loses steam,
without taking control away from its writer.

Transparency is part of the interaction: a live **Why** stacked bar separates
pulse, breathing, expression and text contributions, with evidence and explicit
missing-data labels. Each card captures **Held because** at the moment of the
hold, so its explanation does not drift with later readings. **Try a heated
example** stages a workplace draft whose text alone triggers the pause, with
confirmation before replacing existing work.

The small delight at unlock is a **cool-off receipt**: an inline heat sparkline
with the threshold drawn and a short start/end summary. Confident pulse and
breathing samples appear only when available. Maximum-hold and timer-only
receipts name those limits rather than claiming measured cooling; an override
says it was released before cooling, not automatically sent.

## Demo

**Placeholder: embed Himanshu's own live webcam recording here before publishing.**
Record per [the 60-second shot list](SHOT_LIST.md). Show real live SmartSpectra
readings and calibration, an immediate calm send, then **Try a heated example**.
Show the **Why** bar, **Held because**, the breathing ring, an actual unlock
with its sparkline receipt, and Stop preserving the draft.
Cut waiting honestly; never shorten the app's hold timers or fabricate readings.
Development fake-camera smoke/screenshots are prerecorded-input checks, not
the challenge's live demo.

## Code

Repository: [himanshu748/cooloff-outbox](https://github.com/himanshu748/cooloff-outbox).
**[Try it](https://github.com/himanshu748/cooloff-outbox/releases)**: downloadable
Linux x64 AppImage, Windows x64 portable EXE and unsigned macOS arm64 DMG builds
are produced by the release workflow. Until a release is published, use its
manual-run artifacts; [README](../README.md#try-it--no-cloning-needed) explains
downloads, Vulkan drivers and unsigned-app warnings. No cloning is needed.

For camera use, [get a free Presage key](https://physiology.presagetech.com/auth/register)
and enter it in the app after consent. Timer-only mode needs neither a key nor
a camera. Developers can instead use Node 20+, `npm ci` and `npm start`, with
an optional securely supplied `SMARTSPECTRA_API_KEY` environment variable.

With a camera, consent first, Prepare camera, choose its framing/rotation,
check readiness, then start full signals. The first 20 seconds of confident
pulse and breathing establish the baseline. With no camera, the same composer
offers a predictable timer-only pause for heated drafts.

## How It Responds to Human Signals

SmartSpectra **3.5.0** supplies device readiness through `checkDeviceReadiness()`,
frame transforms through renderer `useMediaStream()` and explicit sustained
low-frame-rate handling. Camera discovery/selection introduced in **3.4** informs
the permission-first picker. The isolated Electron main/preload bridge decodes
breathing, cardio and face bundles; the live panel shows traces, values,
confidence and status rather than hiding uncertainty.

The pure `heat.cjs` function combines pulse and breathing above personal median
baselines, confident angry/contempt/disgust expression scores, and a small
local text component (caps, repeated punctuation and whole-word hostile terms).
Confidence below 50% is ignored; the result caps at 100 and is labeled calm,
warm or heated, never a medical condition. Expressions are uncertain visual
cues, not reliable descriptions of someone's feelings.

At 40 or more, Send and Copy queue the message. Camera-based holds unlock after
30 continuous seconds below 40 with fresh confident pulse/breathing, or three
minutes maximum. Heated drafts created without a calibrated camera instead
wait 30 seconds on a timer. Send anyway becomes available after ten seconds,
with confirmation. Edit/delete remain available throughout. Unlock never sends:
the user explicitly opens a prefilled mail draft or copies text. Stopping the
camera keeps messages, without pretending missing data proves cooling.

## Prize Categories

- **Most Creative/Delightful:** correspondence becomes a tangible little weather
  system: steam tied to heat, a live breathing ring and a quiet green unlock.
  The sparkline receipt turns a pause into a small, inspectable moment rather
  than a disappearing countdown. It makes waiting feel like room to choose.
- **Best Thoughtful Real-World Use:** a concrete everyday communication problem,
  with the **Why** breakdown and captured **Held because** making the rules
  inspectable. Camera-free operation, downloadable builds, a staged try-it
  example, bounded holds and confirmed override make it usable without giving
  up control. No account integration, automatic sending or medical claims.

## Consent and Data Handling

**Storage/retention:** drafts, recipient fields, key, baseline and vitals exist
only in app memory. Receipt history is also memory-only: each hold keeps up to
200 heat/rate samples, at most one per elapsed second while held. The API key
is not saved to disk or a keychain. No camera recording, autosave or
message/vital database. The SDK may cache downloaded models; these are not
draft storage. Only an explicitly enabled local counter persists cooled-message
count and total hold seconds, never receipt history.

**Sharing:** frames are processed on-device. SDK authentication/model downloads
contact Presage. No other app web requests or message-to-server calls. Copy
explicitly shares with the OS clipboard; opening mail explicitly shares with
the user's configured mail client. Those applications can retain/sync text.

**Deletion:** Clear/delete removes app-held messages; deleting a cooling card
removes its receipt history. Quitting drops all drafts, readings, receipts and
the entered key. Delete counter removes its totals file. Clipboard history,
mail-client drafts, OS swap/crash collection and SDK/OS caches are outside the
app's deletion controls. Stop releases sensing, not the messages.

**Telemetry:** off by default; the consent screen separately offers SDK
diagnostics. No microphone permission is requested.

**AI use:** built with **Devin, an AI coding agent**. The app itself runs **no
generative AI**, generates no prose, and sends no messages to an AI service.

**Limits:** camera estimates, not medical. HRV needs at least 60 seconds and
positive confidence; it is displayed when available, not used for heat.
Fake-camera readiness is inconclusive. Motion, lighting, facial variation and
speech affect estimates; calibration may not complete. Text rules can misread
context and dialect. Users remain the authority on what they want to say.

## Agent Session

Built with Devin. **Himanshu: add the shareable agent-session link before
publishing**, after reviewing it for secrets and personal information.
