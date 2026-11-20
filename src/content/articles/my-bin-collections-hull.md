---
title: "Which bin goes out this week? A live Hull bin collection checker"
description: A small side project that shows my next Hull City Council bin collection on this site — which bins, which day — refreshed every morning by GitHub Actions, without putting my address on the internet.
pubDate: 2026-11-20T22:15:00Z
tags: [JavaScript, GitHub Actions, Astro, Side project, Hull]
ai: "Made with AI: this page, its fetch script, the GitHub Actions change and the diagram were produced with Claude, an AI assistant, which also found the council's data endpoint. The fetch script was tested against a copy of a real response, not from GitHub's servers yet."
---

<div class="bins" id="bins" aria-live="polite">
<p class="bins-loading">Loading the next collection…</p>
</div>

<style>
.bins { margin: 1.5rem 0 2rem; }
.bins-next { border: 1px solid var(--border); border-radius: var(--radius, 12px); background: var(--surface); padding: 1.25rem 1.4rem; }
.bins-eyebrow { margin: 0; font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
.bins-when { margin: .35rem 0 0; font-size: 1.6rem; font-weight: 700; line-height: 1.25; color: var(--text); }
.bins-rel { margin: .2rem 0 0; color: var(--muted); }
.bins-chips { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1rem; padding: 0; list-style: none; }
.bins-chips li { margin: 0; display: inline-flex; align-items: center; gap: .55rem; padding: .45rem .8rem .45rem .5rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); font-weight: 600; }
.bins-dot { width: 1.6rem; height: 1.6rem; border-radius: 6px 6px 8px 8px; flex: none; box-shadow: inset 0 -5px 0 rgba(0,0,0,.25); }
.bins-chip-sub { font-weight: 400; color: var(--muted); font-size: .85rem; }
.bins-black .bins-dot { background: #2b2f36; outline: 1px solid #6b7280; }
.bins-blue .bins-dot { background: #2563eb; }
.bins-brown .bins-dot { background: #8b5a2b; }
.bins-other .bins-dot { background: #16a34a; }
.bins-upcoming { margin: 1.25rem 0 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
.bins-upcoming li { margin: 0; display: flex; justify-content: space-between; gap: 1rem; padding: .6rem .1rem; border-bottom: 1px solid var(--border); }
.bins-upcoming .bins-date { color: var(--muted); font-variant-numeric: tabular-nums; }
.bins-mini { display: inline-flex; gap: .35rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.bins-mini span { display: inline-flex; align-items: center; gap: .3rem; font-size: .9rem; }
.bins-mini .bins-dot { width: .8rem; height: .8rem; border-radius: 3px; box-shadow: none; }
.bins-foot { margin: .75rem 0 0; font-size: .8rem; color: var(--faint, var(--muted)); }
.bins-msg { border: 1px dashed var(--border); border-radius: var(--radius, 12px); padding: 1rem 1.2rem; color: var(--muted); }
</style>

<script>
(() => {
  const root = document.getElementById('bins');
  if (!root) return;
  const INFO = {
    'black bin': { cls: 'bins-black', label: 'Black bin', sub: 'general waste' },
    'blue bin': { cls: 'bins-blue', label: 'Blue bin', sub: 'recycling' },
    'brown bin': { cls: 'bins-brown', label: 'Brown bin', sub: 'garden & food' },
  };
  const info = (name) => INFO[name.toLowerCase()] ?? { cls: 'bins-other', label: name, sub: '' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Today's date in the UK, as YYYY-MM-DD
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const asDate = (iso) => new Date(iso + 'T12:00:00Z');
  const pretty = (iso, opts) => asDate(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
  const daysUntil = (iso) => Math.round((asDate(iso) - asDate(today)) / 86400000);
  const relative = (n) => (n === 0 ? 'Today: put them out now if you haven’t!' : n === 1 ? 'Tomorrow: put them out tonight' : `In ${n} days`);
  const message = (html) => { root.innerHTML = `<div class="bins-msg">${html}</div>`; };
  const councilLink = '<a href="https://www.hull.gov.uk/bins-and-recycling/bin-collections/bin-collection-day-checker">Hull City Council’s bin checker</a>';

  fetch('/Portfolio/data/bins.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((data) => {
      const upcoming = (data.collections || []).filter((c) => c.date >= today);
      if (upcoming.length === 0) {
        message(data.error === 'not-configured'
          ? 'The checker isn’t set up yet. Check back soon, or use ' + councilLink + '.'
          : 'Collection dates aren’t available right now. Try ' + councilLink + '.');
        return;
      }
      const [next, ...later] = upcoming;
      const chips = next.bins.map((b) => {
        const i = info(b);
        return `<li class="${i.cls}"><span class="bins-dot" aria-hidden="true"></span>${esc(i.label)}${i.sub ? ` <span class="bins-chip-sub">${esc(i.sub)}</span>` : ''}</li>`;
      }).join('');
      const rows = later.slice(0, 6).map((c) => {
        const minis = c.bins.map((b) => { const i = info(b); return `<span class="${i.cls}"><span class="bins-dot" aria-hidden="true"></span>${esc(i.label)}</span>`; }).join('');
        return `<li><span class="bins-date">${esc(pretty(c.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span><span class="bins-mini">${minis}</span></li>`;
      }).join('');
      const updated = data.updated ? new Date(data.updated).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      root.innerHTML = `
        <div class="bins-next">
          <p class="bins-eyebrow">Next collection</p>
          <p class="bins-when">${esc(pretty(next.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <p class="bins-rel">${esc(relative(daysUntil(next.date)))}</p>
          <ul class="bins-chips">${chips}</ul>
          ${rows ? `<ul class="bins-upcoming" aria-label="Upcoming collections">${rows}</ul>` : ''}
          <p class="bins-foot">From Hull City Council${updated ? `, checked ${esc(updated)}` : ''}. Dates can change around bank holidays.</p>
        </div>`;
    })
    .catch(() => message('Couldn’t load collection dates. Try ' + councilLink + '.'));
})();
</script>

Every week the same question: **which bin goes out?** Hull City Council has an online checker, but it means typing a postcode and picking an address every time. So this page answers it at a glance: the next collection, which bins, and the few after that.

## How it works

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 200" role="img" aria-label="How the bin checker works. Every morning a scheduled GitHub Actions run calls Hull City Council's bin collection endpoint, using a property ID stored as a GitHub secret. It saves only the collection dates and bin types to a bins.json file, which is published with the site. When someone opens this page, it reads bins.json and works out the next collection from today's date.">
<defs><marker id="bn1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="bn1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="40" width="150" height="80" rx="10" class="box"/>
<text x="85" y="68" text-anchor="middle" class="t">Hull City</text>
<text x="85" y="86" text-anchor="middle" class="t">Council</text>
<text x="85" y="106" text-anchor="middle" class="s m" style="font-size:11px">bin-collection JSON</text>
<line x1="192" y1="80" x2="163" y2="80" class="ln" marker-end="url(#bn1a)"/>
<rect x="195" y="40" width="150" height="80" rx="10" class="box hi"/>
<text x="270" y="66" text-anchor="middle" class="t">GitHub Actions</text>
<text x="270" y="86" text-anchor="middle" class="s" style="font-size:12px">every morning</text>
<text x="270" y="104" text-anchor="middle" class="s acc" style="font-size:12px">ID from a secret</text>
<line x1="345" y1="80" x2="377" y2="80" class="ln hi" marker-end="url(#bn1h)"/>
<rect x="380" y="40" width="140" height="80" rx="10" class="box"/>
<text x="450" y="68" text-anchor="middle" class="t">bins.json</text>
<text x="450" y="88" text-anchor="middle" class="s" style="font-size:12px">dates + bin types</text>
<text x="450" y="104" text-anchor="middle" class="s" style="font-size:12px">no address</text>
<line x1="520" y1="80" x2="552" y2="80" class="ln" marker-end="url(#bn1a)"/>
<rect x="555" y="40" width="125" height="80" rx="10" class="box"/>
<text x="617" y="68" text-anchor="middle" class="t">This page</text>
<text x="617" y="88" text-anchor="middle" class="s" style="font-size:12px">picks the next</text>
<text x="617" y="104" text-anchor="middle" class="s" style="font-size:12px">date for today</text>
<text x="345" y="170" text-anchor="middle" class="lbl">The council's site can't be called from other websites, so the data is fetched at build time</text>
</svg></div><figcaption><b>Fetch at build time, decide in the browser.</b> The site is rebuilt every morning with fresh dates; the page itself works out which collection is next.</figcaption></figure>

**1. Finding the data.** Hull City Council doesn't publish an official API, but its bin checker page loads its data from two JSON endpoints: one that lists the properties at a postcode, and one that returns about three months of upcoming collections for a property's **UPRN** (Unique Property Reference Number, a national ID for every address). The open-source [UK Bin Collection Data](https://github.com/robbrad/UKBinCollectionData) project uses the same endpoint.

**2. Why not call it straight from this page?** The council's site doesn't send CORS headers, so browsers block other websites from reading its responses. This site is static (Astro on GitHub Pages), with no server of its own to sit in between.

**3. Fetching at build time instead.** A small Node script runs in the site's GitHub Actions build. It calls the council endpoint, groups the results by date, and writes a `bins.json` file containing **only dates and bin types**. A schedule rebuilds the site every morning, so the data is never more than a day old.

**4. Deciding in the browser.** The page loads `bins.json` and works out the next collection from today's date in the UK, so it stays correct even between rebuilds. If the data is missing, it says so and links to the council's own checker.

## Keeping the address private

This site and its code are public, so the address isn't in either. The property's UPRN is stored as a **GitHub Actions secret**: the build can use it, but it never appears in the code, the logs or the published `bins.json`.

## Limitations

- **It's unofficial.** The endpoint is what the council's own page uses, not a published API, so it could change without warning. If it does, the page falls back to a link to the council's checker.
- **Bank holidays.** Collection days move around Christmas and New Year, and the council announces the changes separately. Always double-check then.
- **Scheduled runs pause on quiet repos.** GitHub disables scheduled workflows in public repos after 60 days without activity. Any push re-enables them.

## Sources

- [Check your bin collection day](https://www.hull.gov.uk/bins-and-recycling/bin-collections/bin-collection-day-checker) — Hull City Council
- [UK Bin Collection Data](https://github.com/robbrad/UKBinCollectionData) — open-source project collecting bin data from UK councils, including Hull
- [Events that trigger workflows: schedule](https://docs.github.com/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule) — GitHub Docs
- [Using secrets in GitHub Actions](https://docs.github.com/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) — GitHub Docs
