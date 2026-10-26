---
title: "Dev, Test, UAT, PreProd, Prod: a practical guide to enterprise environments, on-premises and in Azure UK"
description: What each environment is for, the principles that keep them trustworthy, and a rough reference infrastructure for internal web and app servers alongside Azure UK South and UK West, covering promotion, isolation, data, identity, DR and cost.
pubDate: 2026-10-26T22:00:00Z
tags: [Architecture, Azure, DevOps, Infrastructure, Environments]
ai: "Made with AI: this guide and its diagrams were produced with Claude, an AI assistant. It's general guidance, not a design for a specific organisation."
---

Most enterprises end up with five environments: **Dev, Test, UAT, PreProd and Prod**. The names are easy. Getting real value from them is harder: environments drift apart, test data gets copied from production without being masked, a hotfix goes straight to Prod "just this once", and PreProd turns out to be nothing like the real thing on the night it matters.

This guide covers what each environment is for, the principles that keep them honest, and a rough reference infrastructure for a hybrid estate: internal web and app servers on-premises, plus **Azure UK South** and **UK West**.

## What each environment is for

<div class="table-wrap">

| | Dev | Test | UAT | PreProd | Prod |
|---|---|---|---|---|---|
| **Purpose** | Integrate and try changes | System and integration testing | Business acceptance | Final rehearsal, prod-like | Customers |
| **Used by** | Developers | QA / testers | Business users, product owners | Release, ops, performance testing | Everyone |
| **Deploys** | Every merge, automatically | Automatically or on demand | Release candidates | The exact release going to Prod | Approved releases only |
| **Data** | Synthetic | Synthetic | Masked, realistic | Masked, prod-scale | Real |
| **Stability** | Can break | Mostly stable | Stable during a test cycle | Stable | Highly available |
| **Scale** | Minimal | Minimal | Small | Same topology as Prod | Full, resilient |
| **Change control** | None | Light | Agreed test windows | Same as Prod | CAB / approvals |

</div>

The two environments people most often get wrong are the last two before Prod:

- **UAT is about the *business* saying yes.** It needs realistic data and stability for the length of a test cycle. It doesn't need production scale.
- **PreProd is about *operations* saying yes.** It should look like Prod in every way that affects a release: the same topology, networking, firewall rules, identity, deployment process and configuration shape, at a scale that's representative. If a release can behave differently in Prod than it did in PreProd, PreProd isn't doing its job.

## Principles that keep environments trustworthy

### 1. Build once, deploy many

