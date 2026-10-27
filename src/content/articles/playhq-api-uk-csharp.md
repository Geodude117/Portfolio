---
title: "Connecting to the UK PlayHQ API with C# and .NET 10"
description: A practical C# guide to PlayHQ's public APIs from the UK — the EU base URL, the x-api-key and x-phq-tenant headers, a typed HttpClient, cursor paging with IAsyncEnumerable, walking organisation → seasons → grades → games, handling 400/401/403, caching, testing and the gotchas in the data.
pubDate: 2026-10-26T23:30:00Z
tags: [C#, .NET 10, Basketball, PlayHQ, REST API, HttpClient]
ai: "Made with AI: this guide, its sample code and diagram were produced with Claude, an AI assistant, from PlayHQ's public support articles. The code hasn't been compiled or run against the live API yet, and a few details (the UK tenant name and the name of the response's list property) need confirming with PlayHQ before you rely on them."
---

[PlayHQ](https://www.playhq.com) runs registrations, fixtures, results and ladders for community sport. It started in Australia, but UK and European organisations run on it too (Basketball England is the example PlayHQ gives). If your club or league is on PlayHQ, its **public APIs** let you pull seasons, grades, fixtures and results into your own website, app or reports.

PlayHQ's own [How To Use PlayHQ API's](https://support.playhq.com/hc/en-us/articles/23949453276572-How-To-Use-PlayHQ-API-s) article explains the basics. This guide turns it into working C# for **.NET 10**, aimed at the **UK region**, with the structure you'd want in production code rather than a one-off script.

## The one thing to get right first: the UK base URL

PlayHQ runs separate environments per region. Most examples online use the Australian URL, which **won't know about your UK organisation**:

| Region | Base URL |
| --- | --- |
| **UK and Europe** | `https://api.euprod.playhq.com` |
| Australia and New Zealand | `https://api.playhq.com` |
| Canada | `https://api.caprod.playhq.com` |
| Australia (UAT/testing) | `https://api.uat.playhq.com` |

If you're getting `400 Bad Request` on an organisation ID you know is correct, check you're hitting `euprod` first.

## What you need before writing code

- **API credentials.** You request these through your national association or sport, not directly from a self-service portal. You'll get a **Client ID** (a UUID), which is sent as the `x-api-key` header.
- **The tenant.** Every request also needs an `x-phq-tenant` header: the sport's short name in lowercase. PlayHQ's examples are Australian (`afl`, `ca` for Cricket Australia, `bv` for Basketball Victoria), and the public article doesn't list the UK values, so **ask your association or PlayHQ which tenant to use**.
- **Your organisation ID.** A 32-character UUID for your club or association. A league or club administrator can get it for you from PlayHQ.

**Public vs private APIs.** The public APIs (seasons, grades, fixtures, ladders) need only those two headers. Private APIs, such as the partner games-by-date endpoint, also need an `Authorization: Bearer {token}` header and are only available to approved partners. This guide sticks to the public ones.

## How it fits together

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 300" role="img" aria-label="How the C# client talks to the UK PlayHQ API. The .NET app's typed PlayHqClient sends requests through a headers handler that adds x-api-key and x-phq-tenant, to api.euprod.playhq.com. The calls form a chain: your organisation ID gives seasons, a season ID gives grades, and a grade ID gives games. Each call pages with a cursor while metadata.hasMore is true.">
<defs><marker id="p1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="p1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="20" width="200" height="64" rx="10" class="box"/>
<text x="110" y="46" text-anchor="middle" class="t">Your .NET 10 app</text>
<text x="110" y="66" text-anchor="middle" class="s m" style="font-size:11px">PlayHqClient (typed)</text>
<line x1="210" y1="52" x2="242" y2="52" class="ln hi" marker-end="url(#p1h)"/>
<rect x="245" y="20" width="200" height="64" rx="10" class="box hi"/>
<text x="345" y="44" text-anchor="middle" class="t">Headers handler</text>
<text x="345" y="62" text-anchor="middle" class="s m acc" style="font-size:11px">x-api-key: {clientId}</text>
<text x="345" y="77" text-anchor="middle" class="s m acc" style="font-size:11px">x-phq-tenant: {sport}</text>
<line x1="445" y1="52" x2="477" y2="52" class="ln hi" marker-end="url(#p1h)"/>
<rect x="480" y="20" width="200" height="64" rx="10" class="box"/>
<text x="580" y="46" text-anchor="middle" class="t">PlayHQ UK/EU</text>
<text x="580" y="66" text-anchor="middle" class="s m" style="font-size:11px">api.euprod.playhq.com</text>
<text x="345" y="130" text-anchor="middle" class="lbl">The call chain: each step's IDs feed the next</text>
<rect x="10" y="150" width="200" height="72" rx="10" class="box"/>
<text x="110" y="174" text-anchor="middle" class="t">Seasons</text>
<text x="110" y="194" text-anchor="middle" class="s m" style="font-size:11px">/v1/organisations/</text>
<text x="110" y="209" text-anchor="middle" class="s m" style="font-size:11px">{orgId}/seasons</text>
<line x1="210" y1="186" x2="242" y2="186" class="ln" marker-end="url(#p1a)"/>
<rect x="245" y="150" width="200" height="72" rx="10" class="box"/>
<text x="345" y="174" text-anchor="middle" class="t">Grades</text>
<text x="345" y="194" text-anchor="middle" class="s m" style="font-size:11px">/v1/seasons/</text>
<text x="345" y="209" text-anchor="middle" class="s m" style="font-size:11px">{seasonId}/grades</text>
<line x1="445" y1="186" x2="477" y2="186" class="ln" marker-end="url(#p1a)"/>
<rect x="480" y="150" width="200" height="72" rx="10" class="box"/>
<text x="580" y="174" text-anchor="middle" class="t">Games</text>
<text x="580" y="194" text-anchor="middle" class="s m" style="font-size:11px">/v1/grades/</text>
<text x="580" y="209" text-anchor="middle" class="s m" style="font-size:11px">{gradeId}/games</text>
<rect x="10" y="246" width="670" height="40" rx="10" class="box dim"/>
<text x="345" y="271" text-anchor="middle" class="s">Every list pages: repeat with <tspan class="m acc">?cursor={metadata.nextCursor}</tspan> while <tspan class="m acc">metadata.hasMore</tspan> is true</text>
</svg></div><figcaption><b>The shape of the integration.</b> One typed client and one handler that adds the headers, then a chain of public endpoints that each page with a cursor.</figcaption></figure>

## 1. Create the project

A console app on the generic host gives you configuration, user-secrets, logging and `IHttpClientFactory`, the same way an ASP.NET Core app would. The same code drops straight into a Web API or Blazor app.

```bash
dotnet new console -n PlayHq.Uk --framework net10.0
cd PlayHq.Uk
dotnet add package Microsoft.Extensions.Hosting
dotnet add package Microsoft.Extensions.Http.Resilience
dotnet add package Microsoft.Extensions.Caching.Hybrid
dotnet user-secrets init
```

## 2. Configuration and secrets

Keep the non-secret settings in `appsettings.json`:

```json
{
  "PlayHq": {
    "BaseUrl": "https://api.euprod.playhq.com/",
    "Tenant": "your-sport-tenant",
    "OrganisationId": "00000000000000000000000000000000"
  }
}
```

Put the Client ID in user-secrets locally, and in Key Vault or your pipeline's secret store everywhere else. It should never be committed:

```bash
dotnet user-secrets set "PlayHq:ApiKey" "your-client-id-uuid"
```

Bind it to a validated options class, so a missing setting fails at startup rather than as a confusing 400 later:

```csharp
using System.ComponentModel.DataAnnotations;

public sealed class PlayHqOptions
{
    public const string Section = "PlayHq";

    [Required, Url]
    public string BaseUrl { get; set; } = "https://api.euprod.playhq.com/";

    [Required]
    public string ApiKey { get; set; } = "";

    [Required]
    public string Tenant { get; set; } = "";

    [Required]
    public string OrganisationId { get; set; } = "";
}
```

Note the **trailing slash** on `BaseUrl`. With `HttpClient.BaseAddress`, a relative path like `v1/seasons/...` is resolved against the base address, and without the slash the last segment gets replaced.

## 3. A handler that adds the PlayHQ headers

Rather than setting headers in every method, a `DelegatingHandler` adds them to every request the client sends. It reads options on each request, so a rotated key in configuration is picked up without a restart.

```csharp
using Microsoft.Extensions.Options;

public sealed class PlayHqHeadersHandler(IOptionsMonitor<PlayHqOptions> options)
    : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var o = options.CurrentValue;
        request.Headers.Remove("x-api-key");
        request.Headers.Remove("x-phq-tenant");
        request.Headers.Add("x-api-key", o.ApiKey);
        request.Headers.Add("x-phq-tenant", o.Tenant);
        return base.SendAsync(request, cancellationToken);
    }
}
```

## 4. Models

PlayHQ returns camelCase JSON, so `JsonSerializerDefaults.Web` maps it onto C# records without attributes. These cover the fields in PlayHQ's documentation for seasons, grades and games:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

// Every list endpoint returns a page of items plus paging metadata.
// PlayHQ's articles document "metadata" but not the list's property name;
// "data" is assumed here — check one real response and adjust if needed.
public sealed record Page<T>(
    [property: JsonPropertyName("data")] List<T> Items,
    PageMetadata Metadata);

public sealed record PageMetadata(bool HasMore, string? NextCursor);

public sealed record Season(
    string Id,
    string Name,
    string Status,            // Upcoming, Active or Completed
    DateTimeOffset? CreatedAt,
    DateTimeOffset? UpdatedAt,
    NamedRef? Association,
    NamedRef? Competition);

public sealed record Grade(string Id, string Name, string? Url);

public sealed record NamedRef(string Id, string Name, string? Url = null);

public sealed record Game(
    string Id,
    string Status,
    string? Url,
    Round? Round,
    NamedRef? Pool,
    Schedule? Schedule,
    List<Competitor> Competitors,
    Venue? Venue);

public sealed record Round(string Id, string Name, string? AbbreviatedName, bool IsFinalRound);

public sealed record Schedule(string? Date, string? Time, string? Timezone);

public sealed record Competitor(
    string Id,
    string Name,
    bool IsHomeTeam,
    string? Outcome,
    decimal? ScoreTotal,
    // Documented inconsistently (object vs array), so keep it raw until you've seen real data.
    JsonElement? ScoreSubtotals);

public sealed record Venue(
    string Id,
    string Name,
    string? SurfaceName,
    string? SurfaceNameAbbreviation,
    Address? Address);

public sealed record Address(
    string? Line1,
    string? Suburb,
    [property: JsonConverter(typeof(StringOrNumberConverter))] string? Postcode,
    string? State,
    string? Country,
    double? Latitude,
    double? Longitude);
```

Two UK-specific details are hiding in there. PlayHQ documents `postcode` as a **number**, which is fine for Australian postcodes but not for `HU1 3AA`. The converter accepts either, so you never lose a UK postcode or crash on an Australian one:

```csharp
public sealed class StringOrNumberConverter : JsonConverter<string?>
{
    public override string? Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) =>
        reader.TokenType switch
        {
            JsonTokenType.String => reader.GetString(),
            JsonTokenType.Number => reader.TryGetInt64(out var n) ? n.ToString() : reader.GetDouble().ToString(),
            JsonTokenType.Null => null,
            _ => throw new JsonException($"Unexpected token {reader.TokenType} for a postcode.")
        };

    public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value);
}
```

The other is that address fields are Australian-shaped: `suburb` and `state` will hold whatever the organisation entered, typically a town and a county. Treat them as display text, not structured data.

## 5. The client, with cursor paging

Each list endpoint returns about 100 items. When `metadata.hasMore` is true, you call the same URL again with `?cursor={metadata.nextCursor}`. `IAsyncEnumerable<T>` hides that loop, so callers just `await foreach` and pages are fetched only as they're needed:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.Options;

public sealed class PlayHqClient(HttpClient http, IOptions<PlayHqOptions> options)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string _organisationId = options.Value.OrganisationId;

    public IAsyncEnumerable<Season> GetSeasonsAsync(CancellationToken ct = default) =>
        GetAllAsync<Season>($"v1/organisations/{Uri.EscapeDataString(_organisationId)}/seasons", ct);

    public IAsyncEnumerable<Grade> GetGradesAsync(string seasonId, CancellationToken ct = default) =>
        GetAllAsync<Grade>($"v1/seasons/{Uri.EscapeDataString(seasonId)}/grades", ct);

    public IAsyncEnumerable<Game> GetGradeGamesAsync(string gradeId, CancellationToken ct = default) =>
        GetAllAsync<Game>($"v1/grades/{Uri.EscapeDataString(gradeId)}/games", ct);

    public IAsyncEnumerable<Game> GetTeamFixtureAsync(string teamId, CancellationToken ct = default) =>
        GetAllAsync<Game>($"v1/teams/{Uri.EscapeDataString(teamId)}/fixture", ct);

    private async IAsyncEnumerable<T> GetAllAsync<T>(
        string path, [EnumeratorCancellation] CancellationToken ct)
    {
        string? cursor = null;
        do
        {
            var url = cursor is null ? path : $"{path}?cursor={Uri.EscapeDataString(cursor)}";
            using var response = await http.GetAsync(url, ct);
            await EnsureSuccessAsync(response, url, ct);

            var page = await response.Content.ReadFromJsonAsync<Page<T>>(Json, ct)
                       ?? throw new PlayHqException(response.StatusCode, url, "Empty response body.");

            foreach (var item in page.Items)
                yield return item;

            cursor = page.Metadata.HasMore ? page.Metadata.NextCursor : null;
        }
        while (cursor is not null);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, string url, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;

        var body = await response.Content.ReadAsStringAsync(ct);
        var hint = response.StatusCode switch
        {
            HttpStatusCode.BadRequest =>
                "Check the ID is a valid PlayHQ UUID, you passed only one, and you're on the UK base URL (api.euprod.playhq.com).",
            HttpStatusCode.Unauthorized =>
                "The endpoint is private, or the x-api-key is wrong. Private APIs also need a Bearer token.",
            HttpStatusCode.Forbidden =>
                "The organisation belongs to a different sport than your x-phq-tenant header, or your key isn't allowed to see it.",
            _ => "Unexpected response from PlayHQ."
        };
        throw new PlayHqException(response.StatusCode, url, $"{hint} Body: {body}");
    }
}

public sealed class PlayHqException(HttpStatusCode status, string url, string message)
    : Exception($"PlayHQ returned {(int)status} for {url}. {message}")
{
    public HttpStatusCode StatusCode { get; } = status;
    public string Url { get; } = url;
}
```

