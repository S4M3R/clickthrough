// A synthetic product ("Acme", made up for this demo) rendered as static HTML,
// one function per screen. Nothing here is a real product or real customer
// data. build-flows.mjs opens each screen in a browser, measures its
// components with capture/boxes.js and adds it to a flow with the CLI.

export const VIEWPORT = { width: 960, height: 620 };

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#17191c;background:#f6f5f1;-webkit-font-smoothing:antialiased}
.top{height:56px;display:flex;align-items:center;gap:10px;padding:0 28px;border-bottom:1px solid #e4e2da;background:#fbfaf7}
.mark{width:22px;height:22px;border-radius:6px;background:#17191c;position:relative}
.mark::after{content:"";position:absolute;inset:6px 6px 6px 6px;border-radius:50%;background:#f2b33d}
.brand{font-weight:700;font-size:16px;letter-spacing:-.01em}
.steps{margin-left:auto;font-size:13px;color:#6d6f73}
main{display:grid;place-items:start center;padding:36px 20px 0}
.card{width:400px}
.card.wide{width:560px}
h1{font-size:25px;line-height:1.2;letter-spacing:-.02em;margin:0 0 6px;font-weight:650}
h2{font-size:15px;margin:0 0 2px;font-weight:600}
p{margin:0 0 18px;color:#5d6065}
p.small{font-size:13px;margin:0}
label{display:block;font-size:13px;font-weight:550;margin:0 0 5px}
input{display:block;width:100%;height:40px;border:1px solid #cfcdc4;border-radius:8px;padding:0 12px;font:inherit;background:#fff;color:#17191c;margin:0 0 14px}
button{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:42px;border-radius:8px;border:1px solid #cfcdc4;background:#fff;font:inherit;font-weight:550;color:#17191c;margin:0 0 10px;cursor:pointer}
button.primary{background:#17191c;border-color:#17191c;color:#fff}
button.quiet{border-color:transparent;background:transparent;color:#5d6065}
.ico{width:18px;height:18px;border-radius:50%;display:inline-grid;place-items:center;font-size:11px;font-weight:700;color:#fff}
.ico.g{background:#4285f4}.ico.g::before{content:"G"}.ico.gh{background:#24292f}.ico.gh::before{content:"gh"}
.or{display:flex;align-items:center;gap:12px;color:#8a8c90;font-size:13px;margin:8px 0 16px}
.or::before,.or::after{content:"";flex:1;height:1px;background:#dddbd2}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 10px}
.grid button{height:74px;flex-direction:column;gap:2px;margin:0}
.grid small{font-weight:400;color:#6d6f73;font-size:12.5px}
ul{list-style:none;margin:0 0 18px;padding:0;border:1px solid #dddbd2;border-radius:10px;background:#fff}
li{padding:11px 14px;border-bottom:1px solid #ecebe5;display:flex;justify-content:space-between;gap:12px;font-size:14px}
li:last-child{border-bottom:0}
li span{color:#6d6f73}
pre{margin:0 0 16px;padding:14px;border-radius:10px;background:#17191c;color:#e8e6df;font:12.5px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap}
.third{border:1px dashed #b9b6aa;border-radius:12px;padding:22px;background:#fbfaf7}
.tag{display:inline-block;font-size:12px;color:#6d6f73;border:1px solid #dddbd2;border-radius:99px;padding:2px 9px;margin:0 0 14px;background:#fff}
.row{display:flex;gap:10px}.row button{margin:0}
.ok{width:44px;height:44px;border-radius:50%;background:#1d7a55;color:#fff;display:grid;place-items:center;font-size:22px;margin:0 0 16px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dddbd2;border-radius:10px;overflow:hidden;font-size:14px;margin:0 0 16px}
.dialog{border:1px solid #cfcdc4;border-radius:14px;background:#fff;padding:22px;box-shadow:0 18px 50px rgba(20,20,10,.16)}
`;

const page = (step, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Acme</title><style>${CSS}</style></head><body>
<div class="top"><span class="mark"></span><span class="brand">Acme</span>${step ? `<span class="steps">${step}</span>` : ""}</div>
<main>${body}</main></body></html>`;

const google = `<button><span class="ico g" aria-hidden="true"></span>Continue with Google</button>`;
const github = `<button><span class="ico gh" aria-hidden="true"></span>Continue with GitHub</button>`;

// ---------- Flow: onboarding (project "Acme web") ----------
export const onboarding = {
  id: "onboarding",
  title: "Signup and onboarding",
  start: "signup",
  screens: {
    signup: {
      title: "Create your account",
      route: "/signup",
      // variant "github-first" is what the demo agent ships in answer to the comment.
      html: (variant) => page("", `<div class="card">
        <h1>Create your account</h1><p>Start your free trial. No card required.</p>
        ${variant === "github-first" ? github + google : google + github}
        <div class="or">or</div>
        <label for="e">Email</label><input id="e" placeholder="you@company.com">
        <label for="p">Password</label><input id="p" type="password" placeholder="At least 12 characters">
        <button class="primary">Create account</button></div>`),
    },
    verify: {
      title: "Check your email",
      route: "/signup/verify",
      html: () => page("", `<div class="card">
        <h1>Check your email</h1><p>We sent a 6-digit code to dana@northwind.example.</p>
        <label for="c">Code</label><input id="c" placeholder="123456">
        <button class="primary">Verify</button><button class="quiet">Resend code</button></div>`),
    },
    google: {
      title: "Google sign-in (placeholder)",
      route: "accounts.google.com",
      note: "Third-party page. Stands for Google's account chooser and consent screen.",
      html: () => page("", `<div class="card third"><span class="tag">Third-party page, not captured</span>
        <h1>Google sign-in</h1><p>The person picks a Google account and allows Acme to read their name and email.</p>
        <button class="primary">Allow and return to Acme</button></div>`),
    },
    github: {
      title: "GitHub authorization (placeholder)",
      route: "github.com/login/oauth",
      note: "Third-party page. Stands for GitHub's authorize screen.",
      html: () => page("", `<div class="card third"><span class="tag">Third-party page, not captured</span>
        <h1>Connect GitHub to Acme</h1><p>The person signs in to GitHub and authorizes the Acme app to read their profile and email.</p>
        <button class="primary">Authorize Acme</button></div>`),
    },
    workspace: {
      title: "Name your workspace",
      route: "/onboarding/workspace",
      html: () => page("Step 1 of 3", `<div class="card">
        <h1>Name your workspace</h1><p>This is where your team's dashboards live.</p>
        <label for="w">Workspace name</label><input id="w" placeholder="Northwind Analytics">
        <label for="u">Workspace URL</label><input id="u" placeholder="acme.example/northwind">
        <button class="primary">Continue</button></div>`),
    },
    connect: {
      title: "Connect your data",
      route: "/onboarding/connect",
      html: () => page("Step 2 of 3", `<div class="card wide">
        <h1>Connect your data</h1><p>Pick where your events come from. You can add more later.</p>
        <div class="grid">
          <button>Postgres<small>Read-only connection</small></button>
          <button>Stripe<small>Payments and subscriptions</small></button>
          <button>Segment<small>Forward your existing events</small></button>
          <button>CSV upload<small>One-off import</small></button>
        </div>
        <button class="quiet">Use the API instead</button></div>`),
    },
    postgres: {
      title: "Connect Postgres",
      route: "/onboarding/connect/postgres",
      html: () => page("Step 2 of 3", `<div class="card">
        <h1>Connect Postgres</h1><p>Use a read-only user. Acme never writes to your database.</p>
        <label for="h">Host</label><input id="h" placeholder="db.northwind.example">
        <label for="d">Database</label><input id="d" placeholder="analytics">
        <label for="r">Read-only user</label><input id="r" placeholder="acme_reader">
        <button class="primary">Test and connect</button></div>`),
    },
    stripe: {
      title: "Connect Stripe",
      route: "/onboarding/connect/stripe",
      html: () => page("Step 2 of 3", `<div class="card">
        <h1>Connect Stripe</h1><p>Acme asks for read access to these objects:</p>
        <ul><li>Customers <span>read</span></li><li>Subscriptions <span>read</span></li><li>Invoices <span>read</span></li></ul>
        <button class="primary">Approve in Stripe</button><button class="quiet">Pick another source</button></div>`),
    },
    api: {
      title: "Send events with the API",
      route: "/onboarding/connect/api",
      html: () => page("Step 2 of 3", `<div class="card wide">
        <h1>Send events with the API</h1><p>Send one event and this page moves on by itself.</p>
        <pre>curl https://api.acme.example/v1/events \\
  -H "Authorization: Bearer ak_test_demo" \\
  -d '{"event":"signed_up","user":"u_1"}'</pre>
        <button class="primary">I sent an event</button></div>`),
    },
    done: {
      title: "You're all set",
      route: "/onboarding/done",
      html: () => page("Step 3 of 3", `<div class="card">
        <div class="ok">✓</div><h1>You're all set</h1><p>Your first dashboard fills in as events arrive.</p>
        <button class="primary">Open dashboard</button><button>Invite teammates</button></div>`),
    },
  },
  edges: [
    ["signup", "github", "Sign up with GitHub", "Continue with GitHub"],
    ["signup", "google", "Sign up with Google", "Continue with Google"],
    ["signup", "verify", "Email and password", "Create account"],
    ["verify", "workspace", "Verify", "Verify"],
    ["google", "workspace", "Allow", "Allow and return"],
    ["github", "workspace", "Authorize", "Authorize Acme"],
    ["workspace", "connect", "Continue", "Continue"],
    ["connect", "postgres", "Postgres", "Postgres"],
    ["connect", "stripe", "Stripe", "Stripe"],
    ["connect", "api", "API", "Use the API instead"],
    ["postgres", "done", "Test and connect", "Test and connect"],
    ["stripe", "done", "Approve in Stripe", "Approve in Stripe"],
    ["api", "done", "First event received", "I sent an event"],
  ],
};

// ---------- Flow: invite a teammate (project "Acme admin") ----------
export const invite = {
  id: "invite",
  title: "Invite a teammate",
  start: "members",
  screens: {
    members: {
      title: "Members",
      route: "/settings/members",
      html: () => page("Settings", `<div class="card wide">
        <h1>Members</h1><p>3 people can see this workspace.</p>
        <ul><li>Dana Okafor <span>Owner</span></li><li>Luis Ferrer <span>Admin</span></li><li>Mei Tanaka <span>Viewer</span></li></ul>
        <button class="primary">Invite a teammate</button></div>`),
    },
    dialog: {
      title: "Invite dialog",
      route: "/settings/members?invite=1",
      html: () => page("Settings", `<div class="card dialog">
        <h1>Invite a teammate</h1><p>They get an email with a link that works for 7 days.</p>
        <label for="i">Email</label><input id="i" placeholder="teammate@company.com">
        <div class="row"><button>Copy invite link</button><button class="primary">Send invite</button></div></div>`),
    },
    sent: {
      title: "Invite sent",
      route: "/settings/members?sent=1",
      html: () => page("Settings", `<div class="card">
        <div class="ok">✓</div><h1>Invite sent</h1><p>We emailed sam@northwind.example.</p>
        <button class="primary">Back to members</button></div>`),
    },
    copied: {
      title: "Link copied",
      route: "/settings/members?copied=1",
      html: () => page("Settings", `<div class="card">
        <div class="ok">✓</div><h1>Link copied</h1><p>Anyone with the link can join as a viewer until it expires.</p>
        <button class="primary">Back to members</button></div>`),
    },
  },
  edges: [
    ["members", "dialog", "Invite a teammate", "Invite a teammate"],
    ["dialog", "sent", "Send by email", "Send invite"],
    ["dialog", "copied", "Copy a link", "Copy invite link"],
  ],
};

export const PROJECTS = [
  { id: "acme-web", name: "Acme web", flows: [onboarding] },
  { id: "acme-admin", name: "Acme admin", flows: [invite] },
];
