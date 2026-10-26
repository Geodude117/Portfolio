---
title: "Blackjack Player: the 2017 dissertation where it all started"
description: My final-year Computer Science project — a Unity and C# blackjack app with an advice mode and a Hi-Lo card-counting simulator — and how its ideas carried through to the game I run today.
pubDate: 2026-10-26T11:00:00Z
tags: [C#, Unity, Algorithms, Card counting, University]
---

Long before [Perfect Pair Blackjack](https://ppblackjack.co.uk) existed, there was **Blackjack Player**: my final-year project for a BSc in Computer Science, submitted in October 2017. It was an Android app built in Unity and C#, written up in a 72-page report, and its aim went beyond letting someone play blackjack. I wanted the app to *play itself*: to simulate hundreds of hands using different strategies, including card counting, and show which one made money.

This article looks at what I built, how it worked, what the results showed, and what I'd now do differently.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 168" role="img" aria-label="Three versions of the same game: Blackjack Player in 2017, a Unity and C# Android app with advice and simulation modes; a native SwiftUI rewrite for iPhone with drag-and-drop chip betting; and Perfect Pair Blackjack, a single-file HTML, CSS and JavaScript web game with side bets, live at ppblackjack.co.uk.">
<defs><marker id="b1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>
<rect x="10" y="20" width="200" height="128" rx="12" class="box hi"/>
<text x="26" y="46" class="lbl m">2017 · DISSERTATION</text>
<text x="26" y="72" class="t">Blackjack Player</text>
<text x="26" y="94" class="s">Unity · C# · Android</text>
<text x="26" y="116" class="s">advice mode</text>
<text x="26" y="134" class="s">Hi-Lo simulation</text>
<line x1="210" y1="84" x2="240" y2="84" class="ln" marker-end="url(#b1a)"/>
<rect x="245" y="20" width="200" height="128" rx="12" class="box"/>
<text x="261" y="46" class="lbl m">NATIVE REWRITE</text>
<text x="261" y="72" class="t">Blackjack for iOS</text>
<text x="261" y="94" class="s">Swift · SwiftUI</text>
<text x="261" y="116" class="s">drag-and-drop chips</text>
<text x="261" y="134" class="s">native animations</text>
<line x1="445" y1="84" x2="475" y2="84" class="ln" marker-end="url(#b1a)"/>
<rect x="480" y="20" width="200" height="128" rx="12" class="box"/>
<text x="496" y="46" class="lbl m">2026 · LIVE</text>
<text x="496" y="72" class="t">Perfect Pair Blackjack</text>
<text x="496" y="94" class="s">HTML · CSS · JavaScript</text>
<text x="496" y="116" class="s">Perfect Pairs + 21+3</text>
<text x="496" y="134" class="s">ppblackjack.co.uk</text>
</svg></div><figcaption><b>Three versions of one idea.</b> The dissertation came first. Its card model, shuffle and strategy logic were rebuilt, and improved, in each version after it.</figcaption></figure>

## The brief

The report set out three playing modes:

- **Default mode:** play blackjack as you would online, with a bank balance stored on the device, betting chips, hit, stand, double down and insurance.
- **Advice mode:** a toggle that tells you the mathematically best move for your hand against the dealer's up card, taken from the basic strategy table.
- **Simulation mode:** enter a number of hands and let the computer play them using either **basic strategy** or the **Hi-Lo card-counting system**, raising its bets when the count is in its favour, then report wins, losses, pushes and profit.

The game used four decks (208 cards), the dealer stood on 17, and a natural blackjack paid 3:2.

<div class="shots">
<figure><img src="/Portfolio/images/blackjack-player/game-scene.jpg" alt="The Blackjack Player game scene in Unity: a green felt table with Hit, Stand, Split, Deal and double buttons, five betting chips from 1 to 50, a bank balance of 400 and an Advice toggle." width="515" height="912" loading="lazy" /><figcaption>The game scene, with the Advice toggle bottom right</figcaption></figure>
<figure><img src="/Portfolio/images/blackjack-player/simulation-scene.jpg" alt="The Blackjack Player simulation scene: a field for the number of hands to play, Simulate and Reset buttons, a choice between Basic Strategy and Card Counting, a progress bar, and results for hands won, lost, pushed, played, splits and bank roll." width="407" height="721" loading="lazy" /><figcaption>The simulation scene: pick a strategy and a number of hands</figcaption></figure>
</div>

## Research first

Before writing any code, the report covered the maths behind the game. Played perfectly, **basic strategy** cuts the house edge to well under 1%. It's a lookup table, giving one correct action for every combination of player hand and dealer up card.

**Card counting** goes further. The key insight, from Edward O. Thorp's *Beat the Dealer* (1966), is that the remaining cards change the odds as the shoe is dealt. A shoe rich in tens and Aces favours the player, while one rich in low cards favours the dealer. Thorp described several systems, including counting fives and counting tens. I chose **Hi-Lo**, the most widely used:

1. Give every card a value: **2–6 count +1**, **7–9 count 0**, and **10s and Aces count −1**.
2. Keep a **running count** as cards are dealt.
3. Divide by the number of decks remaining to get the **true count**, which measures how favourable the shoe is regardless of how deep into it you are.
4. Bet more when the true count is high, and the minimum when it isn't.

The report also compared technologies. Unity won over Unreal Engine because it uses C#, which I knew well. Android won over iOS because building for iOS needed a Mac to run Xcode. Ironically, the second version of this game was a native SwiftUI app.

## Cards as integers

In Unity, every card was a **prefab**: a reusable game object with a sprite renderer, a `CardModel` script holding an array of card-face sprites, and a `CardFlipper` script. The flip animation used an `AnimationCurve` to scale the card's X axis from 1 down to 0 and back again, swapping the sprite from back to face halfway through, so the card appears to turn over.

Under the hood, though, a card was just an **integer index from 0 to 207**. The shoe, the player's hand and the dealer's hand were each a `CardStack`: a list of integers, with cards dealt by popping an index off the shoe and pushing it onto a hand. A card's rank came from modular arithmetic, since each suit has 13 cards:

```
card index = 103
card rank  = 103 % 13 = 12  →  King
```

Shuffling used the **Fisher–Yates** algorithm, which gives every ordering of the deck an equal chance. The report covers both versions of the algorithm and the difference between pseudo-random and truly random number generators, a real concern in online gambling, where a predictable seed would let someone predict the cards. The shoe was refilled and reshuffled whenever fewer than 40 cards remained, so a hand could never run out of cards mid-deal.

## Strategy as data, not code

Rather than hard-code basic strategy and Hi-Lo into a wall of `if` statements, I stored both as **XML documents**, one entry per player hand and dealer up card. The simulation parsed the right document at runtime and looked up the advice.

Hi-Lo adds a twist: some decisions depend on the count. For a hard 8, basic strategy always says *hit*, but Hi-Lo says *double down* against a dealer 5 or 6 once the count is even slightly positive:

```xml
<cardInfomation yourhand="8">
  <dealerupcard value="5">
    <adviceIfIndexIsGreater>DOUBLEDOWN</adviceIfIndexIsGreater>
    <hiLoIndex>0.05</hiLoIndex>
  </dealerupcard>
  <dealerupcard value="9">
    <adviceIfIndexIsGreater>HIT</adviceIfIndexIsGreater>
  </dealerupcard>
</cardInfomation>
```

If the player's current Hi-Lo index beats the threshold, the simulation takes the stronger play; otherwise it falls back to the safe one. Keeping strategy as data meant I could correct a table entry without recompiling, and I could test the parser on its own by writing every lookup out to a text file and checking it against the published charts.

## How the count drives play and betting

A `CardCounter` class tracked the running count as every card was dealt, and derived two numbers from it: one for **how much to bet**, and one for **how to play**.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 246" role="img" aria-label="How the Hi-Lo count is used: each card dealt is scored +1 for 2 to 6, 0 for 7 to 9 and minus 1 for 10 to Ace, and added to the running count. The running count divided by decks remaining gives the true count, which sets the bet size. The running count divided by cards remaining gives the Hi-Lo index, which is compared with the index in the XML strategy to choose the play.">
<defs><marker id="b2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="b2h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="83" width="110" height="80" rx="10" class="box"/>
<text x="65" y="118" text-anchor="middle" class="t">Card dealt</text>
<text x="65" y="138" text-anchor="middle" class="s">player or dealer</text>
<line x1="120" y1="123" x2="146" y2="123" class="ln" marker-end="url(#b2a)"/>
<rect x="150" y="83" width="160" height="80" rx="10" class="box"/>
<text x="230" y="105" text-anchor="middle" class="t">Score the card</text>
<text x="230" y="125" text-anchor="middle" class="s m">2–6   +1</text>
<text x="230" y="141" text-anchor="middle" class="s m">7–9    0</text>
<text x="230" y="157" text-anchor="middle" class="s m">10–A  −1</text>
<line x1="310" y1="123" x2="336" y2="123" class="ln" marker-end="url(#b2a)"/>
<rect x="340" y="83" width="140" height="80" rx="10" class="box hi"/>
<text x="410" y="118" text-anchor="middle" class="t">Running count</text>
<text x="410" y="138" text-anchor="middle" class="s">sum so far</text>
<path d="M480 110 C500 110, 500 52, 520 52" class="ln hi" marker-end="url(#b2h)"/>
<path d="M480 136 C500 136, 500 194, 520 194" class="ln hi" marker-end="url(#b2h)"/>
<rect x="524" y="14" width="156" height="78" rx="10" class="box"/>
<text x="602" y="38" text-anchor="middle" class="t">True count</text>
<text x="602" y="57" text-anchor="middle" class="s">÷ decks remaining</text>
<text x="602" y="78" text-anchor="middle" class="s acc">→ how much to bet</text>
<rect x="524" y="155" width="156" height="78" rx="10" class="box"/>
<text x="602" y="179" text-anchor="middle" class="t">Hi-Lo index</text>
<text x="602" y="198" text-anchor="middle" class="s">÷ cards remaining</text>
<text x="602" y="219" text-anchor="middle" class="s acc">→ how to play</text>
</svg></div><figcaption><b>One count, two decisions.</b> The true count scales the bet before the deal; the Hi-Lo index is checked against the XML strategy during the hand.</figcaption></figure>

The betting system was a **bet spread**: one unit when the count was neutral or negative, climbing steeply as the shoe turned in the player's favour, up to 12 units at a true count of +5 or more.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 236" role="img" aria-label="Bet spread by true count: below +2, 1 unit; +2, 2 units; +3, 4 units; +4, double the true count, so 8 to 9 units; +5 or higher, 12 units.">
<line x1="40" y1="190" x2="680" y2="190" class="ln" style="stroke:var(--border)"/>
<text x="30" y="194" text-anchor="end" class="lbl m">0</text>
<line x1="40" y1="40" x2="680" y2="40" class="ln dash" style="stroke:var(--border)"/>
<text x="30" y="44" text-anchor="end" class="lbl m">12</text>
<rect x="70" y="177.5" width="90" height="12.5" rx="4" class="box"/>
<rect x="194" y="165" width="90" height="25" rx="4" class="box"/>
<rect x="318" y="140" width="90" height="50" rx="4" class="box"/>
<rect x="442" y="90" width="90" height="100" rx="4" class="box"/>
<rect x="566" y="40" width="90" height="150" rx="4" class="box hi"/>
<text x="115" y="168" text-anchor="middle" class="s m" style="fill:var(--text)">1×</text>
<text x="239" y="155" text-anchor="middle" class="s m" style="fill:var(--text)">2×</text>
<text x="363" y="130" text-anchor="middle" class="s m" style="fill:var(--text)">4×</text>
<text x="487" y="80" text-anchor="middle" class="s m" style="fill:var(--text)">8–9×</text>
<text x="611" y="30" text-anchor="middle" class="s m acc">12×</text>
<text x="115" y="212" text-anchor="middle" class="lbl m">below +2</text>
<text x="239" y="212" text-anchor="middle" class="lbl m">+2</text>
<text x="363" y="212" text-anchor="middle" class="lbl m">+3</text>
<text x="487" y="212" text-anchor="middle" class="lbl m">+4</text>
<text x="611" y="212" text-anchor="middle" class="lbl m">+5 or more</text>
<text x="487" y="230" text-anchor="middle" class="lbl">2 × true count</text>
<text x="40" y="20" class="lbl">betting units</text>
</svg></div><figcaption><b>Bet small, wait, then bet big.</b> Card counting gains an edge only on the rare hands when the count is high, so the bet spread is what turns that edge into profit.</figcaption></figure>

```csharp
if (cardCounter.CalculateTrueCount() < 2)
{
    PlayerBettingUnit = 1;
    PlayerBet = PlayerBettingUnit * PlayerBet;
}
// … +2 → 2 units, +3 → 4 units …
else if (cardCounter.CalculateTrueCount() >= 4 && cardCounter.CalculateTrueCount() < 5)
{
    int DoubledTrueCount = Convert.ToInt32(cardCounter.CalculateTrueCount() * 2);
    PlayerBet = DoubledTrueCount * PlayerBet;
}
else if (cardCounter.CalculateTrueCount() >= 5)
{
    PlayerBettingUnit = 12;
    PlayerBet = PlayerBettingUnit * PlayerBet;
}
```

The play itself was **recursive**: on a *hit*, the simulation drew a card, looked the new hand up in the strategy again, and kept going until it stood or bust. Then a single `DealersTurnAndEndConditions()` method played out the dealer's hand and settled every bet, including split hands.

## The results

I ran each strategy ten times for 100 hands, starting each run with a bankroll of 400:

<div class="table-wrap">

| Strategy | Avg won | Avg lost | Avg pushed | Avg final bankroll | Avg profit | Best run | Worst run |
|---|---|---|---|---|---|---|---|
| Basic strategy | 42.8 | 52.7 | 7.0 | 843.5 | +443.5 | +1,260 | −265 |
| Hi-Lo counting | 44.7 | 48.7 | 7.3 | 832.3 | +432.3 | +1,295 | −297 |

</div>

Hi-Lo won more hands and lost fewer, exactly as the theory predicts. Both strategies more than doubled the bankroll on average, but the report is honest about the caveats. A bug in how split hands were counted inflated basic strategy's totals; you can see it in the hands-played column, which goes above 100 for basic strategy but not for Hi-Lo. And the swings were enormous, with individual runs ranging from a 297-chip loss to a 1,295-chip gain.

Looking at it now, the bigger issue is **sample size**. A hundred hands is nowhere near enough for blackjack's small edges to show through the noise. The real difference between these strategies is a fraction of a percent, and seeing it reliably takes hundreds of thousands of hands.

## What didn't get finished

The report is candid about this, and I still think that's the most valuable part. Splitting worked in the simulation but never made it into the playable game. The simulation's reset button didn't clear everything. The in-app instructions were cut for time. And there were no automated tests: Unity's Test Runner was available, but testing came down to a manual test table of 26 scenarios and `Debug.Log()` output.

## From 2017 to now

Rebuilding this game twice since has been a good measure of what I've learned:

- **Cards became objects.** Representing a card as a number and deriving its rank with `% 13` was clever, but fragile. In the web version, a card is `{ suit, rank, faceUp }` and there's nothing to decode.
- **The shuffle got faster.** The dissertation used the original Fisher–Yates (O(n²)); today's game uses the modern in-place swap (O(n)). For 208 cards it doesn't matter. Knowing *why* it doesn't matter is the point.
- **Splitting finally shipped.** The rule that defeated me in 2017 works in the web game, with up to four hands and one card each for split Aces.
- **Logic moved out of the god-object.** In 2017 almost everything lived in one Game Controller script, and the report itself says it should be broken up. In the web version, the rules are small, pure functions that are easy to read and test.
- **If I revisited the simulator,** I'd run millions of headless hands with a seeded random generator, so results could be repeated, and chart how each strategy's edge converges, rather than eyeballing ten runs of 100.

The full report is on [GitHub](https://github.com/Geodude117/BlackjackPlayer), and [Perfect Pair Blackjack](https://ppblackjack.co.uk) is where the idea ended up. The [technical write-up](/Portfolio/articles/perfect-pair-blackjack-under-the-hood/) covers how that version works.