The paths for seasons, grades, grade games and team fixtures come from PlayHQ's published API articles. There are more endpoints (ladders, season teams, game summaries) in the [PlayHQ technical docs](https://docs.playhq.com/tech); add them as one-line methods on the same pattern.

## 6. Wire it up

```csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddOptions<PlayHqOptions>()
    .Bind(builder.Configuration.GetSection(PlayHqOptions.Section))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddTransient<PlayHqHeadersHandler>();

builder.Services.AddHttpClient<PlayHqClient>((sp, http) =>
    {
        var o = sp.GetRequiredService<IOptions<PlayHqOptions>>().Value;
        http.BaseAddress = new Uri(o.BaseUrl);
        http.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        http.DefaultRequestHeaders.UserAgent.ParseAdd("MyClub-PlayHq/1.0");
    })
    .AddHttpMessageHandler<PlayHqHeadersHandler>()
    .AddStandardResilienceHandler(); // retries 5xx/timeouts with backoff, circuit breaker

using var host = builder.Build();
var playHq = host.Services.GetRequiredService<PlayHqClient>();

// Walk the chain: active seasons → their grades → upcoming games.
await foreach (var season in playHq.GetSeasonsAsync())
{
    if (season.Status != "Active") continue;
    Console.WriteLine($"{season.Name} ({season.Competition?.Name})");

    await foreach (var grade in playHq.GetGradesAsync(season.Id))
    {
        Console.WriteLine($"  {grade.Name}");

        await foreach (var game in playHq.GetGradeGamesAsync(grade.Id))
        {
            var home = game.Competitors.FirstOrDefault(c => c.IsHomeTeam)?.Name ?? "TBC";
            var away = game.Competitors.FirstOrDefault(c => !c.IsHomeTeam)?.Name ?? "TBC";
            Console.WriteLine($"    {game.Schedule?.Date} {game.Schedule?.Time}  {home} v {away}  @ {game.Venue?.Name}");
        }
    }
}
```

