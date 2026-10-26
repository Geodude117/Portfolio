---
title: "Adding Swagger to a .NET 10 API: OpenAPI, Swagger UI and Scalar"
description: A step-by-step guide to API documentation in .NET 10 — the built-in OpenAPI 3.1 generator, adding Swagger UI or Scalar, describing endpoints properly, JWT authentication in the UI, multiple versions, and what to do with an existing Swashbuckle setup.
pubDate: 2026-10-26T22:40:00Z
tags: [C#, .NET 10, ASP.NET Core, OpenAPI, Swagger]
ai: "Made with AI: this guide, its sample code and diagram were produced with Claude, an AI assistant. The code is written against .NET 10 but hasn't been compiled or run yet."
---

If you last set up Swagger in .NET 6 or 8, the .NET 10 API template will look like something's missing: there's no `AddSwaggerGen`, no `UseSwaggerUI`, and no `/swagger` page. Since .NET 9, ASP.NET Core **generates the OpenAPI document itself**, and leaves the choice of UI to you.

This guide gets you from a new .NET 10 API to a well-documented one with an interactive UI, including authentication and versioning.

## How the pieces fit together

"Swagger" now really means two separate things:

- **The OpenAPI document:** a JSON (or YAML) description of every endpoint, parameter and response. In .NET 10 the built-in `Microsoft.AspNetCore.OpenApi` package generates it, in **OpenAPI 3.1** by default.
- **A UI that reads it:** **Swagger UI**, the familiar one, or **Scalar**, a newer alternative. Both just read the document, so you can use either, or both.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 200" role="img" aria-label="How OpenAPI works in .NET 10. Your endpoints, with metadata and XML comments, are read by the built-in Microsoft.AspNetCore.OpenApi generator, which runs any transformers and serves the document at /openapi/v1.json. Swagger UI at /swagger, Scalar at /scalar and client generators such as NSwag or Kiota all read that one document.">
<defs><marker id="o1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="o1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="66" width="150" height="68" rx="10" class="box"/>
<text x="85" y="90" text-anchor="middle" class="t">Your endpoints</text>
<text x="85" y="110" text-anchor="middle" class="s">metadata</text>
<text x="85" y="126" text-anchor="middle" class="s">XML comments</text>
<line x1="160" y1="100" x2="186" y2="100" class="ln hi" marker-end="url(#o1h)"/>
<rect x="190" y="66" width="160" height="68" rx="10" class="box"/>
<text x="270" y="90" text-anchor="middle" class="t">OpenAPI generator</text>
<text x="270" y="110" text-anchor="middle" class="s m" style="font-size:11px">AddOpenApi()</text>
<text x="270" y="126" text-anchor="middle" class="s">+ transformers</text>
<line x1="350" y1="100" x2="376" y2="100" class="ln hi" marker-end="url(#o1h)"/>
<rect x="380" y="66" width="130" height="68" rx="10" class="box hi"/>
<text x="445" y="92" text-anchor="middle" class="t m" style="font-size:12px">/openapi/v1.json</text>
<text x="445" y="114" text-anchor="middle" class="s">OpenAPI 3.1</text>
<path d="M510 90 C525 90, 525 40, 536 40" class="ln" marker-end="url(#o1a)"/>
<line x1="510" y1="100" x2="536" y2="100" class="ln" marker-end="url(#o1a)"/>
<path d="M510 110 C525 110, 525 160, 536 160" class="ln" marker-end="url(#o1a)"/>
<rect x="540" y="18" width="140" height="44" rx="10" class="box"/>
<text x="610" y="38" text-anchor="middle" class="t">Swagger UI</text>
<text x="610" y="54" text-anchor="middle" class="s m" style="font-size:11px">/swagger</text>
<rect x="540" y="78" width="140" height="44" rx="10" class="box"/>
<text x="610" y="98" text-anchor="middle" class="t">Scalar</text>
<text x="610" y="114" text-anchor="middle" class="s m" style="font-size:11px">/scalar</text>
<rect x="540" y="138" width="140" height="44" rx="10" class="box dim"/>
<text x="610" y="158" text-anchor="middle" class="t">Client generators</text>
<text x="610" y="174" text-anchor="middle" class="s">NSwag · Kiota</text>
</svg></div><figcaption><b>One document, many readers.</b> ASP.NET Core produces the OpenAPI document; the UI is a separate, swappable choice that just reads it.</figcaption></figure>

## Step 1: Generate the OpenAPI document

A new .NET 10 Web API already includes this:

```bash
dotnet new webapi -n Orders.Api
```

To add it to an existing project:

```bash
dotnet add package Microsoft.AspNetCore.OpenApi
```

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();   // serves /openapi/v1.json
}

