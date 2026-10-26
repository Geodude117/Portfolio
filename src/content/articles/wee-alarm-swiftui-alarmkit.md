---
title: "Wee Alarm: a dog potty-break alarm with AlarmKit and SwiftUI"
description: How Wee Alarm works under the hood — one observable store, schedule maths that respects quiet hours, a real AlarmKit alarm with a notification fallback and a "Let out" button that works without opening the app, and a dog and bladder animated entirely in SwiftUI.
pubDate: 2026-10-26T20:45:00Z
tags: [Swift, SwiftUI, AlarmKit, App Intents, iOS, Testing]
ai: "Made with AI: Wee Alarm was built with Claude, an AI assistant, which wrote the code, tests, artwork scripts and App Store material. This article and its diagrams were also produced with Claude, from the app's source code."
---

[Wee Alarm](/Portfolio/wee-alarm/) solves a very specific problem: you're deep in a game or a work session, the hours slip by, and the dog is sitting by the door with its legs crossed. A kitchen timer doesn't cut it, because it's easy to dismiss and forget to restart. Wee Alarm knows when the dog last went out, works out when they'll next need to go, and rings when it's time.

The constraints shaped every technical decision:

- **It has to actually ring.** A notification is easy to miss with the phone on silent or in a Focus mode. This needed a real alarm.
- **One tap to reset.** When the dog's been out, restarting the timer should take one tap, ideally right from the ringing alarm.
- **No backend and no data collection.** No accounts, no server, no analytics. Everything stays on the phone.
- **Not just another timer.** A friendly, animated design that's fun to glance at.

<div class="shots">
<figure><img src="/Portfolio/images/wee-alarm/01-home.jpg" alt="The home screen for a dog called Biscuit: a cartoon dog's face above a circle a third full of yellow liquid, with 'next wee in 1:56:55', 'Alarm at 21:52' and a large yellow Let out button." width="600" height="1304" loading="lazy" /><figcaption>The countdown, with the bladder slowly filling</figcaption></figure>
<figure><img src="/Portfolio/images/wee-alarm/03-overdue.jpg" alt="The same screen when overdue: the circle is full of yellow liquid, the dog frowns with a sweat drop, the text reads 'WEE TIME! +0:16' and a Snooze 15 min button has appeared." width="600" height="1304" loading="lazy" /><figcaption>Overdue: a full bladder and a worried dog</figcaption></figure>
<figure><img src="/Portfolio/images/wee-alarm/02-alarm.jpg" alt="The alarm ringing as a black banner at the top of the screen reading 'Wee Alarm — Biscuit needs a wee', with a yellow paw-print button and a close button." width="600" height="1304" loading="lazy" /><figcaption>The AlarmKit alarm, with its paw-print Let out button</figcaption></figure>
<figure><img src="/Portfolio/images/wee-alarm/04-letout.jpg" alt="Just after tapping Let out: the bladder has drained, paw prints are bursting out of the circle, the dog has happy closed eyes and its tongue out, and the timer has reset to 3:00:00." width="600" height="1304" loading="lazy" /><figcaption>After Let out: paw prints and a relieved dog</figcaption></figure>
</div>

## Architecture: one store, one alarm

