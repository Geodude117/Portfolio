---
title: "Customer.API: a layered .NET API, from stored procedures to a typed client"
description: How I structured a customer-management API into separate projects for the API, business logic, data access, database and client, and what I'd do differently looking back at it today.
pubDate: 2026-10-26T12:00:00Z
tags: [C#, .NET, ASP.NET Core, SQL Server, Dapper, Architecture]
ai: "Made with AI: this article, its diagrams and the code review in 'Looking back' were produced with Claude, an AI assistant, from the Customer.API source code."
---

Customer.API is a REST API for managing customer records: names, dates of birth, addresses and contact details. The domain is deliberately simple, and that's the point. With the business problem out of the way, the project is really about structure: how to split an API into layers that each have one job, and how those layers talk to each other.

It's built on .NET 5 and ASP.NET Core, with SQL Server for storage and Dapper for data access. The whole thing went from an empty repo to a working API, a typed client and a test suite over a few days in September 2021, with features merged through pull requests.

## The solution at a glance

The solution is split into eight projects. Each layer only knows about the one directly below it, and they all share a common set of models.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 372" role="img" aria-label="Customer.API solution layers. A console app uses the Customer.HttpClient library, which calls the Customer.API project over HTTP. The API validates requests with FluentValidation and calls Customer.Business, which uses a unit of work exposing three Dapper repositories in Customer.Repository. The repositories call stored procedures in the Customer.Database SQL project. Customer.Models is shared by every layer, and Customer.Tests covers the validators, business and repository layers.">
<defs><marker id="c1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="c1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="10" width="200" height="56" rx="10" class="box dim"/>
<text x="110" y="34" text-anchor="middle" class="t">Console app</text>
<text x="110" y="53" text-anchor="middle" class="s m">HttpClient.ConsoleTests</text>
<line x1="210" y1="38" x2="246" y2="38" class="ln" marker-end="url(#c1a)"/>
<rect x="250" y="10" width="230" height="56" rx="10" class="box"/>
<text x="365" y="34" text-anchor="middle" class="t">Customer.HttpClient</text>
<text x="365" y="53" text-anchor="middle" class="s">typed client · ICustomerService</text>
<line x1="365" y1="66" x2="365" y2="94" class="ln hi dash" marker-end="url(#c1h)"/>
<text x="373" y="85" class="lbl m">HTTPS · JSON</text>
<rect x="250" y="98" width="230" height="60" rx="10" class="box hi"/>
<text x="365" y="122" text-anchor="middle" class="t">Customer.API</text>
<text x="365" y="142" text-anchor="middle" class="s">controllers · validators · Swagger</text>
<line x1="365" y1="158" x2="365" y2="182" class="ln hi" marker-end="url(#c1h)"/>
<rect x="250" y="186" width="230" height="56" rx="10" class="box"/>
<text x="365" y="210" text-anchor="middle" class="t">Customer.Business</text>
<text x="365" y="229" text-anchor="middle" class="s">assembles customers · rules</text>
<line x1="365" y1="242" x2="365" y2="266" class="ln hi" marker-end="url(#c1h)"/>
<rect x="250" y="270" width="230" height="56" rx="10" class="box"/>
<text x="365" y="294" text-anchor="middle" class="t">Customer.Repository</text>
<text x="365" y="313" text-anchor="middle" class="s">unit of work · 3 Dapper repos</text>
<line x1="480" y1="298" x2="520" y2="298" class="ln hi" marker-end="url(#c1h)"/>
<text x="500" y="290" text-anchor="middle" class="lbl">exec</text>
<rect x="524" y="250" width="156" height="96" rx="10" class="box"/>
<text x="602" y="274" text-anchor="middle" class="t">SQL Server</text>
<text x="602" y="293" text-anchor="middle" class="s m">Customer.Database</text>
<text x="602" y="312" text-anchor="middle" class="s">3 tables</text>
<text x="602" y="330" text-anchor="middle" class="s">13 stored procedures</text>
<rect x="10" y="98" width="200" height="228" rx="10" class="box dim"/>
<text x="110" y="124" text-anchor="middle" class="t">Customer.Models</text>
<text x="110" y="144" text-anchor="middle" class="s">shared by every layer</text>
<text x="110" y="176" text-anchor="middle" class="s m">Customer</text>
<text x="110" y="196" text-anchor="middle" class="s m">Address</text>
<text x="110" y="216" text-anchor="middle" class="s m">ContactInformation</text>
<text x="110" y="236" text-anchor="middle" class="s m">ContactInfomationType</text>
<line x1="210" y1="212" x2="246" y2="212" class="ln dash"/>
<rect x="524" y="98" width="156" height="128" rx="10" class="box dim"/>
<text x="602" y="124" text-anchor="middle" class="t">Customer.Tests</text>
<text x="602" y="146" text-anchor="middle" class="s">MSTest · Moq</text>
<text x="602" y="166" text-anchor="middle" class="s">FluentValidation</text>
<text x="602" y="182" text-anchor="middle" class="s">TestHelper</text>
<text x="602" y="206" text-anchor="middle" class="s m acc">37 tests</text>
<line x1="524" y1="140" x2="484" y2="128" class="ln dash" marker-end="url(#c1a)"/>
<line x1="524" y1="190" x2="484" y2="212" class="ln dash" marker-end="url(#c1a)"/>
<text x="110" y="356" text-anchor="middle" class="lbl">dashed boxes sit beside the main path</text>
</svg></div><figcaption><b>One responsibility per project.</b> The API handles HTTP and validation, the business layer assembles a full customer from its parts, the repository layer owns SQL, and the database project owns the schema. A separate client library means consumers never hand-write URLs.</figcaption></figure>

## The database: schema and stored procedures

The schema lives in a SQL Server Database Project (`.sqlproj`), so tables and stored procedures are versioned alongside the C# code and deployed together. A customer is split across three tables:

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 214" role="img" aria-label="Database schema. The Customer table has a GUID Id primary key, Forename, Surename, DateOfBirth and an AddressId foreign key to Address. The Address table has an integer identity Id, HouseNo, Street, City, Postcode and a CustomerId foreign key back to Customer. The ContactInformation table has an integer identity Id, Type, Value and a CustomerId column with no foreign key.">
<defs><marker id="c2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>
<rect x="10" y="10" width="200" height="164" rx="10" class="box hi"/>
<text x="24" y="34" class="t">Customer</text>
<line x1="10" y1="44" x2="210" y2="44" class="ln" style="stroke:var(--accent)"/>
<text x="24" y="66" class="s m" style="fill:var(--text)">Id</text><text x="196" y="66" text-anchor="end" class="lbl m">GUID · PK</text>
<text x="24" y="88" class="s m">Forename</text><text x="196" y="88" text-anchor="end" class="lbl m">nvarchar</text>
<text x="24" y="110" class="s m">Surename</text><text x="196" y="110" text-anchor="end" class="lbl m">nvarchar</text>
<text x="24" y="132" class="s m">DateOfBirth</text><text x="196" y="132" text-anchor="end" class="lbl m">nvarchar</text>
<text x="24" y="154" class="s m">AddressId</text><text x="196" y="154" text-anchor="end" class="lbl m">int · FK</text>
<rect x="245" y="10" width="200" height="186" rx="10" class="box"/>
<text x="259" y="34" class="t">Address</text>
<line x1="245" y1="44" x2="445" y2="44" class="ln" style="stroke:var(--border)"/>
<text x="259" y="66" class="s m" style="fill:var(--text)">Id</text><text x="431" y="66" text-anchor="end" class="lbl m">int identity · PK</text>
<text x="259" y="88" class="s m">HouseNo</text><text x="431" y="88" text-anchor="end" class="lbl m">int</text>
<text x="259" y="110" class="s m">Street</text><text x="431" y="110" text-anchor="end" class="lbl m">nvarchar</text>
<text x="259" y="132" class="s m">City</text><text x="431" y="132" text-anchor="end" class="lbl m">nvarchar</text>
<text x="259" y="154" class="s m">Postcode</text><text x="431" y="154" text-anchor="end" class="lbl m">nvarchar</text>
<text x="259" y="176" class="s m">CustomerId</text><text x="431" y="176" text-anchor="end" class="lbl m">GUID · FK</text>
<rect x="480" y="10" width="200" height="142" rx="10" class="box"/>
<text x="494" y="34" class="t">ContactInformation</text>
<line x1="480" y1="44" x2="680" y2="44" class="ln" style="stroke:var(--border)"/>
<text x="494" y="66" class="s m" style="fill:var(--text)">Id</text><text x="666" y="66" text-anchor="end" class="lbl m">int identity · PK</text>
<text x="494" y="88" class="s m">Type</text><text x="666" y="88" text-anchor="end" class="lbl m">Email | Telephone</text>
<text x="494" y="110" class="s m">Value</text><text x="666" y="110" text-anchor="end" class="lbl m">nvarchar</text>
<text x="494" y="132" class="s m">CustomerId</text><text x="666" y="132" text-anchor="end" class="lbl m">GUID · no FK</text>
<path d="M210 150 H245" class="ln" marker-start="url(#c2a)" marker-end="url(#c2a)"/>
<text x="227" y="142" text-anchor="middle" class="lbl">1 : 1</text>
<path d="M110 174 V204 H580 V156" class="ln dash" marker-end="url(#c2a)"/>
<text x="460" y="198" class="lbl">1 : many (by convention only)</text>
</svg></div><figcaption><b>Customers use GUIDs; child rows use identities.</b> The client generates the customer's GUID up front, so the API never has to read back an ID after inserting. Contact details are linked by <code>CustomerId</code>, but without a foreign key constraint.</figcaption></figure>

All data access goes through stored procedures: 13 in total, covering get, get-all, insert, update, delete and search for each table. That keeps the SQL in one place, reviewable and tunable by anyone who knows SQL Server, and it means the application only needs permission to execute procedures rather than read or write tables directly.

Search is the most interesting procedure. It accepts a forename, surname, postcode or email, and collects matching customer IDs from each table into a table variable before returning them:

```sql
DECLARE @results TABLE (Id uniqueidentifier not null)

IF (@Forename is not null or @Surename is not null)
    INSERT INTO @results
        SELECT TOP 100 CU.Id FROM dbo.Customer CU
        WHERE (@Forename = CU.Forename) or (@Surename = CU.Surename)

IF (@PostCode is not null)
    INSERT INTO @results
        SELECT TOP 100 AD.CustomerId FROM dbo.[Address] AD
        WHERE (@PostCode = AD.Postcode)

-- …email search against ContactInformation…

SELECT * FROM @results
```

## The repository layer: Dapper and a unit of work

Each table gets a repository built on a generic base class. The base holds the connection string and hands out a fresh `SqlConnection` on every call, which suits ADO.NET's connection pooling:

```csharp
public abstract class Repository<T> : IRepository<T> where T : class
{
    private readonly string _connection;
    public Repository(string connection) => _connection = connection;

    public IDbConnection Connection => new SqlConnection(_connection);

    public abstract Task<IEnumerable<T>> GetAllAsync();
    public abstract Task<T> GetAsync(Guid id);
    public abstract Task<Guid?> InsertAsync(Guid? id, T entity);
    public abstract Task<bool> UpdateAsync(T entity);
}
```

The concrete repositories use Dapper to call the stored procedures and map results straight onto the shared models. Writes run inside a transaction and only commit when exactly one row was affected:

```csharp
using (IDbConnection connection = Connection)
{
    connection.Open();
    using (var tx = connection.BeginTransaction())
    {
        var result = await tx.Connection.ExecuteAsync("[dbo].[Customer_Insert]",
            parameters, commandType: CommandType.StoredProcedure, transaction: tx);

        if (result == 1) { tx.Commit(); return parameters.Get<Guid>("@CustomerId"); }
        tx.Rollback();
        return null;
    }
}
```

A `UnitOfWork` class groups the three repositories behind one interface, so the business layer takes a single dependency instead of three:

```csharp
public interface IUnitOfWork
{
    IAddressRepository AddressRepo { get; }
    IContactInformationRepository ContactInformationRepo { get; }
    ICustomerRepository CustomerRepo { get; }
}
```

## The business layer: assembling a customer

The API deals in whole customers, but the database stores them in three pieces. The business layer bridges that gap. Reading a customer means fetching the customer row, its address and its contact details, then stitching them into one object. Creating one runs the same steps in reverse:

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 300" role="img" aria-label="Creating a customer: a POST request reaches CustomerController, which validates it with CustomerValidator and returns 400 with the errors if it fails. Otherwise CustomerBusiness.InsertAsync calls CustomerRepository to run Customer_Insert in its own transaction, then AddressRepository to run Address_Insert, then ContactInformationRepository to run ContactInformation_Insert once per contact detail. Each step opens its own connection.">
<defs><marker id="c3a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="c3h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<text x="80" y="20" text-anchor="middle" class="lbl m">API</text>
<text x="260" y="20" text-anchor="middle" class="lbl m">Business</text>
<text x="555" y="20" text-anchor="middle" class="lbl m">Repository → SQL</text>
<rect x="10" y="32" width="140" height="48" rx="10" class="box"/>
<text x="80" y="53" text-anchor="middle" class="t">POST</text>
<text x="80" y="70" text-anchor="middle" class="s m">/api/customer</text>
<line x1="80" y1="80" x2="80" y2="104" class="ln" marker-end="url(#c3a)"/>
<rect x="10" y="108" width="140" height="48" rx="10" class="box"/>
<text x="80" y="129" text-anchor="middle" class="t">Validate</text>
<text x="80" y="146" text-anchor="middle" class="s m">CustomerValidator</text>
<line x1="80" y1="156" x2="80" y2="196" class="ln" marker-end="url(#c3a)"/>
<text x="88" y="180" class="lbl">invalid</text>
<rect x="10" y="200" width="140" height="40" rx="10" class="box dim"/>
<text x="80" y="225" text-anchor="middle" class="s">400 + errors</text>
<line x1="150" y1="132" x2="186" y2="132" class="ln hi" marker-end="url(#c3h)"/>
<text x="168" y="124" text-anchor="middle" class="lbl">valid</text>
<rect x="190" y="108" width="140" height="48" rx="10" class="box hi"/>
<text x="260" y="129" text-anchor="middle" class="t">InsertAsync</text>
<text x="260" y="146" text-anchor="middle" class="s m">CustomerBusiness</text>
<path d="M330 120 C380 120, 380 60, 424 60" class="ln hi" marker-end="url(#c3h)"/>
<text x="372" y="72" text-anchor="middle" class="lbl">1</text>
<line x1="330" y1="132" x2="424" y2="132" class="ln hi" marker-end="url(#c3h)"/>
<text x="372" y="125" text-anchor="middle" class="lbl">2</text>
<path d="M330 144 C380 144, 380 204, 424 204" class="ln hi" marker-end="url(#c3h)"/>
<text x="372" y="196" text-anchor="middle" class="lbl">3 · per item</text>
<rect x="428" y="36" width="254" height="48" rx="10" class="box"/>
<text x="442" y="57" class="s m" style="fill:var(--text)">Customer_Insert</text>
<text x="442" y="74" class="lbl">own connection + transaction</text>
<rect x="428" y="108" width="254" height="48" rx="10" class="box"/>
<text x="442" y="129" class="s m" style="fill:var(--text)">Address_Insert</text>
<text x="442" y="146" class="lbl">own connection</text>
<rect x="428" y="180" width="254" height="48" rx="10" class="box"/>
<text x="442" y="201" class="s m" style="fill:var(--text)">ContactInformation_Insert</text>
<text x="442" y="218" class="lbl">own connection · runs once per contact</text>
<rect x="428" y="250" width="254" height="40" rx="10" class="box dim"/>
<text x="555" y="275" text-anchor="middle" class="lbl">no transaction spans all three steps</text>
</svg></div><figcaption><b>One request, three round trips.</b> Each repository call opens its own connection, which keeps them independent and simple, but it also means the three inserts aren't atomic. More on that below.</figcaption></figure>

Updates are smarter than a blind overwrite. The business layer loads the existing customer, compares it with the incoming one, and skips the database entirely if nothing has changed. When something has, it updates the customer and address rows and replaces the contact details, running the independent steps in parallel with `Task.WhenAll`:

```csharp
var oldCustomer = await this.GetAsync(model.Id.Value);
if (model.CompareTo(oldCustomer) <= 0)
    return false;   // nothing to update

var updateResults = TaskSummary.TaskBoolSummary(await Task.WhenAll(new List<Task<bool>>
{
    _CustomerRepository.UpdateAsync(model),             // customer + address
    _ContactInformationRepository.DeleteAsync(model.Id.Value)
}));

foreach (var contactInfo in model.ContactInformation)
    if (await _ContactInformationRepository.InsertAsync(model.Id, contactInfo) == null)
        updateResults = false;
```

## Validation with FluentValidation

Validation rules live in their own classes rather than as attributes on the models, which keeps the models clean and makes the rules testable on their own. The customer validator checks the GUID, the surname, a UK date format and a full UK postcode pattern, then validates each contact detail with a child validator:

```csharp
public CustomerValidator()
{
    RuleFor(x => x.Id).NotNull();
    RuleFor(x => x.Surename).MinimumLength(3).Matches("[a-zA-Z]");
    RuleFor(x => x.DateOfBirth).Must(BeAValidDate)
        .WithMessage("Date of birth is not in the correct format");
    RuleFor(x => x.Address.Postcode).NotNull().Matches(UkPostcodePattern);
    RuleForEach(x => x.ContactInformation).SetValidator(new ContactInformationValidator());
}
```

The contact validator checks the type is a known `ContactInfomationType`, then validates the value against that type: email addresses through `System.Net.Mail.MailAddress`, phone numbers against a pattern. The controller runs validation before touching the business layer and returns `400` with the full list of errors if anything fails.

## A typed HTTP client

Rather than leave consumers to build URLs and parse JSON themselves, the solution ships its own client library. `ICustomerService` exposes methods like `GetAllCustomers()`, `GetCustomers(guid)` and `InsertCustomer(customer)`, and returns the same shared models the API uses. A small console app exercises it end to end: list customers, insert one, read it back, update it, then delete it.

## Tests

The test project has 37 MSTest tests across three areas:

- **Validators (19 tests)** use FluentValidation's `TestHelper` to check each rule against valid and invalid customers: missing contact details, bad postcodes, malformed dates and invalid emails.
- **Business layer (8 tests)** and **repositories (10 tests)** use Moq to set up the expected inputs and outputs for each operation.

## Looking back: what I'd change

I built this in 2021. Reading it again now, as a team lead who reviews this kind of code every week, a few things stand out. I've left the code as it was, because the gap between then and now is part of the story.

- **Make the unit of work a real unit of work.** Here it's a container for three repositories, each opening its own connection. Creating a customer runs three separate operations, so if the contact insert fails, a half-created customer is left behind. A proper unit of work would share one connection and one transaction across all three repositories, and commit once at the end.
- **Commit the delete.** `DeleteAsync` executes inside a transaction but never calls `Commit()`, so disposing the transaction rolls the delete back.
- **Fix two search bugs.** The email clause compares the parameter with itself (`@EmailAddress = @EmailAddress`), so it matches every customer who has an email. And in the business layer, `customerIds.Distinct()` discards its result, so duplicates aren't actually removed.
- **Give the models value equality.** `CompareTo` compares `Address` and the contact list by reference, so it always reports a change and the "skip unchanged updates" optimisation never triggers. Making the models C# `record` types would fix this in one line each.
- **Test the real classes.** The business and repository tests mock the very interfaces they're testing, so they check Moq's setup rather than my code. The validator tests are the genuinely useful ones. Today I'd mock the layer *below* the class under test, and add integration tests against a real SQL Server in a container using Testcontainers.
- **Avoid N+1 queries.** Getting all customers runs one query for the list, then two more per customer. A single procedure returning multiple result sets, read with Dapper's `QueryMultiple`, would do it in one round trip.
- **Modernise the plumbing.** Use `IHttpClientFactory` instead of creating an `HttpClient` per call and blocking on `.Result`; use `throw;` instead of `throw ex;` so stack traces survive; store dates of birth as `date`, not text; and actually wire up the Serilog packages the API already references.

None of these change the shape of the solution, which I'd still largely keep. Clear layers, schema in source control, validation separate from models, and a client library for consumers have all held up. The fixes are in the details, which is where most real-world bugs live.

The code is on [GitHub](https://github.com/Geodude117/Customer.API).
