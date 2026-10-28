import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { useNow, formatAgo, formatExact } from "../units";
import { PageHeader, Card, Chips, EmptyState, Button, SearchInput } from "../components/ui";
import { EMPTY_SITE_FORM, SITE_STATUSES, createSite, sortedSites, summarize, typeLabel } from "./data";
import { LoadError, LoadingCard, SiteForm, SiteStatusBadge } from "./parts";

const HEADERS = ["Customer", "Type", "Status", "Lots", "Curbs", "Online", "Last seen"];

function Customers() {
  const { mode, data } = useOutletContext();
  const navigate = useNavigate();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { loaded, error, sites } = data;

  const head = (
    <PageHeader
      title="Customers"
      subtitle={mode === "sim" ? "Simulated customers and their lots" : "Every customer site and how its curbs are doing"}
      actions={!adding && loaded && !error && <Button variant="primary" icon="users" onClick={() => setAdding(true)}>New customer</Button>}
    />
  );
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) return <>{head}<div className="sws-page-body"><LoadingCard rows={4} /></div></>;

  const { siteStats } = summarize(data);
  const all = sortedSites(sites);
  const q = search.trim().toLowerCase();
  const searched = all.filter(([, s]) => !q || (s.name || "").toLowerCase().includes(q) || (s.contactName || "").toLowerCase().includes(q));
  const rows = searched.filter(([, s]) => filter === "all" || s.status === filter);
  const options = [{ id: "all", label: "All", count: searched.length }, ...SITE_STATUSES.map((s) => ({ ...s, count: searched.filter(([, x]) => x.status === s.id).length }))];

  return (
    <>
      {head}
      <div className="sws-page-body">
        {adding && (
          <Card title="New customer" subtitle="Lots are assigned on the customer's page once it's saved." delay={0} className="sws-narrow">
            <SiteForm
              idPrefix="new-site"
              initial={EMPTY_SITE_FORM}
              submitLabel="Save customer"
              busyLabel="Saving…"
              onSubmit={async (form) => { navigate(`/customers/${await createSite(form)}`); }}
              onCancel={() => setAdding(false)}
            />
          </Card>
        )}

        {all.length === 0 ? (
          <Card delay={60}>
            <EmptyState
              icon="users"
              title="No customers yet"
              action={!adding && <Button size="sm" onClick={() => setAdding(true)}>New customer</Button>}
            >
              {mode === "sim" ? "Reload the demo customers from Home, or add one here." : "Add one here, or convert a quote request on the Requests page."}
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="sws-enter" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}>
              <Chips label="Filter by status" options={options} value={filter} onChange={setFilter} />
              <SearchInput label="Search customers" placeholder="Search name or contact…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240, maxWidth: "100%" }} />
            </div>
            <Card body={false} delay={60}>
              <div className="cn-list">
                <p className="sws-sr-only" role="status">{rows.length} of {all.length} customers shown</p>
                <div role="table" aria-label="Customers" style={{ padding: "4px 6px" }}>
                  <div role="row" className="cn-row cn-cust cn-head">
                    {HEADERS.map((h) => <div key={h} role="columnheader" className="sws-th">{h}</div>)}
                  </div>
                  <div role="rowgroup" className="cn-body">
                    {rows.length === 0 && (
                      <EmptyState icon="search" title="No customers match" action={<Button size="sm" onClick={() => { setFilter("all"); setSearch(""); }}>Clear filters</Button>}>
                        Try another status or search.
                      </EmptyState>
                    )}
                    {rows.map(([id, s]) => {
                      const st = siteStats[id];
                      const ago = formatAgo(st.lastSeen, now);
                      return (
                        // The name is the link; it stretches over the row so the whole row is clickable.
                        <div key={id} role="row" className="cn-row cn-cust is-link">
                          <span role="cell" className="cn-c cn-name"><Link to={`/customers/${id}`} className="cn-row-link">{s.name}</Link></span>
                          <span role="cell" className="cn-c cn-dim">{typeLabel(s.type)}</span>
                          <span role="cell" className="cn-c"><SiteStatusBadge status={s.status} /></span>
                          <span role="cell" className="cn-c"><span className="cn-num">{st.lots.length}</span><span className="cn-key"> {st.lots.length === 1 ? "lot" : "lots"}</span></span>
                          <span role="cell" className="cn-c cn-num">{st.curbs}</span>
                          <span role="cell" className={`cn-c${st.curbs && st.online < st.curbs ? " cn-warn" : ""}`}>
                            {st.curbs ? <><span className="cn-num">{st.online} of {st.curbs}</span><span className="cn-key"> online</span></> : <span className="cn-dim">No curbs</span>}
                          </span>
                          <span role="cell" className={`cn-c${ago ? "" : " cn-dim"}`} title={formatExact(st.lastSeen)}>{ago ? <><span className="cn-key">Seen </span>{ago}</> : "Never seen"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

export default Customers;
