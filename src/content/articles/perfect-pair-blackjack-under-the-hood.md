---
title: "Perfect Pair Blackjack: building a casino game in one HTML file"
description: How the game works under the hood — a single state object, a phase-driven round, side-bet evaluation, soft-ace maths and drag-to-bet chips, all with no framework, no build step and no server.
pubDate: 2026-10-26T10:00:00Z
tags: [JavaScript, Game logic, Architecture, GitHub Pages]
---

[Perfect Pair Blackjack](https://ppblackjack.co.uk) is a free-to-play blackjack table with two side bets, Perfect Pairs and 21+3. It started as a university project in Unity and C#, became a native SwiftUI app, and is now a web game.

The web version has some deliberate constraints:

- **One file.** The whole game is `index.html`: markup, styles and about 1,100 lines of JavaScript.
- **No framework and no build step.** The file in the repo is the file the browser runs.
- **No server.** GitHub Pages serves static files, and the player's chip balance lives in `localStorage` on their own device.

This article walks through how it fits together.

## Architecture: one state object, one render function

Most of the structure comes from the SwiftUI version, where a view model holds the state and the view redraws from it. Without SwiftUI, the same idea becomes a loop: input calls an action, the action changes a single state object, and `render()` brings the DOM back in line with that state.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 268" role="img" aria-label="Update loop: input such as a click, key or drag calls an action like hit, split or addBet. The action changes the state object S, then render reconciles the DOM, which waits for the next input. Actions call pure rule functions and deal cards from the Shoe; render saves the balance to localStorage.">
<defs><marker id="d1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="d1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<path d="M613 60 V30 H82 V56" class="ln dash" marker-end="url(#d1a)"/>
<text x="347" y="22" text-anchor="middle" class="lbl">DOM updated, waiting for the next input</text>
<rect x="10" y="60" width="145" height="78" rx="10" class="box"/>
<text x="82" y="88" text-anchor="middle" class="t">Input</text>
<text x="82" y="108" text-anchor="middle" class="s">click · key · drag</text>
<text x="82" y="126" text-anchor="middle" class="s m">data-act</text>
<rect x="187" y="60" width="145" height="78" rx="10" class="box"/>
<text x="259" y="88" text-anchor="middle" class="t">Action</text>
<text x="259" y="108" text-anchor="middle" class="s m">hit() · stand()</text>
<text x="259" y="126" text-anchor="middle" class="s m">split() · addBet()</text>
<rect x="364" y="60" width="145" height="78" rx="10" class="box hi"/>
<text x="436" y="88" text-anchor="middle" class="t">State  S</text>
<text x="436" y="108" text-anchor="middle" class="s">one plain object</text>
<text x="436" y="126" text-anchor="middle" class="s m">phase · balance</text>
<rect x="541" y="60" width="145" height="78" rx="10" class="box"/>
<text x="613" y="88" text-anchor="middle" class="t">render()</text>
<text x="613" y="108" text-anchor="middle" class="s">reconciles the DOM</text>
<text x="613" y="126" text-anchor="middle" class="s">keyed by card id</text>
<line x1="155" y1="99" x2="183" y2="99" class="ln" marker-end="url(#d1a)"/>
<line x1="332" y1="99" x2="360" y2="99" class="ln hi" marker-end="url(#d1h)"/>
<line x1="509" y1="99" x2="537" y2="99" class="ln hi" marker-end="url(#d1h)"/>
<line x1="222" y1="138" x2="120" y2="176" class="ln" marker-end="url(#d1a)"/>
<text x="150" y="150" text-anchor="end" class="lbl m">deal()</text>
<line x1="259" y1="138" x2="259" y2="176" class="ln" marker-end="url(#d1a)"/>
<text x="266" y="162" class="lbl">calls</text>
<line x1="613" y1="138" x2="613" y2="176" class="ln" marker-end="url(#d1a)"/>
<text x="620" y="162" class="lbl">saves</text>
<rect x="10" y="180" width="145" height="70" rx="10" class="box"/>
<text x="82" y="208" text-anchor="middle" class="t">Shoe</text>
<text x="82" y="228" text-anchor="middle" class="s">6 decks · Fisher–Yates</text>
<rect x="187" y="180" width="145" height="70" rx="10" class="box"/>
<text x="259" y="204" text-anchor="middle" class="t">Pure rules</text>
<text x="259" y="223" text-anchor="middle" class="s m">bestValue · ppResult</text>
<text x="259" y="240" text-anchor="middle" class="s m">evaluate21Plus3</text>
<rect x="541" y="180" width="145" height="70" rx="10" class="box"/>
<text x="613" y="208" text-anchor="middle" class="t">localStorage</text>
<text x="613" y="228" text-anchor="middle" class="s">balance · settings</text>
</svg></div><figcaption><b>Everything flows through <code>S</code>.</b> Actions never touch the DOM directly; they change state and call <code>render()</code>. The rules are pure functions over cards, so they're easy to reason about and test in isolation.</figcaption></figure>

The state is a plain object. Every field the UI depends on lives here, from the current phase to which toast is showing:

```js
const S = {
  phase: 'betting', hands: [newHand()], dealer: newHand(), balance: savedBal > 0 ? savedBal : 500,
  idx: 0, message: 'Place your bets', results: {}, showInsurance: false,
  luckyRank: 14, ppStreak: 0, history: [], round: 1, lastBets: [], chipHistory: [],
  selectedChip: 5, /* …toasts, sheets, animation flags… */
};
```

Input is handled by a single delegated listener. Every interactive element carries a `data-act` attribute, and one `switch` maps it to an action, so there are no per-element event handlers to wire up or clean up when the DOM changes:

```js
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  switch (t.dataset.act) {
    case 'hit':    return requestHit();
    case 'stand':  return stand();
    case 'double': return doubleDown();
    case 'split':  return requestSplit();
    case 'deal':   return deal();
    // …
  }
});
```

## Cards and the shoe

A card is `{ id, suit, rank, faceUp }`, with ranks stored as 2–14 (Ace high) to match the `Rank` enum's raw values in the Swift version. The shoe builds six decks and shuffles them with Fisher–Yates, which gives every ordering equal probability:

```js
reset() {
  this.cards = [];
  for (let d = 0; d < this.deckCount; d++)
    for (let s = 0; s < 4; s++)
      for (const r of RANKS) this.cards.push(mkCard(s, r));
  for (let i = this.cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
  }
}
```

When fewer than 52 cards remain, the shoe reshuffles before the next deal. The shoe also has a `forced` queue: push specific cards onto it and `deal()` returns those first. That's what makes it possible to test rare situations, like a Perfect Pair on the lucky rank, without waiting thousands of hands for one to come up.

## Soft hands and the Ace problem

An Ace counts as 1 or 11, so a hand doesn't have one value; it has a set of possible values. Rather than special-casing "how many Aces are there?", `allValues` branches on every Ace and lets the totals fan out:

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 104" role="img" aria-label="Values of the hand Ace, Ace, 9: start at 0; after the first Ace the totals are 1 and 11; after the second Ace 2, 12, 12 and 22; after the 9 they are 11, 21, 21 and 31. The best total of 21 or less is 21, a soft 21.">
<defs><marker id="d4a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>
<rect x="8" y="36" width="56" height="38" rx="8" class="box"/><text x="36" y="60" text-anchor="middle" class="t m">0</text>
<rect x="102" y="36" width="96" height="38" rx="8" class="box"/><text x="150" y="60" text-anchor="middle" class="t m">1, 11</text>
<rect x="236" y="36" width="150" height="38" rx="8" class="box"/><text x="311" y="60" text-anchor="middle" class="t m">2, 12, 12, <tspan class="fa">22</tspan></text>
<rect x="424" y="36" width="150" height="38" rx="8" class="box"/><text x="499" y="60" text-anchor="middle" class="t m">11, 21, 21, <tspan class="fa">31</tspan></text>
<rect x="612" y="36" width="70" height="38" rx="8" class="box hi"/><text x="647" y="60" text-anchor="middle" class="t m acc">21</text>
<line x1="64" y1="55" x2="98" y2="55" class="ln" marker-end="url(#d4a)"/><text x="81" y="45" text-anchor="middle" class="lbl m">+A</text>
<line x1="198" y1="55" x2="232" y2="55" class="ln" marker-end="url(#d4a)"/><text x="215" y="45" text-anchor="middle" class="lbl m">+A</text>
<line x1="386" y1="55" x2="420" y2="55" class="ln" marker-end="url(#d4a)"/><text x="403" y="45" text-anchor="middle" class="lbl m">+9</text>
<line x1="574" y1="55" x2="608" y2="55" class="ln" marker-end="url(#d4a)"/><text x="591" y="45" text-anchor="middle" class="lbl m">≤21</text>
<text x="311" y="94" text-anchor="middle" class="lbl">22 is already bust</text>
<text x="647" y="94" text-anchor="middle" class="lbl">soft 21</text>
<text x="8" y="20" class="lbl">Hand: A, A, 9</text>
</svg></div><figcaption><b>Every Ace doubles the possibilities.</b> The best value is the highest total that doesn't bust; if they all bust, it's the lowest one.</figcaption></figure>

```js
function allValues(h) {
  let vals = [0];
  for (const c of h.cards) {
    const next = [];
    for (const v of vals) {
      if (c.rank === 14) next.push(v + 1, v + 11);
      else next.push(v + rankValue(c.rank));
    }
    vals = next;
  }
  return vals;
}
function bestValue(h) {
  const a = allValues(h), ok = a.filter(v => v <= 21);
  return ok.length ? Math.max(...ok) : Math.min(...a);
}
```

The set grows as 2ⁿ for n Aces, which sounds alarming until you remember a hand rarely holds more than three or four Aces. Being *soft* then falls out naturally: a hand is soft if its best total is higher than its total with every Ace counted as 1. That one check drives both the dealer's soft-17 rule and the strategy hints.

## A round is a state machine

Every round moves through a fixed set of phases, and each action starts by checking the phase it's allowed in. That one guard stops a whole class of bugs, such as hitting during the dealer's turn or placing a bet mid-hand.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 262" role="img" aria-label="Round phases: betting, then dealing, then playerTurn, then dealerTurn, then results, which loops back to betting via newRound. If the dealer shows an Ace, dealing goes to insurance, which goes to playerTurn when the dealer doesn't have 21 or straight to dealerTurn when they do. If the dealer shows a ten-value card and has 21, dealing skips straight to dealerTurn.">
<defs><marker id="d2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="d2h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<path d="M202 90 C202 30, 486 30, 486 86" class="ln dash" marker-end="url(#d2a)"/>
<text x="344" y="34" text-anchor="middle" class="lbl">dealer peeks: 10 up and 21</text>
<rect x="8" y="90" width="108" height="40" rx="20" class="box"/><text x="62" y="115" text-anchor="middle" class="t m" style="font-size:13px">betting</text>
<rect x="148" y="90" width="108" height="40" rx="20" class="box"/><text x="202" y="115" text-anchor="middle" class="t m" style="font-size:13px">dealing</text>
<rect x="290" y="90" width="108" height="40" rx="20" class="box hi"/><text x="344" y="115" text-anchor="middle" class="t m acc" style="font-size:13px">playerTurn</text>
<rect x="432" y="90" width="108" height="40" rx="20" class="box"/><text x="486" y="115" text-anchor="middle" class="t m" style="font-size:13px">dealerTurn</text>
<rect x="574" y="90" width="108" height="40" rx="20" class="box"/><text x="628" y="115" text-anchor="middle" class="t m" style="font-size:13px">results</text>
<line x1="116" y1="110" x2="144" y2="110" class="ln hi" marker-end="url(#d2h)"/>
<line x1="256" y1="110" x2="286" y2="110" class="ln hi" marker-end="url(#d2h)"/>
<line x1="398" y1="110" x2="428" y2="110" class="ln hi" marker-end="url(#d2h)"/>
<line x1="540" y1="110" x2="570" y2="110" class="ln hi" marker-end="url(#d2h)"/>
<rect x="213" y="180" width="120" height="40" rx="20" class="box dim"/><text x="273" y="205" text-anchor="middle" class="t m" style="font-size:13px">insurance</text>
<line x1="190" y1="130" x2="236" y2="177" class="ln" marker-end="url(#d2a)"/>
<text x="204" y="162" text-anchor="end" class="lbl">Ace up</text>
<line x1="310" y1="180" x2="336" y2="134" class="ln" marker-end="url(#d2a)"/>
<text x="332" y="164" class="lbl">no 21</text>
<path d="M333 200 H486 V134" class="ln" marker-end="url(#d2a)"/>
<text x="410" y="193" text-anchor="middle" class="lbl">dealer 21</text>
<path d="M628 130 V246 H62 V134" class="ln dash" marker-end="url(#d2a)"/>
<text x="345" y="240" text-anchor="middle" class="lbl m">newRound()</text>
</svg></div><figcaption><b>Phases gate every action.</b> <code>hit()</code> returns early unless the phase is <code>playerTurn</code>, <code>addBet()</code> only works in <code>betting</code>, and so on. Insurance is the only optional phase.</figcaption></figure>

The flow itself is written as `async` functions. Dealing is a loop that pushes a card, re-renders, and `await`s a short pause, so the pacing reads top to bottom instead of being spread across timers and callbacks:

```js
async function deal() {
  if (!canDeal() || S.phase !== 'betting') return;
  S.phase = 'dealing';
  const step = async (target, up) => {
    target.cards.push(shoe.deal(up)); play('card'); render();
    await sleep(settings.anim ? speed(700) : speed(350));
  };
  for (const h of S.hands) await step(h, true);   // first card to each hand
  await step(S.dealer, true);                     // dealer up card
  for (const h of S.hands) await step(h, true);   // second card to each hand
  await step(S.dealer, false);                    // dealer hole card, face down
  await waitForReveal();
  await postDealChecks();
}
```

Two small guards keep it robust. A `busy` flag blocks the buttons while a card is still landing, so a fast double-tap can't hit twice. And `waitForReveal()` resolves only when every card-flip animation has finished, so totals and outcomes never get ahead of what the player can see.

### The dealer

The dealer plays a fixed rule: draw below 17, and also draw on soft 17 (the "H17" rule). With `bestValue` and `isSoft` in place, that's a one-line loop condition:

```js
while (bestValue(S.dealer) < 17 || (bestValue(S.dealer) === 17 && isSoft(S.dealer))) {
  await sleep(speed(450));
  S.dealer.cards.push(shoe.deal(true)); play('card'); render();
  await waitForReveal();
}
```

The dealer skips drawing altogether if every player hand has busted, surrendered or hit blackjack, since there's nothing left to beat. Settlement then compares each hand in order: bust, blackjack (paid 3:2), dealer blackjack, dealer bust, higher total, tie. Insurance pays 2:1, which also makes "even money" on a blackjack work without special-casing it.

## Side bets: Perfect Pairs and 21+3

Both side bets depend only on the first cards dealt, so they're evaluated straight after the deal rather than at the end of the round. Winning side bets pay out immediately, and the result is *locked* onto the hand so a later split can't change it.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 320" role="img" aria-label="Perfect Pairs decision tree: if the first two cards are not the same rank, the bet loses. If they are the same suit it's a Perfect Pair paying 30 to 1; same colour, a Coloured Pair paying 10 to 1; otherwise a Mixed Pair paying 5 to 1. 21+3 checks the player's two cards and the dealer's up card in order: suited trips 100 to 1, three of a kind 30 to 1, straight flush 40 to 1, straight 10 to 1, flush 5 to 1, otherwise nothing.">
<defs><marker id="d3a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>
<text x="10" y="20" class="t">Perfect Pairs</text>
<rect x="10" y="36" width="130" height="40" rx="8" class="box"/><text x="75" y="61" text-anchor="middle" class="s" style="fill:var(--text)">Same rank?</text>
<rect x="10" y="124" width="130" height="40" rx="8" class="box"/><text x="75" y="149" text-anchor="middle" class="s" style="fill:var(--text)">Same suit?</text>
<rect x="10" y="212" width="130" height="40" rx="8" class="box"/><text x="75" y="237" text-anchor="middle" class="s" style="fill:var(--text)">Same colour?</text>
<rect x="196" y="36" width="180" height="40" rx="8" class="box dim"/><text x="210" y="61" class="s">No pair</text><text x="364" y="61" text-anchor="end" class="s">lose</text>
<rect x="196" y="124" width="180" height="40" rx="8" class="box hi"/><text x="210" y="149" class="s" style="fill:var(--text)">Perfect pair</text><text x="364" y="149" text-anchor="end" class="s m acc">30:1</text>
<rect x="196" y="212" width="180" height="40" rx="8" class="box"/><text x="210" y="237" class="s" style="fill:var(--text)">Coloured pair</text><text x="364" y="237" text-anchor="end" class="s m acc">10:1</text>
<rect x="196" y="272" width="180" height="40" rx="8" class="box"/><text x="210" y="297" class="s" style="fill:var(--text)">Mixed pair</text><text x="364" y="297" text-anchor="end" class="s m acc">5:1</text>
<line x1="140" y1="56" x2="192" y2="56" class="ln" marker-end="url(#d3a)"/><text x="166" y="50" text-anchor="middle" class="lbl">no</text>
<line x1="75" y1="76" x2="75" y2="120" class="ln" marker-end="url(#d3a)"/><text x="83" y="102" class="lbl">yes</text>
<line x1="140" y1="144" x2="192" y2="144" class="ln" marker-end="url(#d3a)"/><text x="166" y="138" text-anchor="middle" class="lbl">yes</text>
<line x1="75" y1="164" x2="75" y2="208" class="ln" marker-end="url(#d3a)"/><text x="83" y="190" class="lbl">no</text>
<line x1="140" y1="232" x2="192" y2="232" class="ln" marker-end="url(#d3a)"/><text x="166" y="226" text-anchor="middle" class="lbl">yes</text>
<path d="M75 252 V292 H192" class="ln" marker-end="url(#d3a)"/><text x="83" y="276" class="lbl">no</text>
<line x1="396" y1="10" x2="396" y2="312" class="ln" style="stroke:var(--border)"/>
<text x="416" y="20" class="t">21+3 · first match wins</text>
<rect x="416" y="36" width="264" height="36" rx="8" class="box hi"/><text x="430" y="59" class="s" style="fill:var(--text)">1  Suited trips</text><text x="666" y="59" text-anchor="end" class="s m acc">100:1</text>
<rect x="416" y="78" width="264" height="36" rx="8" class="box"/><text x="430" y="101" class="s" style="fill:var(--text)">2  Three of a kind</text><text x="666" y="101" text-anchor="end" class="s m acc">30:1</text>
<rect x="416" y="120" width="264" height="36" rx="8" class="box"/><text x="430" y="143" class="s" style="fill:var(--text)">3  Straight flush</text><text x="666" y="143" text-anchor="end" class="s m acc">40:1</text>
<rect x="416" y="162" width="264" height="36" rx="8" class="box"/><text x="430" y="185" class="s" style="fill:var(--text)">4  Straight</text><text x="666" y="185" text-anchor="end" class="s m acc">10:1</text>
<rect x="416" y="204" width="264" height="36" rx="8" class="box"/><text x="430" y="227" class="s" style="fill:var(--text)">5  Flush</text><text x="666" y="227" text-anchor="end" class="s m acc">5:1</text>
<rect x="416" y="246" width="264" height="36" rx="8" class="box dim"/><text x="430" y="269" class="s">Nothing</text><text x="666" y="269" text-anchor="end" class="s">lose</text>
<text x="416" y="306" class="lbl">your two cards + the dealer's up card</text>
</svg></div><figcaption><b>Order matters.</b> Perfect Pairs narrows from the most specific match down. 21+3 checks trips before straights and flushes, because three cards of the same rank can never form a straight, and suited trips would otherwise be scored as a plain flush.</figcaption></figure>

Both evaluators are small, pure functions, which makes the payout tables easy to check against the rules pages:

```js
function ppResult(h) {
  if (h.cards.length < 2) return 'none';
  const [a, b] = h.cards; if (a.rank !== b.rank) return 'none';
  if (a.suit === b.suit) return 'perfect';
  if (SUITS[a.suit].red === SUITS[b.suit].red) return 'coloured';
  return 'mixed';
}

function evaluate21Plus3(c1, c2, d) {
  const cs = [c1, c2, d];
  const same = cs.every(c => c.suit === cs[0].suit);
  if (c1.rank === c2.rank && c2.rank === d.rank && same) return 'suitedTrips';
  if (c1.rank === c2.rank && c2.rank === d.rank) return 'threeOfAKind';
  const consec = v => { const s = [...v].sort((a, b) => a - b); return s[2] - s[1] === 1 && s[1] - s[0] === 1; };
  const straight = consec(cs.map(c => c.rank)) || consec(cs.map(c => c.rank === 14 ? 1 : c.rank));
  if (same && straight) return 'straightFlush';
  if (straight) return 'straight';
  if (same) return 'flush';
  return 'none';
}
```

The straight check runs twice, once with the Ace high (Q-K-A) and once with it low (A-2-3), so both ends of the deck count.

Two extras sit on top of Perfect Pairs. Each round picks a **lucky rank**, and a Perfect Pair of that rank pays an extra 500:1. Back-to-back Perfect Pairs also build a **streak bonus** that grows by 50 chips for each consecutive hit.

## Drag-to-bet without a framework

In the SwiftUI app, chips are dragged onto betting spots using `DragGesture`, with each drop zone reporting its frame through a `PreferenceKey`. The web version gets the same result from two things the browser already provides: pointer events and `document.elementFromPoint`.

Every betting spot is marked with a `data-drop` attribute naming the bet type (`bet`, `pp` or `t21`). While dragging, a "ghost" chip follows the pointer, and the code asks the browser what's under it:

```js
const targetAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  return el && el.closest('[data-drop]');
};
```

There's no layout bookkeeping: the browser already knows where everything is. Pointer capture keeps the drag tracking even when the finger leaves the chip, and a 6-pixel threshold separates a tap (select this chip) from a drag (place this chip). Pointer events also mean the same code handles mouse, touch and pen.

## Rendering without a virtual DOM

Re-creating the whole table on every `render()` would restart every card animation. Instead, cards are **reconciled by id**: existing card elements are kept and repositioned, new ones are created and flipped in, and removed ones are deleted. It's the same idea as React's `key` prop, in about twenty lines.

For everything else, a tiny `setHTML` helper caches the last HTML string written to each element and skips the write if nothing changed. That keeps `render()` cheap enough to call after every state change without thinking about it.

## Hosting and persistence

The deployment story is deliberately boring. The repo's `main` branch is served by GitHub Pages, and a custom domain points at it. Pushing a commit is the entire release process, and a fix is live in about a minute.

Persistence is a small wrapper around `localStorage` that never throws. Private browsing, full storage and blocked cookies all fall back to defaults instead of crashing the game:

```js
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
```

The balance is written back inside `render()` whenever it changes, so there's no "save" moment to forget.

## What I'd change next

- **Split the file into ES modules.** One file was the right call to get it shipped, but the pure rules (`allValues`, `ppResult`, `evaluate21Plus3`, the strategy table) deserve their own module.
- **Unit-test the rules.** Because they're pure functions, a table-driven test of every side-bet outcome and payout would be cheap and would lock down the maths.
- **A seeded random generator.** Replacing `Math.random()` with a seeded RNG would make whole rounds reproducible, which is useful for bug reports and for replaying a hand.

You can [play the game](https://ppblackjack.co.uk) or browse [the source on GitHub](https://github.com/Geodude117/PPBlackJack).
