# Directory listings: Claude and ChatGPT

The text to paste when submitting Claritia to Claude's connector directory and ChatGPT's app directory. The server is
`https://app.tryclaritia.com/api/mcp` (docs/mcp.md). Each directory's form changes often: field names below are a guide
(check).

## Shared details

| Field | Value |
|---|---|
| Name | Claritia |
| Server URL | `https://app.tryclaritia.com/api/mcp` |
| Transport | Streamable HTTP |
| Sign-in | OAuth 2.1 with PKCE and dynamic client registration. Forms can also be made before signing in |
| Category | Productivity (Business on stores that have it) |
| Website | https://tryclaritia.com |
| Privacy policy | https://tryclaritia.com/privacy |
| Terms | https://tryclaritia.com/terms |
| Support | hello@tryclaritia.com |
| Logo | The Slot mark, `claritia-site/assets/brand` (square, green tile) |

## Short description (under 80 characters)

Make live forms in chat, share the link, and see who signed up.

## Long description

Claritia builds forms that go live right away. Ask for a sign-up form, an inquiry form, an RSVP or an intake form, and
Claritia picks from 740 ready-made forms in 18 styles, or uses the page you describe. You get a link to share and a
claim link. Claim it to keep the form and see every answer, free.

Once you connect your Claritia account, you can list your forms and read the latest answers in chat.

Forms made before signing in close after 14 days unless claimed. They can't ask for passwords, card numbers, bank
details or codes.

## Example prompts

1. Make me a sign-up form for my Saturday yoga class.
2. I run a wedding photography business. Build an inquiry form that asks for the date, venue and budget.
3. Create an RSVP form for our team dinner with a meal choice, in a dark style.
4. Change the form so it also asks for a phone number.
5. Show me the latest answers to my Free trial class form. (needs sign-in)

## Tools

| Tool | What it does | Read only | Needs sign-in |
|---|---|---|---|
| `find_form_template` | Finds the closest ready-made forms for a request | Yes | No |
| `create_form` | Makes a live form from a template or a page, returns the live and claim links | No | No |
| `update_form` | Changes a form made in chat until it's claimed | No | No |
| `list_forms` | Lists the forms in your workspace | Yes | Yes |
| `get_answers` | Shows a form's latest answers, spam and tests left out | Yes | Yes |

Signed in, the server also lists the full set in docs/mcp.md (forms, routing and the testing tools). No tool deletes
anything.

## Data use (for the review forms)

- What Claritia gets: the form's name and page from the chat, and, when signed in, which forms to read.
- What it stores: the form, its versions and its answers, in Claritia's own database. Forms made before sign-in also
  store a hash of the internet address that made them, for the 20-a-day limit.
- What it never does: send chat content to other parties, train AI on it, or read anything from the chat beyond the
  tool's inputs.
- Signing out: revoke the app's key in Settings › API keys.

## Test account for reviewers

Make a reviewer account on app.tryclaritia.com with one sample form and a few answers, and give its email in the form.
Sign-in uses an email link, so give reviewers a Google sign-in or a shared inbox they can reach (check what each
directory accepts).

## Before submitting

- The privacy policy still lists Supabase in Japan and Fly.io as hosts; both moved to the Hostinger VPS. It also needs a
  paragraph on the Claude and ChatGPT connector and forms made before sign-in (draft below).
- Draft paragraph: "Claritia in Claude and ChatGPT. When you use Claritia from an AI app, Claritia receives only what the
  app sends to its tools: the form you ask for and, once you connect your account, which forms to read. Forms made
  before you sign in are kept for 14 days unless claimed, with a hash of the internet address that made them. We don't
  receive your chat, and we don't use any of it to train AI."

## Running cost

$0 at Beta (50 teams) and Growth (500 teams). Listing is free in both directories (check).
