---
title: "Connecting to the Strava API with C# and .NET"
description: "Building a typed Strava API client in .NET with dependency injection, IHttpClientFactory, a DelegatingHandler for OAuth, source-generated JSON and IAsyncEnumerable paging — starting with my Yorkshire Marathon data."
pubDate: 2026-10-26T21:15:00Z
tags: [C#, .NET, HttpClient, Strava, API]
ai: "Made with AI: this article and its sample code were drafted with Claude, an AI assistant (Anthropic). The diagram was also produced with Claude."
---

After running the Yorkshire Marathon I wanted to do more with my run data than scroll through the Strava app. Strava has a REST API, so I used it as an excuse to build a proper .NET API client the way I'd want one built at work: configuration and secrets handled properly, `HttpClient` managed by the framework, authentication kept out of the business code, and strongly typed models all the way through.

By the end you'll have a console app that finds your race, prints its km splits and heart rate, and summarises your training block week by week.

## What we're building

```text
StravaExplorer/
├── Program.cs                  // host setup + the calls we make
├── Strava.http                 // hand-run requests for exploring the API
└── Strava/
    ├── StravaOptions.cs        // strongly typed configuration
    ├── StravaAuthService.cs    // OAuth: authorise, store, refresh tokens
    ├── StravaAuthHandler.cs    // DelegatingHandler that adds the bearer token
    ├── StravaClient.cs         // typed HttpClient with one method per endpoint
    ├── Models.cs               // records for the JSON we care about
    └── StravaJsonContext.cs    // System.Text.Json source generation
```

Here's how a request flows through it:

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 300" role="img" aria-label="Request pipeline. Program.cs calls a method on StravaClient, a typed client. Its HttpClient comes from IHttpClientFactory, and every request passes through StravaAuthHandler, which asks StravaAuthService for an access token and adds it as a bearer header before the request reaches the Strava API. StravaAuthService returns the cached token, loads it from strava-token.json, refreshes it if expired, or runs the browser OAuth flow on first use, using a separate named HttpClient to call Strava's token endpoint.">
<defs><marker id="v1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="v1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="20" width="140" height="56" rx="10" class="box"/>
<text x="80" y="44" text-anchor="middle" class="t">Program.cs</text>
<text x="80" y="63" text-anchor="middle" class="s m">strava.Get…Async()</text>
<line x1="150" y1="48" x2="186" y2="48" class="ln hi" marker-end="url(#v1h)"/>
<rect x="190" y="20" width="150" height="56" rx="10" class="box"/>
<text x="265" y="44" text-anchor="middle" class="t">StravaClient</text>
<text x="265" y="63" text-anchor="middle" class="s">typed client</text>
<line x1="340" y1="48" x2="376" y2="48" class="ln hi" marker-end="url(#v1h)"/>
<rect x="380" y="20" width="150" height="56" rx="10" class="box hi"/>
<text x="455" y="44" text-anchor="middle" class="t">StravaAuthHandler</text>
<text x="455" y="63" text-anchor="middle" class="s">adds Bearer token</text>
<line x1="530" y1="48" x2="566" y2="48" class="ln hi" marker-end="url(#v1h)"/>
<rect x="570" y="20" width="110" height="56" rx="10" class="box"/>
<text x="625" y="44" text-anchor="middle" class="t">Strava API</text>
<text x="625" y="63" text-anchor="middle" class="s m">/api/v3</text>
<text x="345" y="100" text-anchor="middle" class="lbl">HttpClient pipeline from IHttpClientFactory</text>
<path d="M190 88 H530" class="ln dash" style="stroke:var(--border)"/>
<line x1="455" y1="76" x2="455" y2="150" class="ln" marker-end="url(#v1a)"/>
<text x="463" y="130" class="lbl m">GetAccessTokenAsync()</text>
<rect x="330" y="154" width="250" height="132" rx="10" class="box"/>
<text x="455" y="178" text-anchor="middle" class="t">StravaAuthService</text>
<text x="455" y="196" text-anchor="middle" class="s">singleton · SemaphoreSlim</text>
<text x="346" y="222" class="s m">1. cached in memory</text>
<text x="346" y="242" class="s m">2. load strava-token.json</text>
<text x="346" y="262" class="s m">3. refresh if expired</text>
<text x="346" y="280" class="s m">4. first run: browser OAuth</text>
<rect x="10" y="190" width="250" height="60" rx="10" class="box dim"/>
<text x="135" y="214" text-anchor="middle" class="t">Named client "strava-oauth"</text>
<text x="135" y="234" text-anchor="middle" class="s m">POST /oauth/token</text>
<line x1="330" y1="220" x2="264" y2="220" class="ln" marker-end="url(#v1a)"/>
<text x="297" y="212" text-anchor="middle" class="lbl">tokens</text>
</svg></div><figcaption><b>Authentication lives in the pipeline, not the client.</b> <code>StravaClient</code> never sees a token. The auth service uses its own named <code>HttpClient</code> for the token endpoint, so the auth handler never calls itself.</figcaption></figure>

The .NET pieces doing the work:

| Concern | .NET feature |
|---|---|
| Secrets | `dotnet user-secrets` + the options pattern |
| `HttpClient` lifetime | `IHttpClientFactory` via `AddHttpClient` |
| Auth on every request | A `DelegatingHandler` in the client pipeline |
| One method per endpoint | A typed client |
| JSON | Records + `JsonSerializerContext` source generation |
| Paging through history | `IAsyncEnumerable<T>` and `await foreach` |

## Before you start: Strava's 2026 changes

Strava overhauled its developer programme in 2026, so older tutorials are out of date:

- **A Strava subscription is required** to create a Standard Tier API application (for new developers from 1 June 2026, existing ones from 30 June 2026).
- **New apps start in "single-player" mode** with a capacity of one athlete: only your own account can connect, which is all a personal project needs. You can self-upgrade to 10 athletes from the API settings dashboard.
- **Default rate limits** are 200 requests per 15 minutes and 2,000 per day overall, but **reads are capped at 100 per 15 minutes and 1,000 per day**. Everything in this article is a read, so that's the limit that matters.
- **Access tokens expire every six hours**; a refresh token gets you a new one.
- **The base URL is moving** from `https://www.strava.com/api/v3` to `https://api-v3.strava.com`. The new host is available from 4 January 2027, and the old one is retired on 1 June 2027. Here it lives in configuration, so switching is a settings change, not a code change.
- **From 1 June 2027, tokens must be sent in request headers** rather than form parameters. This client already sends the access token as a `Bearer` header.
- **Strava's API Policy prohibits using API data in AI applications** (including prompts, embeddings and RAG). Claude helped write this code, but I'm not feeding my Strava data into an AI model. Read the [API Agreement and Policy](https://www.strava.com/legal/api) before building anything bigger.

## Step 1: Create the Strava app

1. Go to <https://www.strava.com/settings/api> and create an app.
2. Set **Authorization Callback Domain** to `localhost`.
3. Note the **Client ID** and **Client Secret**.

## Step 2: Create the project and store the secrets

```bash
dotnet new console -n StravaExplorer
cd StravaExplorer

dotnet add package Microsoft.Extensions.Hosting
dotnet add package Microsoft.Extensions.Http

dotnet user-secrets init
dotnet user-secrets set "Strava:ClientId" "12345"
dotnet user-secrets set "Strava:ClientSecret" "your_secret_here"

echo "strava-token.json" >> .gitignore
```

User secrets live in your user profile, outside the repo, so there's no risk of committing the client secret. I'm targeting .NET 8 or later for the snake_case naming policy and C# 12 primary constructors.

## Step 3: Explore the API with a `.http` file

Before writing any client code, it's worth poking at the API by hand. Rather than curl, I used a `.http` file, which runs directly in Visual Studio, Rider, or VS Code with the REST Client extension.

First, get an authorisation code by opening this in a browser (with your client ID):

```text
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=read,activity:read_all
```

Click **Authorize**. The browser lands on a "site can't be reached" page — that's fine. Copy the `code` value from the address bar into the file below and run the requests in order:

```http
# Strava.http — don't commit this with real values in it
@clientId = YOUR_CLIENT_ID
@clientSecret = YOUR_CLIENT_SECRET
@code = PASTE_CODE_FROM_BROWSER
@accessToken = PASTE_ACCESS_TOKEN_FROM_FIRST_RESPONSE

### 1. Swap the authorisation code for tokens
POST https://www.strava.com/oauth/token
Content-Type: application/x-www-form-urlencoded

client_id={{clientId}}&client_secret={{clientSecret}}&code={{code}}&grant_type=authorization_code

### 2. Who am I?
GET https://www.strava.com/api/v3/athlete
Authorization: Bearer {{accessToken}}

### 3. Last five activities
GET https://www.strava.com/api/v3/athlete/activities?per_page=5
Authorization: Bearer {{accessToken}}
```

Seeing the raw JSON here made it much easier to decide which fields to model. Now let's automate the whole thing in C#.

## Step 4: Strongly typed options

```csharp
// Strava/StravaOptions.cs
public sealed class StravaOptions
{
    public const string SectionName = "Strava";

    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";

    // Swap to https://api-v3.strava.com/ once Strava's new host is live.
    public Uri BaseUrl { get; set; } = new("https://www.strava.com/api/v3/");

    public string RedirectUri { get; set; } = "http://localhost:5000/exchange_token";
    public string Scopes { get; set; } = "read,activity:read_all";
}
```

## Step 5: Models and source-generated JSON

Records keep the models short and immutable. I only map the fields I use — anything else in the response is ignored.

```csharp
// Strava/Models.cs
using System.Text.Json.Serialization;

public sealed record StravaToken(string AccessToken, string RefreshToken, long ExpiresAt)
{
    // Treat the token as expired five minutes early to avoid edge cases.
    [JsonIgnore]
    public bool IsExpired => DateTimeOffset.UtcNow.ToUnixTimeSeconds() > ExpiresAt - 300;
}

public sealed record Athlete(long Id, string Firstname, string Lastname);

public sealed record ActivitySummary(
    long Id,
    string Name,
    string SportType,
    double Distance,            // metres
    int MovingTime,             // seconds
    int ElapsedTime,            // seconds
    double TotalElevationGain,
    DateTime StartDateLocal,
    double? AverageHeartrate);  // null when no HR monitor was used

public sealed record KmSplit(int Split, double Distance, int MovingTime, double? AverageHeartrate);

public sealed record DetailedActivity(
    long Id,
    string Name,
    double Distance,
    int MovingTime,
    List<KmSplit> SplitsMetric);

public sealed record StreamData(double[] Data);

public sealed record Totals(int Count, double Distance, int MovingTime, double ElevationGain);

public sealed record AthleteStats(Totals RecentRunTotals, Totals YtdRunTotals, Totals AllRunTotals);
```

Instead of reflection-based serialisation, a `JsonSerializerContext` generates the (de)serialisation code at compile time. It's faster, trim- and AOT-friendly, and the snake_case policy means no `[JsonPropertyName]` attributes on every property:

```csharp
// Strava/StravaJsonContext.cs
using System.Text.Json.Serialization;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower)]
[JsonSerializable(typeof(StravaToken))]
[JsonSerializable(typeof(Athlete))]
[JsonSerializable(typeof(List<ActivitySummary>))]
[JsonSerializable(typeof(DetailedActivity))]
[JsonSerializable(typeof(Dictionary<string, StreamData>))]
[JsonSerializable(typeof(AthleteStats))]
internal partial class StravaJsonContext : JsonSerializerContext;
```

## Step 6: The authentication service

This owns the OAuth flow. On first run it opens the browser, catches the redirect with a tiny `HttpListener`, and swaps the code for tokens. After that it reuses the saved tokens and refreshes them when they expire. A `SemaphoreSlim` makes sure concurrent requests don't all try to refresh at once.

```csharp
// Strava/StravaAuthService.cs
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

public sealed class StravaAuthService(
    IHttpClientFactory httpClientFactory,
    IOptions<StravaOptions> options,
    ILogger<StravaAuthService> logger)
{
    public const string OAuthClientName = "strava-oauth";
    private const string TokenFile = "strava-token.json";

    private readonly StravaOptions _options = options.Value;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private StravaToken? _token;

    public async Task<string> GetAccessTokenAsync(CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            _token ??= await LoadAsync(ct);

            if (_token is null)
            {
                _token = await AuthoriseAsync(ct);
                await SaveAsync(_token, ct);
            }
            else if (_token.IsExpired)
            {
                logger.LogInformation("Access token expired, refreshing");
                _token = await RefreshAsync(_token.RefreshToken, ct);
                await SaveAsync(_token, ct); // Strava can rotate the refresh token too
            }

            return _token.AccessToken;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<StravaToken> AuthoriseAsync(CancellationToken ct)
    {
        var redirect = new Uri(_options.RedirectUri);
        var url = "https://www.strava.com/oauth/authorize" +
                  $"?client_id={_options.ClientId}" +
                  "&response_type=code" +
                  $"&redirect_uri={Uri.EscapeDataString(_options.RedirectUri)}" +
                  "&approval_prompt=auto" +
                  $"&scope={_options.Scopes}";

        using var listener = new HttpListener();
        listener.Prefixes.Add($"{redirect.Scheme}://{redirect.Authority}/");
        listener.Start();

        logger.LogInformation("Opening Strava in your browser to authorise the app");
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

        var context = await listener.GetContextAsync().WaitAsync(ct);
        var code = context.Request.QueryString["code"];
        var grantedScopes = context.Request.QueryString["scope"]?.Split(',') ?? [];

        context.Response.OutputStream.Write("All done - you can close this tab."u8);
        context.Response.Close();

        if (code is null)
            throw new InvalidOperationException("Authorisation was cancelled or denied.");
        if (!grantedScopes.Contains("activity:read_all"))
            throw new InvalidOperationException("The activity:read_all scope was not granted.");

        return await RequestTokenAsync(new()
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code
        }, ct);
    }

    private Task<StravaToken> RefreshAsync(string refreshToken, CancellationToken ct) =>
        RequestTokenAsync(new()
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken
        }, ct);

    private async Task<StravaToken> RequestTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        form["client_id"] = _options.ClientId;
        form["client_secret"] = _options.ClientSecret;

        var http = httpClientFactory.CreateClient(OAuthClientName);
        using var response = await http.PostAsync(
            "https://www.strava.com/oauth/token", new FormUrlEncodedContent(form), ct);

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync(StravaJsonContext.Default.StravaToken, ct)
               ?? throw new InvalidOperationException("Strava returned an empty token response.");
    }

    private static async Task<StravaToken?> LoadAsync(CancellationToken ct) =>
        File.Exists(TokenFile)
            ? JsonSerializer.Deserialize(await File.ReadAllTextAsync(TokenFile, ct), StravaJsonContext.Default.StravaToken)
            : null;

    private static Task SaveAsync(StravaToken token, CancellationToken ct) =>
        File.WriteAllTextAsync(TokenFile, JsonSerializer.Serialize(token, StravaJsonContext.Default.StravaToken), ct);
}
```

It's registered as a singleton so the token is cached in memory for the life of the app, and it uses a named client from `IHttpClientFactory` rather than holding onto an `HttpClient` itself.

## Step 7: A `DelegatingHandler` for the bearer token

This is my favourite part of the design. Rather than every API method remembering to add an `Authorization` header, a handler in the `HttpClient` pipeline does it for every request. It also logs Strava's rate-limit headers so you can see how much of your allowance you're using.

```csharp
// Strava/StravaAuthHandler.cs
using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Logging;

public sealed class StravaAuthHandler(StravaAuthService auth, ILogger<StravaAuthHandler> logger)
    : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
    {
        var token = await auth.GetAccessTokenAsync(ct);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await base.SendAsync(request, ct);

        // Two numbers each: the 15-minute window and the daily total.
        if (response.Headers.TryGetValues("X-RateLimit-Usage", out var usage) &&
            response.Headers.TryGetValues("X-RateLimit-Limit", out var limit))
        {
            var level = response.StatusCode == HttpStatusCode.TooManyRequests
                ? LogLevel.Warning
                : LogLevel.Information;

            logger.Log(level, "Strava rate limit: used {Usage} of {Limit}",
                string.Join(",", usage), string.Join(",", limit));
        }

        return response;
    }
}
```

## Step 8: The typed client

The typed client is the only thing the rest of the app talks to. Each endpoint gets a method with real parameters and a real return type, and `IHttpClientFactory` injects a configured `HttpClient` with the auth handler already in its pipeline.

```csharp
// Strava/StravaClient.cs
using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization.Metadata;

public sealed class StravaClient(HttpClient http)
{
    private const int MaxPageSize = 200;

    public Task<Athlete> GetAthleteAsync(CancellationToken ct = default) =>
        GetAsync("athlete", StravaJsonContext.Default.Athlete, ct);

    public Task<List<ActivitySummary>> GetActivitiesAsync(
        DateTimeOffset? after = null,
        DateTimeOffset? before = null,
        int page = 1,
        int perPage = 30,
        CancellationToken ct = default)
    {
        var path = $"athlete/activities?page={page}&per_page={perPage}";
        if (after is not null) path += $"&after={after.Value.ToUnixTimeSeconds()}";
        if (before is not null) path += $"&before={before.Value.ToUnixTimeSeconds()}";

        return GetAsync(path, StravaJsonContext.Default.ListActivitySummary, ct);
    }

    // Pages through the whole history lazily — callers just `await foreach`.
    public async IAsyncEnumerable<ActivitySummary> GetAllActivitiesAsync(
        DateTimeOffset? after = null,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        for (var page = 1; ; page++)
        {
            var batch = await GetActivitiesAsync(after: after, page: page, perPage: MaxPageSize, ct: ct);

            foreach (var activity in batch)
                yield return activity;

            if (batch.Count < MaxPageSize)
                yield break;
        }
    }

    public Task<DetailedActivity> GetActivityAsync(long id, CancellationToken ct = default) =>
        GetAsync($"activities/{id}", StravaJsonContext.Default.DetailedActivity, ct);

    public Task<Dictionary<string, StreamData>> GetStreamsAsync(
        long activityId, IEnumerable<string> keys, CancellationToken ct = default) =>
        GetAsync($"activities/{activityId}/streams?keys={string.Join(',', keys)}&key_by_type=true",
            StravaJsonContext.Default.DictionaryStringStreamData, ct);

    public Task<AthleteStats> GetStatsAsync(long athleteId, CancellationToken ct = default) =>
        GetAsync($"athletes/{athleteId}/stats", StravaJsonContext.Default.AthleteStats, ct);

    private async Task<T> GetAsync<T>(string path, JsonTypeInfo<T> typeInfo, CancellationToken ct)
    {
        using var response = await http.GetAsync(path, ct);

        if (response.StatusCode == HttpStatusCode.TooManyRequests)
            throw new HttpRequestException(
                "Strava rate limit reached - try again later.", null, HttpStatusCode.TooManyRequests);

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync(typeInfo, ct)
               ?? throw new InvalidOperationException($"Empty response from {path}");
    }
}
```

`IAsyncEnumerable<T>` is a nice fit for Strava's paging: the caller doesn't care about pages at all, requests are only made as results are consumed, and you can stop early with `break` without wasting rate limit.

## Step 9: Wiring it up in `Program.cs`

The generic host gives us configuration, logging and DI in a console app, exactly as it would in ASP.NET Core.

Run it with your race date: `dotnet run -- --race-date 2026-10-11` (swap in your own date).

```csharp
// Program.cs
using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

var builder = Host.CreateApplicationBuilder(args);

builder.Configuration.AddUserSecrets<Program>();
builder.Logging.AddFilter("System.Net.Http", LogLevel.Warning); // hide HttpClient's own noise

builder.Services.AddOptions<StravaOptions>()
    .BindConfiguration(StravaOptions.SectionName)
    .Validate(o => o.ClientId.Length > 0 && o.ClientSecret.Length > 0,
        "Set Strava:ClientId and Strava:ClientSecret with dotnet user-secrets.");

builder.Services.AddHttpClient(StravaAuthService.OAuthClientName);
builder.Services.AddSingleton<StravaAuthService>();
builder.Services.AddTransient<StravaAuthHandler>();

builder.Services
    .AddHttpClient<StravaClient>((sp, http) =>
        http.BaseAddress = sp.GetRequiredService<IOptions<StravaOptions>>().Value.BaseUrl)
    .AddHttpMessageHandler<StravaAuthHandler>();

if (!DateOnly.TryParseExact(builder.Configuration["race-date"], "yyyy-MM-dd", out var raceDate))
{
    Console.WriteLine("Usage: dotnet run -- --race-date yyyy-MM-dd");
    return;
}

using var host = builder.Build();
var strava = host.Services.GetRequiredService<StravaClient>();

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };
var ct = cts.Token;

// 1. Who am I?
var me = await strava.GetAthleteAsync(ct);
Console.WriteLine($"Hello {me.Firstname} {me.Lastname}\n");

// 2. Find the race: the longest run on race day
var raceStart = new DateTimeOffset(raceDate.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
var dayActivities = await strava.GetActivitiesAsync(after: raceStart, before: raceStart.AddDays(1), ct: ct);

var race = dayActivities
    .Where(a => a.SportType == "Run")
    .MaxBy(a => a.Distance);

if (race is null)
{
    Console.WriteLine($"No run found on {raceDate:dd MMM yyyy}.");
    return;
}

Console.WriteLine($"Race: {race.Name}");
Console.WriteLine($"  {race.Distance / 1000:F2} km in {TimeSpan.FromSeconds(race.MovingTime):h\\:mm\\:ss} moving, " +
                  $"avg {Pace(race.Distance, race.MovingTime)}");

// 3. Km splits from the detailed activity
var detail = await strava.GetActivityAsync(race.Id, ct);
Console.WriteLine("\nKm splits:");
foreach (var split in detail.SplitsMetric)
    Console.WriteLine($"  km {split.Split,2}: {Pace(split.Distance, split.MovingTime)}  " +
                      $"HR {split.AverageHeartrate?.ToString("F0") ?? "-"}");

// 4. Heart rate stream: one value per recorded point
var streams = await strava.GetStreamsAsync(race.Id, ["time", "heartrate"], ct);
if (streams.TryGetValue("heartrate", out var hr))
    Console.WriteLine($"\nHeart rate: avg {hr.Data.Average():F0}, max {hr.Data.Max():F0} bpm ({hr.Data.Length} points)");

// 5. The 16-week training block, paged lazily with IAsyncEnumerable
var runs = new List<ActivitySummary>();
await foreach (var activity in strava.GetAllActivitiesAsync(after: raceStart.AddDays(-16 * 7), ct: ct))
{
    if (activity.SportType == "Run" && activity.StartDateLocal < raceStart.DateTime)
        runs.Add(activity);
}

Console.WriteLine("\nTraining block:");
foreach (var week in runs
             .GroupBy(r => ISOWeek.GetWeekOfYear(r.StartDateLocal))
             .OrderBy(g => g.Min(r => r.StartDateLocal)))
{
    Console.WriteLine($"  Week {week.Key,2}: {week.Count()} runs, {week.Sum(r => r.Distance) / 1000,5:F1} km, " +
                      $"longest {week.Max(r => r.Distance) / 1000:F1} km");
}

// 6. Lifetime totals
var stats = await strava.GetStatsAsync(me.Id, ct);
Console.WriteLine($"\nYear to date: {stats.YtdRunTotals.Count} runs, {stats.YtdRunTotals.Distance / 1000:F0} km");
Console.WriteLine($"All time:     {stats.AllRunTotals.Count} runs, {stats.AllRunTotals.Distance / 1000:F0} km");

static string Pace(double metres, int seconds)
{
    if (metres <= 0) return "-";
    var secondsPerKm = seconds / (metres / 1000);
    return TimeSpan.FromSeconds(secondsPerKm).ToString(@"m\:ss") + " /km";
}
```

The first run opens your browser for the consent screen. After that, the saved token is reused and refreshed in the background by the auth service.

## Why build it this way?

For a script that runs once, a single `HttpClient` and some inline JSON parsing would work. But this shape is how I'd want a real integration to look, and it costs very little extra:

- **`IHttpClientFactory`** manages handler lifetimes, avoiding the socket exhaustion you get from `new HttpClient()` per request and the stale DNS you get from one static instance.
- **The `DelegatingHandler`** keeps authentication in one place. `StravaClient` has no idea tokens exist, which makes it easy to test with a fake handler.
- **The typed client** gives the rest of the app a clean, discoverable API instead of URL strings scattered around.
- **Source-generated JSON** removes reflection at runtime and catches mapping mistakes at compile time.
- **Options + user secrets** mean no secrets in code, and the 2027 base URL change is one setting.
- **`IAsyncEnumerable`** hides paging and only spends rate limit on what you actually read.

## Endpoints used

| Method | Endpoint | Returns |
|---|---|---|
| `GetAthleteAsync` | `GET /athlete` | Your profile |
| `GetActivitiesAsync` | `GET /athlete/activities` | Activity summaries (`after`/`before` are Unix timestamps, up to 200 per page) |
| `GetActivityAsync` | `GET /activities/{id}` | Full detail, including `splits_metric` |
| `GetStreamsAsync` | `GET /activities/{id}/streams` | Raw time series (time, heartrate, distance, velocity_smooth…) |
| `GetStatsAsync` | `GET /athletes/{id}/stats` | Recent, year-to-date and all-time totals |

## Gotchas

- **Units:** distances are metres and times are seconds. I kept the models faithful to the API and converted at the edges.
- **Nullable heart rate:** `average_heartrate` is missing when no HR monitor was used, hence `double?`.
- **Read limits have their own headers:** Strava also returns `X-ReadRateLimit-Limit` and `X-ReadRateLimit-Usage`. Since this client only reads, those are the numbers to watch, and the handler is easy to extend to log them too.
- **Don't blindly add retries:** it's tempting to add `Microsoft.Extensions.Http.Resilience`, but retrying 429s just burns more of your limit. If you add it, exclude rate-limit responses from retries.
- **Never commit `strava-token.json`**, your `.http` file with real values, or the client secret.

## What's next

With the client in place, I'm planning to chart my pace and heart rate drift across the marathon and compare this training block with the next one.

## Further reading

- [Strava: Getting Started](https://developers.strava.com/docs/getting-started/)
- [Strava: Authentication](https://developers.strava.com/docs/authentication/)
- [Strava: API Reference](https://developers.strava.com/docs/reference/)
- [Strava: Rate Limits](https://developers.strava.com/docs/rate-limits/)
- [Microsoft: IHttpClientFactory with .NET](https://learn.microsoft.com/dotnet/core/extensions/httpclient-factory)
- [Microsoft: System.Text.Json source generation](https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/source-generation)
