---
title: "Salvo Sums: a maths-powered sea battle in SwiftUI"
description: How Salvo Sums works under the hood — a pure-Swift game engine package, a question generator that builds wrong answers from real student mistakes, an opponent that has to earn its shots, seeded randomness, and the tests and tooling that got it ready for the App Store.
pubDate: 2026-10-26T16:00:00Z
tags: [Swift, SwiftUI, Game logic, Testing, iOS]
ai: "Made with AI: Salvo Sums was designed and built with Claude, an AI assistant, which wrote the code, tests, icon and App Store material with me. This article and its diagrams were also produced with Claude, from the app's source code."
---

[Salvo Sums](/Portfolio/salvo-sums/) is a Battleships-style game for iPhone and iPad with one twist: you can't fire until you've earned your ammo, and the only way to load your guns is to answer a GCSE maths question correctly. Get it right and you fire. Get it wrong and you lose your turn, but you see a short worked explanation of where it went wrong.

It started as a question about what a learning game should look like in Xcode, and grew into a full app over an afternoon. The constraints were deliberate:

- **Learning first.** The game is the reward; the maths is the point. Every wrong answer has to teach something.
- **Offline, no backend.** No accounts, no server, no analytics. Everything runs on the device.
- **Testable.** The game logic has to be testable without a simulator, and the whole game has to be playable by an automated test.

<div class="shots">
<figure><img src="/Portfolio/images/salvo-sums/1-battle.jpg" alt="A battle in progress: a status bar showing 3 ammo, a streak of 5, 4 of 5 enemy ships left and all 5 of your ships; an orange prompt to tap enemy waters to fire; a purple panel with Airstrike and Sonar buttons; and the enemy grid with misses, a hit, a sunk ship and a sonar reading of 2." width="600" height="1304" loading="lazy" /><figcaption>A battle in progress, with a special weapon ready</figcaption></figure>
<figure><img src="/Portfolio/images/salvo-sums/2-question.jpg" alt="A question sheet: Linear equations, Foundation, 1 shot. Solve 3x + 9 = 42, with four answers: x = 14, x = 11, x = 33 and x = 17." width="600" height="1304" loading="lazy" /><figcaption>Answer a question to load your guns</figcaption></figure>
<figure><img src="/Portfolio/images/salvo-sums/3-explanation.jpg" alt="The same question after answering x = 11 correctly: Correct! +2 ammo, including a +1 streak bonus for 3 in a row, and the working: subtract 9 from both sides to get 3x = 33, then divide both sides by 3 to get x = 11." width="600" height="1304" loading="lazy" /><figcaption>Every answer comes with the working</figcaption></figure>
<figure><img src="/Portfolio/images/salvo-sums/4-placement.jpg" alt="The placement screen: a row of ship buttons for the Carrier, Battleship, Cruiser and Submarine, each ticked; Horizontal, Random fleet and Clear buttons; the player's grid with five grey ships placed; and a Start battle button." width="600" height="1304" loading="lazy" /><figcaption>Place your fleet, then start the battle</figcaption></figure>
</div>

## Architecture: a game engine package and a thin app