The app is small (about 1,600 lines of Swift), and it's organised around a single idea: **one object owns all the state, and every change to that state reschedules the alarm.**

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 362" role="img" aria-label="Architecture. SwiftUI views call actions on DogStore, an observable main-actor class that is the single source of truth, and redraw from its state. DogStore saves a snapshot to UserDefaults and, after every change, asks the AlarmScheduling protocol to reschedule. AlarmScheduler implements the protocol: its main path is an AlarmKit alarm, with a local notification as a fallback. Tapping Let out on the alarm runs LetOutIntent, and the notification's buttons run NotificationHandler; both call back into DogStore.">
<defs><marker id="w1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="w1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="40" width="190" height="100" rx="10" class="box"/>
<text x="105" y="66" text-anchor="middle" class="t">SwiftUI views</text>
<text x="105" y="88" text-anchor="middle" class="s m">RootView · HomeView</text>
<text x="105" y="106" text-anchor="middle" class="s m">OnboardingView</text>
<text x="105" y="124" text-anchor="middle" class="s m">SettingsView</text>
<rect x="250" y="40" width="190" height="100" rx="10" class="box hi"/>
<text x="345" y="70" text-anchor="middle" class="t">DogStore</text>
<text x="345" y="92" text-anchor="middle" class="s m">@Observable · @MainActor</text>
<text x="345" y="112" text-anchor="middle" class="s">single source of truth</text>
<rect x="490" y="40" width="190" height="64" rx="10" class="box"/>
<text x="585" y="66" text-anchor="middle" class="t">UserDefaults</text>
<text x="585" y="86" text-anchor="middle" class="s">one JSON snapshot</text>
<line x1="200" y1="72" x2="246" y2="72" class="ln hi" marker-end="url(#w1h)"/>
<text x="223" y="64" text-anchor="middle" class="lbl">acts</text>
<line x1="250" y1="110" x2="204" y2="110" class="ln dash" marker-end="url(#w1a)"/>
<text x="227" y="126" text-anchor="middle" class="lbl">state</text>
<line x1="440" y1="72" x2="486" y2="72" class="ln" marker-end="url(#w1a)"/>
<text x="463" y="64" text-anchor="middle" class="lbl">saves</text>
<line x1="345" y1="140" x2="345" y2="166" class="ln hi" marker-end="url(#w1h)"/>
<rect x="270" y="170" width="150" height="34" rx="17" class="box"/>
<text x="345" y="192" text-anchor="middle" class="s m" style="fill:var(--text)">AlarmScheduling</text>
<line x1="345" y1="204" x2="345" y2="226" class="ln hi" marker-end="url(#w1h)"/>
<rect x="250" y="230" width="190" height="50" rx="10" class="box"/>
<text x="345" y="252" text-anchor="middle" class="t">AlarmScheduler</text>
<text x="345" y="270" text-anchor="middle" class="s">reschedule(at:dogName:)</text>
<rect x="150" y="304" width="170" height="50" rx="10" class="box hi"/>
<text x="235" y="326" text-anchor="middle" class="t">AlarmKit alarm</text>
<text x="235" y="344" text-anchor="middle" class="s">rings on silent + Focus</text>
<rect x="370" y="304" width="170" height="50" rx="10" class="box dim"/>
<text x="455" y="326" text-anchor="middle" class="t">Notification</text>
<text x="455" y="344" text-anchor="middle" class="s">fallback</text>
<line x1="300" y1="280" x2="262" y2="300" class="ln hi" marker-end="url(#w1h)"/>
<line x1="390" y1="280" x2="428" y2="300" class="ln dash" marker-end="url(#w1a)"/>
<rect x="10" y="230" width="190" height="50" rx="10" class="box"/>
<text x="105" y="252" text-anchor="middle" class="t">LetOutIntent</text>
<text x="105" y="270" text-anchor="middle" class="s">Let out on the alarm</text>
<path d="M150 329 H105 V284" class="ln" marker-end="url(#w1a)"/>
<text x="20" y="320" class="lbl">button tap</text>
<path d="M200 255 C230 255, 230 132, 246 132" class="ln" marker-end="url(#w1a)"/>
<text x="212" y="208" class="lbl m">letOut()</text>
<rect x="490" y="230" width="190" height="50" rx="10" class="box"/>
<text x="585" y="252" text-anchor="middle" class="t">NotificationHandler</text>
<text x="585" y="270" text-anchor="middle" class="s">Let out · Snooze</text>
<path d="M540 329 H585 V284" class="ln dash" marker-end="url(#w1a)"/>
<path d="M490 255 C460 255, 460 132, 444 132" class="ln" marker-end="url(#w1a)"/>
</svg></div><figcaption><b>Everything goes through <code>DogStore</code>.</b> Views, the alarm's button and the notification's buttons all call the same handful of actions, and every action saves the state and reschedules the alarm. There's no way to change the timer without the alarm following.</figcaption></figure>

