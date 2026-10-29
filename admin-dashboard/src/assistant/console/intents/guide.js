// How-to, troubleshooting and explain intents for the company console: steps in the
// console's own words (its buttons and pages), fixes for common problems, and what
// things mean. Fixed text; nothing here reads or writes data.

export const HOWTO_INTENTS = [
  {
    id: "howto_add_customer", group: "howto",
    keys: [["add customer", 5], ["new customer", 3], ["add", 1.5], ["customer", 1], ["how do i", 0.5], ["can you", -2.5], ["for me", -3], ["recent", -3], ["which", -2], ["lot", -2], ["request", -2], ["platformadmin", -3], ["user", -2]],
    next: ["How do I convert a request?", "How do I assign a lot?", "What does each status mean?"],
    say: [
      "On Customers, press New customer. Fill in the name, type and status (contact and notes are optional) and press Save customer. Then open it to add or assign lots.",
      "Customers → New customer → name, type, status → Save customer. Lots are added on the customer's own page afterwards.",
      "Go to Customers and choose New customer. Only the name, type and status are required. Once it's saved, its page has Add lot and Assign a lot.",
      "Press New customer on the Customers page, fill the form and save. If the customer came from a quote request, convert the request instead so the two stay linked.",
    ],
  },
  {
    id: "howto_convert_request", group: "howto",
    keys: [["convert request", 5], ["convert", 3], ["turn request into customer", 5], ["request into customer", 4.5], ["make customer from", 4], ["how do i", 0.5], ["was", -2], ["which", -2], ["fail", -3], ["will not", -3], ["can not", -2]],
    next: ["What does won mean?", "How do I assign a lot?", "Which requests were converted?"],
    say: [
      "On Requests, find the request and press Convert to customer. That creates a prospect customer from it, marks the request won, and links the two.",
      "Requests → the request → Convert to customer. The new customer is a prospect, named after the organisation (or the person), with them as the contact.",
      "Open Requests and use Convert to customer on the one you want. It's one step and can't be done twice for the same request.",
    ],
  },
  {
    id: "howto_assign_lot", group: "howto",
    keys: [["assign lot", 5], ["assign", 3], ["give customer lot", 4], ["lot to customer", 4], ["link lot", 4], ["how do i", 0.5], ["unassign", -4], ["fail", -3], ["will not", -3]],
    next: ["How do I unassign a lot?", "Lots without a customer", "How do I add a lot?"],
    say: [
      "Open the customer's page (Customers → its name), pick the lot under Assign a lot, and press Assign lot. Only lots without a customer are offered.",
      "Customer page → Assign a lot → choose the lot → Assign lot. The lot's siteId now points to that customer.",
      "Go to the customer, then use the Assign a lot picker. A lot already owned by someone has to be unassigned there first.",
    ],
  },
  {
    id: "howto_unassign_lot", group: "howto",
    keys: [["unassign", 5], ["unassign lot", 5], ["remove lot from customer", 5], ["take lot away", 4], ["detach", 3], ["how do i", 0.5]],
    next: ["How do I assign a lot?", "How do I delete a customer?", "Lots without a customer"],
    say: [
      "On the customer's page, press Unassign next to the lot. The lot and its curbs stay; it just no longer belongs to that customer.",
      "Customer page → the lot → Unassign. Nothing is deleted: the lot moves to Lots without a customer on Deployments.",
      "Use Unassign beside the lot on the customer's page. You'll need to do that for every lot before the customer can be deleted.",
    ],
  },
  {
    id: "howto_add_lot", group: "howto",
    keys: [["add lot", 5], ["new lot", 4], ["create lot", 5], ["add", 1.5], ["lot", 1], ["how do i", 0.5], ["import", -3], ["csv", -3], ["assign", -2], ["customer", -0.5], ["many", -3]],
    next: ["How do I import lots from CSV?", "How do I edit a lot?", "What is a lot ID?"],
    say: [
      "Open the customer's page and press Add lot. Give it a name (the ID is made from its letters and numbers and can't change later), total spots from 1 to 5,000, and optionally a latitude and longitude. Every spot starts open.",
      "Customer page → Add lot → name, total spots, optional location → Add lot. For many lots at once, use Import lots instead.",
      "Lots are added per customer: its page has Add lot. The name sets the lot ID, so pick it carefully.",
    ],
  },
  {
    id: "howto_edit_lot", group: "howto",
    keys: [["change lot", 5], ["rename lot", 5], ["lot size", 3], ["change location", 4], ["change", 2], ["lot", 1], ["location", 1], ["size", 1], ["how do i", 0.5], ["customer", -1.5], ["without", -3]],
    next: ["How do I import lots from CSV?", "Lots without coordinates", "What is a lot ID?"],
    say: [
      "On the customer's page, press Edit on the lot. You can change its name, total spots, latitude and longitude, then Save lot. The ID and open spots don't change.",
      "Customer page → the lot → Edit → Save lot. Name, total spots and location are editable; open spots keep coming from the curbs.",
      "Use Edit beside the lot. For several lots, Import lots updates total spots and locations in one go.",
    ],
  },
  {
    id: "howto_import_lots", group: "howto",
    keys: [["import", 4], ["import lot", 5], ["csv", 3], ["column", 2.5], ["bulk", 2], ["many lot", 3], ["paste", 2], ["fail", -3], ["reject", -4], ["not found", -4], ["error", -3]],
    next: ["Why are import rows rejected?", "Customer not found in import", "How do I add a lot?"],
    say: [
      "Open Import lots in the sidebar and paste CSV. The first line is the header: id, name, customer, totalSpots, latitude, longitude. id is lowercase letters and numbers; customer is an existing customer's exact name; totalSpots is a whole number from 1 to 5,000, and rows without it are refused; latitude and longitude go together or not at all. You'll see a preview with New, Update or Error on each row before anything is written.",
      "Import lots → paste CSV with columns id, name, customer, totalSpots, latitude, longitude → check the preview → Import. Rows without totalSpots are refused. Existing lots only get their totalSpots and location updated, never their name or customer, and nothing is deleted.",
      "Use the Import lots page. Its header is id, name, customer, totalSpots, latitude, longitude. A row needs a valid id, a name, a real customer name and totalSpots (1 to 5,000); missing totalSpots means the row is refused. Rows with errors are skipped and the rest go in batches.",
    ],
  },
  {
    id: "howto_switch_mode", group: "howto",
    keys: [["switch", 3.5], ["switch to simulation", 5], ["switch to live", 5], ["toggle", 3], ["change mode", 4], ["data source", 4], ["go to live", 4], ["go to simulation", 4], ["mode", 1], ["mean", -2], ["which mode", -3], ["am i", -3]],
    next: ["What does Live vs Simulation show?", "Am I in Live or Simulation?", "How do I reload demo customers?"],
    say: [
      "Use Data source at the bottom of the sidebar: Live or Simulation. On a phone, open the menu first. Switching only changes what you see.",
      "Flip the Data source switch in the sidebar. Simulation shows demo customers and fake requests; Live shows the real ones.",
      "Bottom of the sidebar → Data source → Live or Simulation. Each page reloads its data for the mode you pick.",
    ],
  },
  {
    id: "howto_reload_demo", group: "howto",
    keys: [["reload demo", 5], ["reload", 3], ["reset simulation", 4], ["demo customer", 3.5], ["simulation customer", 3.5], ["refill", 3], ["seed", 3], ["empty", -2]],
    next: ["How do I send a fake quote request?", "Simulation is empty", "How do I switch Live/Simulation?"],
    say: [
      "In Simulation, go to Home and press Reload demo customers, then Yes, reload. It replaces the simulated customers and requests and reassigns the demo lots. Live data isn't touched.",
      "Switch to Simulation, then Home → Reload demo customers → Yes, reload. If demo lots are missing, load simulated data on the dashboard's Simulation page first.",
      "Home has Reload demo customers while you're in Simulation. It only ever writes to the simulation.",
    ],
  },
  {
    id: "howto_fake_request", group: "howto",
    keys: [["fake request", 5], ["send fake", 5], ["test request", 4.5], ["fake", 2], ["send", 2], ["request", 1], ["demo request", 4]],
    next: ["How many new requests?", "How do I convert a request?", "How do I reload demo customers?"],
    say: [
      "In Simulation, Home has Send a fake quote request. It adds one made-up request (with an @example.com email), as if someone had used the website form.",
      "Switch to Simulation, then press Send a fake quote request on Home. It shows up on Requests as new.",
      "Home → Send a fake quote request, in Simulation only. Handy for practising Convert to customer.",
    ],
  },
  {
    id: "howto_add_platform_admin", group: "howto",
    keys: [["add platformadmin", 5.5], ["new platformadmin", 5], ["make platformadmin", 5], ["platformadmin", 2.5], ["teammate", 2], ["user", 1], ["give access", 4], ["access", 1.5], ["console access", 3], ["add", 1], ["remove", -4], ["no", -2], ["do not have", -3], ["can not", -2], ["mean", -3], ["vs", -3], ["difference", -3]],
    next: ["How do I find a UID?", "How do I remove a platform admin?", "Platform admin vs customer manager"],
    say: [
      "Two steps, both outside this console. First the person needs an account they can sign in with. Then, in the Firebase console, open Realtime Database and add platformAdmins/<their UID> with the value true. They'll have console access next time they sign in.",
      "The teammate signs up for an account first. Then you find their UID (Firebase console → Authentication → Users) and add platformAdmins/<UID> = true in the Realtime Database. I can't do it for you: I never write.",
      "Platform admins are listed under platformAdmins in the database. Once the person has an account, add platformAdmins/<their UID> = true in the Firebase console, and they're in.",
    ],
  },
  {
    id: "howto_remove_platform_admin", group: "howto",
    keys: [["remove platformadmin", 5.5], ["revoke", 3], ["remove", 2], ["platformadmin", 2], ["take away access", 4.5], ["access", 1], ["offboard", 3.5], ["left company", 3]],
    next: ["How do I add a platform admin?", "How do I find a UID?", "Platform admin vs customer manager"],
    say: [
      "In the Firebase console, open Realtime Database and delete platformAdmins/<their UID>. Any console they have open stops loading data, and their next sign-in says No console access.",
      "Delete their entry under platformAdmins in the Firebase console. If they shouldn't sign in at all any more, disable the account in Authentication too.",
      "Remove platformAdmins/<UID> in the Realtime Database (Firebase console). Their account still exists, but it no longer opens the console.",
    ],
  },
  {
    id: "howto_find_uid", group: "howto",
    keys: [["uid", 4.5], ["find uid", 5], ["what is uid", 4], ["user id", 4], ["where uid", 4], ["my uid", 4.5]],
    next: ["How do I add a platform admin?", "How do I remove a platform admin?", "Can't sign in"],
    say: [
      "In the Firebase console, open Authentication → Users, find the person's email, and copy the User UID column. That's the key under platformAdmins.",
      "Firebase console → Authentication → Users. Each row has a User UID; copy it for platformAdmins/<UID>.",
      "UIDs live in Firebase Authentication. Search the Users list by email and copy the UID from that row.",
    ],
  },
  {
    id: "howto_delete_customer", group: "howto",
    keys: [["remove customer", 5], ["delete customer", 5], ["remove", 2], ["customer", 1], ["get rid of", 3], ["how do i", 0.5], ["will not", -3], ["can not", -2], ["platformadmin", -3], ["lot", -1], ["greyed", -4], ["disabled", -4], ["blocked", -4]],
    next: ["How do I unassign a lot?", "Customers without lots", "Can't delete a customer"],
    say: [
      "Open the customer's page and press Delete customer, then Yes, delete. It only works when no lots point to the customer, so unassign its lots first. Its lots and curbs aren't touched, and it can't be undone.",
      "Customer page → Delete customer → Yes, delete. If the button is greyed out, some lots still belong to it: unassign them first.",
      "Unassign every lot on the customer's page, then use Delete customer at the bottom. Deleting removes only the customer record.",
    ],
  },
  {
    id: "howto_quote_form", group: "howto",
    keys: [["quote form", 5], ["public form", 5], ["request form", 4.5], ["website", 3], ["form", 2], ["where do request come from", 4.5], ["contact form", 4], ["fake", -3], ["send", -1]],
    next: ["How many new requests?", "Newest requests", "How do I send a fake quote request?"],
    say: [
      "The public quote form is the Request a quote section on the website's home page. Anyone can fill it in, signed in or not, and each one lands on Requests as new.",
      "It's on the public website: the home page has a Request a quote section (the #quote link). Submissions arrive here on Requests.",
      "Visitors use Request a quote on the website's home page. Nothing else creates live requests.",
    ],
  },
  {
    id: "howto_edit_customer", group: "howto",
    keys: [["change customer", 5], ["edit customer", 5], ["rename customer", 5], ["change contact", 4], ["update contact", 4], ["change", 1.5], ["customer", 0.5], ["status", -1.5], ["lot", -2]],
    next: ["How do I change a customer's status?", "Who's the contact?", "How do I delete a customer?"],
    say: [
      "Open the customer and press Edit in its details. Change the name, type, contact or notes, then Save changes.",
      "Customer page → Edit → Save changes. Status has its own control on the same page.",
      "Use Edit on the customer's page. Everything except its lots is edited there.",
    ],
  },
  {
    id: "howto_customer_status", group: "howto",
    keys: [["change status", 4.5], ["mark active", 5], ["mark paused", 5], ["mark prospect", 5], ["set status", 4.5], ["pause customer", 4.5], ["activate", 4], ["make active", 4.5], ["status", 1], ["customer", 0.5], ["request", -3]],
    next: ["What does each status mean?", "Active vs prospect vs paused", "How do I edit a customer?"],
    say: [
      "On the customer's page, the Status card has Prospect, Active and Paused. Pick one and it saves straight away.",
      "Customer page → Status → choose prospect, active or paused.",
      "Open the customer and use its Status control. It's only a label for your team; it doesn't change what the customer can see.",
    ],
  },
  {
    id: "howto_request_status", group: "howto",
    keys: [["mark contacted", 5], ["mark closed", 5], ["close request", 4.5], ["request status", 3], ["mark request", 4.5], ["contacted", 2], ["closed", 2], ["how do i", 0.5], ["customer", -2], ["by status", -4]],
    next: ["Requests older than 2 days with no contact", "How do I convert a request?", "What do request statuses mean?"],
    say: [
      "On Requests, each request has a New / Contacted / Closed switch. Pick one and it saves. Won is set only by Convert to customer.",
      "Requests → the request → choose Contacted or Closed. Won can't be picked by hand.",
      "Use the status switch on each request. Mark it Contacted once you've been in touch, Closed if it went nowhere.",
    ],
  },
  {
    id: "howto_sign_out", group: "howto",
    keys: [["signout", 5], ["log off", 4], ["leave console", 3]],
    next: ["Can't sign in", "No console access", "Something else"],
    say: ["Use the sign-out button next to your email at the bottom of the sidebar (in the menu on a phone).", "Bottom of the sidebar → the sign-out icon beside your account.", "Your account sits at the foot of the sidebar; the button next to it signs you out."],
  },
  {
    id: "howto_search_customers", group: "howto",
    keys: [["search customer", 5], ["find customer", 4.5], ["filter customer", 4], ["search", 2], ["find", 1.5], ["import", -3], ["can not", -2]],
    next: ["List customers", "Tell me about a customer", "Active vs prospect vs paused"],
    say: ["The Customers page has a search box and status filters at the top.", "Customers → type in Search customers. Or just ask me, like \"tell me about Demo Mall\".", "Use Search customers on the Customers page, or name the customer here."],
  },
  {
    id: "howto_mobile", group: "howto",
    keys: [["phone", 3], ["mobile", 3.5], ["tablet", 3], ["on my phone", 4], ["small screen", 3]],
    next: ["How do I switch Live/Simulation?", "What can you do?", "Something else"],
    say: ["The console works on a phone: the sidebar becomes a menu button at the top, and lists turn into cards.", "Yes, it fits a phone. Tap the menu button for the pages and the Data source switch.", "On mobile, everything's under the menu at the top right, including me."],
  },
];

