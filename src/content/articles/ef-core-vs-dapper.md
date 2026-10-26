---
title: "EF Core vs Dapper: one API, two ways to talk to SQL Server"
description: I built the same minimal API twice, once with Entity Framework Core and once with Dapper, over the same tables, and ran one test suite against both. Here's how each one stores and retrieves data, and when I'd reach for each.
pubDate: 2026-10-26T13:00:00Z
tags: [C#, .NET, EF Core, Dapper, SQL Server, Testing]
---

"Should we use EF Core or Dapper?" comes up on almost every .NET team, and it's usually argued in the abstract. I wanted something concrete, so I built [a small repo](https://github.com/Geodude117/EfCoreVsDapper) that answers it with code: one API, one database, implemented twice.

- **Entity Framework Core** is a full ORM. You describe your model in C#, write queries in LINQ, and EF Core generates the SQL, tracks changes and manages transactions for you.
- **Dapper** is a *micro*-ORM. You write the SQL yourself, and Dapper does one job very well: it binds parameters and maps result rows onto C# objects.

The API manages customers and their orders on .NET 10 and SQL Server. Every endpoint exists twice, at `/ef/customers` and `/dapper/customers`, and both return identical JSON.

## The shape of the solution

The trick that makes a fair comparison possible is a single interface. The endpoints only ever talk to `ICustomerStore`, and there are two implementations of it:

```csharp
public interface ICustomerStore
{
    Task<IReadOnlyList<CustomerSummary>> ListAsync(CancellationToken ct = default);
    Task<CustomerDetails?> GetAsync(int id, CancellationToken ct = default);
    Task<int> CreateAsync(CreateCustomerRequest request, CancellationToken ct = default);
    Task<int?> AddOrderAsync(int customerId, CreateOrderRequest request, CancellationToken ct = default);
    Task<bool> UpdateEmailAsync(int id, string email, CancellationToken ct = default);
    Task<bool> DeleteAsync(int id, CancellationToken ct = default);
    Task<IReadOnlyList<TopCustomer>> TopCustomersAsync(int count, CancellationToken ct = default);
}
```

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 330" role="img" aria-label="Both paths through the solution: the same minimal API endpoints call ICustomerStore. On the EF Core side, EfCustomerStore writes LINQ, which EF Core turns into SQL using its model and change tracker. On the Dapper side, DapperCustomerStore writes SQL, and Dapper only binds parameters and maps rows. Both use Microsoft.Data.SqlClient to reach the same SQL Server tables.">
<defs><marker id="e1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="e1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="195" y="10" width="300" height="50" rx="10" class="box"/>
<text x="345" y="32" text-anchor="middle" class="t">Minimal API endpoints</text>
<text x="345" y="50" text-anchor="middle" class="s m">/ef/customers · /dapper/customers</text>
<line x1="345" y1="60" x2="345" y2="80" class="ln hi" marker-end="url(#e1h)"/>
<rect x="245" y="84" width="200" height="40" rx="20" class="box hi"/>
<text x="345" y="109" text-anchor="middle" class="t m acc" style="font-size:13px">ICustomerStore</text>
<path d="M300 124 C300 140, 150 140, 150 152" class="ln" marker-end="url(#e1a)"/>
<path d="M390 124 C390 140, 540 140, 540 152" class="ln" marker-end="url(#e1a)"/>
<text x="40" y="146" class="lbl m">EF CORE</text>
<text x="650" y="146" text-anchor="end" class="lbl m">DAPPER</text>
<rect x="40" y="156" width="220" height="44" rx="10" class="box"/>
<text x="150" y="176" text-anchor="middle" class="t">EfCustomerStore</text>
<text x="150" y="192" text-anchor="middle" class="s">you write LINQ</text>
<line x1="150" y1="200" x2="150" y2="214" class="ln" marker-end="url(#e1a)"/>
<rect x="40" y="218" width="220" height="44" rx="10" class="box"/>
<text x="150" y="237" text-anchor="middle" class="t">EF Core</text>
<text x="150" y="253" text-anchor="middle" class="s">model · change tracker · SQL generation</text>
<rect x="430" y="156" width="220" height="44" rx="10" class="box"/>
<text x="540" y="176" text-anchor="middle" class="t">DapperCustomerStore</text>
<text x="540" y="192" text-anchor="middle" class="s">you write SQL</text>
<line x1="540" y1="200" x2="540" y2="214" class="ln" marker-end="url(#e1a)"/>
<rect x="430" y="218" width="220" height="44" rx="10" class="box"/>
<text x="540" y="237" text-anchor="middle" class="t">Dapper</text>
<text x="540" y="253" text-anchor="middle" class="s">bind parameters · map rows</text>
<path d="M150 262 C150 280, 300 280, 300 290" class="ln" marker-end="url(#e1a)"/>
<path d="M540 262 C540 280, 390 280, 390 290" class="ln" marker-end="url(#e1a)"/>
<rect x="195" y="294" width="300" height="30" rx="10" class="box"/>
<text x="345" y="314" text-anchor="middle" class="s" style="fill:var(--text)">SqlClient → SQL Server · same tables</text>
</svg></div><figcaption><b>Same entry point, same database, different amount of machinery in between.</b> EF Core works out the SQL for you; with Dapper the SQL is yours and Dapper just handles the plumbing either side of it.</figcaption></figure>

Because the endpoints are written against the interface, they're mapped once as a generic group and registered for each store:

```csharp
app.MapCustomers<EfCustomerStore>("ef");
app.MapCustomers<DapperCustomerStore>("dapper");
```

One detail matters more than it looks: **the schema comes from the EF Core model.** `AppDbContext` defines the tables, the unique index on email and the cascading foreign key, and Dapper reads and writes those same tables. Neither side gets a schema tailored to it.

## Reading data

### A list with a computed column

The customer list includes each customer's order count. In EF Core, you project straight into the response record and EF Core translates `Orders.Count()` into SQL:

```csharp
await db.Customers
    .OrderBy(c => c.Name).ThenBy(c => c.Id)
    .Select(c => new CustomerSummary(c.Id, c.Name, c.Email, c.Orders.Count()))
    .ToListAsync(ct);
```

Projecting with `Select` is the single most useful EF Core habit. EF Core fetches only the columns it needs and doesn't track the results, so you avoid the classic mistake of loading whole entities just to show three fields.

With Dapper you write the query, and Dapper maps each row onto the same record by matching column names to constructor parameters:

```csharp
const string sql = """
    SELECT c.Id, c.Name, c.Email,
           (SELECT COUNT(*) FROM Orders o WHERE o.CustomerId = c.Id) AS OrderCount
    FROM Customers c
    ORDER BY c.Name, c.Id;
    """;

await using var conn = connections.Create();
return (await conn.QueryAsync<CustomerSummary>(new CommandDefinition(sql, cancellationToken: ct))).AsList();
```

### A customer with their orders

Loading a parent with its children shows the biggest difference in style. EF Core handles the nested collection inside a single LINQ projection:

```csharp
await db.Customers
    .Where(c => c.Id == id)
    .Select(c => new CustomerDetails(c.Id, c.Name, c.Email, c.CreatedUtc,
        c.Orders.OrderBy(o => o.PlacedUtc)
                .Select(o => new OrderDto(o.Id, o.Total, o.PlacedUtc))
                .ToList()))
    .SingleOrDefaultAsync(ct);
```

Dapper has no idea what a "customer with orders" is. Instead, I send two `SELECT` statements in one batch and read the result sets back in turn with `QueryMultiple`, which is still a single round trip:

```csharp
const string sql = """
    SELECT Id, Name, Email, CreatedUtc FROM Customers WHERE Id = @Id;
    SELECT Id, Total, PlacedUtc FROM Orders WHERE CustomerId = @Id ORDER BY PlacedUtc, Id;
    """;

using var results = await conn.QueryMultipleAsync(new CommandDefinition(sql, new { Id = id }, cancellationToken: ct));
var customer = await results.ReadSingleOrDefaultAsync<CustomerRow>();
if (customer is null) return null;
var orders = (await results.ReadAsync<OrderDto>()).AsList();
```

Note `new { Id = id }`. Dapper always takes parameters as an object, and they're sent as real SQL parameters, so there's no string concatenation and no SQL injection risk.

## Storing data, and where transactions live

Creating a customer can include their first orders, and either everything is saved or nothing is. This is where the two libraries differ most in what they do *for* you.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 300" role="img" aria-label="Saving a customer with two orders. With EF Core, you add the customer object with its orders and call SaveChanges once; EF Core opens a transaction, inserts the customer, reads back its id, inserts the orders with that id and commits, all automatically. With Dapper, you open the connection, begin a transaction, insert the customer with OUTPUT INSERTED.Id, insert the orders passing the transaction, and commit; if anything throws first, disposing the transaction rolls it back.">
<defs><marker id="e2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>
<text x="170" y="20" text-anchor="middle" class="t">EF Core</text>
<text x="520" y="20" text-anchor="middle" class="t">Dapper</text>
<line x1="345" y1="8" x2="345" y2="292" class="ln" style="stroke:var(--border)"/>
<rect x="20" y="36" width="300" height="40" rx="10" class="box hi"/>
<text x="36" y="61" class="s" style="fill:var(--text)">db.Customers.Add(customer + orders)</text>
<line x1="170" y1="76" x2="170" y2="92" class="ln" marker-end="url(#e2a)"/>
<rect x="20" y="96" width="300" height="40" rx="10" class="box hi"/>
<text x="36" y="121" class="s m" style="fill:var(--text)">await db.SaveChangesAsync()</text>
<line x1="170" y1="136" x2="170" y2="152" class="ln dash" marker-end="url(#e2a)"/>
<rect x="20" y="156" width="300" height="122" rx="10" class="box dim"/>
<text x="36" y="178" class="lbl">done for you, inside SaveChanges:</text>
<text x="36" y="200" class="s m">BEGIN TRANSACTION</text>
<text x="36" y="218" class="s m">INSERT Customers … OUTPUT Id</text>
<text x="36" y="236" class="s m">INSERT Orders (×2, CustomerId set)</text>
<text x="36" y="254" class="s m">COMMIT</text>
<rect x="370" y="36" width="300" height="34" rx="10" class="box hi"/>
<text x="386" y="58" class="s m" style="fill:var(--text)">await conn.OpenAsync()</text>
<rect x="370" y="78" width="300" height="34" rx="10" class="box hi"/>
<text x="386" y="100" class="s m" style="fill:var(--text)">await conn.BeginTransactionAsync()</text>
<rect x="370" y="120" width="300" height="34" rx="10" class="box hi"/>
<text x="386" y="142" class="s m" style="fill:var(--text)">INSERT Customers … OUTPUT INSERTED.Id</text>
<rect x="370" y="162" width="300" height="34" rx="10" class="box hi"/>
<text x="386" y="184" class="s m" style="fill:var(--text)">INSERT Orders (×2), transaction: tx</text>
<rect x="370" y="204" width="300" height="34" rx="10" class="box hi"/>
<text x="386" y="226" class="s m" style="fill:var(--text)">await tx.CommitAsync()</text>
<text x="386" y="262" class="lbl">throws before commit? disposing tx</text>
<text x="386" y="278" class="lbl">rolls everything back</text>
</svg></div><figcaption><b>Same guarantee, different ownership.</b> EF Core wraps <code>SaveChanges</code> in a transaction automatically and wires up the foreign keys. With Dapper you own every step, which is more code but also leaves nothing hidden.</figcaption></figure>

The EF Core version is just an object graph and one call:

```csharp
var customer = new Customer
{
    Name = request.Name,
    Email = request.Email,
    CreatedUtc = now,
    Orders = (request.InitialOrders ?? []).Select(t => new Order { Total = t, PlacedUtc = now }).ToList()
};
db.Customers.Add(customer);
await db.SaveChangesAsync(ct);   // one transaction, ids and foreign keys filled in
return customer.Id;
```

The Dapper version spells everything out. `OUTPUT INSERTED.Id` returns the new key, and passing a *list* of parameter objects to `ExecuteAsync` runs the insert once per order, all on the same transaction:

```csharp
await using var conn = connections.Create();
await conn.OpenAsync(ct);
await using var tx = await conn.BeginTransactionAsync(ct);

var id = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
    insertCustomer, new { request.Name, request.Email, CreatedUtc = now }, tx, cancellationToken: ct));

var orders = (request.InitialOrders ?? []).Select(t => new { CustomerId = id, Total = t, PlacedUtc = now }).ToList();
if (orders.Count > 0)
    await conn.ExecuteAsync(new CommandDefinition(insertOrder, orders, tx, cancellationToken: ct));

await tx.CommitAsync(ct);
```

This is personal for me. In an [older project of mine](/Portfolio/articles/customer-api-layered-dotnet/), each repository opened its own connection, so a customer, their address and their contact details were saved in three separate transactions. A failure halfway left partial data behind. The fix is exactly what's shown here: one connection, one transaction, one commit. There's a test that proves it for both stores.

### Writing without loading first

For updates and deletes, older EF Core code would load an entity, change it, and save it: two round trips. Since EF Core 7, `ExecuteUpdate` and `ExecuteDelete` send a single statement, which brings EF Core level with the SQL you'd write by hand:

```csharp
// EF Core
await db.Customers.Where(c => c.Id == id)
    .ExecuteUpdateAsync(s => s.SetProperty(c => c.Email, email), ct);

// Dapper
await conn.ExecuteAsync(new CommandDefinition(
    "UPDATE Customers SET Email = @Email WHERE Id = @Id;", new { Id = id, Email = email }, cancellationToken: ct));
```

Dapper can also do clever things in plain SQL that would take two steps in EF Core. Adding an order only if the customer exists is one statement:

```sql
INSERT INTO Orders (CustomerId, Total, PlacedUtc)
OUTPUT INSERTED.Id
SELECT @CustomerId, @Total, @PlacedUtc
WHERE EXISTS (SELECT 1 FROM Customers WHERE Id = @CustomerId);
```

If the customer is missing, nothing is inserted, `OUTPUT` returns no row, and Dapper hands back `null`, which the endpoint turns into a 404.

### Handling errors the same way

Email addresses are unique. When a duplicate goes in, SQL Server raises error 2601 or 2627, but the two libraries surface it differently: EF Core wraps it in a `DbUpdateException`, while Dapper lets the `SqlException` through. Both stores translate it into the same domain exception, so the endpoint can return `409 Conflict` without knowing which library is behind it:

```csharp
catch (DbUpdateException ex) when (SqlErrors.IsUniqueViolation(ex))   // EF Core
catch (Exception ex) when (SqlErrors.IsUniqueViolation(ex))           // Dapper
{
    throw new DuplicateEmailException(request.Email, ex);
}
```

## One test suite, run against both

Comparing two implementations means nothing unless they behave the same, so every test is a `[Theory]` that runs once with `"ef"` and once with `"dapper"`. The tests use [Testcontainers](https://dotnet.testcontainers.org/) to start a real SQL Server in Docker, so they're testing actual SQL, constraints and transactions, not an in-memory fake that behaves differently:

```csharp
[Theory, MemberData(nameof(Stores))]   // "ef", "dapper"
public async Task Duplicate_email_throws_and_leaves_nothing_behind(string kind)
{
    var store = fixture.CreateStore(kind);
    await store.CreateAsync(new CreateCustomerRequest("First", "same@example.com"));

    await Assert.ThrowsAsync<DuplicateEmailException>(() =>
        store.CreateAsync(new CreateCustomerRequest("Second", "same@example.com", [10m, 20m])));

    var only = Assert.Single(await fixture.CreateStore(kind).ListAsync());
    Assert.Equal(0, only.OrderCount);   // the transaction rolled back: no orphaned orders
}
```

A final test writes data through one store and reads it through the other, checking the results are identical. That makes 21 tests in all (ten behaviours, each run against both stores, plus the cross-check), and GitHub Actions runs them on every push.

## So which should you use?

After writing both, my answer is "it depends", but I can be specific about what it depends on:

<div class="table-wrap">

| | EF Core | Dapper |
|---|---|---|
| **You write** | C# and LINQ | SQL |
| **Schema and migrations** | Built in | Bring your own (SQL project, DbUp, etc.) |
| **Transactions** | Automatic per `SaveChanges` | Explicit |
| **Related data** | Navigations and projections | Multiple result sets or multi-mapping |
| **Generated SQL** | Usually good; check it in logs | Exactly what you wrote |
| **Overhead** | Higher, but small for most apps | Close to raw ADO.NET |
| **Best for** | Domain-heavy CRUD, rapid development | Reporting, complex or tuned queries, existing stored procedures |

</div>

They also mix well. A common pattern is EF Core for the bulk of an application's reads and writes, with Dapper for the handful of reporting queries where you want full control of the SQL, sharing the same connection string and database. The aggregate "top customers" report in this repo is a good example: it's tidy in both, but the Dapper version reads like the SQL you'd hand to a DBA.

Whichever you choose, two habits pay off: turn on EF Core's SQL logging (`Microsoft.EntityFrameworkCore.Database.Command`) so you always know what it's sending, and test against a real database engine.

The full code, with setup instructions and an `.http` file of requests to try against both stores, is on [GitHub](https://github.com/Geodude117/EfCoreVsDapper).