`DogStore` is an `@Observable`, `@MainActor` class holding just three pieces of state: the dog's profile, when the dog last went out, and an optional snooze time. Everything else, including when the next wee is due and how full the bladder is, is **derived** from those three values rather than stored:

```swift
@MainActor
@Observable
final class DogStore {
    private(set) var profile: DogProfile? = nil
    private(set) var lastLetOut: Date? = nil
    private(set) var snoozedUntil: Date? = nil

    var nextDue: Date? {
        guard let profile, let lastLetOut else { return nil }
        if let snoozedUntil { return snoozedUntil }
        return WeeSchedule.nextDue(after: lastLetOut,
                                   intervalMinutes: profile.intervalMinutes,
                                   quietHours: profile.quietHoursEnabled ? profile.quietHours : nil)
    }

    func letOut(at now: Date = Date()) {
        guard profile != nil else { return }
        lastLetOut = now
        snoozedUntil = nil
        commit()   // save, then reschedule the alarm
    }
}
```

Every action ends in `commit()`, which saves a snapshot and calls `refreshAlarm()`. Storing so little means there's very little that can drift out of sync: change the interval in Settings and the next due time, the countdown, the bladder level and the alarm all follow automatically.

The store doesn't talk to AlarmKit directly. It talks to a one-method protocol, which is what makes the store testable without a device:

```swift
@MainActor
protocol AlarmScheduling: AnyObject {
    /// Replace any pending alarm with one at `date`. `nil` clears everything.
    func reschedule(at date: Date?, dogName: String)
}
```

The app also calls `refreshAlarm()` whenever it comes back to the foreground, so the alarm on the device is re-synced with the saved state even if something went wrong while the app was closed.

## The schedule maths

### Recommending an interval

Setup asks three things: the dog's name, age and size. From the age and size, the app suggests how often the dog needs to go out, using a simple rule of thumb: puppies every 2 hours, adults every 4, seniors every 3, and small dogs an hour sooner, never less than 1 hour.

```swift
static func intervalMinutes(age: AgeGroup, size: DogSize) -> Int {
    let baseHours: Int
    switch age {
    case .puppy: baseHours = 2
    case .adult: baseHours = 4
    case .senior: baseHours = 3
    }
    let hours = size == .small ? baseHours - 1 : baseHours
    return max(1, hours) * 60
}
```

The suggestion is a starting point that you can adjust in 30-minute steps, and the app is careful never to present it as more than that. Wherever an interval is suggested, it's paired with a note that it's a general guide, not veterinary advice.

### Quiet hours

