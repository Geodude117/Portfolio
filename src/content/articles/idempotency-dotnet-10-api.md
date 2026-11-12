---
title: "Idempotency in .NET 10: making API calls safe to retry"
description: A practical guide to idempotent APIs in C# and .NET 10 — why retries create duplicates, the Idempotency-Key header, a reusable implementation with EF Core that claims each key once and replays the saved response, the client side, testing it, and the best practices that keep it reliable.
pubDate: 2026-11-12T21:00:00Z
tags: [C#, .NET 10, ASP.NET Core, Idempotency, EF Core, API Design]
guide: true
ai: "Made with AI: this guide, its sample code and diagram were produced with Claude, an AI assistant. The code targets .NET 10 and EF Core 10 but hasn't been compiled or run yet."
---

A user clicks **Submit**. The request reaches your API, the order is created, and then the response gets lost: a mobile signal drops, a load balancer times out, or a retry policy kicks in. The client never saw a reply, so it sends the request again. Now there are **two orders**.

The same thing happens with payments, sign-ups, emails, bookings, or any call that *creates* something. The fix is to make the operation **idempotent**: doing it twice has the same effect as doing it once.

## What idempotent means

An operation is **idempotent** if repeating it leaves the system in the same state as running it once.

| HTTP method | Idempotent by design? | Why |
| --- | --- | --- |
| `GET`, `HEAD` | Yes | They only read. |
| `PUT` | Yes | "Set this resource to this value"; setting it twice gives the same result. |
| `DELETE` | Yes | Once it's gone, deleting again changes nothing. |
| **`POST`** | **No** | "Create a new one"; each call creates another. |
| `PATCH` | Not necessarily | "Add 1 to the balance" twice adds 2. |

So the problem is almost always a `POST`. The common, well-established fix is an **idempotency key**.

## The idea: an Idempotency-Key header

The client generates a unique key (a GUID) for each *logical* operation and sends it with the request:

```http
POST /orders
Idempotency-Key: 7f3a2c1e-5b9d-4e8a-9c0f-1a2b3c4d5e6f
Content-Type: application/json

{ "customerId": 42, "productId": 7, "quantity": 1 }
```

If it has to retry, it sends **the same key** again. The server remembers each key it has seen:

- **New key:** do the work, save the response against the key, return it.
- **Key already completed:** don't do the work again; return the saved response.
- **Key still being processed:** return `409 Conflict`, so the client tries again shortly.
- **Same key, different body:** return `422 Unprocessable Content`, because it's a client bug to reuse a key for a different request.

This is the approach used by payment providers such as Stripe, and it's being standardised by the IETF as the [`Idempotency-Key` HTTP header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 270" role="img" aria-label="How the server handles an Idempotency-Key. The request arrives and the server tries to claim the key with an insert against a unique index. If the key is new, it does the work once, saves the response and returns 201. If the key was seen and completed with the same body, it replays the saved response without doing the work again. If the key is still in progress, it returns 409 Conflict. If the key was used with a different body, it returns 422.">
<defs><marker id="ik1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="ik1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="108" width="155" height="60" rx="10" class="box"/>
<text x="87" y="134" text-anchor="middle" class="t">POST /orders</text>
<text x="87" y="152" text-anchor="middle" class="s m" style="font-size:10.5px">Idempotency-Key: 7f3a…</text>
<line x1="165" y1="138" x2="192" y2="138" class="ln hi" marker-end="url(#ik1h)"/>
<rect x="195" y="108" width="150" height="60" rx="10" class="box hi"/>
<text x="270" y="134" text-anchor="middle" class="t">Claim the key</text>
<text x="270" y="152" text-anchor="middle" class="s m" style="font-size:10.5px">INSERT, unique index</text>
<path d="M345 130 L377 45" class="ln hi" marker-end="url(#ik1h)"/>
<path d="M345 136 L377 107" class="ln" marker-end="url(#ik1a)"/>
<path d="M345 142 L377 169" class="ln" marker-end="url(#ik1a)"/>
<path d="M345 148 L377 231" class="ln" marker-end="url(#ik1a)"/>
<rect x="380" y="20" width="300" height="50" rx="10" class="box hi"/>
<text x="530" y="40" text-anchor="middle" class="t">New key</text>
<text x="530" y="58" text-anchor="middle" class="s" style="font-size:12px">do the work once, save the response → 201</text>
<rect x="380" y="82" width="300" height="50" rx="10" class="box"/>
<text x="530" y="102" text-anchor="middle" class="t">Seen · completed · same body</text>
<text x="530" y="120" text-anchor="middle" class="s" style="font-size:12px">replay the saved response, no new work</text>
<rect x="380" y="144" width="300" height="50" rx="10" class="box"/>
<text x="530" y="164" text-anchor="middle" class="t">Seen · still in progress</text>
<text x="530" y="182" text-anchor="middle" class="s" style="font-size:12px">409 Conflict: retry shortly</text>
<rect x="380" y="206" width="300" height="50" rx="10" class="box dim"/>
<text x="530" y="226" text-anchor="middle" class="t">Seen · different body</text>
<text x="530" y="244" text-anchor="middle" class="s" style="font-size:12px">422: key reused for another request</text>
</svg></div><figcaption><b>One key, four outcomes.</b> Only the first request with a key ever does the work; every repeat gets the same answer back.</figcaption></figure>

## 1. Store the keys

A table records each key, a hash of the request it came with, and the response. The **primary key is the idempotency key** (scoped to the caller), so the database itself guarantees two requests can't both claim it, even if they arrive at the same millisecond on different servers.

```csharp
public enum IdempotencyStatus { InProgress = 0, Completed = 1 }

public class IdempotencyRecord
{
    public required string Scope { get; set; }        // who owns the key, e.g. the user or client ID
    public required string Key { get; set; }
    public required string RequestHash { get; set; }  // detects a key reused with a different body
    public IdempotencyStatus Status { get; set; }
    public int? ResponseStatusCode { get; set; }
    public string? ResponseBody { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime ExpiresUtc { get; set; }
}

// In AppDbContext.OnModelCreating
b.Entity<IdempotencyRecord>(e =>
{
    e.HasKey(r => new { r.Scope, r.Key });             // the unique guarantee
    e.Property(r => r.Scope).HasMaxLength(100);
    e.Property(r => r.Key).HasMaxLength(100);
    e.Property(r => r.RequestHash).HasMaxLength(64);
    e.HasIndex(r => r.ExpiresUtc);                     // for the clean-up job
});
```

Keys are scoped to the caller so one user can't collide with, or replay, another user's key.

## 2. A reusable idempotency service

This wraps any operation. It **claims** the key by inserting a row; if the insert hits the unique key, someone has used that key before, and it decides between replay, 409 and 422.

```csharp
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

public sealed class IdempotencyService(AppDbContext db, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan KeepFor = TimeSpan.FromHours(24);

    public async Task<IResult> ExecuteAsync<TRequest, TResponse>(
        HttpResponse httpResponse,
        string scope,
        string key,
        TRequest request,
        Func<CancellationToken, Task<(int StatusCode, TResponse Body)>> operation,
        CancellationToken ct)
    {
        var hash = Hash(request);
        var now = clock.GetUtcNow().UtcDateTime;

        // 1. Claim the key. Only one request can insert this row.
        var record = new IdempotencyRecord
        {
            Scope = scope, Key = key, RequestHash = hash,
            Status = IdempotencyStatus.InProgress,
            CreatedUtc = now, ExpiresUtc = now + KeepFor
        };
        db.IdempotencyRecords.Add(record);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsDuplicateKey(ex))
        {
            db.Entry(record).State = EntityState.Detached;
            return await HandleSeenKeyAsync(httpResponse, scope, key, hash, ct);
        }

        // 2. First time we've seen this key: do the work once.
        try
        {
            var (statusCode, body) = await operation(ct);

            record.Status = IdempotencyStatus.Completed;
            record.ResponseStatusCode = statusCode;
            record.ResponseBody = JsonSerializer.Serialize(body, Json);
            await db.SaveChangesAsync(ct);

            return Results.Json(body, Json, statusCode: statusCode);
        }
        catch
        {
            // The work failed, so there's nothing to replay. Release the key so the client can retry.
            db.IdempotencyRecords.Remove(record);
            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
    }

    private async Task<IResult> HandleSeenKeyAsync(
        HttpResponse httpResponse, string scope, string key, string hash, CancellationToken ct)
    {
        var seen = await db.IdempotencyRecords.AsNoTracking()
            .SingleAsync(r => r.Scope == scope && r.Key == key, ct);

        if (seen.RequestHash != hash)
            return Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity,
                title: "Idempotency key reused",
                detail: "This Idempotency-Key was already used with a different request body.");

        if (seen.Status == IdempotencyStatus.InProgress)
            return Results.Problem(statusCode: StatusCodes.Status409Conflict,
                title: "Request in progress",
                detail: "A request with this Idempotency-Key is still being processed. Retry shortly.");

        // Completed: return exactly what the first request returned.
        httpResponse.Headers["Idempotent-Replayed"] = "true";
        return Results.Text(seen.ResponseBody!, "application/json", statusCode: seen.ResponseStatusCode);
    }

    private static string Hash<T>(T request) =>
        Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request, Json)));

    // SQL Server: 2627 = primary key/unique constraint, 2601 = unique index
    private static bool IsDuplicateKey(DbUpdateException ex) =>
        ex.InnerException is SqlException { Number: 2627 or 2601 };
}
```

For PostgreSQL, check for `PostgresException { SqlState: "23505" }` instead.

A few deliberate choices:

- **The database does the locking.** No in-memory dictionary or `lock` statement, which wouldn't work across several servers.
- **Successes and business failures are both saved.** If the first call returned `400` because the product was out of stock, the retry gets the same `400`. Only unexpected exceptions release the key.
- **Replays are marked** with an `Idempotent-Replayed: true` header, which helps when debugging and lets clients tell the difference.

## 3. Use it on an endpoint

```csharp
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IdempotencyService>();
builder.Services.AddScoped<OrderService>();

app.MapPost("/orders", async (
        CreateOrder req,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        ClaimsPrincipal user,
        HttpContext http,
        IdempotencyService idempotency,
        OrderService orders,
        CancellationToken ct) =>
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Length > 100)
            return Results.Problem(statusCode: 400, title: "An Idempotency-Key header (max 100 characters) is required.");

        var scope = user.FindFirstValue(ClaimTypes.NameIdentifier)!;

        return await idempotency.ExecuteAsync(http.Response, scope, idempotencyKey, req,
            token => orders.CreateAsync(req, token), ct);
    })
    .RequireAuthorization();

public record CreateOrder(int CustomerId, int ProductId, int Quantity);
public record OrderCreated(int OrderId, string Status);
```

`OrderService.CreateAsync` is ordinary code that knows nothing about idempotency. It just returns a status code and a body:

```csharp
public class OrderService(AppDbContext db)
{
    public async Task<(int, OrderCreated)> CreateAsync(CreateOrder req, CancellationToken ct)
    {
        var order = new Order { CustomerId = req.CustomerId, ProductId = req.ProductId, Quantity = req.Quantity };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return (StatusCodes.Status201Created, new OrderCreated(order.Id, "Created"));
    }
}
```

The service and the idempotency record share the same scoped `DbContext`. If you need the order and the "completed" record saved in a single transaction, wrap the call in `db.Database.BeginTransactionAsync()`.

## 4. Pass the key on to other systems

If your operation calls another API (a payment provider, an email service, another microservice), **send the same key, or one derived from it, downstream**. If your server crashes after the downstream call but before saving the response, the client's retry calls downstream again, and that system deduplicates it too.

```csharp
var request = new HttpRequestMessage(HttpMethod.Post, "v1/charges") { Content = JsonContent.Create(charge) };
request.Headers.Add("Idempotency-Key", $"order-{idempotencyKey}");
```

This is what makes the chain safe end to end. Many payment and messaging APIs (Stripe, Adyen and others) accept an idempotency key for this reason.

## 5. The client side

The server can only deduplicate if the client sends the **same key on every retry**. Create the key once per logical action, not per HTTP attempt:

```csharp
public class OrdersApiClient(HttpClient http)
{
    public async Task<OrderCreated> CreateAsync(CreateOrder order, string idempotencyKey, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "orders") { Content = JsonContent.Create(order) };
        request.Headers.Add("Idempotency-Key", idempotencyKey);

        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<OrderCreated>(ct))!;
    }
}

// The key is created when the user starts checking out, and reused for every retry of that one action
var key = Guid.NewGuid().ToString();
var created = await ordersApi.CreateAsync(order, key);
```

With `Microsoft.Extensions.Http.Resilience`, retries resend the same request, header included. If an endpoint *doesn't* support idempotency keys, turn retries off for `POST` so the resilience handler can't create duplicates:

```csharp
builder.Services.AddHttpClient<OrdersApiClient>(c => c.BaseAddress = new Uri("https://api.example.com/"))
    .AddStandardResilienceHandler(o => o.Retry.DisableForUnsafeHttpMethods());
```

In the UI, also **disable the button while the request is running**. That stops most double-clicks before they reach the server; the idempotency key catches the rest.

## 6. Clean up old keys

Keys only need to live as long as a client might retry: 24 hours is common. A small background service removes the rest:

```csharp
public class IdempotencyCleanup(IServiceScopeFactory scopes, TimeProvider clock) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var now = clock.GetUtcNow().UtcDateTime;
            await db.IdempotencyRecords.Where(r => r.ExpiresUtc < now).ExecuteDeleteAsync(stoppingToken);
        }
    }
}
```

## 7. Test it

The test that matters most fires the **same request twice at the same time** and checks the work happened once:

```csharp
[Fact]
public async Task Same_key_twice_creates_one_order()
{
    await using var app = new WebApplicationFactory<Program>();   // configured with a test database and auth
    var client = app.CreateClient();
    var order = new CreateOrder(CustomerId: 42, ProductId: 7, Quantity: 1);
    var key = Guid.NewGuid().ToString();

    var responses = await Task.WhenAll(Send(), Send());

    Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode || r.StatusCode == HttpStatusCode.Conflict));
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    Assert.Equal(1, await db.Orders.CountAsync(o => o.CustomerId == 42));

    Task<HttpResponseMessage> Send()
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/orders") { Content = JsonContent.Create(order) };
        req.Headers.Add("Idempotency-Key", key);
        return client.SendAsync(req);
    }
}
```

Add tests for the other outcomes too: a sequential retry gets the same order ID with `Idempotent-Replayed: true`, and the same key with a different body gets `422`. Run them against a real database (SQL Server in Testcontainers, for example), because the unique constraint is doing the real work.

## Other ways to get idempotency

The key approach works for any `POST`, but sometimes there's a simpler option:

- **Use a natural unique key.** If the business already has one ("one instalment per plan per month", "one booking per seat per showing"), put a **unique index** on it. A duplicate insert then fails instead of creating a second row. It's a good extra safety net even when you use idempotency keys.
- **Let the client choose the ID and use `PUT`.** `PUT /orders/{guid}` creates the order if it doesn't exist, and does nothing (or updates) if it does. That's naturally idempotent.
- **For message queues, keep an inbox.** Consumers (RabbitMQ, Service Bus) may receive the same message more than once. Save each processed message ID in a table with a unique key, in the same transaction as the work, and skip IDs you've already seen.

## Best practices

- **Require the key on every create operation that matters**, and reject requests without one with `400`.
- **Let the database enforce uniqueness.** An insert against a unique key is the only reliable lock across multiple servers.
- **Hash the request body** and reject a reused key with a different body (`422`).
- **Save and replay the full response**, including business errors, so retries get exactly the same answer.
- **Scope keys per user or client**, and cap their length.
- **Return `409` while the first request is still running**, rather than doing the work twice or making the client wait.
- **Pass the key downstream** to other APIs your operation calls.
- **Generate the key once per user action** on the client, and reuse it for every retry.
- **Expire keys** after a sensible window, and clean them up.
- **Test with concurrent requests**, not just sequential retries. That's where the bugs hide.

## Sources

- [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — IETF HTTPAPI working group draft
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) — Stripe API docs
- [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) — Amazon Builders' Library
- [Idempotent](https://developer.mozilla.org/en-US/docs/Glossary/Idempotent) — MDN glossary
- [Build resilient HTTP apps](https://learn.microsoft.com/dotnet/core/resilience/http-resilience) — Microsoft Learn (`DisableForUnsafeHttpMethods`)
- [ExecuteUpdate and ExecuteDelete](https://learn.microsoft.com/ef/core/saving/execute-insert-update-delete) — EF Core docs
