---
title: "Setting up Ollama in Docker properly: security, GPUs, performance and operations"
description: Take Ollama from a laptop experiment to a shared server done right — a Docker Compose setup with no exposed port, TLS and token authentication through Caddy, blocked admin endpoints, NVIDIA GPU support, sizing and performance settings, pre-pulled models, health checks, updates, backups, monitoring and a C# client. Part 2 of 2.
pubDate: 2026-11-12T22:10:00Z
tags: [Ollama, Docker, LLM, AI, Security, DevOps]
ai: "Made with AI: this article, its configuration files, sample code and diagram were produced with Claude, an AI assistant, from Ollama's documentation and published security research. The configuration hasn't been deployed or tested yet."
---

[Part 1](/Portfolio/articles/ollama-docker-quick-start/) got a model running on your own machine with one `docker run` command. That's perfect for experimenting, but not for a server your team or your apps depend on.

The biggest reason is security. **Ollama has no authentication.** Anyone who can reach port 11434 can use your hardware, download or delete your models, and read whatever comes back. Security researchers have repeatedly found exposed Ollama servers on the internet: Cisco Talos found over 1,100 in 2025, and later scans counted far more.

This part builds a setup you can rely on:

- Ollama is **never directly reachable**; it sits on a private Docker network.
- A reverse proxy adds **TLS and a token**, and blocks the model management endpoints.
- Models are **pre-downloaded**, the container is **health-checked**, and versions are **pinned**.
- Memory, GPU and concurrency settings are **chosen on purpose**, not left to chance.

## The target setup

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 280" role="img" aria-label="The production setup. Users and apps connect over HTTPS with a bearer token to Caddy, the only container with a published port. Caddy terminates TLS, checks the token and blocks model management endpoints, then forwards to the ollama container on the internal Docker network. The ollama container uses the GPU, has a pinned version and stores models in a volume. Open WebUI, with its own logins, also talks to ollama on the internal network. A one-off model-init container pulls the required models when the stack starts.">
<defs><marker id="op1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="op1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="40" width="120" height="60" rx="10" class="box"/>
<text x="70" y="66" text-anchor="middle" class="t">Users</text>
<text x="70" y="84" text-anchor="middle" class="t">and apps</text>
<line x1="130" y1="70" x2="157" y2="70" class="ln hi" marker-end="url(#op1h)"/>
<rect x="160" y="30" width="150" height="80" rx="10" class="box hi"/>
<text x="235" y="54" text-anchor="middle" class="t">Caddy</text>
<text x="235" y="73" text-anchor="middle" class="s" style="font-size:12px">TLS · bearer token</text>
<text x="235" y="91" text-anchor="middle" class="s acc" style="font-size:12px">blocks admin APIs</text>
<line x1="310" y1="70" x2="337" y2="70" class="ln hi" marker-end="url(#op1h)"/>
<rect x="340" y="30" width="170" height="80" rx="10" class="box hi"/>
<text x="425" y="54" text-anchor="middle" class="t">ollama</text>
<text x="425" y="73" text-anchor="middle" class="s" style="font-size:12px">GPU · pinned version</text>
<text x="425" y="91" text-anchor="middle" class="s" style="font-size:12px">no published port</text>
<line x1="510" y1="70" x2="537" y2="70" class="ln" marker-end="url(#op1a)"/>
<rect x="540" y="30" width="140" height="80" rx="10" class="box"/>
<text x="610" y="62" text-anchor="middle" class="t">models volume</text>
<text x="610" y="82" text-anchor="middle" class="s m" style="font-size:11px">/root/.ollama</text>
<path d="M70 100 V200 H157" class="ln" marker-end="url(#op1a)"/>
<rect x="160" y="170" width="150" height="60" rx="10" class="box"/>
<text x="235" y="196" text-anchor="middle" class="t">Open WebUI</text>
<text x="235" y="214" text-anchor="middle" class="s" style="font-size:12px">optional, own logins</text>
<line x1="310" y1="175" x2="358" y2="114" class="ln" marker-end="url(#op1a)"/>
<rect x="340" y="170" width="170" height="60" rx="10" class="box dim"/>
<text x="425" y="196" text-anchor="middle" class="t">model-init</text>
<text x="425" y="214" text-anchor="middle" class="s m" style="font-size:11px">ollama pull (one-off)</text>
<line x1="460" y1="170" x2="460" y2="113" class="ln dash" marker-end="url(#op1a)"/>
<text x="345" y="264" text-anchor="middle" class="lbl">Only Caddy publishes ports (80/443). Everything else stays on the internal Docker network.</text>
</svg></div><figcaption><b>The production setup.</b> One door in, through Caddy; Ollama itself is only reachable by containers on the same private network.</figcaption></figure>