Nobody wants an alarm at 3am. Quiet hours (23:00 to 07:00 by default) stop that: if the next wee break would land inside them, it's pushed to the moment they end.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 190" role="img" aria-label="Timeline from 18:00 to 08:00. The dog is let out at 20:30 with a 3-hour interval, so the next break would be at 23:30. That's inside quiet hours, which run from 23:00 to 07:00, so the alarm is moved to 07:00, when quiet hours end.">
<defs><marker id="w2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="w2h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="243" y="30" width="326" height="110" rx="8" style="fill:var(--accent-soft)"/>
<text x="406" y="48" text-anchor="middle" class="lbl">quiet hours · 23:00 – 07:00</text>
<line x1="40" y1="120" x2="650" y2="120" class="ln" style="stroke:var(--border)"/>
<g class="lbl m" text-anchor="middle">
<text x="40" y="160">18:00</text><text x="121" y="160">20:00</text><text x="203" y="160">22:00</text><text x="284" y="160">00:00</text><text x="365" y="160">02:00</text><text x="447" y="160">04:00</text><text x="528" y="160">06:00</text><text x="609" y="160">08:00</text>
</g>
<g class="ln" style="stroke:var(--border)">
<line x1="40" y1="116" x2="40" y2="124"/><line x1="121" y1="116" x2="121" y2="124"/><line x1="203" y1="116" x2="203" y2="124"/><line x1="284" y1="116" x2="284" y2="124"/><line x1="365" y1="116" x2="365" y2="124"/><line x1="447" y1="116" x2="447" y2="124"/><line x1="528" y1="116" x2="528" y2="124"/><line x1="609" y1="116" x2="609" y2="124"/>
</g>
<circle cx="142" cy="120" r="7" class="box hi"/>
<text x="142" y="104" text-anchor="middle" class="s" style="fill:var(--text)">let out 20:30</text>
<path d="M150 112 C190 70, 230 70, 260 112" class="ln dash" marker-end="url(#w2a)"/>
<text x="205" y="68" text-anchor="middle" class="lbl">+3 h</text>
<circle cx="264" cy="120" r="6" class="box dim"/>
<text x="290" y="100" class="s fa">23:30 is too late</text>
<path d="M272 128 C380 150, 470 150, 560 128" class="ln hi" marker-end="url(#w2h)"/>
<text x="416" y="182" text-anchor="middle" class="lbl">pushed to the end of quiet hours</text>
<circle cx="569" cy="120" r="7" class="box hi"/>
<text x="569" y="80" text-anchor="middle" class="s acc">alarm 07:00</text>
</svg></div><figcaption><b>Last trip plus the interval, unless that lands in quiet hours.</b> Then the alarm waits until they end.</figcaption></figure>

Quiet hours are stored as minutes since midnight, which keeps the overnight case simple. When the start is later than the end, the window wraps around midnight, so "inside" means *after the start **or** before the end*:

```swift
func contains(_ date: Date, calendar: Calendar = .current) -> Bool {
    guard startMinutes != endMinutes else { return false }
    let parts = calendar.dateComponents([.hour, .minute], from: date)
    let minute = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    if startMinutes < endMinutes {
        return minute >= startMinutes && minute < endMinutes      // e.g. 13:00–15:00
    } else {
        return minute >= startMinutes || minute < endMinutes      // e.g. 23:00–07:00
    }
}
```

Finding when quiet hours end uses `Calendar.nextDate(after:matching:)` rather than adding hours by hand, so it stays correct across midnight and when the clocks change.

### Snoozing

Snooze adds 15 minutes, but with one subtlety: snoozing *early* (before the alarm is due) should push the alarm later, never pull it earlier. So the snooze is measured from whichever is later, now or the current due time:

```swift
func snooze(minutes: Int = 15, now: Date = Date()) {
    guard profile != nil else { return }
    // Snoozing early should push the alarm later, never pull it forward.
    let from = max(now, nextDue ?? now)
    snoozedUntil = from.addingTimeInterval(TimeInterval(minutes * 60))
    commit()
}
```

## A real alarm with AlarmKit

This is the part that makes Wee Alarm more than a timer. **AlarmKit**, introduced in iOS 26, lets third-party apps schedule genuine alarms, the same kind the Clock app uses. They ring through silent mode and Focus modes, and show up prominently on the Lock Screen.

The alarm is configured with a custom secondary button, **Let out**, backed by an App Intent:

```swift
let letOutButton = AlarmButton(text: "Let out", textColor: .black, systemImageName: "pawprint.fill")
let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title),
                                    secondaryButton: letOutButton,
                                    secondaryButtonBehavior: .custom)

let configuration = AlarmManager.AlarmConfiguration<WeeAlarmMetadata>.alarm(
    schedule: .fixed(date),
    attributes: attributes,
    stopIntent: nil,
    secondaryIntent: LetOutIntent(alarmID: id.uuidString),
    sound: .default
)
_ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
```

`LetOutIntent` is what makes the one-tap reset work. It runs **without opening the app**: it stops the ringing alarm, records the trip, and, because recording the trip goes through `DogStore.letOut()`, schedules the next alarm too:

