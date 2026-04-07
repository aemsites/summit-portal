---
name: Create Microsite
description: Creates a customer microsite by selecting the best-matching industry template, duplicating it into the customer's folder, and returning an edit link in da.live.
triggers:
  - create microsite
  - create offer
  - new microsite
  - new offer for
  - create a microsite
---

# Create Microsite

A sales rep describes their intent for an account and this skill finds the right industry template, sets up the customer folder, copies the template, names the document, and returns a ready-to-edit link.

## Steps

### 1. Extract account name and intent

Parse the user's message to identify:
- **Account name** — the company the microsite is for (e.g. "Microsoft", "Salesforce")
- **Intent** — what the offer or microsite is about (e.g. "coffee machines", "cloud migration", "security audit")

If either is missing or ambiguous, ask for clarification before proceeding.

### 2. List available industry templates

Use `da_list_sources` with the org, repo, and path `/docs/library/templates/industries` from the current page context to retrieve all available templates.

- Do not ask the user for the path — always use the page context for org and repo.
- Note the full path and filename of each template returned.

### 3. Select the best-matching template and confirm with the user

**If the user specified a template in their prompt** (e.g. "use the manufacturing template"), use that template directly and skip the rest of this step.

**If no template was specified**, read the metadata of each returned template using `da_get_source` (look for a `<meta>` block or a Metadata table with fields like `industry`, `tags`, or `description`) and pick the closest match to the user's intent.

Then apply the following logic based on what is available:

- **No templates found at all** — skip confirmation, proceed with a blank document (no copy needed in Step 5).
- **Only `default.html` is available** — skip confirmation, use it silently.
- **Multiple templates available and a match was found** — ask the user to confirm:

  > "I selected the **{template name}** template for this microsite. Does that look right? (yes / no)"

  **If yes:** proceed to Step 4.

  **If no:** list all available templates with numbers so the user can pick one:

  > "Here are all available templates — which one should I use?
  >
  > 1. {template 1 name} — {short description from metadata}
  > 2. {template 2 name} — {short description from metadata}
  > 3. {template 3 name} — {short description from metadata}
  > ...
  >
  > Reply with the number of your choice."

  Wait for the user to reply with a number before proceeding.

### 4. Determine the customer folder path

Build the folder path using this pattern:

```
/customers/{first letter of account (lowercase)}/{account name (lowercase, hyphenated)}
```

Examples:
- Microsoft → `/customers/m/microsoft`
- Salesforce → `/customers/s/salesforce`
- Adobe Systems → `/customers/a/adobe-systems`

Use only lowercase letters and replace spaces with hyphens in the account name.

### 5. Check existing documents and copy the template

First, use `da_list_sources` with the customer folder path to retrieve any documents already in the folder. Remember this list — you will need it in Step 6.

- If the folder does not exist yet or returns no documents, note that this is the first microsite for this account.
- **Never delete or overwrite any existing document in the folder.**

If a template was selected (Step 3), use `da_copy_content` to duplicate it into the customer folder:

- **Source:** full path of the selected template (e.g. `/docs/library/templates/industries/manufacturing.html`)
- **Destination:** `{customer folder}/new-offer-draft.html`

If no template is available (Step 3 determined a blank document is needed), use `da_create_source` to create an empty document at `{customer folder}/new-offer-draft.html` with a minimal HTML shell:

```html
<body><header></header><main><div></div></main></body>
```

If the customer folder does not exist yet, either tool will create it automatically.

### 6. Add intro content based on the intent

After copying, read the new document back with `da_get_source`, then inject an intro section near the top of the `<main>` element — before any existing template blocks — containing:

- A **headline** referencing the account name and the intent (e.g. "Empowering Microsoft with Next-Generation Coffee Solutions")
- A **short introductory paragraph** (2–3 sentences) written in a professional sales tone, grounded in the intent the user provided

Use `da_update_source` to save the updated content back to `{customer folder}/new-offer-draft.html`.

Do not output the HTML in the response.

### 7. List existing offers in the customer folder

Present the list of documents captured in Step 5 (before the new draft was added), plus the newly created draft, to the user:

```
Documents in /customers/{letter}/{account}:

• {document name} — https://da.live/#/{org}/{repo}/customers/{letter}/{account}/{document-name}
• ...
```

Include a clickable da.live edit link for each document.

If the folder had no documents before this run, add a note:

> "This is the first microsite created for {account}."

### 8. Recommend a document name and ask for confirmation

Suggest a document name using this pattern:

```
{account (lowercase, hyphenated)}-{one key word from the intent}-offer
```

Examples:
- Microsoft + coffee machines → `microsoft-coffee-offer`
- Salesforce + cloud migration → `salesforce-cloud-offer`
- Adobe Systems + security audit → `adobe-systems-security-offer`

Present the recommendation to the user:

> "I suggest naming this document **`{recommended-name}`**. Would you like to use this name, or do you have a different name in mind?"

Wait for the user to confirm or provide an alternative name before proceeding.

### 9. Rename the document

Once the user confirms a name, use `da_move_content` to rename the temporary file:

- **Source:** `{customer folder}/new-offer-draft.html`
- **Destination:** `{customer folder}/{confirmed-name}.html`

### 10. Return the edit link

Confirm success and return the direct da.live edit URL:

```
https://da.live/#/{org}/{repo}/customers/{letter}/{account}/{confirmed-name}
```

Tell the user:

> "Your microsite is ready. Open it in da.live to start editing:
> https://da.live/#/{org}/{repo}/customers/{letter}/{account}/{confirmed-name}"

## Rules

- Always use the current page context for org and repo — never ask the user for them.
- Never modify the source template.
- Never delete or overwrite any existing document in the customer folder.
- Only ask for template confirmation when multiple industry templates are available and the user did not specify one upfront.
- If only `default.html` exists or no templates are found at all, proceed silently without asking.
- If no template is available at all, create a blank document — do not error out.
- Do not output raw HTML content in the response.
- Always confirm the selected template with the user before copying it (Step 3).
- Always wait for the user to confirm the document name before renaming.
- If the page context (org/repo) is missing, inform the user that you need to be on a da.live page to use this skill.