## 1. First decide: who actually needs to reach it?

The safest Ollama is one nobody else can reach. Choose the smallest option that works:

1. **Only apps on the same server:** put them on the same Docker network and publish **no ports at all**. No proxy is needed.
2. **People or apps inside your organisation:** keep it on the internal network or behind a VPN (or a private network such as Tailscale), *and* add the token proxy below.
3. **Apps on the internet:** only with TLS, a token, rate limiting and blocked admin endpoints, and ideally an IP allow list. Think hard before choosing this option.

A Linux trap to know about: **ports published by Docker bypass UFW firewall rules**, because Docker writes its own iptables rules. "The firewall blocks 11434" doesn't help if Compose publishes it. The reliable fix is not publishing the port.

## 2. The Docker Compose file

Create a folder with these files: `compose.yaml`, `Caddyfile` and `.env`.

```yaml
# compose.yaml
name: llm

services:
  ollama:
    image: ollama/ollama:${OLLAMA_VERSION}       # pinned, never "latest"
    container_name: ollama
    restart: unless-stopped
    volumes:
      - ollama-models:/root/.ollama
    environment:
      OLLAMA_KEEP_ALIVE: 24h          # keep the model loaded, so no slow first answer
      OLLAMA_CONTEXT_LENGTH: 8192     # default is 4096; more context = more memory
      OLLAMA_NUM_PARALLEL: 2          # requests served at once per model
      OLLAMA_MAX_LOADED_MODELS: 1     # don't let a second model push the first out of VRAM
      OLLAMA_MAX_QUEUE: 64            # beyond this, callers get 503 instead of waiting forever
      OLLAMA_FLASH_ATTENTION: 1
      OLLAMA_KV_CACHE_TYPE: q8_0      # roughly halves context memory, small quality cost
      OLLAMA_NO_CLOUD: 1              # local models only, nothing sent to Ollama's cloud
    # No "ports:" section. Ollama is only reachable on the internal network.
    networks: [llm]
    healthcheck:
      test: ["CMD", "ollama", "list"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 32g                 # stop a runaway model taking the whole host
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  model-init:
    image: ollama/ollama:${OLLAMA_VERSION}
    depends_on:
      ollama:
        condition: service_healthy
    environment:
      OLLAMA_HOST: http://ollama:11434
    entrypoint: ["/bin/sh", "-c", "ollama pull llama3.2 && ollama pull nomic-embed-text"]
    networks: [llm]
    restart: "no"

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      OLLAMA_API_TOKEN: ${OLLAMA_API_TOKEN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on: [ollama]
    networks: [llm]

  open-webui:                          # optional chat UI for people
    image: ghcr.io/open-webui/open-webui:${OPEN_WEBUI_VERSION}
    restart: unless-stopped
    environment:
      OLLAMA_BASE_URL: http://ollama:11434
      WEBUI_AUTH: "True"
    volumes:
      - open-webui:/app/backend/data
    depends_on: [ollama]
    networks: [llm]

networks:
  llm:

volumes:
  ollama-models:
  caddy-data:
  open-webui:
```

```bash
# .env: keep this file out of source control
OLLAMA_VERSION=<pinned version from github.com/ollama/ollama/releases>
OPEN_WEBUI_VERSION=<pinned version>
OLLAMA_API_TOKEN=<long random value, e.g. from: openssl rand -hex 32>
```

What each decision buys you:

- **No `ports` on `ollama`:** the API can't be reached from outside Docker at all.
- **A pinned version:** an update can't change behaviour, or break things, without you choosing it.
- **`model-init`:** the models your apps need are pulled automatically on a fresh server, so nobody needs to `docker exec` in.
- **A health check:** `docker compose ps` shows whether Ollama is actually answering, and dependent services wait for it.
- **A memory limit:** a model too big for the box fails on its own, instead of taking the server down with it.

