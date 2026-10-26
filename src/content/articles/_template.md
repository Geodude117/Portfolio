---
title: Article template
description: Copy this file to start a new article. It stays hidden on the live site because draft is true.
pubDate: 2026-10-26
tags: [Template]
draft: true
---

Copy this file, rename it (the file name becomes the URL, e.g. `my-new-post.md` → `/articles/my-new-post/`), update the details at the top, set `draft: false`, then push.

## Headings, text and lists

Write normal Markdown. **Bold**, *italic*, [links](https://github.com/Geodude117), and lists:

- First point
- Second point

## Code

```csharp
public record Card(Suit Suit, Rank Rank)
{
    public int Value => Rank switch
    {
        Rank.Ace => 11,
        >= Rank.Ten => 10,
        _ => (int)Rank
    };
}
```

## Images

Put images in `public/images/` and reference them like this:

`![Screenshot of the game](/Portfolio/images/screenshot.png)`

## Videos

Upload the video to YouTube (unlisted is fine), take the ID from the URL (the part after `v=`), and paste this, replacing `VIDEO_ID`:

```html
<div class="video">
  <iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID" title="Video title" allowfullscreen loading="lazy"></iframe>
</div>
```

For Vimeo, use `https://player.vimeo.com/video/VIDEO_ID` as the `src` instead.