Build an artifact **once**, from a commit on the main branch, and promote that *same* artifact through every environment. Never rebuild for Prod: a rebuild can pick up a different dependency, compiler or base image, and then what you tested isn't what you're shipping.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 205" role="img" aria-label="Promotion. A CI build from the main branch produces one versioned artifact. The same artifact is promoted unchanged through Dev on every merge with synthetic data, Test for QA with synthetic data, UAT for business users with masked data, PreProd as a prod-like rehearsal, and Prod for customers after approvals and CAB. Only configuration, held in app settings and Key Vault, differs per environment.">
<defs><marker id="n1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="n1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="14" width="150" height="46" rx="10" class="box"/>
<text x="85" y="34" text-anchor="middle" class="t">CI build</text>
<text x="85" y="51" text-anchor="middle" class="s">main branch</text>
<line x1="160" y1="37" x2="186" y2="37" class="ln hi" marker-end="url(#n1h)"/>
<rect x="190" y="14" width="200" height="46" rx="10" class="box hi"/>
<text x="290" y="34" text-anchor="middle" class="t">One artifact</text>
<text x="290" y="51" text-anchor="middle" class="s m">orders-api 1.4.2</text>
<rect x="420" y="14" width="260" height="46" rx="10" class="box dim"/>
<text x="550" y="34" text-anchor="middle" class="t">Config per environment</text>
<text x="550" y="51" text-anchor="middle" class="s">app settings · Key Vault</text>
<line x1="290" y1="60" x2="290" y2="82" class="ln hi"/>
<line x1="69" y1="84" x2="613" y2="84" class="ln dash" style="stroke:var(--accent)"/>
<text x="470" y="78" class="lbl">promoted unchanged</text>
<rect x="10" y="100" width="118" height="50" rx="10" class="box"/>
<text x="69" y="130" text-anchor="middle" class="t">Dev</text>
<rect x="146" y="100" width="118" height="50" rx="10" class="box"/>
<text x="205" y="130" text-anchor="middle" class="t">Test</text>
<rect x="282" y="100" width="118" height="50" rx="10" class="box"/>
<text x="341" y="130" text-anchor="middle" class="t">UAT</text>
<rect x="418" y="100" width="118" height="50" rx="10" class="box"/>
<text x="477" y="130" text-anchor="middle" class="t">PreProd</text>
<rect x="554" y="100" width="126" height="50" rx="10" class="box hi"/>
<text x="617" y="130" text-anchor="middle" class="t">Prod</text>
<line x1="128" y1="125" x2="142" y2="125" class="ln hi" marker-end="url(#n1h)"/>
<line x1="264" y1="125" x2="278" y2="125" class="ln hi" marker-end="url(#n1h)"/>
<line x1="400" y1="125" x2="414" y2="125" class="ln hi" marker-end="url(#n1h)"/>
<line x1="536" y1="125" x2="550" y2="125" class="ln hi" marker-end="url(#n1h)"/>
<g class="lbl" text-anchor="middle">
<text x="69" y="172">every merge</text><text x="69" y="188">synthetic data</text>
<text x="205" y="172">QA sign-off</text><text x="205" y="188">synthetic data</text>
<text x="341" y="172">business sign-off</text><text x="341" y="188">masked data</text>
<text x="477" y="172">ops rehearsal</text><text x="477" y="188">prod-like</text>
<text x="617" y="172">approvals + CAB</text><text x="617" y="188">real data</text>
</g>
</svg></div><figcaption><b>The artifact never changes; only configuration does.</b> Each step to the right needs more confidence and more approval, but the thing being deployed is identical.</figcaption></figure>

### 2. Configuration lives outside the build

Everything that differs between environments, such as connection strings, URLs, feature flags and scale settings, comes from configuration: app settings, environment variables, Azure App Configuration and **Key Vault for secrets**. The code never contains `if (environment == "Prod")`. Keep the *shape* of configuration identical everywhere and only the values different, so a missing setting fails in Dev rather than in Prod.

### 3. Everything is code, including the infrastructure

Define servers, networks, firewall rules and Azure resources in **infrastructure as code**: Bicep or Terraform for Azure, and Ansible, PowerShell DSC or your configuration management tool on-premises. Each environment is the same template with different parameters. That's what makes "PreProd matches Prod" true and checkable, rather than a hope. Manual changes in any environment above Dev should be treated as defects.

### 4. Environments are isolated

An environment should never be able to affect another:

- **Network:** separate VNets or VLANs per environment, with firewall rules that block traffic between them. Dev should not be able to reach a Prod database, even by accident.
- **Identity:** separate service accounts and managed identities per environment. A Test credential leaking must not unlock Prod.
- **Data:** separate databases, storage accounts and queues. No shared "reference" database that Prod also writes to.

### 5. Production data stays in production

Real customer data in lower environments is a data-protection problem, and in regulated sectors such as financial services and debt collection, a serious one. Use **synthetic data** in Dev and Test, and **masked or anonymised** copies of production for UAT and PreProd, refreshed by an automated, audited process. Developers should never need access to Prod data to do their job.

### 6. Prod is changed by pipelines, not people

All deployments go through the same automated pipeline. Use pipeline **environments** with approvals (Azure DevOps Environments or GitHub Environments) so Prod deployments need sign-off, and grant people only **just-in-time** access to Prod for support, through Privileged Identity Management. Hotfixes go through the same pipeline, just faster.

## On-premises: internal web and app servers