The most important decision came first: **all the game logic lives in a local Swift package, `BattleEngine`, that doesn't import SwiftUI or UIKit.** The board, the ammo rules, the question generators and the computer opponent are plain value types. The app target is a thin SwiftUI layer on top.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 300" role="img" aria-label="Architecture. In the app target, SwiftUI views call methods such as fire and answer on GameViewModel, an Observable, MainActor class, and redraw from its observed state. GameViewModel's last shot triggers sounds and haptics. GameViewModel uses the BattleEngine package, which is pure Swift with no UI imports and contains Board, AmmoLedger, QuestionBank, AIStrategy and SeededGenerator.">
<defs><marker id="s1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="s1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<text x="10" y="20" class="lbl">APP TARGET · SWIFTUI</text>
<rect x="10" y="32" width="200" height="84" rx="10" class="box"/>
<text x="110" y="60" text-anchor="middle" class="t">Views</text>
<text x="110" y="80" text-anchor="middle" class="s m">GameView · BoardView</text>
<text x="110" y="98" text-anchor="middle" class="s m">QuestionSheet · Placement</text>
<rect x="245" y="32" width="200" height="84" rx="10" class="box hi"/>
<text x="345" y="60" text-anchor="middle" class="t">GameViewModel</text>
<text x="345" y="80" text-anchor="middle" class="s m">@Observable @MainActor</text>
<text x="345" y="98" text-anchor="middle" class="s">phase · boards · ledger</text>
<rect x="480" y="32" width="200" height="84" rx="10" class="box"/>
<text x="580" y="60" text-anchor="middle" class="t">Feedback</text>
<text x="580" y="80" text-anchor="middle" class="s m">SoundPlayer</text>
<text x="580" y="98" text-anchor="middle" class="s m">.sensoryFeedback</text>
<line x1="210" y1="60" x2="241" y2="60" class="ln hi" marker-end="url(#s1h)"/>
<line x1="245" y1="92" x2="214" y2="92" class="ln dash" marker-end="url(#s1a)"/>
<text x="228" y="52" text-anchor="middle" class="lbl">calls</text>
<text x="228" y="108" text-anchor="middle" class="lbl">state</text>
<line x1="445" y1="74" x2="476" y2="74" class="ln" marker-end="url(#s1a)"/>
<text x="462" y="66" text-anchor="middle" class="lbl">lastShot</text>
<line x1="345" y1="116" x2="345" y2="166" class="ln hi" marker-end="url(#s1h)"/>
<text x="353" y="146" class="lbl">uses</text>
<rect x="10" y="170" width="670" height="118" rx="12" class="box dim"/>
<text x="22" y="190" class="lbl">BATTLEENGINE · LOCAL SWIFT PACKAGE · NO UI IMPORTS</text>
<rect x="22" y="202" width="122" height="72" rx="9" class="box"/>
<text x="83" y="228" text-anchor="middle" class="t">Board</text>
<text x="83" y="247" text-anchor="middle" class="s">ships · shots</text>
<text x="83" y="263" text-anchor="middle" class="s">sonar</text>
<rect x="152" y="202" width="122" height="72" rx="9" class="box"/>
<text x="213" y="228" text-anchor="middle" class="t">AmmoLedger</text>
<text x="213" y="247" text-anchor="middle" class="s">ammo · streak</text>
<text x="213" y="263" text-anchor="middle" class="s">specials</text>
<rect x="282" y="202" width="122" height="72" rx="9" class="box hi"/>
<text x="343" y="228" text-anchor="middle" class="t">QuestionBank</text>
<text x="343" y="247" text-anchor="middle" class="s">8 generators</text>
<text x="343" y="263" text-anchor="middle" class="s">GCSE topics</text>
<rect x="412" y="202" width="122" height="72" rx="9" class="box"/>
<text x="473" y="228" text-anchor="middle" class="t">AIStrategy</text>
<text x="473" y="247" text-anchor="middle" class="s">random</text>
<text x="473" y="263" text-anchor="middle" class="s">hunt / target</text>
<rect x="542" y="202" width="126" height="72" rx="9" class="box"/>
<text x="605" y="228" text-anchor="middle" class="t">SeededGenerator</text>
<text x="605" y="247" text-anchor="middle" class="s">SplitMix64</text>
<text x="605" y="263" text-anchor="middle" class="s">repeatable games</text>
</svg></div><figcaption>The app is a thin SwiftUI layer; everything that decides <b>what happens</b> is in the engine package.</figcaption></figure>

This pays off in three ways:

- **Tests run in seconds.** Engine tests don't need a simulator or a running app. You can run them from Terminal with `swift test`.
- **The rules can't depend on the UI.** There's no way for a view to sneak game logic in, because the engine can't see the views.
- **The UI could change completely** (a new design, a watchOS version, a web port) without touching the rules.

The app side has one view model, `GameViewModel`, marked `@Observable` and `@MainActor`. Views call methods like `fire(at:)` and `answer(_:)`, and SwiftUI redraws whatever reads the properties that changed. Sounds and haptics hang off a `lastShot` event rather than being called from the game logic, so the view model never needs to know about audio.

## The turn loop