The standard resilience handler only retries failures that are worth retrying (timeouts, 5xx, 429), so a 400 for a bad ID fails straight away with the helpful message from `EnsureSuccessAsync`.

## 7. Try it with an .http file first

Before writing any C#, prove your credentials, tenant and region with a `.http` file in Visual Studio, Rider or VS Code. If this returns your seasons, everything else is plumbing:

```http
@baseUrl = https://api.euprod.playhq.com
@apiKey = {{$dotenv PLAYHQ_API_KEY}}
@tenant = your-sport-tenant
@orgId = 00000000000000000000000000000000

### Seasons for my organisation
GET {{baseUrl}}/v1/organisations/{{orgId}}/seasons
x-api-key: {{apiKey}}
x-phq-tenant: {{tenant}}
Accept: application/json

### Grades for a season
GET {{baseUrl}}/v1/seasons/SEASON_ID/grades
x-api-key: {{apiKey}}
x-phq-tenant: {{tenant}}

### Games for a grade
GET {{baseUrl}}/v1/grades/GRADE_ID/games
x-api-key: {{apiKey}}
x-phq-tenant: {{tenant}}
```

This is also the moment to check the two things the docs leave open: the **name of the list property** in the JSON (the `Page<T>` record assumes `data`) and the **shape of `scoreSubtotals`**.

