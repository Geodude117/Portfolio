---
title: "Rules engines in .NET: best practices with Microsoft RulesEngine"
description: A practical C# guide to using a rules engine well — when it's worth it, how Microsoft's RulesEngine works, keeping it behind your own interface, loading and versioning rules, testing every rule, handling failures, security and performance, and when plain C# is the better choice.
pubDate: 2026-11-12T21:30:00Z
tags: [C#, .NET 10, Rules Engine, Architecture, Testing]
guide: true
ai: "Made with AI: this guide, its sample code and diagram were produced with Claude, an AI assistant, using Microsoft RulesEngine 6. The code hasn't been compiled or run yet."
---

Every business app has rules: who qualifies for a discount, which applications need a manual review, what fee applies, when an account should be escalated. Usually they live in `if` statements scattered through the code, so changing "orders over £50" to "orders over £40" means a code change, a review, a test run and a release.

A **rules engine** moves those rules out of the code into data, typically JSON stored in a file or database, so they can be changed, reviewed and versioned separately. This guide uses Microsoft's open-source [RulesEngine](https://microsoft.github.io/RulesEngine/) library and focuses on the practices that make it work in production.

## When a rules engine is worth it, and when it isn't

**Use one when:**

- rules **change often** (pricing, eligibility, promotions, scoring thresholds)
- there are **many** rules, and they're easier to read as a list than as nested `if`s
- the business wants to **see or change** the rules without reading C#
- different customers, regions or brands need **different rule sets** for the same decision

**Don't use one when:**

- there are a handful of rules that rarely change. Plain C# is easier to read, debug and test.
- the logic is really an **algorithm** (calculations with loops, lookups and state), not a set of conditions
- nobody will ever change the rules except developers. You've added a layer for no benefit.

A rules engine is a trade-off: flexibility for indirection. Be deliberate about it.

## How it fits together

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 240" role="img" aria-label="How a rules engine fits into an app. Rules are stored as versioned JSON in a file or database. They are loaded once into a singleton RulesEngine, which compiles and caches them. The app passes inputs such as the customer, the order and a context object with today's date. The engine returns which rules matched and any outputs. The app's own code then decides what to do with those results and acts on them.">
<defs><marker id="re1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="re1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="30" width="150" height="74" rx="10" class="box"/>
<text x="85" y="56" text-anchor="middle" class="t">Rules (JSON)</text>
<text x="85" y="75" text-anchor="middle" class="s" style="font-size:12px">file, DB or blob</text>
<text x="85" y="92" text-anchor="middle" class="s acc" style="font-size:12px">versioned</text>
<line x1="160" y1="67" x2="180" y2="67" class="ln" marker-end="url(#re1a)"/>
<rect x="183" y="30" width="150" height="74" rx="10" class="box hi"/>
<text x="258" y="56" text-anchor="middle" class="t">RulesEngine</text>
<text x="258" y="75" text-anchor="middle" class="s" style="font-size:12px">singleton</text>
<text x="258" y="92" text-anchor="middle" class="s" style="font-size:12px">compiles + caches</text>
<line x1="333" y1="67" x2="353" y2="67" class="ln hi" marker-end="url(#re1h)"/>
<rect x="356" y="30" width="150" height="74" rx="10" class="box"/>
<text x="431" y="56" text-anchor="middle" class="t">Results</text>
<text x="431" y="75" text-anchor="middle" class="s" style="font-size:12px">rules matched,</text>
<text x="431" y="92" text-anchor="middle" class="s" style="font-size:12px">outputs, errors</text>
<line x1="506" y1="67" x2="526" y2="67" class="ln" marker-end="url(#re1a)"/>
<rect x="529" y="30" width="151" height="74" rx="10" class="box"/>
<text x="604" y="56" text-anchor="middle" class="t">Your code</text>
<text x="604" y="75" text-anchor="middle" class="s" style="font-size:12px">decides and acts:</text>
<text x="604" y="92" text-anchor="middle" class="s" style="font-size:12px">save, email, log</text>
<rect x="183" y="150" width="150" height="62" rx="10" class="box dim"/>
<text x="258" y="175" text-anchor="middle" class="t">Inputs</text>
<text x="258" y="195" text-anchor="middle" class="s m" style="font-size:11px">customer, order, context</text>
<line x1="258" y1="150" x2="258" y2="107" class="ln" marker-end="url(#re1a)"/>
<text x="356" y="186" class="lbl">Rules decide; side effects stay in your code.</text>
</svg></div><figcaption><b>The shape of a rules-engine integration.</b> Rules are data, loaded once; the engine evaluates them against inputs; your code owns what happens next.</figcaption></figure>

## 1. Install and write your first rules

```bash
dotnet add package RulesEngine
```

The example is an order discount: which discounts does an order qualify for? Each **workflow** is a named set of rules, and each rule has a C#-like expression:

```json
[
  {
    "WorkflowName": "OrderDiscount",
    "Rules": [
      {
        "RuleName": "LoyalCustomer10",
        "SuccessEvent": "10",
        "ErrorMessage": "Customer is not eligible for the loyalty discount.",
        "Expression": "customer.YearsAsCustomer >= 3 AND order.Total >= 50"
      },
      {
        "RuleName": "BulkOrder15",
        "SuccessEvent": "15",
        "Expression": "order.ItemCount >= 20"
      },
      {
        "RuleName": "BlackFriday20",
        "SuccessEvent": "20",
        "LocalParams": [
          { "Name": "inPromotion", "Expression": "RuleHelpers.IsBetween(context.Today, \"2026-11-27\", \"2026-11-30\")" }
        ],
        "Expression": "inPromotion AND order.Total >= 100"
      }
    ]
  }
]
```

- **`Expression`** is evaluated against named inputs (`customer`, `order`, `context`). `AND`/`OR` and `&&`/`||` both work.
- **`SuccessEvent`** is a value you get back when the rule passes. Here it's the discount percentage.
- **`LocalParams`** names a sub-expression, so long rules stay readable and parts can be reused.

Save this as `Rules/discounts.json`, set it to copy to the output folder, and commit it alongside your code.

## 2. Keep the engine behind your own interface

This is the most important practice. The rest of the app should ask a business question ("what discount applies?") and get a typed answer. It shouldn't know a rules engine exists.

```csharp
public sealed record Customer(int Id, int YearsAsCustomer);
public sealed record OrderSummary(decimal Total, int ItemCount);
public sealed record RuleContext(DateTime Today);

public sealed record DiscountDecision(int Percent, IReadOnlyList<string> MatchedRules);

public interface IDiscountRules
{
    Task<DiscountDecision> EvaluateAsync(Customer customer, OrderSummary order, DateTime today);
}
```

```csharp
using RulesEngine.Models;

public sealed class DiscountRules(RulesEngine.RulesEngine engine, ILogger<DiscountRules> log) : IDiscountRules
{
    public async Task<DiscountDecision> EvaluateAsync(Customer customer, OrderSummary order, DateTime today)
    {
        var results = await engine.ExecuteAllRulesAsync("OrderDiscount",
            new RuleParameter("customer", customer),
            new RuleParameter("order", order),
            new RuleParameter("context", new RuleContext(today)));

        // A rule that throws doesn't stop the others; it reports an error and counts as "not matched".
        foreach (var failed in results.Where(r => !string.IsNullOrEmpty(r.ExceptionMessage)))
            log.LogError("Discount rule {Rule} failed: {Error}", failed.Rule.RuleName, failed.ExceptionMessage);

        var matched = results.Where(r => r.IsSuccess).ToList();

        // The business decision lives here, in code: discounts don't stack, the best one wins.
        var percent = matched.Select(r => int.Parse(r.Rule.SuccessEvent)).DefaultIfEmpty(0).Max();

        log.LogInformation("Discount {Percent}% for customer {CustomerId}; matched {Rules}",
            percent, customer.Id, matched.Select(r => r.Rule.RuleName));

        return new DiscountDecision(percent, matched.Select(r => r.Rule.RuleName).ToList());
    }
}
```

This gives you:

- **one place** that knows rule names, input names and result shapes
- a **typed result** the rest of the app can rely on
- an interface you can **fake in unit tests** of the code that uses it
- the freedom to **swap engines**, or go back to plain C#, without touching callers

Note that the engine reports *which rules passed*; your code decides what that *means* (best discount wins, or add them up, or the first match wins). Keep that policy in code where it's visible and tested.

## 3. Register it once, as a singleton

The engine compiles each rule into a delegate on first use and caches it. Creating a new engine per request throws that work away. Build it once at startup:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using RulesEngine.Models;

builder.Services.AddSingleton(sp =>
{
    var path = Path.Combine(AppContext.BaseDirectory, "Rules", "discounts.json");
    var workflows = JsonSerializer.Deserialize<Workflow[]>(File.ReadAllText(path),
        new JsonSerializerOptions { Converters = { new JsonStringEnumConverter() } })!;

    var settings = new ReSettings
    {
        CustomTypes = [typeof(RuleHelpers)]   // the only extra types rules may call
    };
    return new RulesEngine.RulesEngine(workflows, settings);
});

builder.Services.AddSingleton<IDiscountRules, DiscountRules>();
```

`CustomTypes` exposes your own helper methods to expressions. Keep them small, pure and well tested:

```csharp
public static class RuleHelpers
{
    public static bool IsBetween(DateTime date, string from, string to) =>
        date.Date >= DateTime.Parse(from).Date && date.Date <= DateTime.Parse(to).Date;
}
```

## 4. Pass time and context in; never read them inside a rule

Rules should be **deterministic**: the same inputs always give the same answer. That's why the example passes `context.Today` in instead of calling `DateTime.Now` inside the expression. It means you can:

- **test** a Black Friday rule in July
- **replay** a past decision exactly when a customer queries it
- avoid rules quietly changing at midnight, or behaving differently on servers in different time zones

Use `TimeProvider` in the calling code, so tests can control the date too.

## 5. Treat rules like code: version, review and validate them

Moving rules out of C# doesn't make changes safe. It just moves where the risk is. Give rule changes the same discipline as code:

- **Store them in source control**, or in a database table with a version number, who changed it, when and why.
- **Review changes.** A pull request on `discounts.json` is a perfectly good approval process.
- **Validate before publishing.** Rules compile when they first run, so a typo only shows up in production unless you test for it (see below).
- **Keep the previous version** so you can roll back in seconds.

If rules live in a database and change without a deployment, reload them without restarting:

```csharp
public sealed class RulesReloader(RulesEngine.RulesEngine engine, IRuleStore store, ILogger<RulesReloader> log)
    : BackgroundService
{
    private int _loadedVersion;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var latest = await store.GetPublishedAsync("OrderDiscount", stoppingToken);
            if (latest.Version == _loadedVersion) continue;

            engine.AddOrUpdateWorkflow(latest.Workflow);
            _loadedVersion = latest.Version;
            log.LogInformation("Loaded OrderDiscount rules version {Version}", latest.Version);
        }
    }
}
```

## 6. Test every rule, using the real rule file

Load the **same JSON the app uses** and run table-driven tests. This catches both logic mistakes and typos in expressions:

```csharp
public class DiscountRulesTests
{
    private static readonly IDiscountRules Rules = Build();

