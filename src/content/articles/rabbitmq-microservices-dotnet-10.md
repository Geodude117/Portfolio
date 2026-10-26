---
title: "RabbitMQ in .NET 10: publishing and receiving messages between microservices"
description: A practical guide to event-driven microservices with RabbitMQ and .NET 10 — topology, a reliable publisher with confirms, a consumer with manual acks, retries and dead-lettering, idempotency, the outbox pattern, testing and the best practices that keep messages from going missing.
pubDate: 2026-10-26T21:40:00Z
tags: [C#, .NET 10, RabbitMQ, Microservices, Messaging]
ai: "Made with AI: this guide, its sample code and diagrams were produced with Claude, an AI assistant. The code is written against RabbitMQ.Client 7.2 but hasn't been compiled or run yet."
---

When one service needs to tell others that something happened, like an order being placed, an HTTP call is the obvious first choice. It also couples the services together: if the notifications service is down, the order API either fails or has to remember to try again. A message broker removes that coupling. The order API publishes an event, RabbitMQ stores it safely, and every service that cares picks it up in its own time.

This guide builds that with **.NET 10** and the official **RabbitMQ.Client 7** library, and focuses on the parts tutorials usually skip: what happens when the broker restarts, a consumer crashes mid-message, a message is malformed, or the same message arrives twice.

## What we're building

Two services and a shared library:

- **Orders.Api**, a minimal API that publishes an `OrderPlaced` event when an order is created.
- **Notifications.Worker**, a worker service that consumes `OrderPlaced` and emails the customer.
- **OrderFlow.Messaging**, a small shared library for the connection, topology, publisher and a reusable consumer base class.
- **OrderFlow.Contracts**, the message types both sides share.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 312" role="img" aria-label="Topology. Orders.Api publishes OrderPlaced with routing key order.placed to the orderflow.events topic exchange. The exchange routes order.placed to the notifications.order-placed quorum queue, consumed by the Notifications worker, and order.* to the inventory.order-placed queue, consumed by the Inventory worker. Messages a consumer rejects go to the orderflow.dead-letter exchange and on to that queue's own .dlq queue.">
<defs><marker id="r1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="r1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="120" width="110" height="56" rx="10" class="box"/>
<text x="65" y="144" text-anchor="middle" class="t">Orders.Api</text>
<text x="65" y="163" text-anchor="middle" class="s">publisher</text>
<text x="65" y="196" text-anchor="middle" class="lbl m">order.placed</text>
<line x1="120" y1="148" x2="146" y2="148" class="ln hi" marker-end="url(#r1h)"/>
<rect x="150" y="120" width="140" height="56" rx="10" class="box hi"/>
<text x="220" y="144" text-anchor="middle" class="t m" style="font-size:12px">orderflow.events</text>
<text x="220" y="163" text-anchor="middle" class="s">topic exchange</text>
<path d="M290 136 C315 136, 315 66, 336 66" class="ln hi" marker-end="url(#r1h)"/>
<text x="310" y="88" text-anchor="end" class="lbl m">order.placed</text>
<path d="M290 160 C315 160, 315 226, 336 226" class="ln hi" marker-end="url(#r1h)"/>
<text x="310" y="214" text-anchor="end" class="lbl m">order.*</text>
<rect x="340" y="40" width="190" height="52" rx="10" class="box"/>
<text x="435" y="62" text-anchor="middle" class="s m" style="fill:var(--text);font-size:11px">notifications.order-placed</text>
<text x="435" y="80" text-anchor="middle" class="s">quorum queue</text>
<rect x="340" y="200" width="190" height="52" rx="10" class="box"/>
<text x="435" y="222" text-anchor="middle" class="s m" style="fill:var(--text);font-size:11px">inventory.order-placed</text>
<text x="435" y="240" text-anchor="middle" class="s">quorum queue</text>
<line x1="530" y1="66" x2="566" y2="66" class="ln" marker-end="url(#r1a)"/>
<line x1="530" y1="226" x2="566" y2="226" class="ln" marker-end="url(#r1a)"/>
<rect x="570" y="40" width="110" height="52" rx="10" class="box"/>
<text x="625" y="62" text-anchor="middle" class="t">Notifications</text>
<text x="625" y="80" text-anchor="middle" class="s">worker</text>
<rect x="570" y="200" width="110" height="52" rx="10" class="box"/>
<text x="625" y="222" text-anchor="middle" class="t">Inventory</text>
<text x="625" y="240" text-anchor="middle" class="s">worker</text>
<rect x="150" y="266" width="140" height="40" rx="10" class="box dim"/>
<text x="220" y="290" text-anchor="middle" class="s m" style="font-size:11px">orderflow.dead-letter</text>
<rect x="340" y="266" width="190" height="40" rx="10" class="box dim"/>
<text x="435" y="290" text-anchor="middle" class="s m" style="font-size:11px">&lt;queue&gt;.dlq</text>
<line x1="290" y1="286" x2="336" y2="286" class="ln dash" marker-end="url(#r1a)"/>
<path d="M340 246 C305 246, 262 246, 252 262" class="ln dash" marker-end="url(#r1a)"/>
<text x="238" y="252" text-anchor="end" class="lbl">rejected</text>
</svg></div><figcaption><b>One exchange, one queue per consuming service.</b> The publisher only knows the exchange and a routing key. Each service owns its queue, so adding a new subscriber never touches the publisher, and each queue dead-letters into its own <code>.dlq</code>.</figcaption></figure>

```text
OrderFlow/
├── docker-compose.yml
├── src/
│   ├── OrderFlow.Contracts/        OrderPlaced and other message records
│   ├── OrderFlow.Messaging/        connection, topology, publisher, consumer base
│   ├── Orders.Api/                 minimal API → publishes OrderPlaced
│   └── Notifications.Worker/       BackgroundService → consumes OrderPlaced
└── tests/
    └── OrderFlow.Messaging.Tests/  Testcontainers + a real RabbitMQ
```

## RabbitMQ in two minutes

- **Publishers send to an exchange**, never directly to a queue, along with a **routing key** such as `order.placed`.
- **Exchanges route to queues** using bindings. A **topic** exchange matches routing keys against patterns: `order.*` matches `order.placed` and `order.cancelled`.
- **Consumers read from queues** and **acknowledge** each message once they've handled it. Until then, RabbitMQ keeps it and redelivers it if the consumer disappears.
- **Quorum queues** replicate messages across nodes and are the recommended queue type for data safety. Use them for anything that matters.

## Step 1: Run RabbitMQ locally

```yaml
# docker-compose.yml
services:
  rabbitmq:
    image: rabbitmq:4-management
    hostname: rabbitmq
    ports:
      - "5672:5672"     # AMQP
      - "15672:15672"   # management UI: http://localhost:15672
    environment:
      RABBITMQ_DEFAULT_USER: orderflow
      RABBITMQ_DEFAULT_PASS: local-dev-only
      RABBITMQ_DEFAULT_VHOST: orderflow
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq   # keep messages across container restarts

volumes:
  rabbitmq-data:
```

`docker compose up -d`, then open the management UI to watch exchanges, queues and messages as you go. A dedicated **virtual host** (`orderflow`) keeps this system's exchanges and queues separate from anything else on the same broker.

## Step 2: Contracts

Messages are the public API between services, so they live in their own small project that both sides reference:

```csharp
// OrderFlow.Contracts/OrderPlaced.cs
namespace OrderFlow.Contracts;

/// <summary>Published by Orders.Api when an order has been created.</summary>
public sealed record OrderPlaced(Guid OrderId, string CustomerEmail, decimal Total, DateTimeOffset PlacedAt);
```

Name events in the **past tense**: they describe something that has already happened, not a request. Treat them like a public API: add optional fields freely, but never rename or remove one that consumers might rely on. For a breaking change, publish a new message type (for example `OrderPlacedV2`) alongside the old one until every consumer has moved.

## Step 3: Configuration

```csharp
// OrderFlow.Messaging/RabbitMqOptions.cs
public sealed class RabbitMqOptions
{
    public const string SectionName = "RabbitMq";

    /// <summary>amqp://user:password@host:5672/vhost (use amqps:// for TLS).</summary>
    public string Uri { get; set; } = "";

    /// <summary>Shows in the management UI, so you can tell services' connections apart.</summary>
    public string ClientName { get; set; } = "";

    /// <summary>How many unacknowledged messages a consumer may hold at once.</summary>
    public ushort PrefetchCount { get; set; } = 20;
}
```

The URI contains a password, so keep it out of `appsettings.json` and source control: use `dotnet user-secrets` locally and environment variables or a secret store in production.

```bash
dotnet user-secrets set "RabbitMq:Uri" "amqp://orderflow:local-dev-only@localhost:5672/orderflow"
```

## Step 4: One long-lived connection

Opening a connection is expensive: a TCP connection, a TLS handshake and an AMQP handshake. **Create one connection per service and share it.** Channels are the cheap, lightweight things you create per publisher or consumer.

```csharp
// OrderFlow.Messaging/RabbitMqConnection.cs
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

public sealed class RabbitMqConnection(IOptions<RabbitMqOptions> options, ILogger<RabbitMqConnection> logger)
    : IAsyncDisposable
{
    private readonly SemaphoreSlim _lock = new(1, 1);
    private IConnection? _connection;

    public async Task<IConnection> GetAsync(CancellationToken ct = default)
    {
        if (_connection is not null) return _connection;

        await _lock.WaitAsync(ct);
        try
        {
            if (_connection is not null) return _connection;

            var factory = new ConnectionFactory
            {
                Uri = new Uri(options.Value.Uri),
                ClientProvidedName = options.Value.ClientName,
                AutomaticRecoveryEnabled = true,   // reconnect after a network blip or broker restart
                TopologyRecoveryEnabled = true,    // and re-create consumers on the new connection
            };

            _connection = await factory.CreateConnectionAsync(ct);
            logger.LogInformation("Connected to RabbitMQ as {ClientName}", options.Value.ClientName);
            return _connection;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
        {
            await _connection.CloseAsync();
            await _connection.DisposeAsync();
        }
    }
}
```

Automatic recovery is on by default in the 7.x client, but it's worth being explicit. Note that it only kicks in **after** the first successful connection: if the broker isn't reachable when a service starts, `CreateConnectionAsync` throws. In containers, either retry at startup or make the service depend on RabbitMQ's health check.

## Step 5: Topology, declared idempotently

Exchanges and queues are declared from code. Declarations are **idempotent**: declaring something that already exists with the same settings does nothing, so every service can safely declare what it needs on startup. Declaring it with *different* settings fails with a `PRECONDITION_FAILED` error, so keep all declarations in one shared place.

```csharp
// OrderFlow.Messaging/Topology.cs
using RabbitMQ.Client;

public static class Topology
{
    public const string EventsExchange = "orderflow.events";
    public const string DeadLetterExchange = "orderflow.dead-letter";

    public static Task DeclareEventsExchangeAsync(IChannel channel, CancellationToken ct = default) =>
        channel.ExchangeDeclareAsync(EventsExchange, ExchangeType.Topic,
            durable: true, autoDelete: false, cancellationToken: ct);

    /// <summary>
    /// A consuming service's own durable quorum queue, bound to the routing keys it cares about,
    /// with a dead-letter queue of its own for messages it gives up on.
    /// </summary>
    public static async Task DeclareConsumerQueueAsync(
        IChannel channel, string queue, IEnumerable<string> routingKeys, CancellationToken ct = default)
    {
        await DeclareEventsExchangeAsync(channel, ct);
        await channel.ExchangeDeclareAsync(DeadLetterExchange, ExchangeType.Direct,
            durable: true, autoDelete: false, cancellationToken: ct);

        var deadLetterQueue = $"{queue}.dlq";
        await channel.QueueDeclareAsync(deadLetterQueue, durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object?> { ["x-queue-type"] = "quorum" },
            cancellationToken: ct);
        await channel.QueueBindAsync(deadLetterQueue, DeadLetterExchange, routingKey: queue, cancellationToken: ct);

        await channel.QueueDeclareAsync(queue, durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object?>
            {
                ["x-queue-type"] = "quorum",                    // replicated, durable
                ["x-dead-letter-exchange"] = DeadLetterExchange,
                ["x-dead-letter-routing-key"] = queue,           // lands in exactly this queue's .dlq
                ["x-delivery-limit"] = 5,                        // safety net for poison messages
            },
            cancellationToken: ct);

        foreach (var routingKey in routingKeys)
            await channel.QueueBindAsync(queue, EventsExchange, routingKey, cancellationToken: ct);
    }
}
```

A few things are doing a lot of work here:

- **`durable: true`** means the exchange and queues survive a broker restart.
- **Quorum queues** replicate across nodes in a cluster. Classic mirrored queues were removed in RabbitMQ 4.0, and quorum queues are now the recommended choice for data safety.
- **The dead-letter exchange** gives rejected messages somewhere to go instead of disappearing. Pointing the dead-letter routing key at the queue's own name means each service's failures end up in that service's `.dlq`, not in one shared pile.
- **`x-delivery-limit`** caps how many times a message can be redelivered before it's dead-lettered. That protects you from a message that crashes the consumer every time it's processed. RabbitMQ 4.3 changed which redeliveries count towards the limit, so check the behaviour for the version you run.

## Step 6: A reliable publisher

There are three ways to lose a message on the way in, and three settings that close them off:

| Risk | Fix |
|---|---|
| The broker restarts before the message is written to disk | **Persistent** messages on durable queues |
| The publish is lost on the network or the broker can't store it | **Publisher confirms**: wait for the broker to say "got it" |
| No queue is bound for the routing key, so the exchange silently drops it | **`mandatory: true`**: the broker returns unroutable messages |

In RabbitMQ.Client 7, confirms are switched on per channel through `CreateChannelOptions`. With **confirmation tracking** enabled as well, awaiting `BasicPublishAsync` only completes once the broker has confirmed the message, and throws a `PublishException` if it was rejected or returned as unroutable. Reliability becomes a normal `await` and `try`/`catch`.

```csharp
// OrderFlow.Messaging/RabbitMqEventPublisher.cs
using System.Text.Json;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;

public interface IEventPublisher
{
    Task PublishAsync<T>(T message, string routingKey,
        Guid? messageId = null, string? correlationId = null, CancellationToken ct = default);
}

public sealed class RabbitMqEventPublisher(RabbitMqConnection connection, ILogger<RabbitMqEventPublisher> logger)
    : IEventPublisher, IAsyncDisposable
{
    private static readonly CreateChannelOptions ConfirmedChannel = new(
        publisherConfirmationsEnabled: true,
        publisherConfirmationTrackingEnabled: true);

    private readonly SemaphoreSlim _lock = new(1, 1);
    private IChannel? _channel;

    public async Task PublishAsync<T>(T message, string routingKey,
        Guid? messageId = null, string? correlationId = null, CancellationToken ct = default)
    {
        var properties = new BasicProperties
        {
            Persistent = true,                                     // written to disk
            ContentType = "application/json",
            MessageId = (messageId ?? Guid.NewGuid()).ToString(),  // consumers de-duplicate on this
            CorrelationId = correlationId,                         // ties logs together across services
            Type = typeof(T).Name,                                 // e.g. "OrderPlaced"
            Timestamp = new AmqpTimestamp(DateTimeOffset.UtcNow.ToUnixTimeSeconds()),
        };
        var body = JsonSerializer.SerializeToUtf8Bytes(message);

        await _lock.WaitAsync(ct);
        try
        {
            var channel = await GetChannelAsync(ct);

            // Completes when the broker confirms; throws PublishException if it's nacked or unroutable.
            await channel.BasicPublishAsync(Topology.EventsExchange, routingKey, mandatory: true,
                basicProperties: properties, body: body, cancellationToken: ct);
        }
        finally
        {
            _lock.Release();
        }

        logger.LogInformation("Published {Type} {MessageId} with routing key {RoutingKey}",
            properties.Type, properties.MessageId, routingKey);
    }

    private async Task<IChannel> GetChannelAsync(CancellationToken ct)
    {
        if (_channel is { IsOpen: true }) return _channel;
        if (_channel is not null) await _channel.DisposeAsync();

        var conn = await connection.GetAsync(ct);
        _channel = await conn.CreateChannelAsync(ConfirmedChannel, ct);
        await Topology.DeclareEventsExchangeAsync(_channel, ct);
        return _channel;
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.DisposeAsync();
    }
}
```

The publisher keeps one channel and serialises access with a `SemaphoreSlim`, which is simple and safe. If you need more throughput, keep a small pool of confirmed channels instead.

One consequence of `mandatory: true`: publishing fails until at least one queue is bound to the routing key. That's the point, because it turns a silent misconfiguration into an error. It does mean consuming services (or a deployment step) need to declare their queues before the publisher starts sending.

### Publishing from the API

```csharp
// Orders.Api/Program.cs
using OrderFlow.Contracts;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddSingleton<RabbitMqConnection>();
builder.Services.AddSingleton<IEventPublisher, RabbitMqEventPublisher>();

var app = builder.Build();

app.MapPost("/orders", async (PlaceOrder request, IEventPublisher events, HttpContext http, CancellationToken ct) =>
{
    var placed = new OrderPlaced(Guid.NewGuid(), request.CustomerEmail, request.Total, DateTimeOffset.UtcNow);

    // In a real service, save the order and publish via an outbox (see below).
    await events.PublishAsync(placed, "order.placed", correlationId: http.TraceIdentifier, ct: ct);

    return Results.Accepted($"/orders/{placed.OrderId}", new { placed.OrderId });
});

app.Run();

public sealed record PlaceOrder(string CustomerEmail, decimal Total);
```

## Step 7: A consumer you can trust

Receiving is where most of the subtlety lives. The rules:

- **Acknowledge manually** (`autoAck: false`), and only *after* the work is done. With auto-ack, a crash halfway through loses the message.
- **Set a prefetch count.** Without one, RabbitMQ pushes the entire queue at a consumer as fast as it can, and one slow instance hoards messages the others could be processing.
- **Retry transient failures, then give up cleanly.** After a few attempts, `BasicNack` with `requeue: false` sends the message to the dead-letter queue. Requeueing forever just makes a poison message spin.
- **Never ack on shutdown.** If the service is stopping mid-message, leave it unacknowledged and RabbitMQ will redeliver it.

Rather than repeat all that in every service, it goes in a base class:

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 250" role="img" aria-label="What happens to each delivered message: it is deserialised, then HandleAsync runs. On success it is acknowledged and removed from the queue. If handling throws, it is retried up to three times with backoff; if it still fails, or if the message can't be deserialised, it is nacked without requeue and goes to the dead-letter queue. If the service shuts down mid-message, it is left unacknowledged and redelivered later with Redelivered set to true.">
<defs><marker id="r2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="r2h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<path d="M375 50 C375 12, 425 12, 425 46" class="ln dash" marker-end="url(#r2a)"/>
<text x="400" y="12" text-anchor="middle" class="lbl">retry ×3 with backoff</text>
<rect x="10" y="50" width="120" height="50" rx="10" class="box"/>
<text x="70" y="72" text-anchor="middle" class="t">Delivered</text>
<text x="70" y="90" text-anchor="middle" class="s">within prefetch</text>
<rect x="170" y="50" width="120" height="50" rx="10" class="box"/>
<text x="230" y="72" text-anchor="middle" class="t">Deserialise</text>
<text x="230" y="90" text-anchor="middle" class="s m">JSON → T</text>
<rect x="330" y="50" width="140" height="50" rx="10" class="box hi"/>
<text x="400" y="72" text-anchor="middle" class="t m" style="font-size:13px">HandleAsync</text>
<text x="400" y="90" text-anchor="middle" class="s">idempotent</text>
<rect x="520" y="50" width="160" height="50" rx="10" class="box hi"/>
<text x="600" y="72" text-anchor="middle" class="t m" style="font-size:13px">BasicAck</text>
<text x="600" y="90" text-anchor="middle" class="s">removed from queue</text>
<line x1="130" y1="75" x2="166" y2="75" class="ln hi" marker-end="url(#r2h)"/>
<line x1="290" y1="75" x2="326" y2="75" class="ln hi" marker-end="url(#r2h)"/>
<line x1="470" y1="75" x2="516" y2="75" class="ln hi" marker-end="url(#r2h)"/>
<rect x="150" y="170" width="380" height="44" rx="10" class="box dim"/>
<text x="340" y="197" text-anchor="middle" class="s m" style="fill:var(--text)">BasicNack(requeue: false) → dead-letter queue</text>
<line x1="230" y1="100" x2="230" y2="166" class="ln dash" marker-end="url(#r2a)"/>
<text x="238" y="138" class="lbl">malformed</text>
<line x1="400" y1="100" x2="400" y2="166" class="ln dash" marker-end="url(#r2a)"/>
<text x="408" y="138" class="lbl">still failing</text>
<text x="340" y="240" text-anchor="middle" class="lbl">shutting down mid-message? leave it unacked: it's redelivered later with Redelivered = true</text>
</svg></div><figcaption><b>Every message ends in exactly one of three places:</b> acknowledged, dead-lettered, or back in the queue for another attempt.</figcaption></figure>

```csharp
// OrderFlow.Messaging/RabbitMqConsumer.cs
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

public sealed record MessageContext(string MessageId, string? CorrelationId, bool Redelivered);

public abstract class RabbitMqConsumer<T>(
    RabbitMqConnection connection,
    IOptions<RabbitMqOptions> options,
    ILogger logger) : BackgroundService
{
    private const int MaxAttempts = 3;
    private IChannel? _channel;

    protected abstract string QueueName { get; }
    protected abstract string[] RoutingKeys { get; }
    protected abstract Task HandleAsync(T message, MessageContext context, CancellationToken ct);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var conn = await connection.GetAsync(stoppingToken);
        _channel = await conn.CreateChannelAsync(cancellationToken: stoppingToken);

        await Topology.DeclareConsumerQueueAsync(_channel, QueueName, RoutingKeys, stoppingToken);
        await _channel.BasicQosAsync(prefetchSize: 0, prefetchCount: options.Value.PrefetchCount,
            global: false, cancellationToken: stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(_channel);
        consumer.ReceivedAsync += (_, delivery) => OnReceivedAsync(delivery, stoppingToken);
        await _channel.BasicConsumeAsync(QueueName, autoAck: false, consumer: consumer,
            cancellationToken: stoppingToken);

        logger.LogInformation("Consuming {Queue}", QueueName);

        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { /* shutting down */ }
    }

    private async Task OnReceivedAsync(BasicDeliverEventArgs delivery, CancellationToken stoppingToken)
    {
        var props = delivery.BasicProperties;

        // The body's memory is only valid inside this handler, so deserialise it here.
        T? message = default;
        try { message = JsonSerializer.Deserialize<T>(delivery.Body.Span); }
        catch (JsonException ex) { logger.LogError(ex, "Malformed message on {Queue}", QueueName); }

        if (message is null || props.MessageId is null)
        {
            // Retrying won't fix a bad message: dead-letter it straight away.
            await _channel!.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false);
            return;
        }

        var context = new MessageContext(props.MessageId, props.CorrelationId, delivery.Redelivered);
        using var scope = logger.BeginScope(new Dictionary<string, object?>
        {
            ["MessageId"] = context.MessageId,
            ["CorrelationId"] = context.CorrelationId,
        });

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await HandleAsync(message, context, stoppingToken);
                await _channel!.BasicAckAsync(delivery.DeliveryTag, multiple: false);
                return;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return; // shutting down: leave it unacked so the broker redelivers it
            }
            catch (Exception ex) when (attempt < MaxAttempts)
            {
                logger.LogWarning(ex, "Handling failed on attempt {Attempt}; retrying", attempt);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Handling failed {Attempts} times; dead-lettering", attempt);
                await _channel!.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false);
                return;
            }

            try { await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)), stoppingToken); } // 2s, 4s
            catch (OperationCanceledException) { return; }
        }
    }

    public override async Task StopAsync(CancellationToken ct)
    {
        await base.StopAsync(ct); // cancels stoppingToken
        if (_channel is not null)
        {
            await _channel.CloseAsync(ct);
            await _channel.DisposeAsync();
        }
    }
}
```

By default the 7.x client runs one handler at a time per channel, so the prefetch count acts as a buffer of messages waiting their turn. To process several messages from one queue in parallel, pass `consumerDispatchConcurrency` in `CreateChannelOptions`. Your handler then has to be safe to run concurrently.

## Step 8: Idempotent handlers

RabbitMQ guarantees **at-least-once** delivery, not exactly-once. A consumer can finish its work and then crash before its acknowledgement reaches the broker, and the message is delivered again. So **every handler must be safe to run twice for the same message.** That's why the publisher stamps every message with a `MessageId`.

The usual pattern is an **inbox**: record each processed `MessageId` and skip ones you've seen before.

```csharp
// Notifications.Worker/OrderPlacedConsumer.cs
using Microsoft.Extensions.Options;
using OrderFlow.Contracts;

public sealed class OrderPlacedConsumer(
    RabbitMqConnection connection,
    IOptions<RabbitMqOptions> options,
    IServiceScopeFactory scopes,
    ILogger<OrderPlacedConsumer> logger)
    : RabbitMqConsumer<OrderPlaced>(connection, options, logger)
{
    protected override string QueueName => "notifications.order-placed";
    protected override string[] RoutingKeys => ["order.placed"];

    protected override async Task HandleAsync(OrderPlaced message, MessageContext context, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var inbox = scope.ServiceProvider.GetRequiredService<IInbox>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailSender>();

        if (await inbox.HasProcessedAsync(context.MessageId, ct))
            return; // a redelivery of something we've already handled

        await email.SendOrderConfirmationAsync(message.CustomerEmail, message.OrderId, ct);
        await inbox.MarkProcessedAsync(context.MessageId, ct);
    }
}
```

Each message is handled in its own **DI scope**, so scoped services such as a `DbContext` aren't shared between messages. When the handler writes to a database, do the work and the inbox insert **in the same transaction**, with a unique key on `MessageId`. Then a duplicate either does nothing or fails cleanly. For side effects you can't roll back, like sending an email, a duplicate is still *possible* if the service crashes between sending and recording it. That's usually acceptable; if it isn't, the receiving system needs its own idempotency key.

```csharp
// Notifications.Worker/Program.cs
var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddSingleton<RabbitMqConnection>();
builder.Services.AddSingleton<IInbox, InMemoryInbox>();     // use a database table in production
builder.Services.AddScoped<IEmailSender, LoggingEmailSender>();
builder.Services.AddHostedService<OrderPlacedConsumer>();

builder.Build().Run();
```

## Step 9: The outbox pattern

The API above has a subtle bug that every event-driven system has to solve: **saving to the database and publishing to RabbitMQ are two separate operations.** If the order is saved and the publish fails, the event is lost. Publish first and the save fails, and you've announced an order that doesn't exist.

The **transactional outbox** fixes this. Instead of publishing directly, the API writes the event to an `OutboxMessages` table **in the same database transaction** as the order. A background dispatcher then publishes anything unsent and marks it sent once RabbitMQ confirms.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 200" role="img" aria-label="Outbox pattern. POST /orders writes the order and an outbox message in one SQL transaction. An outbox dispatcher background service polls for unsent messages, publishes them to RabbitMQ with publisher confirms, and marks each one sent only after the broker confirms it.">
<defs><marker id="r3a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="r3h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="40" width="130" height="50" rx="10" class="box"/>
<text x="75" y="62" text-anchor="middle" class="t m" style="font-size:13px">POST /orders</text>
<text x="75" y="80" text-anchor="middle" class="s">Orders.Api</text>
<line x1="140" y1="65" x2="166" y2="65" class="ln hi" marker-end="url(#r3h)"/>
<rect x="170" y="14" width="220" height="122" rx="10" class="box dim"/>
<text x="280" y="32" text-anchor="middle" class="lbl">one SQL transaction</text>
<rect x="190" y="44" width="180" height="34" rx="8" class="box"/>
<text x="280" y="66" text-anchor="middle" class="s m" style="fill:var(--text)">Orders</text>
<rect x="190" y="88" width="180" height="34" rx="8" class="box hi"/>
<text x="280" y="110" text-anchor="middle" class="s m" style="fill:var(--text)">OutboxMessages</text>
<rect x="440" y="40" width="120" height="60" rx="10" class="box hi"/>
<text x="500" y="64" text-anchor="middle" class="t">Dispatcher</text>
<text x="500" y="84" text-anchor="middle" class="s">BackgroundService</text>
<path d="M370 98 C400 98, 410 80, 436 76" class="ln" marker-end="url(#r3a)"/>
<text x="404" y="120" text-anchor="middle" class="lbl">poll unsent</text>
<rect x="590" y="40" width="90" height="60" rx="10" class="box"/>
<text x="635" y="64" text-anchor="middle" class="t">RabbitMQ</text>
<text x="635" y="84" text-anchor="middle" class="s">confirms</text>
<line x1="560" y1="70" x2="586" y2="70" class="ln hi" marker-end="url(#r3h)"/>
<path d="M500 100 C500 160, 420 160, 374 116" class="ln dash" marker-end="url(#r3a)"/>
<text x="520" y="168" class="lbl">mark sent after the broker confirms</text>
</svg></div><figcaption><b>The order and its event are saved together or not at all.</b> If publishing fails, the message stays in the outbox and the dispatcher tries again on its next pass.</figcaption></figure>

```csharp
// In the endpoint: one transaction for the order and its event
db.Orders.Add(order);
db.OutboxMessages.Add(new OutboxMessage
{
    Id = Guid.NewGuid(),                 // becomes the RabbitMQ MessageId
    Type = nameof(OrderPlaced),
    RoutingKey = "order.placed",
    Payload = JsonSerializer.Serialize(placed),
    CreatedUtc = DateTime.UtcNow,
});
await db.SaveChangesAsync(ct);           // both rows, or neither
```

```csharp
// The dispatcher's loop (sketch): publish unsent messages, mark them sent once confirmed
while (!stoppingToken.IsCancellationRequested)
{
    await using var scope = scopes.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();

    var pending = await db.OutboxMessages
        .Where(m => m.SentUtc == null)
        .OrderBy(m => m.CreatedUtc)
        .Take(50)
        .ToListAsync(stoppingToken);

    foreach (var message in pending)
    {
        // An overload of the publisher that takes the stored JSON and the outbox Id as the MessageId.
        await publisher.PublishRawAsync(message.Payload, message.Type, message.RoutingKey,
            messageId: message.Id, ct: stoppingToken);

        message.SentUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(stoppingToken);
    }

    if (pending.Count == 0)
        await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
}
```

Because the outbox row's `Id` becomes the `MessageId`, a crash between publishing and marking the row sent just causes a duplicate publish with the **same** ID, which the consumer's inbox already handles. The outbox and the inbox are two halves of the same guarantee.

## Testing against a real broker

Mocking `IChannel` tells you very little about whether messages actually flow. [Testcontainers](https://dotnet.testcontainers.org/) starts a throwaway RabbitMQ in Docker for the test run, so you can test the real thing: declare the topology, publish, and wait for the consumer to receive it.

```csharp
public sealed class RabbitMqFixture : IAsyncLifetime
{
    private readonly RabbitMqContainer _container =
        new RabbitMqBuilder("rabbitmq:4-management").Build();

    public string Uri => _container.GetConnectionString();

    public Task InitializeAsync() => _container.StartAsync();
    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}
```

The tests worth writing:

- A published `OrderPlaced` reaches the consumer and is acknowledged.
- Publishing with no queue bound throws a `PublishException`, which proves `mandatory` and confirms are working.
- A malformed message ends up in the `.dlq` and doesn't block the queue.
- A handler that always throws is retried, then dead-lettered.
- The same `MessageId` delivered twice only sends one email.

## Observability

- **Correlation IDs.** The publisher stamps `CorrelationId` and the consumer adds it to a logging scope, so one request can be followed through every service's logs.
- **Distributed tracing.** The `RabbitMQ.Client.OpenTelemetry` package adds `AddRabbitMQInstrumentation()` for OpenTelemetry, linking the publish and consume spans into one trace. At the time of writing it's a release candidate.
- **Alert on queues, not just services.** The numbers that tell you something is wrong: a **growing queue** (consumers can't keep up or are down), a **growing `.dlq`** (messages are failing), and a high **unacked count** (consumers are stuck). The management UI shows all three, and the Prometheus plugin exports them.

## Security

- **One user per service**, with permissions limited to what it needs. The publisher can write to `orderflow.events`; each consumer can configure and read only its own queues.
- **Never use `guest` in production.** It's restricted to localhost by default for good reason.
- **Use TLS (`amqps://`)** for anything leaving the machine.
- **Keep credentials in secrets**: user secrets locally, a vault or your platform's secret store in production.

## Raw client or a library?

This guide uses the official client directly, because it shows exactly what's happening. For a larger system, a messaging library handles the outbox, retries, serialisation and topology for you:

- **MassTransit** is the most widely used. Version 9 is commercial; version 8 remains open source, with security patches through the end of 2026.
- **Wolverine** is open source, with a built-in outbox and RabbitMQ transport.
- **NServiceBus** is commercial, with long-term support.
- **.NET Aspire** has a RabbitMQ integration that wires up the connection, health checks and telemetry, and starts a local broker for development.

Even with a library, everything above still applies: it's what the library is doing for you under the hood.

## Best practices checklist

<div class="table-wrap">

| Area | Do this |
|---|---|
| Connections | One long-lived connection per service; a channel per publisher or consumer |
| Recovery | Keep automatic recovery on; retry the *first* connection at startup |
| Topology | Durable topic exchange; one durable **quorum** queue per consuming service; declarations in one shared place |
| Publishing | Persistent messages, publisher confirms, `mandatory: true`, a `MessageId` on every message |
| Atomicity | Publish through a **transactional outbox**, never straight after `SaveChanges` |
| Consuming | Manual acks after the work is done; a sensible prefetch (10–50) |
| Failures | Retry transient errors with backoff, then `BasicNack(requeue: false)` to a per-queue dead-letter queue |
| Poison messages | Set `x-delivery-limit`; dead-letter malformed messages immediately |
| Duplicates | Idempotent handlers with an **inbox** keyed on `MessageId` |
| Contracts | Past-tense event names; additive changes only; a new type for breaking changes |
| Shutdown | Cancel cleanly, never ack an unfinished message |
| Testing | Integration tests against a real broker with Testcontainers |
| Operations | Alert on queue depth, `.dlq` depth and unacked messages; trace with correlation IDs |
| Security | A user per service, no `guest`, TLS, secrets out of source control |

</div>

## Further reading

- [RabbitMQ: Publisher confirms tutorial (.NET)](https://www.rabbitmq.com/tutorials/tutorial-seven-dotnet)
- [RabbitMQ: Work queues tutorial (.NET)](https://www.rabbitmq.com/tutorials/tutorial-two-dotnet)
- [RabbitMQ 4.3 release notes](https://www.rabbitmq.com/blog/2026/04/23/rabbitmq-4.3-release)
- [RabbitMQ.Client on NuGet](https://www.nuget.org/packages/RabbitMQ.Client)
- [RabbitMQ.Client.OpenTelemetry on NuGet](https://www.nuget.org/packages/RabbitMQ.Client.OpenTelemetry/)