## 8. Cache it

Fixtures and grades change a few times a week, not every second, and PlayHQ doesn't publish rate limits. If you show fixtures on a website, cache them rather than calling PlayHQ on every page view. `HybridCache` in .NET 10 handles in-memory caching, optional Redis, and stops a stampede of identical requests when an entry expires:

```csharp
using Microsoft.Extensions.Caching.Hybrid;

builder.Services.AddHybridCache(o => o.DefaultEntryOptions = new HybridCacheEntryOptions
{
    Expiration = TimeSpan.FromMinutes(15),
    LocalCacheExpiration = TimeSpan.FromMinutes(5)
});

public sealed class FixtureService(PlayHqClient playHq, HybridCache cache)
{
    public ValueTask<List<Game>> GetGradeGamesAsync(string gradeId, CancellationToken ct = default) =>
        cache.GetOrCreateAsync(
            $"playhq:grade:{gradeId}:games",
            async token => await playHq.GetGradeGamesAsync(gradeId, token).ToListAsync(token),
            cancellationToken: ct);
}
```

`ToListAsync` on `IAsyncEnumerable<T>` is built into .NET 10's `System.Linq.AsyncEnumerable`; on older versions use the `System.Linq.Async` package. Use a shorter expiry on match days if you show live results.

## 9. Test it without calling PlayHQ