A game moves through a small set of phases: placing your fleet, your turn, the enemy's turn, and won or lost. Your turn has two halves. With no ammo you answer a question. With ammo you fire until it runs out.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 300" role="img" aria-label="Turn loop. Placing leads to Player turn when you start the battle. With no ammo, Player turn opens a Question. A correct answer leads to Firing; a wrong answer goes straight to Enemy turn. Firing leads to Won if the enemy fleet is sunk, otherwise to Enemy turn when ammo runs out. Enemy turn leads to Lost if your fleet is sunk, otherwise back to Player turn after a short pause.">
<defs><marker id="s2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="s2h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="95" width="100" height="56" rx="10" class="box"/>
<text x="60" y="128" text-anchor="middle" class="t">Placing</text>
<rect x="150" y="95" width="120" height="56" rx="10" class="box hi"/>
<text x="210" y="128" text-anchor="middle" class="t">Player turn</text>
<rect x="310" y="15" width="120" height="56" rx="10" class="box"/>
<text x="370" y="48" text-anchor="middle" class="t">Question</text>
<rect x="310" y="150" width="120" height="56" rx="10" class="box"/>
<text x="370" y="183" text-anchor="middle" class="t">Firing</text>
<rect x="310" y="236" width="120" height="44" rx="10" class="box dim"/>
<text x="370" y="263" text-anchor="middle" class="t">Won</text>
<rect x="470" y="95" width="120" height="56" rx="10" class="box"/>
<text x="530" y="128" text-anchor="middle" class="t">Enemy turn</text>
<rect x="612" y="101" width="70" height="44" rx="10" class="box dim"/>
<text x="647" y="128" text-anchor="middle" class="t">Lost</text>
<line x1="110" y1="123" x2="146" y2="123" class="ln hi" marker-end="url(#s2h)"/>
<text x="128" y="115" text-anchor="middle" class="lbl">start</text>
<path d="M210 95 V43 H306" class="ln hi" marker-end="url(#s2h)"/>
<text x="218" y="36" class="lbl">no ammo</text>
<line x1="370" y1="71" x2="370" y2="146" class="ln hi" marker-end="url(#s2h)"/>
<text x="378" y="112" class="lbl">correct · +shots</text>
<path d="M430 43 H530 V91" class="ln" marker-end="url(#s2a)"/>
<text x="480" y="36" text-anchor="middle" class="lbl">wrong</text>
<path d="M430 178 H500 V155" class="ln" marker-end="url(#s2a)"/>
<text x="436" y="196" class="lbl">ammo runs out</text>
<line x1="370" y1="206" x2="370" y2="232" class="ln" marker-end="url(#s2a)"/>
<text x="378" y="224" class="lbl">fleet sunk</text>
<line x1="590" y1="123" x2="608" y2="123" class="ln" marker-end="url(#s2a)"/>
<path d="M560 151 V292 H210 V155" class="ln dash" marker-end="url(#s2a)"/>
<text x="460" y="285" text-anchor="middle" class="lbl">enemy done · after a 0.9s pause</text>
</svg></div><figcaption>Your turn alternates between answering and firing. A wrong answer hands the turn straight to the enemy.</figcaption></figure>

The phase is a plain enum, and every action checks it before doing anything:

```swift
enum Phase: Equatable {
    case placing, playerTurn, enemyTurn, won, lost
}

var canFire: Bool { phase == .playerTurn && ledger.ammo > 0 && armedWeapon == nil }
var canAsk: Bool { phase == .playerTurn && ledger.ammo == 0 && question == nil && armedWeapon == nil }
```

The enemy's turn runs after a short pause so you can see what happened, using a `Task` and `Task.sleep`. That pause caused a real bug: if you started a new game while the enemy was "thinking", its shot still landed, but in the new game. The fix is a game ID that bumps on every new game, captured when the turn is scheduled and checked when it runs:

```swift
private func startEnemyTurn() {
    phase = .enemyTurn
    let scheduledFor = gameID
    Task {
        try? await Task.sleep(for: .milliseconds(900))
        enemyTakesTurn(in: scheduledFor)
    }
}

private func enemyTakesTurn(in game: Int) {
    guard game == gameID, phase == .enemyTurn else { return }
    // ...
}
```

It's the same idea as a cancellation token, without having to keep hold of the `Task`.

## Earning ammo

The reward rules live in `AmmoLedger`, a small struct with no dependencies:

```swift
public mutating func recordAnswer(correct: Bool, tier: Tier) -> Int {
    guard correct else {
        streak = 0
        return 0
    }
    streak += 1
    var earned = tier == .higher ? 2 : 1
    if streak.isMultiple(of: 3) { earned += 1 }
    if streak.isMultiple(of: Self.streakForSpecial) { specialCharges += 1 }
    ammo += earned
    return earned
}
```

Foundation questions earn one shot and Higher questions earn two. Every third correct answer in a row adds a bonus shot, and every fifth unlocks a special weapon: an **Airstrike** that hits a plus shape of five squares, or **Sonar**, which counts the hidden ship sections in a 3 × 3 area without firing.

Because the rules are isolated, they're also easy to test exhaustively. Testing also caught a confusing moment in the UI: a "Foundation · 1 shot" question that paid out two shots. The maths was right, because it was the third in a row, but the screen didn't say so. The feedback now spells out the streak bonus.

## Generating questions instead of storing them

The obvious approach is a bank of written questions. It's quick to start, but it runs out, it repeats, and someone has to check every answer by hand. Salvo Sums **generates** every question instead. Each topic is a function that picks numbers, computes the answer, and builds the wrong options from the mistakes students really make.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 190" role="img" aria-label="How a fractions question is built. Step 1, random values from the seeded generator: 1/3 + 1/4. Step 2, compute the answer and simplify it: 7/12. Step 3, wrong answers from misconceptions: adding tops and bottoms gives 2/7, forgetting to scale the tops gives 1/6, multiplying the tops gives 1/12. Step 4, remove duplicates and shuffle, giving four unique options with the working attached.">
<defs><marker id="s3h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="20" width="150" height="110" rx="10" class="box"/>
<text x="85" y="46" text-anchor="middle" class="t">1 · Pick values</text>
<text x="85" y="68" text-anchor="middle" class="s">seeded random</text>
<text x="85" y="104" text-anchor="middle" class="acc m">1/3 + 1/4</text>
<rect x="185" y="20" width="150" height="110" rx="10" class="box"/>
<text x="260" y="46" text-anchor="middle" class="t">2 · Compute</text>
<text x="260" y="68" text-anchor="middle" class="s">answer, simplified</text>
<text x="260" y="104" text-anchor="middle" class="acc m">7/12</text>
<rect x="360" y="20" width="150" height="110" rx="10" class="box hi"/>
<text x="435" y="46" text-anchor="middle" class="t">3 · Mistakes</text>
<text x="435" y="70" text-anchor="middle" class="s m">2/7 tops+bottoms</text>
<text x="435" y="90" text-anchor="middle" class="s m">1/6 tops not scaled</text>
<text x="435" y="110" text-anchor="middle" class="s m">1/12 × the tops</text>
<rect x="535" y="20" width="145" height="110" rx="10" class="box"/>
<text x="607" y="46" text-anchor="middle" class="t">4 · Finish</text>
<text x="607" y="70" text-anchor="middle" class="s">drop duplicates</text>
<text x="607" y="90" text-anchor="middle" class="s">shuffle 4 options</text>
<text x="607" y="110" text-anchor="middle" class="s">attach working</text>
<line x1="160" y1="75" x2="181" y2="75" class="ln hi" marker-end="url(#s3h)"/>
<line x1="335" y1="75" x2="356" y2="75" class="ln hi" marker-end="url(#s3h)"/>
<line x1="510" y1="75" x2="531" y2="75" class="ln hi" marker-end="url(#s3h)"/>
<text x="345" y="168" text-anchor="middle" class="lbl">Every topic follows the same four steps; only the maths and the mistakes change.</text>
</svg></div><figcaption>A fractions question being built. The wrong answers aren't random numbers: each one is a specific, common mistake.</figcaption></figure>

The fractions generator shows the pattern:

