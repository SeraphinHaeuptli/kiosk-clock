# Play Console — content rating questionnaire (IARC)

Answers for **Kiosk** (`com.kioskclock.app`).

Play Console → App content → Content ratings. One questionnaire, administered
by the International Age Rating Coalition, produces ratings for every board at
once — ESRB, PEGI, USK, ClassInd, GRAC, ACB and the IARC generic rating used
where no local board applies.

Kiosk is a clock. Almost every answer is "no", and the interesting part is the
handful that are not, plus the reasoning for the two that people commonly get
wrong for an app like this (location, and purchases).

**Answer honestly.** A misdeclared questionnaire is grounds for the rating
being invalidated and the app removed, and unlike the Data safety form there
is nothing here worth shading — the honest answers already produce the lowest
rating in every territory.

---

## 0. Before the questions

**Email address for the IARC certificate:** `[YOUR CONTACT EMAIL]`

This is where the rating certificates and any rating-authority correspondence
go. It is not shown publicly on the listing.

**Questionnaire category:** choose the **app** questionnaire, not the game
one, and within it the category for a **utility / productivity / tool** (the
wording is usually along the lines of *"Utility, Productivity, Communication
or Other"*). Kiosk is a clock; it is not a game, not social, not a news or
reference app, not education, not entertainment/media playback.

Matching Play store category: **Tools** (with **Personalisation** as the
defensible alternative, given that what the app mostly sells is a look).

---

## 1. Violence

| Question area | Answer |
|---|---|
| Realistic or cartoon violence, of any kind | **No** |
| Depictions of injury, blood, gore, mutilation | **No** |
| Violence toward humans, animals or characters | **No** |
| Depictions of death | **No** |
| Torture, or acts of violence against a defenceless person | **No** |
| Sexual violence | **No** |
| Glamorisation or encouragement of violence | **No** |

Justification: the app draws digits. There are eight clock faces (plain
digits, ASCII character art, a stacked pair, an analogue dial, words, a
split-flap board, an LED matrix and concentric dot rings) and eight backdrops
(black, a horizon glow, stars, a dither field, a Perlin-noise character field,
a ground grid, CRT scanlines and falling glyph columns). No figures, no
characters, no narrative, no imagery of any kind beyond typography and
abstract fields.

## 2. Sexuality and nudity

| Question area | Answer |
|---|---|
| Nudity, partial nudity, or suggestive imagery | **No** |
| Sexual behaviour, references or innuendo | **No** |
| Sexual content of any degree | **No** |
| Prostitution, or sexual exploitation | **No** |

Justification: as above — there is no representational imagery in the app at
all.

## 3. Language

| Question area | Answer |
|---|---|
| Profanity or crude language | **No** |
| Sexual or crude humour | **No** |
| Discriminatory language, or content promoting hatred or discrimination toward a group | **No** |

Justification: every string in the app is functional interface text. The
strongest word anywhere in it is the watermark banner
`UNLICENSED · FOUNDER PACK`. Two settings labels use the terms "phosphor" and
"burn-in". Users can type their own short labels for a second time zone, a
countdown and a preset name — those are stored on the device, shown only on
that device's own screen, and never transmitted or shared with anyone, so they
are not user-generated content in the sense this questionnaire means.

## 4. Controlled substances

| Question area | Answer |
|---|---|
| Use or reference to illegal drugs | **No** |
| Use or reference to alcohol or tobacco | **No** |
| Facilitating the sale or purchase of any controlled substance | **No** |

## 5. Gambling

| Question area | Answer |
|---|---|
| Real-money gambling, betting or wagering | **No** |
| Simulated gambling (casino-style play with no real money) | **No** |
| Loot boxes or randomised paid rewards | **No** |

Justification worth stating, because one feature sounds adjacent and is not:
**shuffle** rotates which face and backdrop are shown every quarter hour, hour
or day. It is derived deterministically from the settings and the clock (see
`src/clock/shuffle.ts`), it changes only which of the *already-unlocked* looks
is drawn, no money or currency is involved at any point, and there is nothing
to win or lose. It is a screensaver rotation, not a randomised reward.

Likewise the Founder pack is a single fixed-price purchase of a known,
fully-listed set of content. Nothing about it is randomised.

## 6. Miscellaneous / other content

| Question area | Answer |
|---|---|
| Content likely to frighten or disturb young children | **No** |
| Horror or shock content | **No** |
| Depictions of, or instruction in, criminal activity | **No** |
| Content encouraging self-harm, dangerous behaviour or extremism | **No** |
| Hateful, harassing or bullying content | **No** |
| Political, religious or otherwise sensitive content | **No** |
| Depictions of real-world tragedy | **No** |

## 7. Interactive elements and app behaviours

This is the section that matters for Kiosk, and the one where the questions
need reading carefully — several of them ask about sharing *with other users*,
which is not the same as making a network request.

| Question | Answer | Justification |
|---|---|---|
| Do users interact, communicate or exchange content with each other? | **No** | The app is single-device. There is no messaging, no comments, no accounts, no multiplayer, no server, and no way for one installation to reach another. |
| Does the app allow users to share content with people outside the app? | **No** | There is no share sheet, no export, no upload. |
| Does the app share the user's **current location** with other users? | **No** | Read this one carefully. The user may *type* a place name, which is sent to a geocoder and a weather service so a forecast can be drawn in the corner of the screen. It is not the device's GPS position — the app holds no location permission and never asks Android where it is — and it is never displayed or transmitted to any other person. This question is about person-to-person location sharing, which the app has no mechanism for. **Answer no.** Declare the location handling on the Data safety form instead, where it belongs — see `docs/data-safety.md`. |
| Does the app collect or share personal information with third parties? | **See note** | Some versions of the questionnaire ask this. The truthful answer is that the app transmits a user-typed place name to two public services (MET Norway and OpenStreetMap Nominatim) and nothing else, and collects nothing for the developer. If the question offers only yes/no with no room for that, answer in the direction the Data safety form does (yes, location, to third parties) rather than contradicting it — the two declarations must not disagree. This does not raise the age rating in any territory. |
| Does the app offer the purchase of **digital goods**? | **Yes**, once billing is real — **No** today | See the note below. |
| Does the app offer purchase of physical goods or services? | **No** | |
| Does the app contain advertising? | **No** | No ad SDK, no promotional content, no cross-promotion. |
| Does the app provide **unrestricted access to the internet** (a browser, or arbitrary web content)? | **No** | There is no WebView and no browser. The app makes exactly three kinds of HTTP request, each to a fixed shape of JSON that it parses into typed fields; the response is never rendered as content. A user-supplied now-playing URL is the one address the app does not control, and its response is capped at 64 KB, parsed as JSON, and reduced to a title and an artist string. That is not internet access in the sense this question means. |
| Does the app contain user-generated content shared with others? | **No** | The only free text is the weather place, a now-playing URL and three short labels, all on-device and visible only to the person who typed them. |
| Does the app contain a social network or user profiles? | **No** | |
| Does the app include news, or user-submitted news? | **No** | |
| Does the app request or display a user's contacts? | **No** | |

### The digital-purchase answer

**Today, from `main`: No.** `src/billing/index.ts` sets
`activeBilling = testBilling`, which writes a flag to local storage and
charges nothing. There is no purchase to declare.

**In the released app: Yes.** Once `activeBilling` is switched to
`playBilling` and the managed product `founder_lifetime` is live in Play
Console, the app offers one non-consumable in-app purchase. Answer yes.

This adds a descriptor — ESRB's *In-App Purchases* interactive element, PEGI's
*In-Game Purchases* content descriptor and their equivalents — but it does
**not** raise the age band in any territory. Note also that a change from "no
purchases" to "purchases" is a change of answer that requires re-taking the
questionnaire, so if you submit a first build without billing you will retake
it later. It is cleaner to finish the billing work before the first submission
and answer yes once.

## 8. Territory-specific follow-ups

Some boards add their own questions after the main set — Brazil's ClassInd and
Korea's GRAC in particular. Every one of them is on the same subject matter
covered above (violence, sex, drugs, gambling, discrimination, criminal
activity) and every answer is **no** for the same reasons.

---

## Expected result

With the answers above, Kiosk should receive the lowest rating each board
offers, with an in-app-purchase descriptor once billing is live:

| Board | Territory | Expected rating |
|---|---|---|
| ESRB | US, Canada, Mexico | **Everyone** (interactive element: *In-App Purchases*, once billing is live) |
| PEGI | Europe | **PEGI 3** (descriptor: *In-Game Purchases*, once billing is live) |
| USK | Germany | **USK 0** — freigegeben ohne Altersbeschränkung |
| ClassInd | Brazil | **L** — Livre (suitable for all audiences) |
| GRAC | South Korea | **All** (전체이용가) |
| ACB | Australia | **G** — General |
| IARC generic | everywhere else, including the UK on Play | **3+** — shown on the listing as "Rated for 3+" |

A few things follow from that which are worth knowing before you submit:

- **A 3+ rating does not make this a children's app.** The rating describes
  content; the *Target audience and content* declaration, elsewhere on the App
  content page, is what determines whether the Families policy applies. Answer
  that one with an adult age band and do not opt into the Families programme —
  see `docs/data-safety.md`. A 3+ content rating and an adults-only target
  audience are a normal, consistent pair for a utility.
- **The rating is generated immediately** on submitting the questionnaire, and
  applies to every territory at once. There is no waiting on a human.
- **Re-take it whenever the answers change** — the obvious trigger here is
  switching billing on. Play requires the questionnaire to be re-submitted
  when the app's content or behaviour changes materially, and an out-of-date
  rating can get the listing removed.

## What I could and could not verify

- **Verified from primary sources:** everything asserted about the app itself,
  read from this repository — the faces and backdrops, the shuffle mechanism
  in `src/clock/shuffle.ts`, the free-text fields in `src/clock/settings.ts`
  and `src/clock/presets.ts`, the absence of any WebView or browser, the
  three network destinations, and the billing state in `src/billing/index.ts`.
  IARC's own published rating definitions were also reachable.
- **Could not verify from a primary source:** the exact current wording and
  ordering of the questionnaire's individual questions, because
  `support.google.com` and `play.google.com` are blocked from this
  environment. The question areas above are grouped as IARC's published
  category structure and as consistently reported by secondary sources, but
  **the live questionnaire may word a question differently or add one**. Read
  each question as it appears rather than pattern-matching it to this table —
  particularly the location and personal-information questions in section 7,
  where the difference between "shares location with other users" and "sends a
  place name to a weather service" is the whole answer.