Because the client takes an `HttpClient`, you can give it a fake handler and test the paging and error handling without credentials or network:

```csharp
public sealed class StubHandler(Queue<HttpResponseMessage> responses) : HttpMessageHandler
{
    public List<string> Requested { get; } = [];

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Requested.Add(request.RequestUri!.PathAndQuery);
        return Task.FromResult(responses.Dequeue());
    }
}

[Fact]
public async Task Follows_the_cursor_until_hasMore_is_false()
{
    var stub = new StubHandler(new([
        Json("""{"data":[{"id":"g1","name":"U14 Boys"}],"metadata":{"hasMore":true,"nextCursor":"abc"}}"""),
        Json("""{"data":[{"id":"g2","name":"U16 Girls"}],"metadata":{"hasMore":false}}""")
    ]));
    var client = new PlayHqClient(
        new HttpClient(stub) { BaseAddress = new Uri("https://api.euprod.playhq.com/") },
        Options.Create(new PlayHqOptions { OrganisationId = "org" }));

    var grades = await client.GetGradesAsync("s1").ToListAsync();

    Assert.Equal(["g1", "g2"], grades.Select(g => g.Id));
    Assert.Equal("/v1/seasons/s1/grades?cursor=abc", stub.Requested[1]);
}

static HttpResponseMessage Json(string body) =>
    new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
```