```swift
static func fractions<G: RandomNumberGenerator>(_ rng: inout G) -> Question {
    let b = Int.random(in: 2...9, using: &rng)
    var d = Int.random(in: 2...9, using: &rng)
    while d == b { d = Int.random(in: 2...9, using: &rng) }
    let a = Int.random(in: 1..<b, using: &rng)
    let c = Int.random(in: 1..<d, using: &rng)
    let top = a * d + c * b
    let bottom = b * d
    let answer = Maths.fraction(top, bottom)

    return .build(
        topic: .fractions,
        prompt: "Work out \(a)/\(b) + \(c)/\(d)",
        answer: answer,
        candidates: [
            Maths.fraction(a + c, b + d),   // added tops and bottoms
            Maths.fraction(a + c, bottom),  // right bottom, forgot to scale the tops
            Maths.fraction(a * c, bottom),  // multiplied instead of adding
            // ...more fallbacks
        ],
        explanation: "Use a common denominator of \(bottom): ...",
        using: &rng
    )
}
```

`Question.build` takes the first three candidates that differ from the answer and from each other, shuffles them in with the answer, and records where the correct one landed. Each topic has its own list of mistakes:

<div class="table-wrap">

| Topic | Example | Wrong answers come from |
| --- | --- | --- |
| Fractions | 1/3 + 1/4 | Adding tops and bottoms, forgetting to scale the tops |
| Percentages | Increase £80 by 15% | Adding 15 instead of 15%, finding only the 15% |
| Ratio | Share £60 in the ratio 2:3 | Giving the smaller share, splitting in half |
| Linear equations | 3x + 9 = 42 | Forgetting to divide, a sign error |
| Area | Triangle, base 8, height 5 | Forgetting to halve, adding the sides |
| Probability | P(not red) | Giving P(red), using the wrong total |
| Expanding brackets | (x + 3)(x − 2) | Missing the middle term, a sign error |
| Pythagoras | Sides 6 and 8 | Adding the sides, forgetting the square root |

</div>

### Checking every possible question

Generated questions have a risk that a fixed bank doesn't: an unlucky combination of numbers could make two "different" wrong answers come out the same, leaving a question with only three options. Because the input ranges are small, it's possible to check **every** combination rather than sampling some.

Running every possible input through the generators found three real gaps. A triangle with base 2 and height 2 has an area of 2, and three of its wrong answers all came out as 4. One bag of counters and one bracket expansion had the same problem. Adding one or two extra candidates fixed all three.

A code review found a subtler problem. One probability distractor divided red counters by non-red ones, and in about 1 bag in 11 that gave a "probability" bigger than 1. Any student who knows a probability can't exceed 1 could rule it out without doing the question. It was replaced with a plausible wrong answer. Now a unit test sweeps 1,000 seeded questions per topic on every run:

```swift
@Test(arguments: Topic.allCases)
func everyQuestionHasFourDistinctOptionsAndOneCorrectAnswer(topic: Topic) {
    var rng = SeededGenerator(seed: 2026)
    for _ in 0..<1_000 {
        let question = QuestionBank.make(topic, using: &rng)
        #expect(question.options.count == 4)
        #expect(Set(question.options).count == 4)
        #expect(!question.options.contains("None of these"))
    }
}
```

## An opponent that has to earn its shots

If the computer fired every turn while you had to answer questions, it would win almost every game. So the computer "answers" too: on each turn it rolls against an accuracy that depends on the difficulty, and only fires if it passes.

<div class="table-wrap">

| Difficulty | Answers correctly | Targeting |
| --- | --- | --- |
| Easy | 60% | Random squares it hasn't tried |
| Medium | 75% | Hunt and target |
| Hard | 90% | Hunt and target |

</div>

**Hunt and target** is the classic Battleships strategy. While hunting, it only fires at squares where the row plus the column is even, a checkerboard. The smallest ship is two squares long, so every ship must cover at least one of those squares, and it finds them in half the shots. Once it has a hit, it switches to targeting the squares next to it. If two hits are already in a line, it prefers the squares that extend that line:

```swift
let wounded = Set(Coordinate.all.filter { board.state(at: $0) == .hit })
let targets = open.filter { cell in cell.neighbours.contains { wounded.contains($0) } }

if !targets.isEmpty {
    // Prefer cells that extend a line of two or more hits.
    let inLine = targets.filter { cell in
        cell.neighbours.contains { hit in
            wounded.contains(hit)
                && wounded.contains(Coordinate(column: 2 * hit.column - cell.column,
                                               row: 2 * hit.row - cell.row))
        }
    }
    return (inLine.isEmpty ? targets : inLine).randomElement(using: &rng)
}
```

