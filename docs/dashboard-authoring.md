# Authoring the report dashboard

The dashboard used to put several full-width announcements ahead of reports.
It now groups their existing content into **Resources & guidance**, beside reports
on desktop and below them on mobile. Authors can keep today's block order.
No DA content edit is required to enable the layout.

The report list starts at 25 rows. Readers can choose 25, 50 or 100 rows and search
by company, website or campaign. Campaign choices come from the existing sheets;
see [campaign registration and membership](integrations/event-tabs-and-event-membership.md).
Do not add a tab or duplicate the picker when a new campaign is published.

Opening the campaign selector shows all available campaigns in a scrollable list.
Readers can browse without typing, or search for any part of a campaign name to
narrow the choices. Clearing the search restores the full list.

Existing campaign labels, membership columns and legacy campaign links remain
supported. Do not rename their IDs or columns just to enable this dashboard;
the reader does not require a DA sheet migration.

Reports appear newest publication date first, with unrecorded or invalid dates
last. Click a report row to open its details and sharing panel. The row keeps
only **Open** and **Share** shortcuts; Share focuses the sharing controls in
that same panel. When several formats are available, choose one first.

The layout waits for its styles before rearranging the authored content. While
the complete report list loads, it reserves one screen of space so mobile
resources do not appear briefly and then move away. That extra space is removed
when loading finishes; empty and unavailable states keep their compact layout.

The first resource card, **Questions & help**, links directly to
[#digital-insights on Adobe Slack](https://adobe.enterprise.slack.com/archives/C0ABMNDLXC5)
for questions about the platform, Digital Insights and Digital Opportunity reports.
It stays visible without opening a guidance dialog. On mobile, use the
**Resources & guidance** jump link to reach it below the reports. This destination
is included in the dashboard code; no new DA callout or publication is required.

**Present with confidence** links to
[Digital Insights Hub Guides](https://digital-insights.corp.adobe.com/reports/how-to-use)
and the demo report. The former Sales Playbook link and **Why a section may be
missing** card are removed, along with their legacy authored callouts. They do
not reappear as additional guidance, even if the old blocks remain in DA.

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
| Presenting guidance | Use Digital Insights Hub Guides to read, present and explain a customer's report and portal page. Explore the demo report before a meeting. |

Keep the existing three-cell `Report Callout (report-requests)` block: label,
heading/body, then actions, followed by the heading, demo link and `Customer Picker`
block. The old neutral playbook and coverage callouts can be deleted from DA;
the layout already removes them from the rendered dashboard.
The layout reuses the other decorated source blocks and export controls. Shortcut
links keep their existing event handlers, and full guidance retains working
links with the original labels and destinations. It does not create another
report list or export form.

The compact card summaries are part of the dashboard code. Other full authored
guidance remains available from each card. Additional callouts or authored
sections appear as additional guidance rather than being discarded.

The information panels use smaller subheadings, readable paragraphs and separated
actions rather than the original banner layout. Their title and close button
stay visible while long guidance scrolls, including with the keyboard. Keep all
original wording and links inside each panel, even when the same destination
also has a shortcut in the resource column.

## Destinations to retain

| Purpose | Destination |
|---|---|
| Platform and report questions | `https://adobe.enterprise.slack.com/archives/C0ABMNDLXC5` (`#digital-insights`) |
| Staff request review | `/adobe/report-requests` |
| No-sign-in customer intake | `/request-report` |
| Generate more reports | `https://digital-insights.corp.adobe.com/` |
| Digital Insights Hub Guides | `https://digital-insights.corp.adobe.com/reports/how-to-use` |
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
- Preserve all destinations above. New copy must
  not promise that every section or PDF is always available.
- Preview both desktop and mobile, including a short window. Compare each panel's
  full wording and links with the original content, not just its card summary.
  Check keyboard scrolling, the close button, the Slack help link, resources jump,
  export form, company/website search, campaign search and page-size selector.
- Check a report with several campaigns and one with several formats. Details
  and sharing must refer to the chosen page, not every page for its website.
- Ask the page owner to approve the content preview before publishing.
  Production publishing and campaign backfills are separate actions, not part
  of these pull requests.
