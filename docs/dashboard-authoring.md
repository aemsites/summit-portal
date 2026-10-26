# Authoring the report dashboard

The dashboard used to put several full-width announcements ahead of reports.
It now groups their existing content into **Resources & guidance**, beside reports
on desktop and below them on mobile. Authors can keep today's block order.
No DA content edit is required to enable the layout.

The report list starts at 25 rows. Readers can choose 25, 50 or 100 rows and search
by company, website or campaign. Campaign choices come from the existing sheets;
see [campaign registration and membership](integrations/event-tabs-and-event-membership.md).
Do not add a tab or duplicate the picker when a new campaign is published.

Reports appear newest publication date first, with unrecorded or invalid dates
last. Click a report row to open its details and sharing panel. The row keeps
only **Open** and **Share** shortcuts; Share focuses the sharing controls in
that same panel. When several formats are available, choose one first.

## Copy example for owner review

This example follows the approved reports-first design. Review these optional
content edits in preview before publishing them; this code change does not
publish or overwrite the authored page.

| Authored content | Suggested wording |
|---|---|
| Main heading | Digital Opportunity Reports |
| Introduction | Find a company, open a report, or share a magic link. |
| Customer-request heading | Customer report requests |
| Customer-request body | Customers can request without Adobe sign-in. Review their request, generate the report in Digital Insights Hub, then return here to send a magic link. |
| Presenting guidance | Use the Sales Playbook to read, present and explain a customer's report and portal page. Explore the demo report before a meeting. |
| Coverage guidance | SEO and keyword data come from Semrush, an Adobe company; AI-visibility data comes from Adobe. New or small sites, redirects and blocked collection can leave gaps. AI Visibility or Keyword Opportunities may be omitted, and occasionally no PDF is available. |

Keep the existing three-cell `Report Callout (report-requests)` block: label,
heading/body, then actions. Keep the existing neutral playbook and coverage
callouts, followed by the heading, demo link and `Customer Picker` block.
The layout moves the decorated source nodes, including their existing links
and event handlers; it does not create another report list or export form.

The compact card summaries are part of the dashboard code. Full authored
guidance remains available from each card. Additional callouts or authored
sections appear as additional guidance rather than being discarded.

## Destinations to retain

| Purpose | Destination |
|---|---|
| Staff request review | `/adobe/report-requests` |
| No-sign-in customer intake | `/request-report` |
| Generate more reports | `https://digital-insights.corp.adobe.com/` |
| Sales Playbook | `/docs/sales-playbook` |
| Demo | `/customers/0-9/000-demo/` |
| Event staff guide | `/adobe/booth-guide` |
| Booth experience | `/booth` |

The DIH header action is for Adobe staff to generate reports. It is not the
public customer request form. Keep both workflows distinct.

**Booth usage export (CSV)** opens the original controls with all activity
choices, access feedback and guidance. Retain the 90-day retention and downloaded
email policy, action-versus-person interpretation, Email/Visit correlation,
unsuccessful lookups, limits of opens and mail acceptance, and the distinction
between activity and historical contact opt-ins. Do not move that guidance away
from the form. Booth and portal access remain separate; shared event devices
need a dedicated browser profile without a portal sign-in.

## DA editing checklist

- Edit the existing dashboard page; do not create a second picker or hand-maintained
  campaign navigation.
- Keep the company-list source and its environment prefix. The picker derives
  the matching insights and campaign-registry sheet URLs from it.
- Preserve all destinations above and the coverage limitations. New copy must
  not promise that every section or PDF is always available.
- Preview both desktop and mobile. Check the resources jump link, full guidance,
  export form, company/website search, campaign search and page-size selector.
- Check a report with several campaigns and one with several formats. Details
  and sharing must refer to the chosen page, not every page for its website.
- Ask the page owner to approve the content preview before publishing.
  Production publishing and campaign backfills are separate actions, not part
  of these pull requests.