app.Run();
```

Run the app and open `/openapi/v1.json`: that's the full description of your API. If you prefer YAML, map it with a `.yaml` extension: `app.MapOpenApi("/openapi/{documentName}.yaml")`.

## Step 2: Add Swagger UI

You only need the UI part of Swashbuckle, not its generator:

```bash
dotnet add package Swashbuckle.AspNetCore.SwaggerUI
```

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "Orders API v1");
    });
}
```

Browse to `/swagger` and you have the familiar interactive page, reading the document ASP.NET Core generated.

### Or Scalar

Scalar is a more modern API reference UI, with a cleaner layout, built-in code samples in many languages and a request client. It's a one-liner:

```bash
dotnet add package Scalar.AspNetCore
```

```csharp
using Scalar.AspNetCore;

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();   // serves /scalar
}
```

Both can run side by side, so you can let your team pick.

## Step 3: Describe your endpoints properly

A generated document is only as useful as the information you give it. Without help, every endpoint shows a bare `200 OK` and no explanation.

### Minimal APIs

Return **`TypedResults`** with a `Results<...>` return type, and the generator can see every possible response without extra attributes. Add names, summaries and tags with the fluent methods:

```csharp
var orders = app.MapGroup("/orders").WithTags("Orders");

orders.MapGet("/{id:guid}", async Task<Results<Ok<OrderDto>, NotFound>> (Guid id, IOrderStore store) =>
        await store.FindAsync(id) is { } order ? TypedResults.Ok(order) : TypedResults.NotFound())
    .WithName("GetOrder")
    .WithSummary("Get an order")
    .WithDescription("Returns a single order by its ID, including its lines.");

orders.MapPost("/", async Task<Results<Created<OrderDto>, ValidationProblem>> (CreateOrder request, IOrderStore store) =>
    {
        var order = await store.CreateAsync(request);
        return TypedResults.Created($"/orders/{order.Id}", order);
    })
    .WithName("CreateOrder")
    .WithSummary("Place a new order");
```

The `Results<Ok<OrderDto>, NotFound>` return type documents both the `200` with its schema and the `404`, and the compiler stops you from returning anything else.

### Controllers

Controllers use attributes for the same information:

```csharp
[ApiController]
[Route("orders")]
[Tags("Orders")]
public class OrdersController(IOrderStore store) : ControllerBase
{
    [HttpGet("{id:guid}")]
    [EndpointSummary("Get an order")]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id) =>
        await store.FindAsync(id) is { } order ? Ok(order) : NotFound();
}
```

### XML comments

.NET 10 can also pull summaries and parameter descriptions from your XML documentation comments. Turn on documentation generation in the project file:

```xml
<PropertyGroup>
  <GenerateDocumentationFile>true</GenerateDocumentationFile>
  <!-- Don't warn about every public member without a comment -->
  <NoWarn>$(NoWarn);1591</NoWarn>
</PropertyGroup>
```

```csharp
/// <summary>An order placed by a customer.</summary>
/// <param name="Id">The order's unique ID.</param>
/// <param name="Total">Order total in pounds, including VAT.</param>
public record OrderDto(Guid Id, string CustomerEmail, decimal Total);
```

Those descriptions then appear on the schemas in Swagger UI, which is especially useful for explaining units and formats such as "in pounds, including VAT".

## Step 4: Set the title, version and contact details

Anything you want to change about the generated document goes in a **document transformer**:

```csharp
using Microsoft.OpenApi;

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Info = new OpenApiInfo
        {
            Title = "Orders API",
            Version = "v1",
            Description = "Create and look up customer orders.",
            Contact = new OpenApiContact { Name = "Application Development", Email = "appdev@example.com" },
        };
        return Task.CompletedTask;
    });
});
```

There are also **operation transformers** (for every endpoint) and **schema transformers** (for every type) if you need to adjust things more precisely.

