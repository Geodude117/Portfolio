---
title: "Implementing the repository pattern in .NET 10"
description: A practical guide to the repository pattern in .NET 10 with EF Core — what it is, when it's worth it, a specific repository with a unit of work, wiring it into dependency injection and a minimal API, testing it with a fake and a real database, and the common mistakes to avoid.
pubDate: 2026-10-26T23:50:00Z
tags: [C#, .NET 10, EF Core, Repository Pattern, Architecture]
ai: "Made with AI: this guide, its sample code and diagram were produced with Claude, an AI assistant. The code targets .NET 10 and EF Core 10 but hasn't been compiled or run yet."
---

The **repository pattern** puts a simple, collection-like interface in front of your data. The rest of your app says "get me customer 42" or "add this customer", and it never needs to know whether that comes from SQL Server through EF Core, from Dapper, or from an in-memory list in a test.

This guide builds one properly in **.NET 10** with **EF Core 10**, using a `Customer` example, and is honest about when you don't need one.

## Do you actually need one?

EF Core's `DbContext` is already a repository (each `DbSet<T>`) and a unit of work (`SaveChangesAsync`). Wrapping it just to wrap it adds code without adding value.

A repository earns its place when:

- you want your **business logic to be testable** without a database
- you want **data access in one place**, so queries aren't scattered across controllers and services
- you might use **different data tech** behind the same interface, such as EF Core for writes and Dapper for heavy reads (see [EF Core vs Dapper](/Portfolio/articles/ef-core-vs-dapper/))
- you're following a **layered or clean architecture**, where the domain layer mustn't reference EF Core

For a small CRUD API, using `DbContext` directly is a perfectly good choice.

## How it fits together

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 250" role="img" aria-label="Layers of the repository pattern. An API endpoint calls CustomerService. CustomerService depends only on the ICustomerRepository and IUnitOfWork interfaces. EfCustomerRepository implements ICustomerRepository using AppDbContext, which talks to SQL Server. In tests, a FakeCustomerRepository implements the same interface instead.">
<defs><marker id="rp1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="rp1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="20" width="150" height="60" rx="10" class="box"/>
<text x="85" y="46" text-anchor="middle" class="t">API endpoint</text>
<text x="85" y="64" text-anchor="middle" class="s m" style="font-size:11px">/customers</text>
<line x1="160" y1="50" x2="192" y2="50" class="ln" marker-end="url(#rp1a)"/>
<rect x="195" y="20" width="150" height="60" rx="10" class="box"/>
<text x="270" y="46" text-anchor="middle" class="t">CustomerService</text>
<text x="270" y="64" text-anchor="middle" class="s" style="font-size:12px">business rules</text>
<line x1="345" y1="50" x2="377" y2="50" class="ln hi" marker-end="url(#rp1h)"/>
<rect x="380" y="20" width="300" height="60" rx="10" class="box hi"/>
<text x="530" y="44" text-anchor="middle" class="t">ICustomerRepository</text>
<text x="530" y="64" text-anchor="middle" class="s m acc" style="font-size:11px">+ IUnitOfWork (interfaces only)</text>
<path d="M455 80 V140" class="ln dash" marker-end="url(#rp1a)"/>
<text x="463" y="114" class="lbl">implements</text>
<path d="M605 80 V140" class="ln dash" marker-end="url(#rp1a)"/>
<text x="613" y="114" class="lbl">in tests</text>
<rect x="380" y="144" width="150" height="60" rx="10" class="box"/>
<text x="455" y="170" text-anchor="middle" class="t">EfCustomer</text>
<text x="455" y="188" text-anchor="middle" class="t">Repository</text>
<rect x="545" y="144" width="135" height="60" rx="10" class="box dim"/>
<text x="612" y="170" text-anchor="middle" class="t">FakeCustomer</text>
<text x="612" y="188" text-anchor="middle" class="t">Repository</text>
<line x1="380" y1="174" x2="318" y2="174" class="ln" marker-end="url(#rp1a)"/>
<rect x="165" y="144" width="150" height="60" rx="10" class="box"/>
<text x="240" y="170" text-anchor="middle" class="t">AppDbContext</text>
<text x="240" y="188" text-anchor="middle" class="s m" style="font-size:11px">EF Core 10</text>
<line x1="165" y1="174" x2="113" y2="174" class="ln" marker-end="url(#rp1a)"/>
<rect x="10" y="144" width="100" height="60" rx="10" class="box"/>
<text x="60" y="179" text-anchor="middle" class="t">SQL Server</text>
<text x="345" y="236" text-anchor="middle" class="lbl">The service never references EF Core, so either implementation can be plugged in</text>
</svg></div><figcaption><b>The shape of the pattern.</b> Business code depends on interfaces; EF Core lives behind them in one class.</figcaption></figure>

## 1. The entity and the DbContext

A plain class for the data, and a `DbContext` that maps it:

```csharp
public class Customer
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Customer>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(200);
            e.Property(c => c.Email).HasMaxLength(320);
            e.HasIndex(c => c.Email).IsUnique();
        });
    }
}
```

## 2. The repository interface

Make it **specific to the entity** and describe what the app needs, in the app's language. Avoid a generic `IRepository<T>` with every possible method; more on that below.

```csharp
public interface ICustomerRepository
{
    Task<Customer?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<Customer?> GetByEmailAsync(string email, CancellationToken ct = default);
    Task<IReadOnlyList<Customer>> GetActiveAsync(int page, int pageSize, CancellationToken ct = default);
    Task<bool> EmailExistsAsync(string email, CancellationToken ct = default);
    void Add(Customer customer);
    void Remove(Customer customer);
}

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
```

Two deliberate choices:

- **Reads return finished results** (`IReadOnlyList<T>`, not `IQueryable<T>`). Returning `IQueryable` lets callers build queries outside the repository, which defeats the point.
- **`Add` and `Remove` don't save.** Saving belongs to the unit of work, so a service can make several changes, possibly across repositories, and commit them in one transaction.

## 3. The EF Core implementation

```csharp
public class EfCustomerRepository(AppDbContext db) : ICustomerRepository
{
    public Task<Customer?> GetByIdAsync(int id, CancellationToken ct = default) =>
        db.Customers.FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<Customer?> GetByEmailAsync(string email, CancellationToken ct = default) =>
        db.Customers.FirstOrDefaultAsync(c => c.Email == email, ct);

    public async Task<IReadOnlyList<Customer>> GetActiveAsync(int page, int pageSize, CancellationToken ct = default) =>
        await db.Customers
            .AsNoTracking()                 // read-only list: no change tracking needed
            .Where(c => c.IsActive)
            .OrderBy(c => c.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

    public Task<bool> EmailExistsAsync(string email, CancellationToken ct = default) =>
        db.Customers.AnyAsync(c => c.Email == email, ct);

    public void Add(Customer customer) => db.Customers.Add(customer);
    public void Remove(Customer customer) => db.Customers.Remove(customer);
}

public class EfUnitOfWork(AppDbContext db) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}
```

`GetByIdAsync` is tracked on purpose: you usually fetch a single customer to change it, and tracking lets `SaveChangesAsync` spot the change. Lists are `AsNoTracking` because they're only displayed.

## 4. Use it from a service

The service holds the business rules and only knows about the interfaces:

```csharp
public class CustomerService(ICustomerRepository customers, IUnitOfWork uow)
{
    public async Task<Result<Customer>> RegisterAsync(string name, string email, CancellationToken ct = default)
    {
        email = email.Trim().ToLowerInvariant();

        if (await customers.EmailExistsAsync(email, ct))
            return Result<Customer>.Fail("A customer with that email already exists.");

        var customer = new Customer { Name = name.Trim(), Email = email };
        customers.Add(customer);
        await uow.SaveChangesAsync(ct);

        return Result<Customer>.Ok(customer);
    }

    public async Task<bool> DeactivateAsync(int id, CancellationToken ct = default)
    {
        var customer = await customers.GetByIdAsync(id, ct);
        if (customer is null) return false;

        customer.IsActive = false;          // tracked, so EF sees the change
        await uow.SaveChangesAsync(ct);
        return true;
    }
}

public record Result<T>(bool Success, T? Value, string? Error)
{
    public static Result<T> Ok(T value) => new(true, value, null);
    public static Result<T> Fail(string error) => new(false, default, error);
}
```

## 5. Register everything with dependency injection

Everything is **scoped**: one `DbContext` per HTTP request, shared by the repository and the unit of work so they see the same changes. (New to DI? See [Dependency injection in C#, explained with one example](/Portfolio/articles/dependency-injection-csharp-one-example/).)

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<ICustomerRepository, EfCustomerRepository>();
builder.Services.AddScoped<IUnitOfWork, EfUnitOfWork>();
builder.Services.AddScoped<CustomerService>();

var app = builder.Build();

var customers = app.MapGroup("/customers");

customers.MapGet("/", (ICustomerRepository repo, int page = 1, int pageSize = 20, CancellationToken ct = default) =>
    repo.GetActiveAsync(page, Math.Clamp(pageSize, 1, 100), ct));

customers.MapGet("/{id:int}", async (int id, ICustomerRepository repo, CancellationToken ct) =>
    await repo.GetByIdAsync(id, ct) is { } c ? Results.Ok(c) : Results.NotFound());

customers.MapPost("/", async (RegisterCustomer req, CustomerService svc, CancellationToken ct) =>
{
    var result = await svc.RegisterAsync(req.Name, req.Email, ct);
    return result.Success
        ? Results.Created($"/customers/{result.Value!.Id}", result.Value)
        : Results.Conflict(new { error = result.Error });
});

customers.MapDelete("/{id:int}", async (int id, CustomerService svc, CancellationToken ct) =>
    await svc.DeactivateAsync(id, ct) ? Results.NoContent() : Results.NotFound());

app.Run();

public record RegisterCustomer(string Name, string Email);
```

In a real API you'd return a DTO rather than the entity, so database fields don't leak into your public contract.

## 6. Test it

**Unit tests use a fake repository.** This is the main payoff: the business rules in `CustomerService` are tested in milliseconds with no database.

```csharp
public class FakeCustomerRepository : ICustomerRepository, IUnitOfWork
{
    public List<Customer> Store { get; } = [];
    public int Saves { get; private set; }

    public Task<Customer?> GetByIdAsync(int id, CancellationToken ct = default) =>
        Task.FromResult(Store.FirstOrDefault(c => c.Id == id));
    public Task<Customer?> GetByEmailAsync(string email, CancellationToken ct = default) =>
        Task.FromResult(Store.FirstOrDefault(c => c.Email == email));
    public Task<IReadOnlyList<Customer>> GetActiveAsync(int page, int pageSize, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Customer>>(Store.Where(c => c.IsActive).Skip((page - 1) * pageSize).Take(pageSize).ToList());
    public Task<bool> EmailExistsAsync(string email, CancellationToken ct = default) =>
        Task.FromResult(Store.Any(c => c.Email == email));
    public void Add(Customer customer) { customer.Id = Store.Count + 1; Store.Add(customer); }
    public void Remove(Customer customer) => Store.Remove(customer);
    public Task<int> SaveChangesAsync(CancellationToken ct = default) { Saves++; return Task.FromResult(1); }
}

[Fact]
public async Task Register_rejects_a_duplicate_email()
{
    var fake = new FakeCustomerRepository();
    fake.Store.Add(new Customer { Id = 1, Name = "Jo", Email = "jo@example.com" });
    var service = new CustomerService(fake, fake);

    var result = await service.RegisterAsync("Jo Again", "  JO@example.com ");

    Assert.False(result.Success);
    Assert.Equal(0, fake.Saves);
}
```

**Integration tests check the real repository** against a real database, because a fake can't tell you whether your LINQ translates to SQL. Use SQLite in memory for speed, or [Testcontainers](https://dotnet.testcontainers.org/) with SQL Server when you need exact behaviour. Avoid EF Core's InMemory provider for this: it doesn't enforce unique indexes or translate queries like a real database does.

```csharp
[Fact]
public async Task GetActiveAsync_skips_inactive_customers()
{
    await using var conn = new SqliteConnection("DataSource=:memory:");
    await conn.OpenAsync();
    await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options);
    await db.Database.EnsureCreatedAsync();

    db.Customers.AddRange(
        new Customer { Name = "Active", Email = "a@example.com" },
        new Customer { Name = "Gone", Email = "g@example.com", IsActive = false });
    await db.SaveChangesAsync();

    var repo = new EfCustomerRepository(db);
    var result = await repo.GetActiveAsync(page: 1, pageSize: 10);

    Assert.Equal(["Active"], result.Select(c => c.Name));
}
```

## Common mistakes

- **The "generic repository" trap.** `IRepository<T>` with `GetAll`, `Find(Expression<...>)` and `GetQueryable()` looks reusable, but it's just `DbSet<T>` with extra steps, and it pushes query logic back out to callers. Specific methods with meaningful names are easier to read, test and optimise. A small generic base class *behind* specific interfaces is fine if it saves repetition.
- **Returning `IQueryable`.** Callers end up writing EF queries in controllers, and you can't swap the implementation.
- **Saving inside every repository method.** You lose the ability to commit several changes together. Let the unit of work save.
- **`GetAll()` with no paging.** Fine with 50 rows, painful with 5 million. Page or filter every list method.
- **One repository per table.** Model repositories on what the app works with (a customer with their addresses), not on database tables.
- **Forgetting `CancellationToken`.** Pass it all the way through, so a cancelled HTTP request stops its database query too.

## Summary

1. Define a **specific interface** per entity, in your app's language.
2. Implement it with **EF Core** (or Dapper) in one class: `AsNoTracking` for reads, tracked entities for updates.
3. Let a **unit of work** do the saving.
4. Register them as **scoped** services and depend only on the interfaces.
5. **Unit test** business rules with a fake, and **integration test** the real repository against a real database.

## Sources

- [Design the infrastructure persistence layer](https://learn.microsoft.com/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) — Microsoft Learn (repository and unit of work patterns)
- [Testing against your production database system](https://learn.microsoft.com/ef/core/testing/testing-with-the-database) and [choosing a testing strategy](https://learn.microsoft.com/ef/core/testing/choosing-a-testing-strategy) — EF Core docs
- [DbContext lifetime, configuration and initialization](https://learn.microsoft.com/ef/core/dbcontext-configuration/) — EF Core docs
- [Dependency injection in ASP.NET Core](https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection) — Microsoft Learn
