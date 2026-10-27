---
title: "Fixing EF Core's \"A second operation was started on this context instance\" error"
description: A practical guide to EF Core's most common lifetime bug — what the "second operation was started on this context instance before a previous operation completed" error means, the six usual causes (missing awaits, Task.WhenAll, singletons, background services, Blazor Server, open readers), and how to fix and prevent each one in .NET 8 and 10.
pubDate: 2026-10-27T08:30:00Z
tags: [C#, .NET 10, EF Core, Dependency Injection, Debugging]
ai: "Made with AI: this guide, its sample code and diagram were produced with Claude, an AI assistant. The code targets .NET 8/10 with EF Core but hasn't been compiled or run yet."
---

If you've worked with Entity Framework Core for long, you've probably seen this:

```text
System.InvalidOperationException: A second operation was started on this context instance
before a previous operation completed. This is usually caused by different threads concurrently
using the same instance of DbContext.
```

It's one of the most common EF Core errors, and it's frustrating because it's often **intermittent**: fine on your machine, then failing under load in production.

The cause is always the same: **two pieces of code used one `DbContext` at the same time**. A `DbContext` isn't thread-safe and can only run one database operation at a time. The fix depends on *how* two operations ended up sharing it.

## The one rule

> One `DbContext` per unit of work, used by one operation at a time.

In a web app, a "unit of work" is normally one HTTP request, which is why `AddDbContext` registers the context as **scoped** by default. Most cases of this bug come from breaking that rule without realising it.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 230" role="img" aria-label="Left: the bug. Two operations, such as two parallel tasks or two requests through a singleton, both call into the same DbContext at once, and the second throws InvalidOperationException. Right: the fix. Each operation gets its own DbContext, from a scope or IDbContextFactory, so they run independently.">
<defs><marker id="ef1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="ef1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<text x="165" y="20" text-anchor="middle" class="lbl">The bug: one shared context</text>
<rect x="10" y="36" width="130" height="44" rx="10" class="box"/>
<text x="75" y="63" text-anchor="middle" class="t">Operation A</text>
<rect x="10" y="100" width="130" height="44" rx="10" class="box"/>
<text x="75" y="127" text-anchor="middle" class="t">Operation B</text>
<line x1="140" y1="58" x2="187" y2="82" class="ln" marker-end="url(#ef1a)"/>
<line x1="140" y1="122" x2="187" y2="100" class="ln" marker-end="url(#ef1a)"/>
<rect x="190" y="66" width="130" height="50" rx="10" class="box dim"/>
<text x="255" y="96" text-anchor="middle" class="t">DbContext</text>
<text x="165" y="176" text-anchor="middle" class="s acc">B starts while A is still running:</text>
<text x="165" y="194" text-anchor="middle" class="s m acc" style="font-size:11px">InvalidOperationException</text>
<line x1="345" y1="20" x2="345" y2="210" class="ln dash"/>
<text x="525" y="20" text-anchor="middle" class="lbl">The fix: one context each</text>
<rect x="370" y="36" width="130" height="44" rx="10" class="box"/>
<text x="435" y="63" text-anchor="middle" class="t">Operation A</text>
<rect x="370" y="100" width="130" height="44" rx="10" class="box"/>
<text x="435" y="127" text-anchor="middle" class="t">Operation B</text>
<line x1="500" y1="58" x2="547" y2="58" class="ln hi" marker-end="url(#ef1h)"/>
<line x1="500" y1="122" x2="547" y2="122" class="ln hi" marker-end="url(#ef1h)"/>
<rect x="550" y="36" width="130" height="44" rx="10" class="box hi"/>
<text x="615" y="63" text-anchor="middle" class="t">DbContext 1</text>
<rect x="550" y="100" width="130" height="44" rx="10" class="box hi"/>
<text x="615" y="127" text-anchor="middle" class="t">DbContext 2</text>
<text x="525" y="176" text-anchor="middle" class="s">From a new scope, or</text>
<text x="525" y="194" text-anchor="middle" class="s m" style="font-size:11px">IDbContextFactory.CreateDbContext()</text>
</svg></div><figcaption><b>What's actually going wrong.</b> Every fix below is a way of making sure each concurrent operation has its own context, or isn't concurrent at all.</figcaption></figure>

Work through the causes below, roughly in order of how often they turn up.

## Cause 1: a missing `await`

By far the most common. A call returns a `Task`, nobody awaits it, and the next query starts while the first is still running:

```csharp
// ❌ The first call is still running when the second starts
public async Task<IActionResult> Update(int id)
{
    _auditService.LogAsync(id, "Updated");          // not awaited!
    var order = await _db.Orders.FindAsync(id);       // second operation → boom
    ...
}
```

Its close relative is **`async void`**. Nothing can await an `async void` method, so its database work keeps running in the background:

```csharp
// ❌ Nobody can wait for this
private async void SaveAudit(int id) => await _db.SaveChangesAsync();
```

**Fix:** await every async call, and make methods `async Task`, never `async void` (event handlers are the only exception). Turn the compiler warning into a build error, so a missing await can't slip through again:

```xml
<!-- .csproj -->
<PropertyGroup>
  <WarningsAsErrors>$(WarningsAsErrors);CS4014</WarningsAsErrors>
</PropertyGroup>
```

CS4014 is "this call is not awaited". Analysers such as `Microsoft.VisualStudio.Threading.Analyzers` also catch `async void` and other async mistakes.

## Cause 2: running queries in parallel on purpose

`Task.WhenAll` looks like an easy speed-up, but every task uses the same injected context:

```csharp
// ❌ Three queries on one context at the same time
var ordersTask    = _db.Orders.Where(o => o.CustomerId == id).ToListAsync();
var invoicesTask  = _db.Invoices.Where(i => i.CustomerId == id).ToListAsync();
var paymentsTask  = _db.Payments.Where(p => p.CustomerId == id).ToListAsync();
await Task.WhenAll(ordersTask, invoicesTask, paymentsTask);
```

The same happens with `Parallel.ForEach`, or `Parallel.ForEachAsync` over items that each hit the database.

**Fix, option A (usually the right one):** just await them one after another. Three small queries back to back are typically a few milliseconds, and the code is simpler.

```csharp
var orders   = await _db.Orders.Where(o => o.CustomerId == id).ToListAsync(ct);
var invoices = await _db.Invoices.Where(i => i.CustomerId == id).ToListAsync(ct);
var payments = await _db.Payments.Where(p => p.CustomerId == id).ToListAsync(ct);
```

**Fix, option B (when parallel really matters):** give each task its own context from `IDbContextFactory`:

```csharp
// Program.cs: registers both the factory and a scoped DbContext
builder.Services.AddDbContextFactory<AppDbContext>(o => o.UseSqlServer(connectionString));
```

```csharp
public class CustomerSummaryService(IDbContextFactory<AppDbContext> factory)
{
    public async Task<CustomerSummary> GetAsync(int id, CancellationToken ct)
    {
        var orders   = Query(db => db.Orders.Where(o => o.CustomerId == id).ToListAsync(ct));
        var invoices = Query(db => db.Invoices.Where(i => i.CustomerId == id).ToListAsync(ct));
        var payments = Query(db => db.Payments.Where(p => p.CustomerId == id).ToListAsync(ct));

        await Task.WhenAll(orders, invoices, payments);
        return new CustomerSummary(orders.Result, invoices.Result, payments.Result);
    }

    private async Task<T> Query<T>(Func<AppDbContext, Task<T>> query)
    {
        await using var db = await factory.CreateDbContextAsync();   // one context per task
        return await query(db);
    }
}
```

Bear in mind that this uses a database connection per task, so it isn't free under load.

## Cause 3: a context captured by a singleton

This is the classic "lifetime bug", and the one behind most **intermittent** failures. A service registered as a **singleton** gets a `DbContext` injected once at startup. From then on, every request shares that single context:

```csharp
builder.Services.AddDbContext<AppDbContext>(...);           // scoped
builder.Services.AddSingleton<IPricingCache, PricingCache>(); // singleton...

public class PricingCache(AppDbContext db) : IPricingCache  // ...holding a scoped context ❌
{
    public Task<decimal> GetPriceAsync(int productId) =>
        db.Products.Where(p => p.Id == productId).Select(p => p.Price).FirstAsync();
}
```

With one user, it works. With two requests at once, they collide on the shared context. It also serves stale tracked data and leaks memory as the change tracker grows forever. This is called a **captive dependency**: a longer-lived service holding onto a shorter-lived one.

The same thing happens if you register the context itself as a singleton (`ServiceLifetime.Singleton`), or store it in a `static` field.

**Fix:** match the lifetimes. Make the service scoped if it can be:

```csharp
builder.Services.AddScoped<IPricingCache, PricingCache>();
```

If it genuinely needs to be a singleton (it holds a cache, say), inject the **factory** instead and create a short-lived context per call:

```csharp
public class PricingCache(IDbContextFactory<AppDbContext> factory) : IPricingCache
{
    public async Task<decimal> GetPriceAsync(int productId, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        return await db.Products.Where(p => p.Id == productId).Select(p => p.Price).FirstAsync(ct);
    }
}
```

**Catch it automatically.** ASP.NET Core can spot captive dependencies at startup. It does this in Development by default; turn it on everywhere so the app refuses to start instead of failing randomly in production:

```csharp
builder.Host.UseDefaultServiceProvider(o =>
{
    o.ValidateScopes = true;   // error if a singleton consumes a scoped service
    o.ValidateOnBuild = true;  // check all registrations at startup
});
```

## Cause 4: background services and hosted services

A `BackgroundService` is a singleton, so injecting a `DbContext` into its constructor is cause 3 in disguise. It also has no HTTP request, so there's no request scope to hand it a context:

```csharp
// ❌ One context for the lifetime of the app, shared across every loop
public class ReminderWorker(AppDbContext db) : BackgroundService { ... }
```

**Fix:** create a scope for each piece of work, and resolve the context from it:

```csharp
public class ReminderWorker(IServiceScopeFactory scopeFactory, ILogger<ReminderWorker> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await using var scope = scopeFactory.CreateAsyncScope();   // fresh scope per run
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var due = await db.Reminders
                .Where(r => r.DueUtc <= DateTime.UtcNow && !r.Sent)
                .ToListAsync(stoppingToken);

            foreach (var r in due) r.Sent = true;
            await db.SaveChangesAsync(stoppingToken);
            log.LogInformation("Sent {Count} reminders", due.Count);
        }
    }
}
```

The same applies to anything outside a request: timer callbacks, message consumers (RabbitMQ, Service Bus), and `Task.Run` or "fire and forget" work started from a controller. Work started from a request that outlives it will also hit `ObjectDisposedException`, because the request's context is disposed when the request ends. Give that work its own scope.

## Cause 5: Blazor Server

In Blazor Server, a "scope" is the user's whole **circuit**, which can last for hours, not one request. A scoped `DbContext` is shared by every component on the page, so two components loading at once, or a user double-clicking a button, collide.

**Fix:** use `IDbContextFactory` in components, with one short-lived context per operation:

```razor
@inject IDbContextFactory<AppDbContext> DbFactory

@code {
    private List<Order> orders = [];

    protected override async Task OnInitializedAsync()
    {
        await using var db = await DbFactory.CreateDbContextAsync();
        orders = await db.Orders.AsNoTracking().OrderByDescending(o => o.Date).Take(50).ToListAsync();
    }
}
```

Microsoft's Blazor guidance recommends exactly this. Also disable buttons while a save is running, so a double click can't start a second operation.

## Cause 6: querying inside a loop over another query

Looping over a query with `await foreach` (or a synchronous `foreach` over an `IQueryable`) keeps a data reader open. Running another query inside the loop starts a second operation:

```csharp
// ❌ The outer query is still streaming when the inner one runs
await foreach (var customer in _db.Customers.AsAsyncEnumerable())
{
    var total = await _db.Orders.Where(o => o.CustomerId == customer.Id).SumAsync(o => o.Total);
}
```

Depending on the provider, this shows up as this error or as *"There is already an open DataReader associated with this Connection"*.

**Fix:** finish the first query before starting the next, or better, let the database do it in one query:

```csharp
// ✅ One query, no loop
var totals = await _db.Customers
    .Select(c => new { c.Id, c.Name, Total = c.Orders.Sum(o => o.Total) })
    .ToListAsync(ct);
```

If you must loop, materialise first with `ToListAsync()`. Lazy loading inside a loop causes the same problem (plus N+1 queries), so prefer `Include` or projections.

## Quick diagnosis checklist

When the error appears, look at the stack trace for the two operations, then ask:

1. **Is every async call awaited?** Search for unawaited calls and `async void`.
2. **Is there a `Task.WhenAll`, `Parallel.*` or `Task.Run`** touching the context?
3. **Who holds the context?** Follow the constructor chain up. Any **singleton**, `static` or **hosted service** in that chain is the bug.
4. **Is it Blazor Server?** Switch components to `IDbContextFactory`.
5. **Is there a query inside a loop** over another query?
6. **Does it only fail under load?** That points strongly at a shared context (causes 3 to 5), not a missing await.

## Prevent it

- Keep `AddDbContext`'s default **scoped** lifetime; never make the context a singleton or `static`.
- Turn on **`ValidateScopes` and `ValidateOnBuild`** in every environment.
- Make **CS4014 an error** and ban `async void` outside event handlers.
- Use **`IDbContextFactory`** for singletons, Blazor Server and genuine parallel work, and `IServiceScopeFactory` in background services.
- Keep contexts **short-lived**: create, query, save, dispose.
- Write a **load test** for busy endpoints. This bug hides with one user and appears with ten.

## Sources

- [DbContext lifetime, configuration, and initialization](https://learn.microsoft.com/ef/core/dbcontext-configuration/) — EF Core docs (threading, scoped lifetime, `IDbContextFactory`)
- [ASP.NET Core Blazor with Entity Framework Core](https://learn.microsoft.com/aspnet/core/blazor/blazor-ef-core) — Microsoft Learn
- [Dependency injection in ASP.NET Core: service lifetimes and scope validation](https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection) — Microsoft Learn
- [Background tasks with hosted services: consuming a scoped service](https://learn.microsoft.com/aspnet/core/fundamentals/host/hosted-services) — Microsoft Learn
- [Compiler warning CS4014](https://learn.microsoft.com/dotnet/csharp/language-reference/compiler-messages/cs4014) — Microsoft Learn