export const TROUBLESHOOT_INTENTS = [
  {
    id: "ts_no_access", group: "howto",
    keys: [["no console access", 5.5], ["no access", 4.5], ["do not have access", 5], ["access denied", 4.5], ["not allowed", 3.5], ["access", 1.5], ["kicked out", 4], ["signed out", 2.5], ["how do i", -2], ["add", -3]],
    next: ["How do I add a platform admin?", "Can't sign in", "How do I find a UID?"],
    say: [
      "\"No console access\" means the account signed in fine but isn't a platform admin: there's no platformAdmins/<its UID> = true in the database. Ask a platform admin to add it in the Firebase console, and check you used your company account.",
      "That screen appears when the account isn't listed under platformAdmins. Customer accounts never get in here. Someone with Firebase console access has to add your UID.",
      "Your sign-in worked, but the account has no platformAdmins entry, so the console signs it out. Get it added (Firebase console → Realtime Database → platformAdmins/<UID> = true) and sign in again.",
    ],
  },
  {
    id: "ts_cant_sign_in", group: "howto",
    keys: [["can not signin", 5], ["signin", 2], ["login", 2.5], ["wrong password", 4.5], ["forgot password", 4.5], ["password", 2.5], ["locked out", 4]],
    next: ["No console access", "How do I find a UID?", "Something else"],
    say: [
      "Check the email and password, or use Forgot password? on the sign-in page to get a reset link. If it signs in but then says no access, the account isn't a platform admin yet.",
      "Use Forgot password? on the sign-in screen. If the account doesn't exist at all, it has to be created first.",
      "Wrong password or no account are the usual causes. Reset it from the sign-in page; if it still fails, look the email up in Firebase Authentication.",
    ],
  },
  {
    id: "ts_load_error", group: "howto",
    keys: [["could not load", 5], ["load console data", 5.5], ["will not load", 4.5], ["not loading", 4], ["blank", 2], ["error", 2], ["home shows", 3], ["refused read", 4]],
    next: ["No console access", "How do I add a platform admin?", "Numbers look wrong"],
    say: [
      "\"Couldn't load console data\" means the database refused a read. Usually the security rules aren't published yet, or this account lost its platformAdmins entry. If it's a connection problem instead, reload the page.",
      "The read was refused or failed. Check the rules are deployed, that your UID is still under platformAdmins, then reload.",
      "That's a refused or failed read, not a bug in the page. Reload first; if it stays, check platformAdmins and the published rules.",
    ],
  },
  {
    id: "ts_convert_fails", group: "howto",
    keys: [["convert", 2], ["can not convert", 5], ["will not convert", 5], ["convert fail", 5], ["convert not work", 5], ["convert error", 4.5], ["fail", 1.5], ["refused", 2]],
    next: ["Which requests were converted?", "How do I convert a request?", "What does won mean?"],
    say: [
      "A request converts only once. If it's already won (or already linked to a customer), the database refuses a second conversion. Check Requests for its status, and look for the customer it became.",
      "Most often the request was converted already. If not, make sure you're still a platform admin and try again after a reload.",
      "Converting writes the customer and marks the request won in one go; it's refused if the request is already won. Refresh Requests and check.",
    ],
  },
  {
    id: "ts_assign_fails", group: "howto",
    keys: [["can not assign", 5], ["will not assign", 5], ["assign fail", 5], ["assign not work", 5], ["lot not in list", 4.5], ["not in picker", 4], ["assign", 1.5], ["fail", 1.5]],
    next: ["Lots without a customer", "How do I unassign a lot?", "How do I add a lot?"],
    say: [
      "The Assign a lot picker only offers lots with no customer. If the lot you want belongs to someone else, unassign it on their page first. A lot that was deleted or never created won't appear at all.",
      "Assigning is refused if the lot doesn't exist or the customer is gone. Reload, check Lots without a customer, and try again.",
      "Missing from the picker? It's probably already assigned. Ask me \"who owns <lot>\" to find out.",
    ],
  },
  {
    id: "ts_import_rejected", group: "howto",
    keys: [["import reject", 5.5], ["row rejected", 5], ["row error", 5], ["import error", 5], ["import fail", 5], ["rejected", 3], ["import", 1.5], ["why error", 3], ["refused", 2], ["customer not found", -4]],
    next: ["Customer not found in import", "How do I import lots from CSV?", "Lots without a total size"],
    say: [
      "Each rejected row says why in the preview. The usual reasons: id isn't lowercase letters and numbers; totalSpots is missing or outside 1 to 5,000; only one of latitude and longitude is given; the customer name doesn't match exactly; an id appears twice; or the lot already belongs to another customer.",
      "Look at the reasons under each Error row. Missing totalSpots is the most common: rows without it are always refused. Fix those rows and paste them again.",
      "Rows fail the same checks as Add lot: valid lowercase id, a name up to 80 characters, totalSpots 1 to 5,000, both coordinates or none, and an existing customer. Rows that pass still import; the errors are skipped.",
    ],
  },
  {
    id: "ts_import_customer_not_found", group: "howto",
    keys: [["customer not found", 6], ["no customer called", 5], ["customer column", 4], ["did you mean", 3], ["customer name wrong", 4.5], ["import", 2], ["not found", 2], ["can not find customer", 4]],
    next: ["List customers", "How do I add a customer?", "Why are import rows rejected?"],
    say: [
      "The customer column must match an existing customer's name exactly, including spaces and capitals. The preview suggests the right one when only the case differs. If the customer doesn't exist yet, add it first.",
      "\"No customer is called …\" means the name in your CSV isn't a customer's exact name. Copy it from the Customers page, or create the customer, then paste again.",
      "Names are matched exactly, so \"harbor mall\" isn't \"Harbor Mall\". Ask me to list customers and copy the names from there.",
    ],
  },
  {
    id: "ts_numbers_wrong", group: "howto",
    keys: [["numbers wrong", 5], ["wrong number", 5], ["does not add up", 5], ["count wrong", 4.5], ["seems off", 4], ["incorrect", 3.5], ["wrong", 2], ["mismatch", 3.5]],
    next: ["Am I in Live or Simulation?", "Curbs not in a lot", "How do sites, lots and curbs link?"],
    say: [
      "First check the mode: Simulation and Live are separate sets. Then remember how things link: a curb counts for a customer only if its lot field names a lot, and that lot's siteId names the customer. Curbs not in a lot don't count for anyone.",
      "Most mismatches come from curbs that aren't in a lot, or lots without a customer. Ask me for \"curbs not in a lot\" and \"lots without a customer\".",
      "Numbers update live. If they look off, check Live vs Simulation, then look for loose curbs and unassigned lots: they're counted in totals but not under any customer.",
    ],
  },
  {
    id: "ts_sim_empty", group: "howto",
    keys: [["simulation empty", 5.5], ["no demo", 4], ["nothing in simulation", 5], ["empty", 2.5], ["simulation", 1], ["no simulated", 4]],
    next: ["How do I reload demo customers?", "How do I send a fake quote request?", "How do I switch Live/Simulation?"],
    say: [
      "The simulated lots and curbs come from the customer dashboard's Simulation page (Load fresh simulated data). Once they exist, go to Home here in Simulation and press Reload demo customers.",
      "Load simulated data on the dashboard first, then Reload demo customers on Home. That fills customers, requests and demo lot assignments.",
      "Empty simulation? Two steps: simulated data on the dashboard, then Reload demo customers here.",
    ],
  },
  {
    id: "ts_delete_blocked", group: "howto",
    keys: [["can not remove customer", 5.5], ["can not delete", 4.5], ["delete greyed", 5], ["delete disabled", 5], ["will not delete", 5], ["greyed out", 4], ["greyed", 2]],
    next: ["How do I unassign a lot?", "How do I delete a customer?", "Lots of a customer"],
    say: [
      "Delete customer stays disabled while any lot points to the customer. Unassign each of its lots on the same page, then delete.",
      "Some lots still belong to that customer. Unassign them first; the lots and curbs themselves stay.",
      "It's blocked on purpose, so no lot is left pointing at a customer that doesn't exist. Unassign the lots, then try again.",
    ],
  },
  {
    id: "ts_lot_id_taken", group: "howto",
    keys: [["id already exists", 5.5], ["id taken", 5], ["already exists", 4], ["duplicate lot", 4.5], ["lot id", 2]],
    next: ["What is a lot ID?", "How do I add a lot?", "How do I import lots from CSV?"],
    say: [
      "The lot ID is made from the name's letters and numbers, and IDs are unique. Another lot already has that ID: choose a different name.",
      "Two names like \"North Garage\" and \"north-garage\" give the same ID (northgarage). Pick a name that makes a new one.",
      "That ID is taken, maybe by a lot you haven't seen. Rename the new lot slightly.",
    ],
  },
  {
    id: "ts_curbs_missing", group: "howto",
    keys: [["no curb showing", 5], ["curb missing", 5], ["curb not showing", 5], ["where are curb", 4], ["lot has no curb", 4.5], ["missing", 2]],
    next: ["Curbs not in a lot", "Which customers have real curbs?", "How do sites, lots and curbs link?"],
    say: [
      "Curbs appear once the hardware reports in. Each curb then has to be put in a lot (the customer's manager does that in Setup on their dashboard). Until then it shows under curbs not in a lot.",
      "A lot only lists curbs whose lot field names it. Check \"curbs not in a lot\": they may be reporting but not placed yet.",
      "No curbs usually means none have reported yet, or they're not placed in that lot. The customer's manager places them.",
    ],
  },
];