The `2 * hit - cell` trick reflects the candidate square through the hit next to it. If the square on the far side is also a hit, the candidate continues the line.

Notice that `wounded` only includes hits on ships that **aren't sunk yet**. The strategy never looks at where your ships are, only at what a human player could see: hits, misses and announced sinkings. That keeps it honest, and it means the AI has no state of its own to get out of sync. It works out its next shot from the board every time. A test plays 200 seeded games with each strategy and checks that hunt and target needs fewer shots on average than random.

## Seeded randomness

Everything random (fleet placement, questions, AI decisions) takes a generator as an `inout` parameter instead of calling the system's random source directly. The app uses a tiny SplitMix64 generator:

```swift
public struct SeededGenerator: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) { state = seed }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
```

The same seed always gives the same game, which makes tests repeatable and bugs reproducible. The original plan used GameplayKit's seeded source, but a dozen lines of Swift removes the dependency and keeps the engine buildable anywhere Swift runs.

## Testing

There are 25 engine tests, written with **Swift Testing**, and 5 UI tests, written with **XCTest**, that drive the real app in the simulator.

The engine tests cover placement, firing and sinking, the ammo and streak rules, special weapons, the AI and the question sweep. Two lessons came out of getting them running:

- **Xcode hides a local package's tests inside an app project.** The package's own scheme showed "No Tests", so ⌘U was quietly running nothing but the UI tests. The fix was a separate test target in the Xcode project that compiles the package's test folder, so the same tests run from both ⌘U and `swift test`.
- **`#expect` can't call mutating methods.** Swift Testing's macro captures the expression, so `#expect(board.fire(at: c) == .hit)` doesn't compile. Store the result first, then check it.

The UI tests play the game for real. One places a fleet by hand, picks a ship up and puts it back vertically, then starts the battle. Another plays six full rounds: it answers a question, fires every shot it earned, waits for the enemy and checks that control comes back. Each grid square has an accessibility identifier (`enemy-B4`, `player-J1`), so the tests can tap exact squares. The same work makes the board usable with VoiceOver, which reads out "B4, Hit" rather than just "B4".

## Getting ready for the App Store

A few pieces of tooling made the release side much less manual:

- **Screenshots are generated by a test.** A launch argument (`-screenshots battle`, debug builds only) sets up a realistic mid-game position with a seeded game. A UI test then visits four screens and writes each PNG straight into the repo, finding the folder from its own source path with `#filePath`. Running it on the iPhone 16 Pro Max and iPad Pro 13-inch simulators gives exactly the 1320 × 2868 and 2064 × 2752 sizes App Store Connect asks for. Looking at the screenshots also caught two problems the tests had missed: ship names cut off on the placement screen, and a bonus shot the screen didn't explain.
- **Privacy is declared, not just promised.** The app collects nothing, and a privacy manifest says so. It declares the one "required reason" API the app uses, `UserDefaults` for the sound setting, and the [privacy policy](/Portfolio/salvo-sums/privacy/) lives on this site.
- **Sound effects are public domain.** Eleven CC0 sounds from Kenney were trimmed and converted to AAC, about 130 KB in total. They play through an "ambient" audio session, so they respect the silent switch and don't stop your music.
- **The name avoids a trademark.** "Battleship" is a Hasbro trademark, so the working title, BattleMaths, became Salvo Sums: a salvo is a burst of shots, which is exactly what correct answers earn.

## What I'd change next

- **Adaptive questions.** Save how well the player does in each topic with SwiftData, and serve more questions from their weakest topics. That's the biggest win for the learning side.
- **Proper maths typesetting.** Fractions are shown as `7/12` text. Stacked fractions and superscripts would read much more like an exam paper.
- **Use the iPad's space.** On a 13-inch iPad the game only fills the top half of the screen. The boards should grow to fill it.
- **A harder Hard mode.** A probability-density AI, which scores every square by how many remaining ship positions could cover it, would make Hard feel properly ruthless.
- **Rebalance the enemy.** A streak can earn the player three shots in a turn, but the enemy only ever gets one. Hard mode could earn bonus shots too.

You can read more on the [Salvo Sums page](/Portfolio/salvo-sums/) or browse [the source on GitHub](https://github.com/Geodude117/BattleShips).
