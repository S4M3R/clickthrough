# Clickthrough site

The landing page, the demo that produces its visuals, and the launch kit.

```
site/
  index.html, styles.css, site.js   the page (static, no build step)
  og.png, favicon.svg               social image and icon
  media/                            demo video, GIF and screenshots (generated)
  demo/                             scripts that generate media/ and og.png
  launch/                           posts, alt text and the launch-day checklist
```

Open `index.html` in a browser to preview it. Deploy the `site/` folder as it
is; `.vercelignore` keeps `demo/` and `launch/` out of the deploy.

Every image and the video come from `demo/`, which uses a made-up product
("Acme"). Do not add screenshots of real products here.

## Agent logos

`media/agents/` holds the small logos shown in the install button. They are the
marks of their owners, used only to name the agents Clickthrough works with:
Claude Code, Codex (OpenAI) and Cursor from [Simple Icons](https://simpleicons.org),
T3 Code, Orca and Conductor from the icons on their own sites (t3.codes,
onorca.dev, conductor.build). Replace or remove one if its owner asks.