    [Theory]
    [InlineData(5, 60, 1, "2026-07-01", 10)]   // loyal customer, order over £50
    [InlineData(1, 60, 1, "2026-07-01", 0)]    // new customer: no discount
    [InlineData(1, 30, 25, "2026-07-01", 15)]  // bulk order
    [InlineData(5, 150, 1, "2026-11-28", 20)]  // Black Friday beats loyalty
    [InlineData(5, 150, 1, "2026-12-01", 10)]  // day after Black Friday
    public async Task Picks_the_right_discount(int years, decimal total, int items, string today, int expected)
    {
        var result = await Rules.EvaluateAsync(
            new Customer(1, years), new OrderSummary(total, items), DateTime.Parse(today));

        Assert.Equal(expected, result.Percent);
    }

    [Fact]
    public async Task Every_rule_compiles_and_runs_without_errors()
    {
        var engine = BuildEngine();
        var results = await engine.ExecuteAllRulesAsync("OrderDiscount",
            new RuleParameter("customer", new Customer(1, 1)),
            new RuleParameter("order", new OrderSummary(1, 1)),
            new RuleParameter("context", new RuleContext(DateTime.Today)));

        Assert.All(results, r => Assert.True(string.IsNullOrEmpty(r.ExceptionMessage),
            $"{r.Rule.RuleName}: {r.ExceptionMessage}"));
    }