Add the same kind of test for a `403`, checking the exception message mentions the tenant, and for a postcode that arrives as a string and as a number.

## Gotchas in the data

- **Latitude and longitude.** PlayHQ's own sample responses have them the wrong way round. Before you drop venues on a map, sanity-check one: UK latitudes are roughly 50–59 and longitudes roughly −8 to 2. If a Hull venue comes back at latitude −0.3, swap them.
- **Dates and times are local.** `schedule` gives a date, a time and a timezone as separate strings. Combine them with the timezone (`Europe/London`) into a `DateTimeOffset` before sorting or comparing, or BST will bite you twice a year.
- **Scores aren't final until they're final.** Outcomes and `scoreTotal` may be missing or provisional until the game is completed. Check `status` before showing a result.
- **One ID per call.** Every endpoint returns 400 if you pass several IDs. Fan out with separate calls (and cache them) instead.
- **403 usually means the wrong tenant.** The organisation belongs to a different sport than the one in your `x-phq-tenant` header.
- **Status strings.** Seasons use `Upcoming`, `Active` and `Completed`. Compare them case-insensitively, or map them to an enum with a fallback, so a new status doesn't break your app.

## Best practices

- **Never hard-code the Client ID.** User-secrets locally, Key Vault (or your pipeline's secret variables) in every other environment, and rotate it if it ever lands in a commit.
- **Make the region configuration, not code.** The base URL lives in `appsettings.json`, so the same build can point at a test environment or another region.
- **Call PlayHQ from your server, not the browser.** Putting the key in front-end JavaScript publishes it. Have your API or site fetch and cache the data, then serve it.
- **Use `IHttpClientFactory`.** It manages connection lifetimes and DNS changes for you; never `new HttpClient()` per call.
- **Stream with `IAsyncEnumerable`.** You only fetch the pages you actually consume, and a `break` stops further calls.
- **Store PlayHQ IDs, not names.** Team and grade names change between seasons; the UUIDs don't.
- **Log the URL and status, never the headers.** The headers contain your key.

## Sources

- [How To Use PlayHQ API's](https://support.playhq.com/hc/en-us/articles/23949453276572-How-To-Use-PlayHQ-API-s) — PlayHQ Support (regions, headers, credentials)
- [Season Grades](https://supporta.playhq.com/hc/en-au/articles/4405530765593-Season-Grades) — PlayHQ Support
- [Grade Fixture Collection](https://supporta.playhq.com/hc/en-au/articles/4405530772377-Grade-Fixture-Collection) — PlayHQ Support
- [Games Collection by organisation & date](https://supporta.playhq.com/hc/en-au/articles/4405422328473-Games-Collection-by-organisation-date) — PlayHQ Support (private partner API)
- [PlayHQ technical documentation](https://docs.playhq.com/tech)
- [Make HTTP requests using IHttpClientFactory](https://learn.microsoft.com/aspnet/core/fundamentals/http-requests) — Microsoft Learn
- [HybridCache library in ASP.NET Core](https://learn.microsoft.com/aspnet/core/performance/caching/hybrid) — Microsoft Learn