No NVIDIA GPU? Remove the `reservations` block. For AMD GPUs, use the `ollama/ollama:<version>-rocm` image and pass `/dev/kfd` and `/dev/dri` as devices instead.

## 3. Caddy: TLS, a token, and blocked admin endpoints

[Caddy](https://caddyserver.com) gets and renews TLS certificates automatically. This config checks for the token and refuses the endpoints that change models:

```text
# Caddyfile
llm.example.com {
	route {
		# Model management stays on the server itself, never through the proxy
		@admin path /api/pull /api/push /api/delete /api/create /api/copy /api/blobs/*
		respond @admin "Forbidden" 403

		# Every other request needs the bearer token
		@unauthorised not header Authorization "Bearer {$OLLAMA_API_TOKEN}"
		respond @unauthorised "Unauthorised" 401

		reverse_proxy ollama:11434
	}
}

chat.example.com {
	reverse_proxy open-webui:8080
}
```

For an internal-only server, replace the public host name with an internal one and Caddy's `tls internal` option, or put your organisation's own certificate in place.

Start the stack and test it:

```bash
docker compose up -d
docker compose ps                     # ollama should show "healthy"

curl https://llm.example.com/api/version                                  # 401
curl -H "Authorization: Bearer $OLLAMA_API_TOKEN" https://llm.example.com/api/version   # works
curl -X DELETE -H "Authorization: Bearer $OLLAMA_API_TOKEN" https://llm.example.com/api/delete  # 403
```

A single shared token is a good start. When several apps or teams use the server, give each its own token, so you can revoke one without affecting the rest: one `@unauthorised` matcher per token, or an API gateway in front.

## 4. GPU setup (NVIDIA)

Install the **NVIDIA driver** on the host and the **NVIDIA Container Toolkit**, then let Docker use it:

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
docker run --rm --gpus all ubuntu nvidia-smi     # should list your GPU
```

After starting the stack, check the model is really on the GPU:

```bash
docker exec ollama ollama ps
# NAME              SIZE     PROCESSOR    UNTIL
# llama3.2:latest   3.6 GB   100% GPU     24 hours from now
```

If `PROCESSOR` shows a split such as `40%/60% CPU/GPU`, the model doesn't fit in video memory. Part of it is running on the CPU, which is much slower. Use a smaller model, a smaller quantisation, or less context.

## 5. Size it properly

Memory is the main constraint. A rough way to think about it:

> **memory needed ≈ model size + (context length × parallel requests × per-token cost) + overhead**

- **Model size:** roughly the download size. Default tags are usually 4-bit quantised, which is a good balance. 8-bit versions give slightly better quality for about double the memory.
- **Context length:** how much text a single request can hold. Doubling `OLLAMA_CONTEXT_LENGTH` roughly doubles that part of the memory.
- **`OLLAMA_NUM_PARALLEL`** multiplies the context memory, because each parallel slot gets its own.
- **`OLLAMA_KV_CACHE_TYPE=q8_0`** roughly halves the context memory. It needs flash attention, which the Compose file turns on.

Aim to fit the whole model, plus its context, in **GPU memory**, with some headroom. Then load-test with your real prompts and watch `ollama ps` and `nvidia-smi`.

## 6. Pin your prompts and settings with a Modelfile

If several apps share one assistant, define it once as a custom model, with its system prompt and settings under version control:

```text
# Modelfile
FROM llama3.2
PARAMETER temperature 0.2
PARAMETER num_ctx 8192
SYSTEM "You are a concise assistant for an internal software development team. If you don't know, say so."
```

```bash
docker cp Modelfile ollama:/tmp/Modelfile
docker exec ollama ollama create team-assistant -f /tmp/Modelfile
```

Apps then ask for `team-assistant`, and you change its behaviour in one place. Add the `create` step to `model-init`, so a rebuilt server gets it automatically.

## 7. Use it from C#

The same `IChatClient` code from part 1, now with the token, a longer timeout (long answers can take more than `HttpClient`'s default 100 seconds), plus logging and OpenTelemetry tracing from Microsoft.Extensions.AI:

```csharp
using Microsoft.Extensions.AI;
using OllamaSharp;

var http = new HttpClient
{
    BaseAddress = new Uri(builder.Configuration["Ollama:BaseUrl"]!),   // https://llm.example.com/
    Timeout = TimeSpan.FromMinutes(5)
};
http.DefaultRequestHeaders.Authorization =
    new("Bearer", builder.Configuration["Ollama:ApiToken"]);           // from user-secrets or Key Vault

builder.Services.AddChatClient(new OllamaApiClient(http, "team-assistant"))
    .UseLogging()
    .UseOpenTelemetry();
```

Keep the token in user-secrets locally and in Key Vault (or your pipeline's secret store) everywhere else, never in `appsettings.json`.

## 8. Keep it running

**Updates.** Read the release notes, change `OLLAMA_VERSION` in `.env`, then:

```bash
docker compose pull
docker compose up -d
docker compose ps        # healthy again?
```

Test on a non-production server first if apps depend on it. To roll back, put the old tag back and run the same commands. Update regularly: Ollama has had security fixes, and an old version is a risk if anything can reach it.

**Backups.** Models can be downloaded again, so you don't need to back them up. Back up what you can't recreate:

- `compose.yaml`, `Caddyfile` and Modelfiles: keep them in git
- `.env` secrets: keep them in your secret store
- the `open-webui` volume, if people use it: it holds their accounts and chat history

**Monitoring.**

- `docker compose ps` and the health check: alert if `ollama` is unhealthy or restarting
- `docker logs ollama`: load errors and out-of-memory messages
- `GET /api/ps` (from inside the network): which models are loaded and where
- `nvidia-smi`, or NVIDIA's DCGM exporter for Prometheus: GPU memory, use and temperature
- your app's own traces (OpenTelemetry, as above): response times and errors as users see them

**Rate limiting.** One heavy user can saturate a GPU. `OLLAMA_MAX_QUEUE` stops an unlimited backlog, but per-client rate limits in the proxy, or ASP.NET Core rate limiting in an app layer in front, keep things fair.

## 9. Privacy and data

- Prompts and answers stay on your server, which is often the reason for self-hosting. Make sure your **logs** don't quietly copy them somewhere else.
- `OLLAMA_NO_CLOUD=1` stops cloud models and features being used by accident, so nothing is sent off the server.
- The server only needs internet access to **download models**. In a locked-down network, allow only Ollama's model registry, or pull models on another machine and copy the volume across.
- Check the **licence** of each model before using it in a product. They differ.

## Checklist

- [ ] Ollama has **no published port**; only the proxy does, and only if it's needed.
- [ ] Access goes through **TLS and a token** (or a VPN), with admin endpoints blocked.
- [ ] Image versions are **pinned**, and updates are deliberate and tested.
- [ ] Models are **pre-pulled** by `model-init`, and custom models come from Modelfiles in git.
- [ ] A **health check**, restart policy and memory limit are set.
- [ ] The GPU is confirmed with `ollama ps` showing **100% GPU**.
- [ ] Context length, parallel requests and loaded models are **sized** for your memory, then load-tested.
- [ ] Secrets are in a **secret store**; config is in **git**; Open WebUI data is **backed up**.
- [ ] Health, logs, GPU and response times are **monitored**.
- [ ] Model **licences** are checked for your use.

## Sources

- [Ollama Docker documentation](https://docs.ollama.com/docker) — images, GPU flags, volumes
- [Ollama FAQ](https://docs.ollama.com/faq) — environment variables and their defaults, proxies, context length
- [Detecting exposed LLM servers: a Shodan case study on Ollama](https://blogs.cisco.com/security/detecting-exposed-llm-servers-shodan-case-study-on-ollama) — Cisco
- [175,000 Ollama servers are exposed to the internet](https://www.twingate.com/blog/ollama-server-exposure) — Twingate
- [Understanding and securing exposed Ollama instances](https://upguard.com/blog/understanding-and-securing-exposed-ollama-instances) — UpGuard
- [Packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/) — Docker docs (published ports and UFW)
- [Installing the NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) — NVIDIA
- [Caddyfile request matchers](https://caddyserver.com/docs/caddyfile/matchers) — Caddy docs
- [Open WebUI documentation](https://docs.openwebui.com)
- [Microsoft.Extensions.AI](https://learn.microsoft.com/dotnet/ai/microsoft-extensions-ai) — Microsoft Learn