For internal servers, the classic three-tier layout still works well. Every environment has the **same tiers and the same firewall rules**; what changes is how many servers sit in each tier.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 205" role="img" aria-label="Production on-premises layout. Users reach a load balancer in the DMZ web tier, which spreads traffic across two web servers running IIS or a reverse proxy. A firewall separates the DMZ from the internal app tier, where two app servers run APIs, services and workers. Another firewall separates them from the data tier, where SQL Server runs as an Always On availability group with a primary and a secondary.">
<defs><marker id="n2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="n2h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="36" width="80" height="42" rx="10" class="box"/>
<text x="50" y="62" text-anchor="middle" class="t">Users</text>
<line x1="90" y1="57" x2="121" y2="57" class="ln hi" marker-end="url(#n2h)"/>
<rect x="110" y="10" width="170" height="160" rx="12" class="box dim"/>
<text x="195" y="28" text-anchor="middle" class="lbl">DMZ · web tier</text>
<rect x="125" y="40" width="140" height="34" rx="8" class="box hi"/>
<text x="195" y="62" text-anchor="middle" class="s" style="fill:var(--text)">Load balancer</text>
<rect x="125" y="88" width="65" height="44" rx="8" class="box"/>
<text x="157" y="115" text-anchor="middle" class="s" style="fill:var(--text)">Web 1</text>
<rect x="200" y="88" width="65" height="44" rx="8" class="box"/>
<text x="232" y="115" text-anchor="middle" class="s" style="fill:var(--text)">Web 2</text>
<line x1="180" y1="74" x2="160" y2="86" class="ln"/>
<line x1="210" y1="74" x2="230" y2="86" class="ln"/>
<text x="195" y="154" text-anchor="middle" class="lbl">IIS / reverse proxy</text>
<line x1="295" y1="10" x2="295" y2="170" class="ln dash" style="stroke:var(--accent)"/>
<rect x="310" y="10" width="170" height="160" rx="12" class="box dim"/>
<text x="395" y="28" text-anchor="middle" class="lbl">internal · app tier</text>
<rect x="325" y="60" width="65" height="44" rx="8" class="box"/>
<text x="357" y="87" text-anchor="middle" class="s" style="fill:var(--text)">App 1</text>
<rect x="400" y="60" width="65" height="44" rx="8" class="box"/>
<text x="432" y="87" text-anchor="middle" class="s" style="fill:var(--text)">App 2</text>
<text x="395" y="134" text-anchor="middle" class="lbl">APIs · services · workers</text>
<line x1="265" y1="110" x2="321" y2="84" class="ln hi" marker-end="url(#n2h)"/>
<line x1="495" y1="10" x2="495" y2="170" class="ln dash" style="stroke:var(--accent)"/>
<rect x="510" y="10" width="170" height="160" rx="12" class="box dim"/>
<text x="595" y="28" text-anchor="middle" class="lbl">data tier</text>
<rect x="525" y="40" width="140" height="34" rx="8" class="box hi"/>
<text x="595" y="62" text-anchor="middle" class="s" style="fill:var(--text)">SQL primary</text>
<rect x="525" y="88" width="140" height="34" rx="8" class="box"/>
<text x="595" y="110" text-anchor="middle" class="s" style="fill:var(--text)">SQL secondary</text>
<line x1="595" y1="74" x2="595" y2="86" class="ln dash"/>
<text x="595" y="146" text-anchor="middle" class="lbl">Always On AG</text>
<line x1="465" y1="82" x2="521" y2="58" class="ln hi" marker-end="url(#n2h)"/>
<text x="295" y="190" text-anchor="middle" class="lbl">firewall</text>
<text x="495" y="190" text-anchor="middle" class="lbl">firewall</text>
</svg></div><figcaption><b>Production: at least two of everything, behind a load balancer.</b> Lower environments keep the same tiers and firewall rules with one server per tier, so a release that needs a new port or firewall rule is caught long before Prod.</figcaption></figure>

Practical points for the on-premises estate:

- **Separate the tiers.** Only the web tier is reachable from users; only the app tier can reach the database. Each boundary is a firewall rule you can test in every environment.
- **One service account per application per environment**, with only the rights it needs. Never run app pools as a domain admin or share accounts across environments.
- **Patch in rings.** OS and framework patches go to Dev and Test first, then UAT and PreProd, then Prod. The environments become an early-warning system for patches as well as releases.
- **Use a naming convention that shows the environment**, such as `WEB-PRD-01`, `APP-UAT-01` or `SQL-PPD-01`, so nobody runs a script on the wrong box.
- **Give PreProd the same load-balanced, clustered shape as Prod**, even if the servers are smaller. Failover, sticky sessions and cluster behaviour can't be tested on a single server.

## Azure: UK South and UK West

### The two regions

- **UK South (London)** has **three availability zones**: separate datacentres within the region with independent power, cooling and networking. It's the natural **primary** region.
- **UK West (Cardiff)** is UK South's **paired region**, but it has **no availability zones**. It's the natural **secondary** region for disaster recovery, and keeps data in the UK.

So the usual pattern is **high availability within UK South** (spread across zones) and **disaster recovery to UK West** (replicated, ready to take over if the whole of UK South is unavailable). UK South has reported capacity constraints during 2026, particularly for new zonal deployments, so confirm capacity with Microsoft before planning a large build there.

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 320" role="img" aria-label="Azure layout. On-premises data centres connect over ExpressRoute to a hub virtual network in each region. In UK South, the primary region with three availability zones, the hub holds Azure Firewall and the gateway. It connects to non-production spokes (Dev, Test, UAT, and PreProd mirroring prod, one subscription each) and to the production spoke, which is zone-redundant across three zones with App Service or AKS, an Azure SQL failover group, Key Vault and Application Insights. Production replicates asynchronously to UK West, the paired region with no zones, where a warm-standby production DR environment runs scaled down with a SQL geo-secondary, alongside a PreProd DR environment for drills.">
<defs><marker id="n3h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="170" y="4" width="350" height="34" rx="10" class="box"/>
<text x="345" y="26" text-anchor="middle" class="t">On-premises data centres · ExpressRoute</text>
<rect x="10" y="54" width="420" height="256" rx="14" class="box dim"/>
<rect x="450" y="54" width="230" height="256" rx="14" class="box dim"/>
<line x1="260" y1="38" x2="220" y2="70" class="ln dash"/>
<line x1="430" y1="38" x2="565" y2="70" class="ln dash"/>
<rect x="30" y="70" width="380" height="40" rx="8" class="box"/>
<text x="220" y="95" text-anchor="middle" class="s" style="fill:var(--text)">Hub VNet · Azure Firewall · gateway</text>
<rect x="470" y="70" width="190" height="40" rx="8" class="box"/>
<text x="565" y="95" text-anchor="middle" class="s" style="fill:var(--text)">Hub VNet · firewall</text>
<line x1="120" y1="110" x2="120" y2="126" class="ln"/>
<line x1="320" y1="110" x2="320" y2="126" class="ln"/>
<line x1="565" y1="110" x2="565" y2="126" class="ln"/>
<rect x="30" y="126" width="180" height="150" rx="10" class="box"/>
<text x="120" y="150" text-anchor="middle" class="t">Non-prod spokes</text>
<text x="120" y="174" text-anchor="middle" class="s">Dev · Test · UAT</text>
<text x="120" y="194" text-anchor="middle" class="s">PreProd mirrors Prod</text>
<text x="120" y="214" text-anchor="middle" class="s">a subscription each</text>
<text x="120" y="234" text-anchor="middle" class="s">auto-shutdown out of hours</text>
<rect x="230" y="126" width="180" height="150" rx="10" class="box hi"/>
<text x="320" y="150" text-anchor="middle" class="t">Prod spoke</text>
<text x="320" y="174" text-anchor="middle" class="s">zone-redundant (3 AZs)</text>
<text x="320" y="194" text-anchor="middle" class="s">App Service / AKS</text>
<text x="320" y="214" text-anchor="middle" class="s">Azure SQL failover group</text>
<text x="320" y="234" text-anchor="middle" class="s">Key Vault · App Insights</text>
<rect x="470" y="126" width="190" height="100" rx="10" class="box"/>
<text x="565" y="150" text-anchor="middle" class="t">Prod DR</text>
<text x="565" y="172" text-anchor="middle" class="s">warm standby</text>
<text x="565" y="192" text-anchor="middle" class="s">SQL geo-secondary</text>
<text x="565" y="212" text-anchor="middle" class="s">scaled down until needed</text>
<rect x="470" y="236" width="190" height="40" rx="10" class="box dim"/>
<text x="565" y="261" text-anchor="middle" class="s">PreProd DR, for drills</text>
<line x1="410" y1="176" x2="466" y2="176" class="ln hi dash" marker-end="url(#n3h)"/>
<text x="438" y="196" text-anchor="middle" class="lbl">async</text>
<text x="24" y="298" class="lbl">UK South (London) · primary · 3 availability zones</text>
<text x="464" y="298" class="lbl">UK West (Cardiff) · paired · no zones</text>
</svg></div><figcaption><b>High availability in UK South, disaster recovery in UK West.</b> Only Prod (and PreProd, so you can rehearse) needs a footprint in the secondary region. Hubs in both regions connect back to the data centres.</figcaption></figure>

