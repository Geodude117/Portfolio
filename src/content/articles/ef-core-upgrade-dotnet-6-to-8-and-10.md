---
title: "Upgrading EF Core from .NET 6 to .NET 8 and 10: the breaking changes that actually bite"
description: The Entity Framework Core problems you're most likely to hit moving an enterprise app off .NET 6 — the "certificate chain was issued by an authority that is not trusted" error and how to fix it properly, tables with triggers, Contains and SQL Server compatibility levels, stricter migrations, and what changes again in EF Core 10.
pubDate: 2026-10-26T22:20:00Z
tags: [C#, .NET, EF Core, SQL Server, Upgrades]
ai: "Made with AI: this article and its diagrams were produced with Claude, an AI assistant, from Microsoft's EF Core breaking-change documentation."
---

.NET 6 went out of support in November 2024, and .NET 8's support ends in November 2026. If you're still upgrading, the sensible target is now **.NET 10**, the current long-term support release. EF Core versions are tied to .NET versions, so jumping from .NET 6 to .NET 10 means jumping **four EF Core versions at once**: 7, 8, 9 and 10. Each one has breaking changes, and on a typical enterprise SQL Server estate a handful of them reliably cause failures.

This article covers the ones that actually bite, roughly in the order you'll hit them.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 214" role="img" aria-label="Breaking changes by EF Core version. EF Core 6 on .NET 6 is the starting point, out of support since November 2024. EF Core 7: Encrypt defaults to true, tables with triggers fail with the OUTPUT clause, orphaned dependents are no longer deleted. EF Core 8: Contains translates to OPENJSON and needs compatibility level 130, and date columns scaffold to DateOnly. EF Core 9: migrations throw on pending model changes and can't run inside your own transaction. EF Core 10: Contains uses multiple parameters, JSON columns use the json type on Azure SQL, and ExecuteUpdate takes a normal lambda.">
<defs><marker id="u1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<line x1="10" y1="16" x2="676" y2="16" class="ln hi" marker-end="url(#u1a)"/>
<rect x="10" y="30" width="122" height="174" rx="10" class="box dim"/>
<text x="71" y="54" text-anchor="middle" class="t">EF Core 6</text>
<text x="71" y="74" text-anchor="middle" class="lbl m">.NET 6</text>
<text x="71" y="104" text-anchor="middle" class="s">starting point</text>
<text x="71" y="124" text-anchor="middle" class="s">out of support</text>
<text x="71" y="144" text-anchor="middle" class="s">since Nov 2024</text>
<rect x="144" y="30" width="122" height="174" rx="10" class="box hi"/>
<text x="205" y="54" text-anchor="middle" class="t">EF Core 7</text>
<text x="205" y="74" text-anchor="middle" class="lbl m">.NET 7</text>
<text x="205" y="104" text-anchor="middle" class="s acc">Encrypt=true</text>
<text x="205" y="122" text-anchor="middle" class="s">by default</text>
<text x="205" y="148" text-anchor="middle" class="s">triggers vs</text>
<text x="205" y="166" text-anchor="middle" class="s">OUTPUT clause</text>
<text x="205" y="190" text-anchor="middle" class="s">orphans kept</text>
<rect x="278" y="30" width="122" height="174" rx="10" class="box"/>
<text x="339" y="54" text-anchor="middle" class="t">EF Core 8</text>
<text x="339" y="74" text-anchor="middle" class="lbl m">.NET 8 · LTS</text>
<text x="339" y="104" text-anchor="middle" class="s acc">Contains →</text>
<text x="339" y="122" text-anchor="middle" class="s acc">OPENJSON</text>
<text x="339" y="148" text-anchor="middle" class="s">needs compat</text>
<text x="339" y="166" text-anchor="middle" class="s">level ≥ 130</text>
<text x="339" y="190" text-anchor="middle" class="s">date → DateOnly</text>
<rect x="412" y="30" width="122" height="174" rx="10" class="box"/>
<text x="473" y="54" text-anchor="middle" class="t">EF Core 9</text>
<text x="473" y="74" text-anchor="middle" class="lbl m">.NET 9</text>
<text x="473" y="104" text-anchor="middle" class="s acc">Migrate throws</text>
<text x="473" y="122" text-anchor="middle" class="s acc">on model drift</text>
<text x="473" y="148" text-anchor="middle" class="s">no migrations in</text>
<text x="473" y="166" text-anchor="middle" class="s">your transaction</text>
<rect x="546" y="30" width="130" height="174" rx="10" class="box hi"/>
<text x="611" y="54" text-anchor="middle" class="t">EF Core 10</text>
<text x="611" y="74" text-anchor="middle" class="lbl m">.NET 10 · LTS</text>
<text x="611" y="104" text-anchor="middle" class="s acc">Contains →</text>
<text x="611" y="122" text-anchor="middle" class="s acc">IN (@p1, @p2…)</text>
<text x="611" y="148" text-anchor="middle" class="s">json column type</text>
<text x="611" y="166" text-anchor="middle" class="s">on Azure SQL</text>
<text x="611" y="190" text-anchor="middle" class="s">ExecuteUpdate λ</text>
</svg></div><figcaption><b>Four versions' worth of breaking changes arrive at once.</b> Upgrading .NET 6 → 10 means reading every EF Core breaking-change list in between, not just the last one.</figcaption></figure>

## 1. "The certificate chain was issued by an authority that is not trusted"

This is the one almost everyone hits first. The app worked yesterday on .NET 6, you upgrade, and every database call fails with:

```text
Microsoft.Data.SqlClient.SqlException (0x80131904): A connection was successfully established
with the server, but then an error occurred during the login process.
(provider: SSL Provider, error: 0 - The certificate chain was issued by an authority that is not trusted.)
```

### What changed

EF Core 7 moved to a newer **Microsoft.Data.SqlClient**, which (from version 4.0) changed the default of the `Encrypt` connection string setting from `False` to **`True`**. Every connection is now encrypted with TLS, and the client **validates the SQL Server's certificate** like a browser validates a website's. If the server has a self-signed certificate (which SQL Server generates automatically if none is configured), or a certificate from a CA the app server doesn't trust, validation fails.

EF Core can't revert this. It's the driver, and it's a deliberate security default. The same thing happens without EF Core if you move Dapper or ADO.NET code from the deprecated `System.Data.SqlClient` to `Microsoft.Data.SqlClient`.

### The quick fix, and why it's only a stopgap

You'll see this fix everywhere:

```text
Server=sql-prd-01;Database=Orders;Integrated Security=True;TrustServerCertificate=True
```

`TrustServerCertificate=True` keeps the connection **encrypted** but **skips checking who you're talking to**. That means it doesn't protect against a man-in-the-middle, which is the whole point of the certificate. The other option, `Encrypt=False`, turns encryption off altogether. Both get you back to where .NET 6 was, but neither is where you want a production system, and certainly not one handling financial or personal data.

### The proper fix

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 254" role="img" aria-label="Fixing the untrusted certificate error, by where SQL Server runs. Azure SQL or Managed Instance: already has a trusted certificate, keep Encrypt=True. On-premises with a certificate from your own CA: trust the CA's root certificate on the app servers and containers, and set HostNameInCertificate if the name you connect with differs. On-premises with a self-signed or no certificate: install a certificate issued by your CA, using TrustServerCertificate=True only as a temporary measure. Local development with LocalDB or Docker: TrustServerCertificate=True is fine.">
<defs><marker id="u2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>
<rect x="10" y="96" width="170" height="62" rx="10" class="box hi"/>
<text x="95" y="120" text-anchor="middle" class="t">"Certificate chain</text>
<text x="95" y="140" text-anchor="middle" class="t">not trusted"</text>
<path d="M180 120 C200 120, 200 35, 216 35" class="ln" marker-end="url(#u2a)"/>
<path d="M180 124 C200 124, 200 95, 216 95" class="ln" marker-end="url(#u2a)"/>
<path d="M180 132 C200 132, 200 155, 216 155" class="ln" marker-end="url(#u2a)"/>
<path d="M180 136 C200 136, 200 215, 216 215" class="ln" marker-end="url(#u2a)"/>
<rect x="220" y="10" width="170" height="50" rx="10" class="box"/>
<text x="305" y="31" text-anchor="middle" class="s" style="fill:var(--text)">Azure SQL /</text>
<text x="305" y="48" text-anchor="middle" class="s" style="fill:var(--text)">Managed Instance</text>
<rect x="220" y="70" width="170" height="50" rx="10" class="box"/>
<text x="305" y="91" text-anchor="middle" class="s" style="fill:var(--text)">On-prem, cert from</text>
<text x="305" y="108" text-anchor="middle" class="s" style="fill:var(--text)">your internal CA</text>
<rect x="220" y="130" width="170" height="50" rx="10" class="box"/>
<text x="305" y="151" text-anchor="middle" class="s" style="fill:var(--text)">On-prem, self-signed</text>
<text x="305" y="168" text-anchor="middle" class="s" style="fill:var(--text)">or no certificate</text>
<rect x="220" y="190" width="170" height="50" rx="10" class="box"/>
<text x="305" y="211" text-anchor="middle" class="s" style="fill:var(--text)">Local dev</text>
<text x="305" y="228" text-anchor="middle" class="s" style="fill:var(--text)">LocalDB / Docker</text>
<line x1="390" y1="35" x2="416" y2="35" class="ln" marker-end="url(#u2a)"/>
<line x1="390" y1="95" x2="416" y2="95" class="ln" marker-end="url(#u2a)"/>
<line x1="390" y1="155" x2="416" y2="155" class="ln" marker-end="url(#u2a)"/>
<line x1="390" y1="215" x2="416" y2="215" class="ln" marker-end="url(#u2a)"/>
<rect x="420" y="10" width="260" height="50" rx="10" class="box hi"/>
<text x="434" y="31" class="s" style="fill:var(--text)">Already trusted.</text>
<text x="434" y="48" class="s">Keep Encrypt=True; nothing to change.</text>
<rect x="420" y="70" width="260" height="50" rx="10" class="box hi"/>
<text x="434" y="91" class="s" style="fill:var(--text)">Trust your CA's root on app servers</text>
<text x="434" y="108" class="s">+ HostNameInCertificate if names differ</text>
<rect x="420" y="130" width="260" height="50" rx="10" class="box"/>
<text x="434" y="151" class="s" style="fill:var(--text)">Install a CA-issued certificate</text>
<text x="434" y="168" class="s">TrustServerCertificate only as a stopgap</text>
<rect x="420" y="190" width="260" height="50" rx="10" class="box dim"/>
<text x="434" y="211" class="s" style="fill:var(--text)">TrustServerCertificate=True</text>
<text x="434" y="228" class="s">is fine here (never in Prod)</text>
</svg></div><figcaption><b>The right fix depends on where SQL Server runs.</b> In most enterprises it's the middle two rows: get the server a proper certificate and make sure the app servers trust whoever issued it.</figcaption></figure>

**Azure SQL Database and Managed Instance** already present certificates from a public CA, so they work with `Encrypt=True` out of the box. If you're seeing this error against Azure SQL, check for something in between, like a proxy or an IP address in place of the server name.

**On-premises SQL Server** is where the work is:

1. **Give each SQL Server a certificate issued by your internal CA** (Active Directory Certificate Services or similar), with the server's fully qualified name, and, for an Always On availability group, the **listener name**, in the Subject Alternative Names. Configure it in SQL Server Configuration Manager and restart the service.
2. **Make sure the app servers trust that CA.** Domain-joined Windows servers usually already trust the enterprise root through Group Policy. **Linux containers don't**: the root certificate has to be added to the image.

   ```dockerfile
   # Trust the internal root CA inside a Linux container
   COPY certs/contoso-root-ca.crt /usr/local/share/ca-certificates/
   RUN update-ca-certificates
   ```

3. **Connect using a name that's on the certificate.** If you connect by IP address, a DNS alias or an old server name, validation fails even with a perfectly good certificate. Either connect with the certificate's name, or tell the client which name to expect:

   ```text
   Server=10.20.30.40;Database=Orders;Integrated Security=True;Encrypt=True;HostNameInCertificate=sql-prd-01.corp.contoso.com
   ```

For **local development** with LocalDB or SQL Server in Docker, `TrustServerCertificate=True` is fine. Keep that in `appsettings.Development.json` or user secrets so it never leaks into a higher environment:

```jsonc
// appsettings.Development.json: local only
{
  "ConnectionStrings": {
    "Orders": "Server=(localdb)\\MSSQLLocalDB;Database=Orders;Trusted_Connection=True;TrustServerCertificate=True"
  }
}
```

Two related surprises:

- **Very old SQL Servers** that only support TLS 1.0 or 1.1 can't negotiate a connection from modern .NET on Linux at all, because OpenSSL refuses those protocol versions. The fix is patching or upgrading SQL Server, not weakening the client.
- **`Encrypt=Strict`** (SQL Server 2022 and later) goes one step further, using TDS 8.0 and always validating the certificate. It's worth adopting once your certificates are in order.

## 2. Saving to a table with a trigger fails

Enterprise databases often have audit or history triggers. After upgrading, saving changes to those tables fails with:

```text
The target table 'Orders' of the DML statement cannot have any enabled triggers
if the statement contains an OUTPUT clause without INTO clause.
```

EF Core 7 started using SQL Server's `OUTPUT` clause to read back generated values (identities, defaults, row versions) in the same statement as the insert or update. It's faster, but SQL Server doesn't allow a plain `OUTPUT` clause on a table that has a trigger. Tell EF Core about the table and it falls back to the older approach for that table only:

```csharp
// EF Core 8 and later
modelBuilder.Entity<Order>()
    .ToTable(tb => tb.UseSqlOutputClause(false));

// EF Core 7 used this instead:
// .ToTable(tb => tb.HasTrigger("trg_Orders_Audit"));
```

Some computed columns cause the same error, with the same fix. To find every table that needs it, list the triggers in the database:

```sql
SELECT OBJECT_NAME(parent_id) AS TableName, name AS TriggerName
FROM sys.triggers
WHERE parent_class = 1 AND is_disabled = 0
ORDER BY TableName;
```

## 3. Queries with `Contains` fail or slow down

This one is common on databases that were restored from older SQL Server versions and never had their compatibility level raised. A query like this:

```csharp
var orders = await db.Orders.Where(o => ids.Contains(o.Id)).ToListAsync();
```

used to embed the values in the SQL as `IN (1, 2, 3)`. **EF Core 8** sends the list as a single JSON parameter and unpacks it with `OPENJSON`. That gives SQL Server one reusable query plan instead of a new plan for every different list, but `OPENJSON` needs **SQL Server 2016 or later and a database compatibility level of at least 130**. On a lower level, the query fails with a syntax error near `$` or `OPENJSON`.

Check the compatibility level:

```sql
SELECT name, compatibility_level FROM sys.databases;
```

Then either:

- **Raise the compatibility level** to match your SQL Server version. This is the best fix, but it changes the query optimiser's behaviour too, so test it like any other change, or
- **Tell EF Core about the older level**, so it keeps generating the old SQL:

  ```csharp
  options.UseSqlServer(connectionString, sql => sql.UseCompatibilityLevel(120));
  ```

Even on a modern database, a minority of `OPENJSON` queries can be slower than before. You can switch back for a single query with `EF.Constant`:

```csharp
var blogs = await db.Blogs.Where(b => EF.Constant(names).Contains(b.Name)).ToListAsync();
```

**EF Core 10 changes this again.** By default it now sends one parameter per value, `IN (@ids1, @ids2, @ids3)`. That avoids `OPENJSON` entirely, so the compatibility-level problem goes away on EF Core 10. If you need a particular behaviour, you can set it globally with `UseParameterizedCollectionMode` or per query with `EF.Constant`, `EF.Parameter` and `EF.MultipleParameters`.

## 4. Migrations that worked now throw

**EF Core 9** made migrations stricter in two ways that catch out a lot of upgraded projects.

**It refuses to migrate when the model doesn't match the migrations.** `Migrate()`, `MigrateAsync()` and `dotnet ef database update` throw a `PendingModelChangesWarning` exception if your model has changes that no migration covers. Common causes in older projects:

- **Non-deterministic seed data:** `HasData` using `DateTime.Now`, `DateTime.UtcNow` or `Guid.NewGuid()`. Every build looks like a model change. Replace them with fixed values and add a migration.
- **A missing or stale model snapshot**, usually from hand-written migrations. Add a new migration to regenerate it.
- **Genuine drift:** someone changed the model and never added a migration. The exception has found a real bug.

```bash
# See what EF thinks has changed
dotnet ef migrations add CheckForDrift
# An empty migration means the warning was a false alarm; delete it.
```

**It won't run migrations inside your own transaction.** Code that wrapped `MigrateAsync` in an explicit transaction now throws `MigrationsUserTransactionWarning`, because EF Core now takes a database lock so two instances can't migrate at the same time. Just call it directly:

```csharp
await db.Database.MigrateAsync(cancellationToken);
```

For production, consider not migrating on application startup at all. Generate an idempotent script (`dotnet ef migrations script --idempotent`) or a migration bundle (`dotnet ef migrations bundle`) and run it as a deliberate step in your release pipeline, where it can be reviewed and approved like any other change.

## 5. Smaller changes worth knowing

- **Orphans aren't deleted automatically (EF Core 7).** Removing the link between a parent and an optional child no longer deletes the child. If your code relied on that, delete the child explicitly.
- **Scaffolding produces different types (EF Core 8).** If you're database-first and re-scaffold, `date` columns become `DateOnly` and `time` columns `TimeOnly`, and non-nullable `bool` columns with a default are no longer `bool?`. Expect a noisy diff.
- **Enums inside JSON columns are stored as numbers (EF Core 8)** rather than strings. Add `HasConversion<string>()` to keep strings.
- **JSON columns use SQL Server's `json` type (EF Core 10)** on Azure SQL or compatibility level 170. Existing `nvarchar(max)` columns are altered on upgrade with `UseAzureSql`; keep them with `HasColumnType("nvarchar(max)")` if you need to.
- **`ExecuteUpdateAsync` takes a normal lambda (EF Core 10)**, not an expression tree. Code that built the setters as an `Expression` needs rewriting, though it gets simpler.
- **Tool versions must match.** Update the `dotnet-ef` tool and `Microsoft.EntityFrameworkCore.Design` to the same major version as EF Core. Mismatched tools give confusing errors.

## An upgrade checklist

1. **Upgrade in one pass to .NET 10 / EF Core 10**, but read the breaking-change notes for EF Core 7, 8, 9 *and* 10.
2. **Inventory your SQL Servers:** version, compatibility level, and whether each has a certificate your app servers trust.
3. **Fix certificates before the upgrade lands.** Plan `TrustServerCertificate=True` only for local development, and treat any use of it in a higher environment as a temporary, tracked exception.
4. **List tables with triggers** and add `UseSqlOutputClause(false)` for each.
5. **Run the migrations against a copy of each database** in Test and PreProd, and fix any `PendingModelChangesWarning` properly.
6. **Turn on EF Core's SQL logging in Test** (`Microsoft.EntityFrameworkCore.Database.Command`) and compare the generated SQL for your most important queries.
7. **Load-test PreProd** with production-like data volumes before go-live, because query-plan changes are where the surprises hide.

## Further reading

- [Microsoft: Breaking changes in EF Core 7](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-7.0/breaking-changes)
- [Microsoft: Breaking changes in EF Core 8](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-8.0/breaking-changes)
- [Microsoft: Breaking changes in EF Core 9](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-9.0/breaking-changes)
- [Microsoft: Breaking changes in EF Core 10](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-10.0/breaking-changes)
- [Rick Strahl: Connection failures with Microsoft.Data.SqlClient 4 and later](https://weblog.west-wind.com/posts/2021/Dec/07/Connection-Failures-with-MicrosoftDataSqlClient-4-and-later)
