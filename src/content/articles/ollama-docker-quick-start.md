---
title: "Running a local LLM with Ollama and Docker: a quick start"
description: Get a large language model running on your own machine in about ten minutes — Ollama in a Docker container, pulling and chatting with a model, calling its REST and OpenAI-compatible APIs with curl, and using it from C#. Part 1 of 2.
pubDate: 2026-11-12T22:00:00Z
tags: [Ollama, Docker, LLM, AI, C#]
ai: "Made with AI: this article, its commands, sample code and diagram were produced with Claude, an AI assistant, from Ollama's documentation. The commands and code haven't been run yet."
---

[Ollama](https://ollama.com) runs open large language models (LLMs), such as Llama, Gemma, Qwen and Mistral, on your own hardware. Nothing leaves your machine, there's no per-token bill, and it works offline. It also gives you a simple HTTP API, so your own apps can use the model like any other service.

Running it in **Docker** keeps it tidy: one container, one volume for the models, and nothing installed on your machine apart from Docker.

This is **part 1**: the quickest route to a working model on your own computer. [Part 2](/Portfolio/articles/ollama-docker-production-setup/) covers setting it up properly for a shared server: security, GPUs, performance and keeping it running.

## What you'll end up with

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 230" role="img" aria-label="The quick-start setup. On your machine, a Docker container named ollama runs the Ollama server on port 11434, published only to localhost. Downloaded models are stored in a Docker volume called ollama, so they survive container restarts. The ollama command line inside the container, curl, and a C# app all talk to the server through localhost port 11434.">
<defs><marker id="ol1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="ol1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="20" width="170" height="44" rx="10" class="box"/>
<text x="95" y="47" text-anchor="middle" class="t">ollama run (CLI)</text>
<rect x="10" y="84" width="170" height="44" rx="10" class="box"/>
<text x="95" y="111" text-anchor="middle" class="t">curl / Postman</text>
<rect x="10" y="148" width="170" height="44" rx="10" class="box"/>
<text x="95" y="175" text-anchor="middle" class="t">Your C# app</text>
<line x1="180" y1="42" x2="247" y2="96" class="ln" marker-end="url(#ol1a)"/>
<line x1="180" y1="106" x2="247" y2="106" class="ln" marker-end="url(#ol1a)"/>
<line x1="180" y1="170" x2="247" y2="116" class="ln" marker-end="url(#ol1a)"/>
<rect x="250" y="66" width="200" height="80" rx="10" class="box hi"/>
<text x="350" y="92" text-anchor="middle" class="t">ollama container</text>
<text x="350" y="112" text-anchor="middle" class="s m acc" style="font-size:11px">127.0.0.1:11434</text>
<text x="350" y="130" text-anchor="middle" class="s" style="font-size:12px">ollama/ollama image</text>
<line x1="450" y1="106" x2="507" y2="106" class="ln hi" marker-end="url(#ol1h)"/>
<rect x="510" y="66" width="170" height="80" rx="10" class="box"/>
<text x="595" y="92" text-anchor="middle" class="t">ollama volume</text>
<text x="595" y="112" text-anchor="middle" class="s m" style="font-size:11px">/root/.ollama</text>
<text x="595" y="130" text-anchor="middle" class="s" style="font-size:12px">downloaded models</text>
<text x="345" y="218" text-anchor="middle" class="lbl">Everything runs on your machine; only localhost can reach the API</text>
</svg></div><figcaption><b>The quick-start setup.</b> One container, one volume for models, and an API on localhost that any tool or app can call.</figcaption></figure>

## Before you start

- **Docker:** Docker Desktop on Windows or macOS, or Docker Engine on Linux.
- **Memory:** as a rough guide, a small 1–4 billion parameter model needs 4–8 GB of free RAM, and an 8 billion parameter model needs about 8–16 GB. Start small.
- **A GPU is optional.** Small models run fine on a modern CPU, just more slowly. GPU setup is covered in [part 2](/Portfolio/articles/ollama-docker-production-setup/).
- **Disk space:** models are typically 1–10 GB each.

## 1. Start the Ollama container

```bash
docker run -d \
  --name ollama \
  -v ollama:/root/.ollama \
  -p 127.0.0.1:11434:11434 \
  --restart unless-stopped \
  ollama/ollama
```

What each part does:

- **`-v ollama:/root/.ollama`** stores models in a named volume, so they survive the container being removed or updated. Without it, you'd download every model again.
- **`-p 127.0.0.1:11434:11434`** makes the API available on port 11434, **only to your own machine**. Ollama's own docs use `-p 11434:11434`, which publishes it on every network interface, so anyone on the same Wi-Fi could use it. Ollama has no login, so keep it on localhost.
- **`--restart unless-stopped`** starts it again after a reboot.

Have an NVIDIA GPU and the NVIDIA Container Toolkit installed? Add `--gpus=all` before `ollama/ollama`. (Part 2 covers the setup.)

Check it's running:

```bash
curl http://localhost:11434/api/version
```

## 2. Download a model and chat with it

```bash
docker exec -it ollama ollama run llama3.2
```

The first time, this downloads the model (about 2 GB for Llama 3.2's 3 billion parameter version), then opens an interactive chat. Type a question, and use `/bye` to exit.

Browse the [Ollama model library](https://ollama.com/library) for others. Some handy commands:

```bash
docker exec -it ollama ollama pull gemma3       # download without chatting
docker exec -it ollama ollama list              # models you've downloaded
docker exec -it ollama ollama ps                # models loaded in memory right now
docker exec -it ollama ollama rm gemma3         # delete a model
```

## 3. Call the API

Anything that can make an HTTP request can use the model. Ollama's own chat API:

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [{ "role": "user", "content": "Explain Docker volumes in one sentence." }],
  "stream": false
}'
```

Leave out `"stream": false` and the answer streams back word by word, like ChatGPT.

Ollama also has an **OpenAI-compatible API**, so tools and libraries written for OpenAI work by changing the base URL:

```bash
curl http://localhost:11434/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "llama3.2",
  "messages": [{ "role": "user", "content": "Explain Docker volumes in one sentence." }]
}'
```

## 4. Use it from C#

The [OllamaSharp](https://github.com/awaescher/OllamaSharp) package implements `IChatClient` from **Microsoft.Extensions.AI**, .NET's standard abstraction for chat models. Code written against `IChatClient` can later switch to Azure OpenAI or another provider without changes.

```bash
dotnet new console -n OllamaDemo
cd OllamaDemo
dotnet add package OllamaSharp
```

```csharp
using Microsoft.Extensions.AI;
using OllamaSharp;

IChatClient chat = new OllamaApiClient(new Uri("http://localhost:11434"), "llama3.2");

// One answer
var response = await chat.GetResponseAsync("Give me three names for a dog-walking app.");
Console.WriteLine(response.Text);

// Streamed, word by word
await foreach (var update in chat.GetStreamingResponseAsync("Now explain why you chose them."))
    Console.Write(update.Text);
```

In an ASP.NET Core app, register it once with dependency injection and inject `IChatClient` wherever you need it:

```csharp
builder.Services.AddChatClient(new OllamaApiClient(new Uri("http://localhost:11434"), "llama3.2"));
```

## Stopping, updating and removing

```bash
docker stop ollama            # stop it
docker start ollama           # start it again
docker pull ollama/ollama     # get the latest version, then remove and re-run the container
docker rm -f ollama           # remove the container (models stay in the volume)
docker volume rm ollama       # delete all downloaded models too
```

## Tips

- **The first answer is slow** because the model loads into memory. Later answers are faster. Ollama unloads a model after 5 minutes idle by default.
- **Smaller is faster.** If answers crawl, try a smaller model or a smaller version of it (for example a 1B instead of a 3B tag).
- **Don't publish port 11434 to your network**, and never to the internet. Thousands of Ollama servers have been found exposed with no authentication.

## Next: setting it up properly

This setup is ideal for trying things out on your own machine. To run Ollama on a shared server for a team or an app, read [part 2: setting up Ollama in Docker properly](/Portfolio/articles/ollama-docker-production-setup/). It covers authentication and TLS, GPUs, sizing, performance settings, health checks, updates and monitoring.

## Sources

- [Ollama Docker documentation](https://docs.ollama.com/docker) — run commands for CPU, NVIDIA and AMD
- [Ollama FAQ](https://docs.ollama.com/faq) — defaults such as the 5-minute keep-alive and binding to 127.0.0.1
- [Ollama model library](https://ollama.com/library)
- [OllamaSharp](https://github.com/awaescher/OllamaSharp) — .NET client implementing `IChatClient`
- [Microsoft.Extensions.AI](https://learn.microsoft.com/dotnet/ai/microsoft-extensions-ai) — Microsoft Learn