    // BuildEngine() loads Rules/discounts.json exactly as Program.cs does;
    // Build() wraps it in DiscountRules with a NullLogger.
}
```

Run the "every rule compiles" test in CI on every change to the rules, and run the same check before publishing a new version from an admin screen.

## 7. Handle failures on purpose

- **Fail closed.** If a rule throws (a null property, a bad cast), RulesEngine reports it in `ExceptionMessage` and treats the rule as not matched. For a discount that's safe. For something like a fraud check, "not matched" might mean "allowed", so check for errors and decide explicitly what a failure means.
- **Log which rules fired**, with the rules version. When someone asks "why did this customer get 20%?", you need to answer from the logs, not by re-running today's rules.
- **Validate inputs before** you call the engine. Rules are much simpler when they can assume `order` isn't null.

## 8. Security and performance

- **Rule expressions are code.** RulesEngine compiles them with `System.Linq.Dynamic.Core`. Only let trusted people edit rules, keep the library and its dependencies up to date (older versions of the dynamic LINQ library had code-execution vulnerabilities), and expose only the helper types you need through `CustomTypes`.
- **Pass small, flat input objects.** Give rules a DTO with exactly what they need, not an EF Core entity with navigation properties. That avoids lazy-loading surprises and accidentally exposing data.
- **Don't do I/O in rules.** No database calls or HTTP from helper methods. Load the data first and pass it in.
- **Reuse the singleton engine** so compiled rules stay cached. Measure if you're evaluating thousands of decisions a second; in most apps the cost is tiny compared to the database calls around it.

## 9. Keep rules readable

- **Name rules after the business rule**, e.g. `LoyalCustomer10`, not `Rule3`.
- **One condition per rule** where you can. Five small rules are easier to test and explain than one giant expression.
- **Use `LocalParams`** for named sub-expressions instead of repeating logic.
- **Put messages in `ErrorMessage`** that a support person could read to a customer.
- **Use nested rules** (`"Operator": "And"` or `"Or"` with child `Rules`) for genuinely grouped conditions, but don't nest deeply. If you need several levels, it's probably code.

## Alternatives

- **Plain C# with the strategy or specification pattern.** Each rule is a small class implementing `IDiscountRule`, registered in DI. It's type-safe, fully debuggable and easy to test. Choose this when developers own the rules.
- **[NRules](https://nrules.net/)** is a forward-chaining production rules engine for .NET. It fits complex rule interactions, where one rule's result triggers others, with rules written in C#.
- **Commercial decision platforms** suit organisations that need business users authoring rules through a UI, with built-in approval, audit and simulation.

## Checklist

- [ ] There's a real reason to use a rules engine (rules change often, there are many of them, or business users need to see them).
- [ ] The engine is hidden behind an interface that returns a typed business result.
- [ ] One singleton engine, built once at startup or reloaded on version change.
- [ ] Time and context are passed in; rules are deterministic and have no side effects.
- [ ] Rules are versioned, reviewed and can be rolled back.
- [ ] Every rule is covered by table-driven tests that use the real rule file, plus a "compiles and runs" test in CI.
- [ ] Rule errors are logged, and the app decides explicitly what a failure means.
- [ ] Only trusted people can edit rules, and the library is kept up to date.

## Sources

- [Microsoft RulesEngine documentation](https://microsoft.github.io/RulesEngine/) — workflows, rules, `LocalParams`, actions, `ReSettings`
- [RulesEngine on NuGet](https://www.nuget.org/packages/RulesEngine) — version 6.0.1, targets including .NET 10
- [Getting Started](https://github.com/microsoft/RulesEngine/wiki/Getting-Started) — RulesEngine wiki
- [Understanding MS Rules Engine built-in post-rule actions](https://dev.to/vamsidogiparthi/understanding-ms-rules-engine-in-built-post-rule-actions-part-3-3i2k) — DEV Community
- [Replacing the BizTalk Business Rules Engine](https://milkyware.github.io/integration/replacing-biztalk-business-rules-engine)
- [NRules](https://nrules.net/)