```swift
struct LetOutIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Let the dog out"
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Alarm ID")
    var alarmID: String

    func perform() async throws -> some IntentResult {
        // A custom alarm button doesn't dismiss the alarm by itself, so stop it here.
        if let id = UUID(uuidString: alarmID) {
            try? AlarmManager.shared.stop(id: id)
        }
        await MainActor.run { DogStore.shared.letOut() }
        return .result()
    }
}
```

### Falling back gracefully

AlarmKit needs the user's permission, and people can say no. If alarms are denied, or scheduling throws, the app falls back to a **time-sensitive local notification**, which can still break through some Focus modes, with its own **Let out ✓** and **Snooze 15 min** actions. If neither is allowed, the home screen shows a banner linking straight to the app's settings.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 210" role="img" aria-label="What happens when the alarm is rescheduled: the request waits for any previous scheduling task to finish, cancels the old alarm while keeping any test alarm, and checks the new time is in the future. If not, nothing more happens. If it is, the app schedules an AlarmKit alarm unless alarms have been denied; if alarms are denied or scheduling fails, it schedules a time-sensitive local notification with Let out and Snooze actions instead.">
<defs><marker id="w3a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="w3h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="20" width="150" height="56" rx="10" class="box"/>
<text x="85" y="44" text-anchor="middle" class="t m" style="font-size:13px">reschedule()</text>
<text x="85" y="63" text-anchor="middle" class="s">state changed</text>
<rect x="190" y="20" width="150" height="56" rx="10" class="box"/>
<text x="265" y="44" text-anchor="middle" class="t">Wait in line</text>
<text x="265" y="63" text-anchor="middle" class="s">chained Task</text>
<rect x="370" y="20" width="150" height="56" rx="10" class="box"/>
<text x="445" y="44" text-anchor="middle" class="t">Cancel old alarm</text>
<text x="445" y="63" text-anchor="middle" class="s">keeps a test alarm</text>
<rect x="550" y="20" width="130" height="56" rx="10" class="box dim"/>
<text x="615" y="44" text-anchor="middle" class="t">In the future?</text>
<text x="615" y="63" text-anchor="middle" class="s">no → done</text>
<line x1="160" y1="48" x2="186" y2="48" class="ln hi" marker-end="url(#w3h)"/>
<line x1="340" y1="48" x2="366" y2="48" class="ln hi" marker-end="url(#w3h)"/>
<line x1="520" y1="48" x2="546" y2="48" class="ln hi" marker-end="url(#w3h)"/>
<line x1="615" y1="76" x2="615" y2="116" class="ln hi" marker-end="url(#w3h)"/>
<text x="623" y="100" class="lbl">yes</text>
<rect x="520" y="120" width="160" height="56" rx="10" class="box hi"/>
<text x="600" y="144" text-anchor="middle" class="t">AlarmKit alarm</text>
<text x="600" y="163" text-anchor="middle" class="s">unless denied</text>
<line x1="520" y1="148" x2="474" y2="148" class="ln dash" marker-end="url(#w3a)"/>
<text x="497" y="140" text-anchor="middle" class="lbl">fails</text>
<rect x="250" y="120" width="220" height="56" rx="10" class="box dim"/>
<text x="360" y="144" text-anchor="middle" class="t">Local notification</text>
<text x="360" y="163" text-anchor="middle" class="s">time-sensitive · Let out · Snooze</text>
<text x="600" y="200" text-anchor="middle" class="lbl">rings on silent + Focus</text>
<text x="360" y="200" text-anchor="middle" class="lbl">if alarms are denied or scheduling throws</text>
</svg></div><figcaption><b>Always one alarm, never two.</b> Each reschedule waits for the previous one to finish, then replaces whatever was pending.</figcaption></figure>

Scheduling is asynchronous, and a quick double tap on **Let out** could otherwise start two scheduling tasks that race each other and leave two alarms behind. The scheduler avoids that by chaining each request onto the previous one, so they always run in order:

```swift
func reschedule(at date: Date?, dogName: String) {
    // Chain work so a quick tap-tap can't leave two alarms behind.
    let previous = pending
    pending = Task { [weak self] in
        await previous?.value
        await self?.apply(date: date, dogName: dogName)
    }
}
```