### Subscriptions and management groups

Microsoft's Cloud Adoption Framework recommends **one subscription per application environment**. That gives each environment its own security boundary, access control, budget and quotas, and lets each deployment pipeline's identity be limited to one environment. A typical management group structure:

```text
Tenant root
└── Contoso
    ├── Platform
    │   ├── Identity          domain controllers, Entra Connect
    │   ├── Management        Log Analytics, automation, backup
    │   └── Connectivity      hub VNets, firewalls, ExpressRoute, DNS
    ├── Landing zones
    │   ├── Corp              internal apps: sub-orders-dev, -test, -uat, -preprod, -prod
    │   └── Online            internet-facing apps, same pattern
    ├── Sandbox               experiments, cut off from corporate network
    └── Decommissioned
```

One point surprises people: **Dev, Test, UAT, PreProd and Prod sit in the same management group** and get the **same Azure Policy**. Policies that only apply in Prod cause failed promotions, where something deploys cleanly in Dev and is blocked in Prod. Differences belong in parameters such as SKUs and instance counts, not in different rules. Only **Sandbox**, for experiments, gets a looser policy set, and it has no connection to the corporate network.

### Networking

- **Hub-and-spoke in each region.** The hub holds shared services: Azure Firewall, the ExpressRoute or VPN gateway back to on-premises, and DNS. Each environment's VNet is a spoke peered to the hub. Spokes can't talk to each other except through the firewall, which is how Dev is kept away from Prod.
- **Private endpoints for PaaS.** Azure SQL, Storage and Key Vault are reached over private IPs inside the VNet, with public network access turned off.
- **Plan IP ranges up front.** Give every environment and region its own non-overlapping range that also doesn't clash with on-premises. Fixing overlapping address space later is very painful.
- **One DNS story.** Use Azure Private DNS zones and a DNS resolver so on-premises servers and Azure resources can resolve each other's private names.

### Resilience by environment

<div class="table-wrap">

| | Dev / Test | UAT | PreProd | Prod |
|---|---|---|---|---|
| **Region** | UK South (or UK West) | UK South | UK South + UK West | UK South + UK West |
| **Zones** | Not needed | Not needed | Zone-redundant, like Prod | Zone-redundant |
| **DR** | None, rebuild from code | None | Same pattern as Prod, for drills | Warm standby in UK West |
| **Database** | Single, small | Single | Failover group | Azure SQL failover group (UK South → UK West) |
| **Backups** | Short retention | Short retention | As Prod | Long retention, geo-redundant |
| **Hours** | Office hours, auto-shutdown | During test cycles | Always on during releases | 24/7 |

</div>

For Prod, decide the **recovery time objective (RTO)** and **recovery point objective (RPO)** with the business *first*, then choose the pattern:

- **Backup and restore**, the cheapest: hours to recover, rebuilt from IaC and backups.
- **Warm standby**, shown above and the usual choice: a scaled-down copy running in UK West, databases geo-replicated, scaled up on failover. Minutes to an hour.
- **Active-active**: both regions serving traffic behind Azure Front Door. The fastest recovery, but the most cost and complexity, and harder for stateful systems.

In UK financial services, the FCA and PRA operational resilience rules also expect firms to set impact tolerances for important business services and test that they can stay within them, so regular, documented **DR drills** (in PreProd and in Prod) are part of the job, not an optional extra.

## Identity and access

- **Microsoft Entra ID for everyone**, synchronised with on-premises Active Directory, with MFA and Conditional Access.
- **No standing access to Prod.** Admins request time-limited elevation through **Privileged Identity Management**, with approval and an audit trail.
- **Managed identities for apps** wherever possible, instead of passwords or keys. One identity per app per environment.
- **Pipelines deploy with their own identity**, scoped to one environment's subscription, ideally using workload identity federation so there are no stored secrets.
- **Break-glass accounts** for emergencies, stored securely, monitored, and tested.

## Observability and cost

- **Monitoring:** Application Insights per app per environment, and Log Analytics workspaces, with Prod kept separate from non-prod. Only Prod alerts should page someone out of hours; non-prod alerts go to a team channel.
- **Tagging:** every resource gets `environment`, `application`, `owner` and `costCentre` tags, enforced by policy, so cost reports and clean-ups are possible.
- **Naming:** a consistent pattern that shows the environment and region, for example `rg-orders-prod-uks-001`, `app-orders-uat-uks`, `sql-orders-prod-ukw` (with `uks` for UK South and `ukw` for UK West).
- **Cost:** auto-shutdown or scale-to-zero for Dev and Test outside office hours, smaller SKUs below PreProd, reserved instances or savings plans for steady Prod workloads, and budgets with alerts on every subscription.

## A rough reference estate

<div class="table-wrap">

| Environment | On-premises | Azure |
|---|---|---|
| **Dev** | 1 web, 1 app, shared non-prod SQL instance | UK South, small App Service plan or dev AKS pool, basic SQL tier, auto-shutdown |
| **Test** | 1 web, 1 app, own database | UK South, same as Dev |
| **UAT** | 1 web, 1 app, own database with masked data | UK South, slightly larger, stable during test cycles |
| **PreProd** | 2 web, 2 app behind a load balancer, SQL Always On | UK South zone-redundant + UK West DR, Prod topology at reduced scale |
| **Prod** | 2+ web, 2+ app behind a load balancer, SQL Always On across two sites | UK South zone-redundant + UK West warm standby, SQL failover group, Front Door |

</div>

## Checklist

- [ ] Each environment has a clear purpose, owner and data policy
- [ ] One artifact is built once and promoted unchanged
- [ ] Configuration and secrets are external; Key Vault per environment
- [ ] All infrastructure is defined as code, with PreProd generated from the same templates as Prod
- [ ] Environments are isolated: network, identity and data
- [ ] No real customer data below Prod; masked refreshes are automated and audited
- [ ] Deployments only through pipelines, with approvals for Prod
- [ ] No standing admin access to Prod; PIM for elevation
- [ ] One Azure subscription per environment, same management group, same policies
- [ ] Hub-and-spoke networking, private endpoints, non-overlapping IP ranges
- [ ] Prod and PreProd are zone-redundant in UK South with DR to UK West
- [ ] RTO and RPO are agreed, and DR is tested on a schedule
- [ ] Tags, naming, budgets and out-of-hours shutdown are in place

## Further reading

- [Microsoft: Manage application environments in Azure landing zones](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-area/management-application-environments)
- [Microsoft: Management groups in the Azure landing zone](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-area/resource-org-management-groups)
- [Microsoft: What are Azure availability zones?](https://learn.microsoft.com/en-us/azure/reliability/availability-zones-overview)