## Step 5: Authentication in Swagger UI

If your API uses JWT bearer tokens, describe the scheme in the document so Swagger UI shows an **Authorize** button where you can paste a token:

```csharp
using Microsoft.OpenApi;

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();

        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Paste an access token (without the 'Bearer ' prefix).",
        };

        // Apply it to every operation
        document.Security =
        [
            new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("Bearer", document)] = [],
            },
        ];

        return Task.CompletedTask;
    });
});
```

If you're coming from older Swashbuckle code, note that the types now live in the `Microsoft.OpenApi` namespace (not `Microsoft.OpenApi.Models`), security schemes are referenced with `OpenApiSecuritySchemeReference`, and collections can be `null` until you create them. That's the change from Microsoft.OpenApi 1.x to 2.x, which .NET 10 uses.

For an OAuth 2.0 identity provider, use an `OAuth2` scheme with the authorization code flow instead, and turn on PKCE in the UI so people can sign in interactively:

```csharp
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/openapi/v1.json", "Orders API v1");
    options.OAuthClientId("orders-api-swagger");   // a public client: no secret in the browser
    options.OAuthUsePkce();
});
```

## Step 6: Multiple versions

Each call to `AddOpenApi` with a name creates a separate document. Endpoints are assigned to a document by their **group name**:

```csharp
builder.Services.AddOpenApi("v1");
builder.Services.AddOpenApi("v2");

app.MapGroup("/v1/orders").WithGroupName("v1") /* …v1 endpoints… */;
app.MapGroup("/v2/orders").WithGroupName("v2") /* …v2 endpoints… */;

app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/openapi/v1.json", "Orders API v1");
    options.SwaggerEndpoint("/openapi/v2.json", "Orders API v2");
});
```

Swagger UI then shows a dropdown to switch between versions. For more complete versioning (URL, header or query-string versions, deprecation), the `Asp.Versioning.Http` package works with the built-in generator.

## Step 7: Decide what production gets

The templates only map the document and UI **in Development**, which is the right default for most internal APIs. If people outside the team need the docs:

- **Protect them** rather than exposing them publicly:

  ```csharp
  app.MapOpenApi().RequireAuthorization("ApiDocs");
  ```

- **Or generate the document at build time** and publish it with your release. Add the `Microsoft.Extensions.ApiDescription.Server` package and the document is written out on every build, ready for a developer portal or for generating typed clients with NSwag or Kiota. It also lets you check the API contract in code review, since any change to the API shows up as a change to the file.

## Coming from Swashbuckle?

If you're upgrading an older app that uses `AddSwaggerGen` and `UseSwagger`, you have two options:

- **Keep Swashbuckle.** It's still maintained as a community project, and its current versions support .NET 10. Expect to update custom filters for the Microsoft.OpenApi 2.x types.
- **Switch to the built-in generator** (recommended for new work): replace `AddSwaggerGen` with `AddOpenApi`, replace `UseSwagger` with `MapOpenApi`, point `UseSwaggerUI` at `/openapi/v1.json`, and port any schema or operation filters to transformers.

Either way, compare the old and new documents for a few important endpoints, especially enums, nullable properties and inheritance, since generators differ in the details.

## Best practices

- **Use typed results or `ProducesResponseType`** so every possible response, including errors, is documented.
- **Return Problem Details** (`TypedResults.Problem`, `ValidationProblem`) for errors, so clients get a consistent error shape.
- **Write summaries for people**: what the endpoint does, units, formats and side effects, not just the method name.
- **Give every operation a stable name** (`WithName`): client generators use it for method names.
- **Don't expose docs publicly by default.** Development only, or behind authorisation.
- **Never put real secrets in the UI config.** Use public clients with PKCE for OAuth.
- **Treat the document as a contract:** generate it at build time, review changes, and version deliberately.

## Further reading

- [Microsoft: Generate OpenAPI documents in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0)
- [Duende: Securing OpenAPI and Swagger UI with OAuth in .NET 10](https://duendesoftware.com/blog/20251126-securing-openapi-and-swagger-ui-with-oauth-in-dotnet-10)
- [Scalar for ASP.NET Core](https://scalar.com/blog/posts/2026-10-06-openapi-aspnet-core-dotnet-9-10)
