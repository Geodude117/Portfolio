---
title: "Dependency injection in C#, explained with one example"
description: A short, plain-English explanation of dependency injection in C# and .NET, using a single example — an order service that sends a confirmation — from the tightly coupled version to the injected one, and why it makes testing easy.
pubDate: 2026-10-26T23:45:00Z
tags: [C#, .NET, Dependency Injection, Beginner]
guide: true
ai: "Made with AI: this article, its example code and diagram were produced with Claude, an AI assistant. The code hasn't been compiled or run yet."
---

**Dependency injection (DI)** sounds complicated, but the idea is simple:

> A class shouldn't build the things it needs. It should be **given** them.

Think of a coffee shop. The barista doesn't go out and build an espresso machine every morning. The machine is supplied, and the barista just uses it. If the shop swaps it for a better one, the barista still makes coffee the same way.

Here's one example in C#, from start to finish.

## The problem: a class that builds its own tools

An `OrderService` needs to send a confirmation when an order is placed:

```csharp
public class OrderService
{
    public void PlaceOrder(string customerEmail)
    {
        // ...save the order...

        var sender = new EmailSender();          // builds its own dependency
        sender.Send(customerEmail, "Thanks for your order!");
    }
}
```

This works, but `OrderService` is now **welded** to `EmailSender`:

- Want to send an SMS instead? You have to edit `OrderService`.
- Want to unit test `PlaceOrder`? Every test sends a real email.

## The fix: ask for it, don't build it

**Step 1: describe what you need with an interface.** `OrderService` doesn't care *how* the message is sent, only that it can be:

```csharp
public interface IMessageSender
{
    void Send(string to, string message);
}

public class EmailSender : IMessageSender
{
    public void Send(string to, string message) =>
        Console.WriteLine($"Email to {to}: {message}");
}
```

**Step 2: receive it through the constructor.** This is the "injection":

```csharp
public class OrderService(IMessageSender sender)
{
    public void PlaceOrder(string customerEmail)
    {
        // ...save the order...
        sender.Send(customerEmail, "Thanks for your order!");
    }
}
```

`OrderService` no longer mentions `EmailSender` anywhere. It just says "give me something that can send a message".

**Step 3: tell .NET what to hand over.** In `Program.cs`, register which class fills the interface:

```csharp
builder.Services.AddScoped<IMessageSender, EmailSender>();
builder.Services.AddScoped<OrderService>();
```

From now on, whenever something asks for an `OrderService`, .NET creates it and passes in an `EmailSender` automatically. In a Web API, you just ask for it in your endpoint:

```csharp
app.MapPost("/orders", (string email, OrderService orders) =>
{
    orders.PlaceOrder(email);
    return Results.Ok();
});
```

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 170" role="img" aria-label="The DI container reads the registration in Program.cs, which maps IMessageSender to EmailSender. When OrderService is needed, the container creates an EmailSender and passes it into OrderService's constructor. OrderService only knows about the IMessageSender interface.">
<defs><marker id="q1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="q1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="30" width="200" height="80" rx="10" class="box"/>
<text x="110" y="58" text-anchor="middle" class="t">Program.cs</text>
<text x="110" y="78" text-anchor="middle" class="s m" style="font-size:11px">IMessageSender</text>
<text x="110" y="94" text-anchor="middle" class="s m" style="font-size:11px">→ EmailSender</text>
<line x1="210" y1="70" x2="242" y2="70" class="ln" marker-end="url(#q1a)"/>
<rect x="245" y="30" width="200" height="80" rx="10" class="box hi"/>
<text x="345" y="58" text-anchor="middle" class="t">DI container</text>
<text x="345" y="78" text-anchor="middle" class="s" style="font-size:12px">creates EmailSender</text>
<text x="345" y="94" text-anchor="middle" class="s" style="font-size:12px">and hands it over</text>
<line x1="445" y1="70" x2="477" y2="70" class="ln hi" marker-end="url(#q1h)"/>
<rect x="480" y="30" width="200" height="80" rx="10" class="box"/>
<text x="580" y="58" text-anchor="middle" class="t">OrderService</text>
<text x="580" y="78" text-anchor="middle" class="s m acc" style="font-size:11px">(IMessageSender sender)</text>
<text x="580" y="94" text-anchor="middle" class="s" style="font-size:12px">never says "new"</text>
<text x="345" y="148" text-anchor="middle" class="lbl">Swap EmailSender for SmsSender in Program.cs: OrderService doesn't change</text>
</svg></div><figcaption><b>Who builds what.</b> You register the pairing once; the container builds the dependency and passes it in.</figcaption></figure>

## The payoff

**Swapping is a one-line change.** Switching to SMS means writing an `SmsSender : IMessageSender` and changing the registration. `OrderService` is untouched:

```csharp
builder.Services.AddScoped<IMessageSender, SmsSender>();
```

**Testing becomes easy.** In a unit test, you hand `OrderService` a fake sender that just records what it was asked to do. No real emails:

```csharp
public class FakeSender : IMessageSender
{
    public List<string> Sent { get; } = [];
    public void Send(string to, string message) => Sent.Add(to);
}

[Fact]
public void PlaceOrder_sends_a_confirmation()
{
    var fake = new FakeSender();
    var service = new OrderService(fake);

    service.PlaceOrder("jo@example.com");

    Assert.Single(fake.Sent);
}
```

## In one sentence

Instead of a class creating what it needs with `new`, it **asks for it in its constructor**, and .NET supplies it, so you can swap the real thing for another version, or a fake in tests, without touching the class.

## Sources

- [Dependency injection in .NET](https://learn.microsoft.com/dotnet/core/extensions/dependency-injection) — Microsoft Learn
- [Dependency injection in ASP.NET Core](https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection) — Microsoft Learn
