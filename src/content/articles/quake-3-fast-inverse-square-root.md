---
title: "0x5f3759df: how Quake III normalised vectors faster, and whether it still matters"
description: The famous fast inverse square root from Quake III Arena, explained step by step — why games need 1/√x for vector normalisation, how reading a float's bits as an integer gives a close guess, the Newton–Raphson step that sharpens it, measured accuracy, a C# port, who really wrote it, and a modern benchmark showing what to use today.
pubDate: 2026-11-19T11:30:00Z
tags: [C, C#, Algorithms, Performance, Game development]
ai: "Made with AI: this article, its code, diagram and measurements were produced with Claude, an AI assistant. The accuracy figures and benchmark were run by Claude in a cloud Linux VM (gcc 13, Intel Xeon). The C# port hasn't been compiled or run."
---

In 2005, id Software released the source code of **Quake III Arena** (1999). Programmers soon found one short function that made it famous far beyond gaming. It calculates `1/√x` using a strange hexadecimal constant, `0x5f3759df`, and some bit-level trickery. Its original comments call it "evil floating point bit level hacking", followed by a two-word expletive about the magic number.

This article explains what it does, why it worked, how accurate it is, and, with a benchmark, whether you should ever use it today.

## Why a game needs 1/√x so often

3D games are full of **vectors**: the direction a surface faces, the direction light comes from, the direction a player is looking. Lighting, reflections and movement all need these as **unit vectors**, length exactly 1, so the maths only cares about direction.

Making a vector length 1 is called **normalising** it: divide each part by the vector's length.

```text
length = √(x² + y² + z²)
unit   = (x / length,  y / length,  z / length)
```

Faster still is to work out `1 / length` once, then **multiply** three times, because multiplying was much cheaper than dividing:

```text
inv  = 1 / √(x² + y² + z²)
unit = (x × inv,  y × inv,  z × inv)
```

A game does this thousands of times per frame. On late-1990s CPUs, a square root followed by a division was expensive. A faster `1/√x`, even a slightly approximate one, meant more frames per second.

## The function

Here is the algorithm, written in modern, portable C. The original read the float's bits through a pointer cast, which modern compilers treat as undefined behaviour; `memcpy` does the same job safely and compiles to the same instructions. The comments are mine.

```c
#include <stdint.h>
#include <string.h>

float fast_inverse_sqrt(float x)
{
    uint32_t i;
    float y;

    memcpy(&i, &x, sizeof i);          // 1. read the float's 32 bits as an integer
    i = 0x5f3759df - (i >> 1);         // 2. the magic: a rough 1/√x, in integer form
    memcpy(&y, &i, sizeof y);          // 3. read those bits back as a float

    return y * (1.5f - 0.5f * x * y * y);   // 4. one Newton–Raphson step to sharpen it
}
```

Four lines of real work, with no square root and no division. You can see the original in context in [Quake III Arena's `q_math.c`](https://github.com/id-Software/Quake-III-Arena/blob/master/code/game/q_math.c) (released under the GPL), where it's called `Q_rsqrt`.

## Walking through it with x = 4

The right answer is `1/√4 = 0.5`. These values come from running the code:

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 250" role="img" aria-label="The fast inverse square root worked through for x equals 4. The float 4.0 is read as the integer 0x40800000. The integer step computes 0x5f3759df minus 0x40800000 shifted right by one, giving 0x3ef759df. Read back as a float, that is 0.4831, about 3.4 percent below the true answer. One Newton-Raphson step, y times 1.5 minus half x y squared, gives 0.49915, about 0.17 percent from the true answer of 0.5.">
<defs><marker id="qk1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="qk1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="30" width="200" height="70" rx="10" class="box"/>
<text x="110" y="56" text-anchor="middle" class="t">x = 4.0 (float)</text>
<text x="110" y="78" text-anchor="middle" class="s m" style="font-size:11px">bits: 0x40800000</text>
<line x1="210" y1="65" x2="242" y2="65" class="ln" marker-end="url(#qk1a)"/>
<rect x="245" y="30" width="200" height="70" rx="10" class="box hi"/>
<text x="345" y="54" text-anchor="middle" class="t">The magic step</text>
<text x="345" y="73" text-anchor="middle" class="s m acc" style="font-size:11px">0x5f3759df − (i &gt;&gt; 1)</text>
<text x="345" y="89" text-anchor="middle" class="s m" style="font-size:11px">= 0x3ef759df</text>
<line x1="445" y1="65" x2="477" y2="65" class="ln" marker-end="url(#qk1a)"/>
<rect x="480" y="30" width="200" height="70" rx="10" class="box"/>
<text x="580" y="56" text-anchor="middle" class="t">Back to a float</text>
<text x="580" y="78" text-anchor="middle" class="s" style="font-size:12px">0.4831 (3.4% off)</text>
<path d="M580 100 V125 H110 V147" class="ln" marker-end="url(#qk1a)"/>
<rect x="10" y="150" width="200" height="70" rx="10" class="box hi"/>
<text x="110" y="174" text-anchor="middle" class="t">Newton–Raphson</text>
<text x="110" y="195" text-anchor="middle" class="s m acc" style="font-size:11px">y × (1.5 − ½·x·y²)</text>
<line x1="210" y1="185" x2="242" y2="185" class="ln hi" marker-end="url(#qk1h)"/>
<rect x="245" y="150" width="200" height="70" rx="10" class="box hi"/>
<text x="345" y="176" text-anchor="middle" class="t">0.49915</text>
<text x="345" y="198" text-anchor="middle" class="s" style="font-size:12px">0.17% off</text>
<text x="465" y="180" class="lbl">True answer: 0.5</text>
<text x="465" y="198" class="lbl">No sqrt, no division</text>
</svg></div><figcaption><b>Four steps, real numbers.</b> An integer subtraction gets within a few percent, and one cheap refinement step gets within a fifth of a percent.</figcaption></figure>

### Step 1: read the float as an integer

A 32-bit float is stored as a **sign** bit, an 8-bit **exponent** and a 23-bit **fraction** (the IEEE 754 format). 4.0 is `1.0 × 2²`, stored as the bits `0x40800000`.

The key insight is this: **if you read those bits as an ordinary integer, you get a scaled, shifted approximation of log₂(x)**. The exponent sits in the high bits, so it dominates the integer's value, and the fraction bits fill in a roughly straight-line approximation between powers of two.

### Step 2: the magic line

Logarithms turn hard operations into easy ones:

```text
log₂(1/√x) = −½ × log₂(x)
```

Halving and negating are cheap in integer maths. `i >> 1` halves the integer, which halves the logarithm, and subtracting from a constant negates it. The constant puts back the exponent's offset (bias) correctly:

```text
0x5f3759df = 1597463007 ≈ 1.5 × 2²³ × (127 − 0.045)
```

The `127` is the float exponent bias, and the `1.5` comes from the "−½" rule. The small `0.045` is a tuning value that balances the error of the straight-line log approximation. That's where the "magic" lives.

### Step 3: read the bits back as a float

`0x3ef759df` read as a float is **0.4831**, about 3.4% below the true 0.5. That's a good guess from one subtraction and one shift.

### Step 4: one Newton–Raphson step

Newton's method improves a guess `y` for a root of an equation. For `1/√x`, one step works out as:

```text
y_better = y × (1.5 − 0.5 × x × y²)
```

That's only multiplications and a subtraction. Each step roughly **squares the error** (3.4% becomes about 0.17%). Quake used one step; the original even has a second step commented out as unnecessary.

## How accurate is it?

I measured the worst-case error across every float from 1.0 up to 4.0. The pattern repeats for every power of four, so this covers all positive inputs:

| Method | Worst relative error |
| --- | --- |
| The magic guess alone | 3.44% |
| **With one Newton step (Quake III)** | **0.175%** |
| With two Newton steps | 0.0005% |
| Chris Lomont's improved constant `0x5f375a86`, one step | 0.1751% |
| SSE `rsqrtss` hardware estimate | 0.033% |

An error of 0.175% in a lighting normal is invisible on screen, which is why it was a great trade for a game. It's not suitable where precision matters, such as physics, finance or scientific work.

In 2003, Chris Lomont analysed the constant and found that `0x5f375a86` is slightly better after a Newton step. In practice the difference is tiny, as the table shows.

## The same thing in C#

.NET can read a float's bits directly, so the port is short:

```csharp
static float FastInverseSqrt(float x)
{
    int i = BitConverter.SingleToInt32Bits(x);    // float bits as an int
    i = 0x5f3759df - (i >> 1);                     // the magic step
    float y = BitConverter.Int32BitsToSingle(i);  // bits back to a float
    return y * (1.5f - 0.5f * x * y * y);          // one Newton–Raphson step
}
```

(`>>` on an `int` is an arithmetic shift, but that doesn't matter here: positive floats have a sign bit of 0.)

**But don't use it.** In modern .NET:

- `1f / MathF.Sqrt(x)` is accurate and fast.
- `MathF.ReciprocalSqrtEstimate(x)` (since .NET 6) gives you the hardware estimate: `rsqrtss` on x86/x64, or `FRSQRTE` on ARM64.
- `Vector3.Normalize(v)` in `System.Numerics` normalises a whole vector using SIMD instructions.

## Is it still faster? A modern benchmark

I normalised a million random 3D vectors, keeping the fastest of 50 runs, three ways (gcc 13, `-O2`, Intel Xeon cloud VM):

| Method | Compiler free to vectorise | Vectorisation off |
| --- | --- | --- |
| `1.0f / sqrtf(x)` | **1.29 ns** per vector | 1.77 ns |
| Quake III trick | 1.46 ns | 1.67 ns |
| SSE `rsqrtss` estimate | 1.39 ns | **1.19 ns** |

This is a single run on a shared virtual machine, so treat the exact numbers as rough. The pattern is still clear:

- **The plain version is now as fast as the trick, or faster.** With vectorisation on, the compiler processes several vectors at once with SIMD square-root and divide instructions, and wins.
- **The hardware estimate beats the trick** at its own game: faster and around five times more accurate.
- **Every option costs about one to two nanoseconds.** The bottleneck has moved elsewhere: memory, cache misses and the GPU.

The trick lost its advantage for two reasons. In 1999 the Pentium III added SSE, including a single instruction (`rsqrtss`) that does what `Q_rsqrt` does, in hardware. Since then, square root and division units have become much faster, and lighting maths has largely moved to GPUs, which have their own fast reciprocal square root.

## Who actually wrote it?

Most people assumed John Carmack wrote it. He didn't. A 2006 investigation by [Beyond3D](https://beyond3d.com/content/articles/15) traced it back through 3dfx's Gary Tarolli to **Greg Walsh** at Ardent Computer in the late 1980s. Walsh built on a bit-manipulation idea that Cleve Moler (later the founder of MathWorks) had learned from earlier, unpublished work by William Kahan and K.C. Ng at Berkeley. It probably reached id Software via 3dfx. Similar code also turned up in other games of the era.

## What developers can take from it

- **Know your data's representation.** The trick only exists because someone understood exactly how a float is stored in bits.
- **Approximation is a valid engineering choice**, when you know the error and it's acceptable for the job.
- **Measure, don't assume.** The fastest code in 1999 is no longer the fastest. Compilers, CPUs and hardware instructions change the answer. Always benchmark on today's hardware, with tools like BenchmarkDotNet in .NET.
- **Prefer clear code plus the platform's optimised functions.** `Vector3.Normalize` says what it does, and lets the runtime choose the fastest instructions on each machine.

## Sources

- [Quake III Arena source code: `code/game/q_math.c`](https://github.com/id-Software/Quake-III-Arena/blob/master/code/game/q_math.c) — id Software (GPL)
- [Fast inverse square root](https://en.wikipedia.org/wiki/Fast_inverse_square_root) — Wikipedia, for history and the SSE `rsqrtss` context
- [Origin of Quake3's Fast InvSqrt(), part two](https://beyond3d.com/content/articles/15) — Beyond3D, on Greg Walsh's authorship
- [Generalising the Fast Reciprocal Square Root Algorithm](https://arxiv.org/pdf/2307.15600) — arXiv, summarising Lomont's 2003 constant and its error bound
- [MathF.ReciprocalSqrtEstimate](https://learn.microsoft.com/dotnet/api/system.mathf.reciprocalsqrtestimate) — Microsoft Learn (RSQRTSS and FRSQRTE behaviour)
- [Quake III's fast inverse square root on Apple M4 and Ryzen](https://lilting.ch/en/articles/fast-inverse-square-root-apple-m4-benchmark) — an independent benchmark with similar accuracy results