export const EXPLAIN_INTENTS = [
  {
    id: "explain_admin_vs_manager", group: "explain",
    keys: [["platformadmin vs", 5], ["difference", 2], ["customer manager", 4], ["manager", 2.5], ["platformadmin", 1.5], ["who can see", 3], ["vs", 1.5], ["add", -2], ["remove", -2]],
    next: ["How do I add a platform admin?", "What does Live vs Simulation show?", "How do sites, lots and curbs link?"],
    say: [
      "Platform admins are Smart Wheel Stop staff: they use this console and see every customer, request and lot. A customer manager runs one customer's own dashboard (their team, LEDs and curbs) and never sees the console.",
      "Platform admin = us, across all customers, listed under platformAdmins. Customer manager = one customer's lead user, on their dashboard only.",
      "Two different worlds: platform admins work here on customers and requests; customer managers manage their own site and staff on the customer dashboard.",
    ],
  },
  {
    id: "explain_customer_status", group: "explain",
    keys: [["what does status mean", 5], ["status mean", 4.5], ["each status", 4], ["what is prospect", 4.5], ["what is paused", 4.5], ["what is active", 4], ["mean", 1.5], ["prospect", 1], ["paused", 1], ["request", -3]],
    next: ["Active vs prospect vs paused", "How do I change a customer's status?", "What does won mean?"],
    say: [
      "Prospect: we're talking, nothing signed. Active: a live customer. Paused: on hold for now. It's a label for our team; it doesn't change their data or access.",
      "A customer is a prospect until they sign, active while they're a customer, and paused if things are on hold.",
      "Three statuses: prospect (early), active (up and running), paused (on hold). Converted requests start as prospects.",
    ],
  },
  {
    id: "explain_won", group: "explain",
    keys: [["what does won mean", 5.5], ["won mean", 5], ["what is won", 4.5], ["what is converted", 4.5], ["won", 2], ["mean", 1.5], ["which", -2]],
    next: ["Which requests were converted?", "How do I convert a request?", "What do request statuses mean?"],
    say: [
      "Won means the request was converted into a customer. It's set only by Convert to customer, it's final, and the request keeps a link to the customer it became.",
      "A won request became a customer. You can't pick Won by hand, and a won request can't be converted again.",
      "Won = converted. The request and the new customer point at each other.",
    ],
  },
  {
    id: "explain_request_status", group: "explain",
    keys: [["request status mean", 5], ["what is contacted", 4.5], ["what is closed", 4.5], ["request status", 2.5], ["mean", 1.5], ["contacted", 1], ["closed", 1], ["by status", -4]],
    next: ["Requests by status", "How do I mark a request contacted?", "What does won mean?"],
    say: [
      "New: nobody has handled it. Contacted: someone got in touch. Closed: it went nowhere. Won: it became a customer.",
      "Requests go new → contacted → won or closed. Only Convert to customer sets won.",
      "Four statuses: new, contacted, closed and won. The first three are picked on Requests; won comes from converting.",
    ],
  },
  {
    id: "explain_live_vs_sim", group: "explain",
    keys: [["live vs simulation", 5], ["what is simulation", 4.5], ["simulation mean", 4.5], ["difference", 2], ["live", 1.5], ["simulation", 1.5], ["what is live", 4], ["show", 0.5], ["switch", -3], ["how do i", -3], ["which mode", -3], ["empty", -3]],
    next: ["How do I switch Live/Simulation?", "Am I in Live or Simulation?", "How do I reload demo customers?"],
    say: [
      "Live shows the real customers, quote requests, lots and hardware. Simulation shows a separate practice set: demo customers, fake requests and simulated curbs. Nothing in one touches the other.",
      "Live = real data. Simulation = demo data kept apart, for practice and demos. The Data source switch picks which one you see.",
      "Simulation is a sandbox: change anything there without affecting a real customer. Live is the real thing.",
    ],
  },
  {
    id: "explain_data_model", group: "explain",
    keys: [["how link", 4], ["how do customer lot curb", 5], ["connect", 2.5], ["relationship", 4], ["siteid", 4.5], ["structure", 3], ["data model", 5], ["link", 1.5], ["how work", 2]],
    next: ["Lots without a customer", "Curbs not in a lot", "Numbers look wrong"],
    say: [
      "Customer (a site) → lot → curb. A lot belongs to a customer through its siteId; a curb belongs to a lot through its lot field. So a curb counts for a customer only when both links are set.",
      "Each lot has a siteId pointing at its customer, and each curb has a lot field pointing at its lot. One customer has many lots; one lot has many curbs.",
      "Sites are customers. Lots point up to a site (siteId), curbs point up to a lot (lot). Unassigned lots and loose curbs sit outside any customer.",
    ],
  },
  {
    id: "explain_customer_types", group: "explain",
    keys: [["customer types", 3], ["what types", 3.5], ["type mean", 4], ["which types", 3.5], ["types are there", 4], ["by type", -4]],
    next: ["Customers by type", "What does each status mean?", "List customers"],
    say: ["A customer is a campus, mall, garage, hotel or other. The type is a label for our team.", "Five types: campus, mall, garage, hotel and other. Converting a request picks one from the site type they asked about.", "Types: campus, mall, garage, hotel, other. They don't change how anything works."],
  },
  {
    id: "explain_offline", group: "explain",
    keys: [["what does offline mean", 5.5], ["offline mean", 5], ["what is offline", 4.5], ["why offline", 3.5], ["mean", 1], ["which", -3]],
    next: ["Which curbs are offline?", "Offline curbs by customer", "What counts as a low battery?"],
    say: ["Offline means the curb isn't reporting: its online flag is off. Often a flat battery, interference or a blocked antenna.", "An offline curb has stopped talking to its Receiver, so its spot can't be counted.", "Not reporting = offline. The customer's operators see the same thing on their dashboard."],
  },
  {
    id: "explain_low_battery", group: "explain",
    keys: [["what is low battery", 8], ["low battery mean", 5], ["counts as low", 5], ["battery threshold", 4.5], ["threshold", 2], ["how low", 3]],
    next: ["Show low batteries", "Low batteries by customer", "What does offline mean?"],
    say: ["Here a battery is low below 20%, the default alert level. Each customer can set their own level on their dashboard.", "Under 20% counts as low in the console.", "Low means below 20%. Curbs without a battery reading are never counted as low."],
  },
  {
    id: "explain_console", group: "explain",
    keys: [["what is console", 5], ["what is this", 3.5], ["company console", 4.5], ["console for", 4], ["purpose", 3], ["what is page", 2]],
    next: ["What can you do?", "Platform admin vs customer manager", "Summary"],
    say: ["This is the company console: where Smart Wheel Stop staff look after customers, quote requests, lots and deployments. Customers never see it.", "The console is our own app, separate from the customer dashboard: customers, requests, lots, imports and deployments.", "It's the vendor side: who our customers are, what they've asked for, and where the hardware is."],
  },
  {
    id: "explain_lot_id", group: "explain",
    keys: [["what is lot id", 5], ["lot id", 3.5], ["id mean", 3.5], ["id", 1], ["taken", -3], ["exists", -3]],
    next: ["How do I add a lot?", "How do I import lots from CSV?", "Lot ID already exists"],
    say: ["A lot's ID is its key in the database: lowercase letters and numbers only. Add lot makes it from the name, and it never changes.", "Lot IDs look like lot14 or northgarage. They're fixed once the lot exists; the name can change.", "The ID is permanent and unique. In an import, the id column is it."],
  },
  {
    id: "explain_open_spots", group: "explain",
    keys: [["open spots", 4.5], ["openspots", 5], ["why can not change open", 5], ["free spots", 3]],
    next: ["How do I edit a lot?", "How do sites, lots and curbs link?", "Biggest lot"],
    say: ["Open spots belong to the hardware: they start equal to total spots when a lot is created, then the curbs keep them up to date. Nobody edits them here.", "A lot's openSpots is set once, at creation, then reported by the curbs.", "We set total spots; the curbs report open spots."],
  },
  {
    id: "explain_curb", group: "explain",
    keys: [["what is curb", 5], ["what is wheel stop", 5], ["curb mean", 4], ["how do curb work", 4.5]],
    next: ["Total curbs online", "What does offline mean?", "How do sites, lots and curbs link?"],
    say: ["A curb is a smart wheel stop: it sits at the front of a parking spot, senses whether a car is there, and has an LED. It reports to a Receiver, which writes to the database.", "Each curb watches one spot and reports free or occupied, plus its battery.", "Curbs are the hardware: one per spot, with a sensor, an LED and a battery."],
  },
  {
    id: "history_not_recorded", group: "explain",
    keys: [["yesterday", 3.5], ["last week", 3.5], ["last month", 3.5], ["trend", 3.5], ["over time", 3.5], ["history", 3.5], ["growth", 3], ["compared to", 2.5], ["busier than", 3], ["typical", 2.5]],
    next: ["Summary", "How many requests this week?", "Newest customer"],
    say: [
      "The console doesn't keep history: I only see the data as it is right now, so I can't compare with yesterday or last month. Requests and customers do carry their dates, so ask me about requests this week.",
      "I can't do trends here: nothing in the console records past values. What I can tell you is today's picture, and when each request or customer was created.",
      "No recorded history in the console, so no before-and-after. Try \"requests this week\" or \"newest customer\" instead.",
    ],
  },
];