There's also a **test alarm** in Settings that rings in one minute. It's useful for checking the alarm works with the phone on silent, and for App Review. It's tracked separately, so rescheduling the real alarm never cancels a pending test.

## Animation: drawn in SwiftUI, driven by time

There are no image assets for the dog or the bladder. Both are drawn in SwiftUI from circles, ellipses and custom `Shape`s, and both are animated by `TimelineView(.animation)`, which redraws every frame and provides the current time. Each frame is then just a function of time and state.

### A bladder that fills up

The bladder level is how far through the interval you are: 0 just after a trip outside, 1 when the next one is due. The liquid surface is a custom `Shape` that draws a sine wave across the circle:

```swift
struct Wave: Shape {
    var level: Double
    var phase: Double
    var amplitude: Double

    // Let SwiftUI animate the level, so draining after "Let out" is a smooth spring.
    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(level, amplitude) }
        set { level = newValue.first; amplitude = newValue.second }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let baseline = rect.height * (1 - level)
        path.move(to: CGPoint(x: 0, y: rect.height))
        for i in 0...60 {
            let relative = Double(i) / 60
            let y = baseline + sin(relative * 2 * .pi * 1.5 + phase) * amplitude
            path.addLine(to: CGPoint(x: rect.width * relative, y: y))
        }
        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.closeSubpath()
        return path
    }
}
```

Two waves are layered with slightly different speeds to look like real liquid, and bubbles drift up through it. **Urgency drives the motion:** as the level rises, the waves move faster and grow taller, and when the dog is overdue the whole bladder starts to jiggle. Because `level` is part of `animatableData`, tapping **Let out** inside a spring animation makes the liquid visibly drain rather than snap to empty.

### A dog with moods

The dog's mood comes from the same progress value:

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 186" role="img" aria-label="The dog's mood across the interval. From 0 to 75 percent of the interval the dog is happy, with slow ears and blinking. From 75 to 100 percent it is antsy, fidgeting with faster ears. Once overdue it is desperate, doing the potty dance with a sweat drop. Tapping Let out makes it relieved for 3 seconds while the bladder drains.">
<defs><marker id="w4a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>
<path d="M645 66 C645 20, 45 20, 45 66" class="ln dash" marker-end="url(#w4a)"/>
<text x="345" y="22" text-anchor="middle" class="lbl">Let out → relieved for 3 s while the bladder drains</text>
<rect x="40" y="70" width="360" height="34" rx="8" class="box"/>
<text x="220" y="92" text-anchor="middle" class="t m" style="font-size:13px">happy</text>
<rect x="400" y="70" width="120" height="34" rx="8" class="box"/>
<text x="460" y="92" text-anchor="middle" class="t m" style="font-size:13px">antsy</text>
<rect x="520" y="70" width="130" height="34" rx="8" class="box hi"/>
<text x="585" y="92" text-anchor="middle" class="t m acc" style="font-size:13px">desperate</text>
<g class="lbl m">
<text x="40" y="122">0</text><text x="400" y="122" text-anchor="middle">0.75</text><text x="520" y="122" text-anchor="middle">1 · due</text><text x="650" y="122" text-anchor="end">overdue</text>
</g>
<text x="220" y="148" text-anchor="middle" class="s">slow ears, blinks, gentle bob</text>
<text x="460" y="148" text-anchor="middle" class="s">fidgets, faster ears</text>
<text x="585" y="148" text-anchor="middle" class="s">potty dance</text>
<text x="585" y="166" text-anchor="middle" class="s">sweat drop</text>
<text x="220" y="172" text-anchor="middle" class="lbl">progress = time since last trip ÷ interval</text>
</svg></div><figcaption><b>One number drives the whole screen.</b> The same progress value sets the bladder level, the wave speed and the dog's mood.</figcaption></figure>

