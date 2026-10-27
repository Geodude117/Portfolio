---
title: "Adding MudBlazor to a .NET 10 Blazor app: setup, layout, data grids, forms and theming"
description: A practical guide to MudBlazor in a .NET 10 Blazor Web App — installing it, getting render modes right so dialogs and menus actually work, building a layout, data grid, form, dialogs and snackbars, theming with dark mode, testing with bUnit, and the best practices that keep it maintainable.
pubDate: 2026-10-26T23:00:00Z
tags: [C#, .NET 10, Blazor, MudBlazor, UI]
guide: true
ai: "Made with AI: this guide, its sample code and diagram were produced with Claude, an AI assistant. The code targets MudBlazor 9 on .NET 10 but hasn't been compiled or run yet."
---

[MudBlazor](https://mudblazor.com) is one of the most popular component libraries for Blazor: Material Design components written in C#, with very little JavaScript. It gives you a professional-looking app with data grids, forms, dialogs, navigation and theming, without writing CSS from scratch, which makes it a strong fit for internal line-of-business apps.

This guide adds MudBlazor to a new **.NET 10 Blazor Web App** and builds the pieces most business apps need. It also covers the setup mistake that catches out almost everyone: render modes.

## How it fits together

<figure class="diagram"><div class="scroll"><svg viewBox="0 0 690 272" role="img" aria-label="Where MudBlazor plugs into a .NET 10 Blazor Web App. Program.cs calls AddMudServices, which registers services such as IDialogService and ISnackbar that pages inject. App.razor loads MudBlazor's CSS and JavaScript and sets an interactive render mode on Routes and HeadOutlet. MainLayout.razor contains the four providers, MudThemeProvider, MudPopoverProvider, MudDialogProvider and MudSnackbarProvider, plus the layout. Pages then use components such as MudDataGrid, MudForm, dialogs and snackbars.">
<defs><marker id="m1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah"/></marker><marker id="m1h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ah hi"/></marker></defs>
<rect x="10" y="20" width="200" height="64" rx="10" class="box"/>
<text x="110" y="44" text-anchor="middle" class="t">Program.cs</text>
<text x="110" y="64" text-anchor="middle" class="s m" style="font-size:11px">AddMudServices()</text>
<path d="M110 84 V240 H246" class="ln dash" marker-end="url(#m1a)"/>
<text x="118" y="168" class="lbl">IDialogService,</text>
<text x="118" y="184" class="lbl">ISnackbar… injected</text>
<rect x="250" y="20" width="430" height="64" rx="10" class="box hi"/>
<text x="465" y="42" text-anchor="middle" class="t">App.razor</text>
<text x="465" y="60" text-anchor="middle" class="s m" style="font-size:11px">MudBlazor.min.css · MudBlazor.min.js</text>
<text x="465" y="76" text-anchor="middle" class="s m acc" style="font-size:11px">&lt;Routes @rendermode="InteractiveServer" /&gt;</text>
<line x1="465" y1="84" x2="465" y2="106" class="ln hi" marker-end="url(#m1h)"/>
<rect x="250" y="110" width="430" height="88" rx="10" class="box"/>
<text x="465" y="132" text-anchor="middle" class="t">MainLayout.razor</text>
<rect x="262" y="146" width="98" height="26" rx="6" class="box hi"/>
<text x="311" y="163" text-anchor="middle" class="s m" style="fill:var(--text);font-size:10px">Theme</text>
<rect x="366" y="146" width="98" height="26" rx="6" class="box hi"/>
<text x="415" y="163" text-anchor="middle" class="s m" style="fill:var(--text);font-size:10px">Popover</text>
<rect x="470" y="146" width="98" height="26" rx="6" class="box hi"/>
<text x="519" y="163" text-anchor="middle" class="s m" style="fill:var(--text);font-size:10px">Dialog</text>
<rect x="574" y="146" width="98" height="26" rx="6" class="box hi"/>
<text x="623" y="163" text-anchor="middle" class="s m" style="fill:var(--text);font-size:10px">Snackbar</text>
<text x="465" y="190" text-anchor="middle" class="lbl">providers, once · then MudLayout, MudAppBar, MudDrawer</text>
<line x1="465" y1="198" x2="465" y2="220" class="ln hi" marker-end="url(#m1h)"/>
<rect x="250" y="224" width="430" height="40" rx="10" class="box"/>
<text x="465" y="249" text-anchor="middle" class="s" style="fill:var(--text)">Pages: MudDataGrid · MudForm · dialogs · snackbars</text>
</svg></div><figcaption><b>Four places to touch, once each.</b> Register services, load the assets, make the app interactive, and put the providers in the layout. Everything else is just using components.</figcaption></figure>

## Step 1: Create the app

```bash
dotnet new blazor -n Orders.Web --interactivity Server --all-interactive
cd Orders.Web
dotnet add package MudBlazor
```

`--all-interactive` matters. It makes the **whole app** interactive, rather than each page choosing its own render mode. More on why in [Render modes](#render-modes-the-thing-that-breaks-dialogs) below.

If you're starting from scratch, MudBlazor also publishes project templates (`dotnet new install MudBlazor.Templates`) that do all of the following for you. Doing it by hand once is worth it, though, so you know where everything lives.

## Step 2: Register the services

```csharp
// Program.cs
using MudBlazor;
using MudBlazor.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddMudServices(config =>
{
    config.SnackbarConfiguration.PositionClass = Defaults.Classes.Position.BottomRight;
    config.SnackbarConfiguration.VisibleStateDuration = 4000;
});
```

`AddMudServices` registers everything the components need, including `IDialogService` for dialogs and `ISnackbar` for toast notifications.

## Step 3: Imports, CSS and JavaScript

Add the namespace once so every component can use MudBlazor:

```razor
@* Components/_Imports.razor *@
@using MudBlazor
```

Then load the font, stylesheet and script in `App.razor`. The MudBlazor script goes **after** the Blazor script. This is a trimmed-down version; keep anything else your template's `App.razor` includes, such as `<ImportMap />` and the `@Assets[...]` links:

```razor
@* Components/App.razor *@
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="/" />
    <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap" rel="stylesheet" />
    <link href="_content/MudBlazor/MudBlazor.min.css" rel="stylesheet" />
    <HeadOutlet @rendermode="InteractiveServer" />
</head>
<body>
    <Routes @rendermode="InteractiveServer" />
    <script src="_framework/blazor.web.js"></script>
    <script src="_content/MudBlazor/MudBlazor.min.js"></script>
</body>
</html>
```

You can remove Bootstrap and the template's default CSS. Mixing two design systems leads to conflicting styles.

## Step 4: Providers and layout

MudBlazor needs four **providers** rendered once, high up in the app. They host the theme, popovers (used by menus, selects, date pickers and tooltips), dialogs and snackbars. The layout is the natural place for them:

```razor
@* Components/Layout/MainLayout.razor *@
@inherits LayoutComponentBase

<MudThemeProvider Theme="AppTheme.Theme" @bind-IsDarkMode="_darkMode" />
<MudPopoverProvider />
<MudDialogProvider />
<MudSnackbarProvider />

<MudLayout>
    <MudAppBar Elevation="1">
        <MudIconButton Icon="@Icons.Material.Filled.Menu" Color="Color.Inherit" Edge="Edge.Start"
                       OnClick="() => _drawerOpen = !_drawerOpen" AriaLabel="Toggle navigation" />
        <MudText Typo="Typo.h6" Class="ml-2">Orders</MudText>
        <MudSpacer />
        <MudIconButton Icon="@(_darkMode ? Icons.Material.Filled.LightMode : Icons.Material.Filled.DarkMode)"
                       Color="Color.Inherit" OnClick="() => _darkMode = !_darkMode" AriaLabel="Toggle dark mode" />
    </MudAppBar>

    <MudDrawer @bind-Open="_drawerOpen" ClipMode="DrawerClipMode.Always" Elevation="1">
        <MudNavMenu>
            <MudNavLink Href="/" Match="NavLinkMatch.All" Icon="@Icons.Material.Filled.Dashboard">Dashboard</MudNavLink>
            <MudNavLink Href="/orders" Icon="@Icons.Material.Filled.Receipt">Orders</MudNavLink>
        </MudNavMenu>
    </MudDrawer>

    <MudMainContent>
        <MudContainer MaxWidth="MaxWidth.Large" Class="pt-6 pb-10">
            @Body
        </MudContainer>
    </MudMainContent>
</MudLayout>

@code {
    private bool _drawerOpen = true;
    private bool _darkMode;
}
```

Put each provider in **exactly one place**. Two `MudPopoverProvider`s, for example one in `App.razor` and one in the layout, cause menus and dialogs to misbehave.

## Render modes: the thing that breaks dialogs

This is the most common MudBlazor problem in .NET 8 and later: **buttons do nothing, menus don't open, dialogs never appear, and there's no error.**

The cause is **static server-side rendering**. A Blazor Web App can render pages as plain, non-interactive HTML, and that's the default for any page without a render mode. MudBlazor **doesn't support static rendering**: its components need an interactive circuit for clicks, popovers and dialogs. If the layout (and therefore the providers) renders statically, the providers never become interactive, and nothing that depends on them works, even on an interactive page.

The fix is to make the **whole app interactive** by putting the render mode on `Routes` and `HeadOutlet` in `App.razor`, as above. That's exactly what `--all-interactive` sets up.

Which interactive mode to choose:

- **Interactive Server** (used here) runs components on the server over a SignalR connection. It's the simplest to build and deploy, keeps code and database access on the server, and is ideal for internal business apps on a reliable network.
- **Interactive WebAssembly** runs in the browser and needs an API for data access. It's better for public apps or offline-tolerant scenarios.
- **Interactive Auto** starts on the server and switches to WebAssembly once it has downloaded. It's the most flexible, but you have to write components that work in both places.

## Step 5: A data grid

`MudDataGrid` gives you sorting, filtering, paging and column templates with very little code:

```razor
@* Components/Pages/Orders.razor *@
@page "/orders"
@inject IOrderService OrderService
@inject IDialogService DialogService
@inject ISnackbar Snackbar

<PageTitle>Orders</PageTitle>

<MudText Typo="Typo.h4" Class="mb-4">Orders</MudText>

<MudDataGrid T="OrderDto" Items="_orders" Loading="_loading" Hover="true" Dense="true"
             Filterable="true" SortMode="SortMode.Multiple" QuickFilter="QuickFilter">
    <ToolBarContent>
        <MudTextField @bind-Value="_search" Placeholder="Search customer or order"
                      Adornment="Adornment.Start" AdornmentIcon="@Icons.Material.Filled.Search"
                      Immediate="true" Clearable="true" Class="mt-0" />
    </ToolBarContent>
    <Columns>
        <PropertyColumn Property="o => o.Reference" Title="Order" />
        <PropertyColumn Property="o => o.Customer" />
        <PropertyColumn Property="o => o.PlacedAt" Title="Placed" Format="dd MMM yyyy HH:mm" />
        <PropertyColumn Property="o => o.Total" Format="C" />
        <TemplateColumn Title="Status" Sortable="false">
            <CellTemplate>
                <MudChip T="string" Size="Size.Small" Color="StatusColour(context.Item.Status)">
                    @context.Item.Status
                </MudChip>
            </CellTemplate>
        </TemplateColumn>
        <TemplateColumn CellClass="d-flex justify-end" Sortable="false" Filterable="false">
            <CellTemplate>
                <MudIconButton Icon="@Icons.Material.Filled.Delete" Size="Size.Small" Color="Color.Error"
                               OnClick="() => DeleteAsync(context.Item)" AriaLabel="Delete order" />
            </CellTemplate>
        </TemplateColumn>
    </Columns>
    <PagerContent>
        <MudDataGridPager T="OrderDto" />
    </PagerContent>
</MudDataGrid>

@code {
    private List<OrderDto> _orders = [];
    private bool _loading = true;
    private string? _search;

    protected override async Task OnInitializedAsync()
    {
        _orders = await OrderService.GetRecentAsync();
        _loading = false;
    }

    private bool QuickFilter(OrderDto order) =>
        string.IsNullOrWhiteSpace(_search)
        || order.Reference.Contains(_search, StringComparison.OrdinalIgnoreCase)
        || order.Customer.Contains(_search, StringComparison.OrdinalIgnoreCase);

    private static Color StatusColour(OrderStatus status) => status switch
    {
        OrderStatus.Paid => Color.Success,
        OrderStatus.Overdue => Color.Error,
        _ => Color.Default,
    };
}
```

This loads everything into memory, which is fine for hundreds of rows. For thousands or more, use the grid's **`ServerData`** parameter instead of `Items`. The grid then calls your method with the current page, sort and filters, so the database does the work and only one page of rows is ever loaded.

## Step 6: Dialogs and snackbars

A reusable confirmation dialog is a small component of its own:

```razor
@* Components/Shared/ConfirmDialog.razor *@
<MudDialog>
    <DialogContent>
        <MudText>@Message</MudText>
    </DialogContent>
    <DialogActions>
        <MudButton OnClick="() => MudDialog.Cancel()">Cancel</MudButton>
        <MudButton Color="Color.Error" Variant="Variant.Filled"
                   OnClick="() => MudDialog.Close(DialogResult.Ok(true))">@ConfirmText</MudButton>
    </DialogActions>
</MudDialog>

@code {
    [CascadingParameter] private IMudDialogInstance MudDialog { get; set; } = default!;
    [Parameter] public string Message { get; set; } = "";
    [Parameter] public string ConfirmText { get; set; } = "Confirm";
}
```

Show it from any page with `IDialogService`, wait for the result, then confirm with a snackbar:

```csharp
private async Task DeleteAsync(OrderDto order)
{
    var parameters = new DialogParameters<ConfirmDialog>
    {
        { d => d.Message, $"Delete order {order.Reference}? This can't be undone." },
        { d => d.ConfirmText, "Delete" },
    };

    var dialog = await DialogService.ShowAsync<ConfirmDialog>("Delete order", parameters,
        new DialogOptions { MaxWidth = MaxWidth.ExtraSmall, FullWidth = true, CloseOnEscapeKey = true });

    var result = await dialog.Result;
    if (result is null || result.Canceled)
        return;

    await OrderService.DeleteAsync(order.Id);
    _orders.Remove(order);
    Snackbar.Add($"Order {order.Reference} deleted", Severity.Success);
}
```

The typed `DialogParameters<ConfirmDialog>` means a renamed parameter is a compile error rather than a silent bug.

## Step 7: A validated form

MudBlazor's inputs work with Blazor's standard `EditForm` and data annotations, so validation rules stay on the model:

```razor
@* Components/Pages/NewOrder.razor *@
@page "/orders/new"
@inject IOrderService OrderService
@inject ISnackbar Snackbar
@inject NavigationManager Navigation

<MudText Typo="Typo.h4" Class="mb-4">New order</MudText>

<EditForm Model="_model" OnValidSubmit="SaveAsync">
    <DataAnnotationsValidator />
    <MudCard>
        <MudCardContent>
            <MudTextField @bind-Value="_model.Customer" For="() => _model.Customer" Label="Customer" />
            <MudTextField @bind-Value="_model.Email" For="() => _model.Email" Label="Email" InputType="InputType.Email" />
            <MudNumericField @bind-Value="_model.Total" For="() => _model.Total" Label="Total" Format="N2"
                             Adornment="Adornment.Start" AdornmentText="£" />
            <MudDatePicker @bind-Date="_model.DueDate" Label="Due date" />
        </MudCardContent>
        <MudCardActions>
            <MudButton ButtonType="ButtonType.Submit" Variant="Variant.Filled" Color="Color.Primary"
                       Disabled="_saving" Class="ml-auto">
                @(_saving ? "Saving…" : "Save")
            </MudButton>
        </MudCardActions>
    </MudCard>
</EditForm>

@code {
    private readonly NewOrderModel _model = new();
    private bool _saving;

    private async Task SaveAsync()
    {
        _saving = true;
        try
        {
            await OrderService.CreateAsync(_model);
            Snackbar.Add("Order saved", Severity.Success);
            Navigation.NavigateTo("/orders");
        }
        finally
        {
            _saving = false;
        }
    }
}
```

```csharp
public sealed class NewOrderModel
{
    [Required, StringLength(100)] public string Customer { get; set; } = "";
    [Required, EmailAddress] public string Email { get; set; } = "";
    [Range(0.01, 1_000_000)] public decimal Total { get; set; }
    public DateTime? DueDate { get; set; }
}
```

The `For` parameter links each input to its property, so validation messages appear under the right field. Disabling the button while saving stops double submissions.

## Step 8: Your own theme, with dark mode

Define the theme once, in one class, rather than scattering colours through components:

```csharp
// Theme/AppTheme.cs
using MudBlazor;

public static class AppTheme
{
    public static readonly MudTheme Theme = new()
    {
        PaletteLight = new PaletteLight
        {
            Primary = "#2c6cb0",
            Secondary = "#5d6a7c",
            AppbarBackground = "#1c2531",
            Background = "#f4f6f9",
        },
        PaletteDark = new PaletteDark
        {
            Primary = "#6fa8e8",
            Secondary = "#97a3b4",
            AppbarBackground = "#151c25",
            Background = "#0e131a",
            Surface = "#151c25",
        },
        LayoutProperties = new LayoutProperties
        {
            DefaultBorderRadius = "8px",
        },
    };
}
```

`MudThemeProvider` takes the theme and an `IsDarkMode` flag, and every component follows it. The layout above binds that flag to a toggle in the app bar. To remember the user's choice, save it to local storage or their profile.

## Step 9: Test components with bUnit

[bUnit](https://bunit.dev) renders components in a unit test. MudBlazor components need their services and providers, and use a little JavaScript, so set those up in a base class:

```csharp
public abstract class MudTestContext : BunitContext
{
    protected MudTestContext()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;   // MudBlazor's JS calls succeed silently
        Services.AddMudServices();
        Services.AddSingleton<IOrderService, FakeOrderService>();
    }
}

public class OrdersPageTests : MudTestContext
{
    [Fact]
    public void Shows_one_row_per_order()
    {
        Render<MudPopoverProvider>();
        var page = Render<Orders>();

        page.WaitForAssertion(() =>
            Assert.Equal(3, page.FindAll("tbody tr.mud-table-row").Count));
    }
}
```

## Best practices

- **Make the app interactive globally.** Static rendering isn't supported, and a static layout breaks popovers, menus and dialogs without any error.
- **One of each provider, in the layout.** Never add a second `MudPopoverProvider` "to fix" something.
- **Pick one design system.** Remove Bootstrap and the template CSS, and use MudBlazor's spacing and flex utility classes (`pa-4`, `mt-2`, `d-flex`, `justify-end`) instead of custom CSS where you can.
- **Centralise the theme.** Colours, radius and typography live in one `MudTheme`, so a rebrand is one file.
- **Use `ServerData` for large lists**, so filtering, sorting and paging happen in the database.
- **Wrap repeated patterns in your own components**, such as a confirm dialog, a page header or a status chip, so pages stay short and consistent.
- **Mind accessibility.** Icon-only buttons need an `AriaLabel`, and colour should never be the only way status is shown.
- **Keep business logic out of components.** Inject services, so components only handle presentation and are easy to test.
- **Pin the version and read release notes before upgrading.** Major versions of MudBlazor do contain breaking changes, so upgrade deliberately.

## Further reading

- [MudBlazor documentation and component gallery](https://mudblazor.com)
- [MudBlazor on NuGet](https://www.nuget.org/packages/MudBlazor)
- [Microsoft: ASP.NET Core Blazor render modes](https://learn.microsoft.com/aspnet/core/blazor/components/render-modes)