Each mood is a handful of numbers: how fast and how far the ears swing, the curve of the mouth, how the body bobs. The ears swing with `sin(t * earSpeed) * earWiggle`; when the dog is desperate, it hops with `-abs(sin(t * 7))`, which gives a bouncing potty dance. The mouth is a custom `Smile` shape whose curve is animatable, so it morphs smoothly from a smile to a worried frown as the mood changes rather than switching between pictures.

### The finishing touches

A few small SwiftUI features do a lot of work:

- **`.contentTransition(.numericText(countsDown:))`** makes the countdown digits roll rather than flicker.
- **`.sensoryFeedback(.success, trigger:)`** plays a success haptic when you tap **Let out**, and selection haptics as you change settings.
- **`matchedGeometryEffect`** slides a yellow pill between the options in setup.
- **`PawBurst`** fires 16 paw prints outwards at random angles, distances and spins when the dog is let out, then removes them.
- In setup, the dog **tilts its head** when you type its name and grows or shrinks as you pick a size.

## Private by design

The app collects nothing. The whole state is encoded as a single JSON snapshot in `UserDefaults`:

```swift
private struct Snapshot: Codable {
    var profile: DogProfile?
    var lastLetOut: Date?
    var snoozedUntil: Date?
}
```

There's no network code at all. The app's privacy manifest (`PrivacyInfo.xcprivacy`) declares no tracking and no collected data, and records the one "required reason" API it uses (UserDefaults, for the app's own data). On the App Store, that means the **Data Not Collected** label.

## Testing

The project has 18 tests written with **Swift Testing** (`@Test`, `#expect`), 24 cases once the parameterised one expands. They cover the parts with real logic: the recommendation rules for every age and size, quiet hours (overnight, daytime and turned off), due times that move into the morning, text formatting, and the store's behaviour.

Store tests use a fake scheduler that just records what it was asked to do, so they can check that every action reschedules the alarm without touching AlarmKit:

```swift
private final class FakeScheduler: AlarmScheduling {
    var calls: [(date: Date?, name: String)] = []
    func reschedule(at date: Date?, dogName: String) { calls.append((date, dogName)) }
}

@Test func snoozingEarlyNeverBringsTheAlarmForward() {
    let store = DogStore(defaults: freshDefaults(), scheduler: nil)
    let start = Date()
    store.completeSetup(profile, now: start)            // next wee due in 3 hours
    let originalDue = store.nextDue!
    store.snooze(minutes: 15, now: start.addingTimeInterval(60 * 60))   // snooze after 1 hour
    #expect(store.nextDue == originalDue.addingTimeInterval(15 * 60))
}
```

Each test also gets its own `UserDefaults` suite, so tests never share or leak state. The alarm itself can't be unit tested: AlarmKit needs a real device, so it's checked by hand with the phone silenced and a Focus mode on, using the in-app test alarm.

## Getting ready for the App Store

Shipping needs more than code. The repo includes an App Store submission pack: listing text, keywords chosen to avoid repeating words Apple already indexes from the name, privacy answers, age-rating answers, review notes explaining how to trigger an alarm, and a checklist. The app icon, logo and every set of App Store screenshots are generated by Python scripts in the repo, so they can be regenerated whenever the design changes. The [support page and privacy policy](/Portfolio/wee-alarm/) are hosted on this site.

## What could come next

- **Snooze on the alarm itself.** The AlarmKit alarm offers **Let out** and stop; snooze is only available in the app and on the fallback notification. AlarmKit's countdown support looks like the natural way to add it.
- **Keep the bladder full while snoozed.** Progress is measured from the last trip to the *current* due time, so snoozing an overdue alarm moves the finish line and the bladder drops back slightly. Measuring against the original due time would keep it full.
- **Structured logging.** The scheduler logs with `print`; Apple's `Logger` would make those messages filterable in Console and cheaper in release builds.
- **More than one dog.** The model holds a single profile; multiple dogs would mean a list of profiles, each with its own alarm.

You can find out more on the [Wee Alarm page](/Portfolio/wee-alarm/), or browse the [source on GitHub](https://github.com/Geodude117/Wee-Alarm).
