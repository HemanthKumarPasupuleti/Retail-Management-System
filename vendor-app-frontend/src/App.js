import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:8080";

function App() {
  const [vendors, setVendors] = useState([]);
  const [pos, setPos] = useState([]);
  const [activeTab, setActiveTab] = useState("vendors");
  const [vendorForm, setVendorForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });
  const [editingVendorId, setEditingVendorId] = useState(null);

  const [poForm, setPoForm] = useState({
    id: null,
    po: "",
    amount: "",
    vendor: "",
    status: "Open",
  });
  const [editingPoId, setEditingPoId] = useState(null);

  // Chat bot state
  const [chatMessages, setChatMessages] = useState([
    { role: "bot", text: "Hi! Ask me about vendors or purchase orders." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const vendorOptions = useMemo(
    () => vendors.map((v) => ({ value: v.id, label: v.name })),
    [vendors]
  );

  useEffect(() => {
    loadVendors();
    loadPOs();
  }, []);

  const loadVendors = async () => {
    try {
      const res = await fetch(`${API_URL}/vendors`);
      const data = await res.json();
      setVendors(data);
    } catch (err) {
      console.error("Failed to load vendors", err);
    }
  };

  const loadPOs = async () => {
    try {
      const res = await fetch(`${API_URL}/pos`);
      const data = await res.json();
      setPos(data);
    } catch (err) {
      console.error("Failed to load POs", err);
    }
  };

  const resetVendorForm = () => {
    setVendorForm({ name: "", address: "", phone: "", email: "" });
    setEditingVendorId(null);
  };

  const resetPoForm = () => {
    setPoForm({ id: null, po: "", amount: "", vendor: "", status: "Open" });
    setEditingPoId(null);
  };

  const handleVendorSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...vendorForm };
    const isEdit = !!editingVendorId;
    const url = isEdit
      ? `${API_URL}/vendors/${editingVendorId}`
      : `${API_URL}/vendors`;

    try {
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (isEdit) {
          setVendors((prev) =>
            prev.map((v) => (v.id === editingVendorId ? data : v))
          );
        } else {
          setVendors((prev) => [...prev, data]);
        }
        resetVendorForm();
      } else {
        console.error("Vendor save failed", data);
      }
    } catch (err) {
      console.error("Vendor save failed", err);
    }
  };

  const startEditVendor = (vendor) => {
    setVendorForm({
      name: vendor.name || "",
      address: vendor.address || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
    });
    setEditingVendorId(vendor.id);
  };

  const deleteVendor = async (id) => {
    if (!window.confirm("Delete this vendor?")) return;
    try {
      const res = await fetch(`${API_URL}/vendors/${id}`, { method: "DELETE" });
      if (res.ok) {
        setVendors((prev) => prev.filter((v) => v.id !== id));
      }
    } catch (err) {
      console.error("Delete vendor failed", err);
    }
  };

  const handlePoSubmit = async (e) => {
    e.preventDefault();
    const isEdit = !!editingPoId;
    const payload = {
      po: Number(poForm.po || 0),
      amount: Number(poForm.amount || 0),
      vendor: poForm.vendor,
      status: poForm.status || "Open",
    };

    const url = isEdit
      ? `${API_URL}/pos/${editingPoId}/revise`
      : `${API_URL}/pos`;

    try {
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (isEdit) {
          setPos((prev) =>
            prev.map((p) => (p.id === editingPoId ? { ...p, ...payload, id: editingPoId } : p))
          );
        } else {
          setPos((prev) => [...prev, data]);
        }
        resetPoForm();
      } else {
        console.error("PO save failed", data);
      }
    } catch (err) {
      console.error("PO save failed", err);
    }
  };

  const startEditPo = (po) => {
    setPoForm({
      id: po.id,
      po: po.po,
      amount: po.amount,
      vendor: po.vendor || "",
      status: po.status || "Open",
    });
    setEditingPoId(po.id);
  };

  const handleSendChat = async (e) => {
    if (e) e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const userMsg = { role: "user", text: trimmed };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsBotTyping(true);

    const t = trimmed.toLowerCase();

    // Greetings
    if (/^(hi|hello|hey|good\s+morning|good\s+afternoon|good\s+evening)\b/.test(t)) {
      setTimeout(() => {
        setChatMessages((prev) => [...prev, { role: "bot", text: "Hello! How can I help you today?" }]);
        setIsBotTyping(false);
      }, 400);
      return;
    }

    // Create PO command: try to parse inline details
    const createRegex = /(create|add)\s+(?:a\s+)?(?:po|purchase order)(?:\s+#?(\d+))?(?:.*amount\s+([0-9]+(?:\.[0-9]+)?))?(?:.*vendor\s+([\w\s\-\.]+))?/i;
    const deleteRegex = /(delete|remove)\s+(?:po|purchase order)(?:\s+#?(\d+))?/i;

    const createMatch = trimmed.match(createRegex);
    const deleteMatch = trimmed.match(deleteRegex);

    if (createMatch && (createMatch[2] || createMatch[3] || createMatch[4])) {
      // We have at least some details; attempt to create PO
      const poNum = createMatch[2] ? Number(createMatch[2]) : undefined;
      const amount = createMatch[3] ? Number(createMatch[3]) : 0;
      const vendorName = createMatch[4] ? createMatch[4].trim() : "";

      const payload = { po: poNum || 0, amount: amount || 0, vendor: vendorName || "", status: "Open" };
      try {
        const res = await fetch(`${API_URL}/pos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setPos((prev) => [data, ...prev]);
          setChatMessages((prev) => [...prev, { role: "bot", text: `PO created successfully: #${data.po} (id ${data.id})` }]);
        } else {
          const err = await res.text();
          setChatMessages((prev) => [...prev, { role: "bot", text: `Failed to create PO: ${err}` }]);
        }
      } catch (err) {
        setChatMessages((prev) => [...prev, { role: "bot", text: `Error creating PO: ${err.message}` }]);
      } finally {
        setIsBotTyping(false);
      }
      return;
    }

    if (deleteMatch && deleteMatch[2]) {
      const poNumber = deleteMatch[2];
      // find PO by po number
      const found = pos.find((p) => String(p.po) === String(poNumber));
      if (!found) {
        setTimeout(() => {
          setChatMessages((prev) => [...prev, { role: "bot", text: `No PO found with number ${poNumber}.` }]);
          setIsBotTyping(false);
        }, 400);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/pos/${found.id}`, { method: "DELETE" });
        if (res.ok) {
          setPos((prev) => prev.filter((p) => p.id !== found.id));
          setChatMessages((prev) => [...prev, { role: "bot", text: `PO #${poNumber} deleted.` }]);
        } else {
          const err = await res.text();
          setChatMessages((prev) => [...prev, { role: "bot", text: `Failed to delete PO: ${err}` }]);
        }
      } catch (err) {
        setChatMessages((prev) => [...prev, { role: "bot", text: `Error deleting PO: ${err.message}` }]);
      } finally {
        setIsBotTyping(false);
      }
      return;
    }

    // Default informational reply
    setTimeout(() => {
      const reply = getBotReply(trimmed, vendors, pos);
      setChatMessages((prev) => [...prev, { role: "bot", text: reply }]);
      setIsBotTyping(false);
    }, 400);
  };

  const getBotReply = (text, vendorList, poList) => {
    const t = text.toLowerCase();
    const isHow = t.includes("how");
    const mentionsPO = t.includes("po") || t.includes("purchase order");

    if (isHow && mentionsPO && t.includes("add")) {
      return "To add a PO: go to the Purchase Orders tab, enter PO Number, Amount, pick Vendor from the dropdown, choose Status, then click Add PO. The record saves to purchase_orders.";
    }
    if (isHow && mentionsPO && (t.includes("edit") || t.includes("update") || t.includes("revise"))) {
      return "To edit a PO: in the Purchase Orders tab, click Edit on the row, change the fields, then click Save PO.";
    }
    if (isHow && mentionsPO && (t.includes("delete") || t.includes("remove"))) {
      return "To delete a PO: in the Purchase Orders tab, click Delete on the row. It will remove the record from purchase_orders.";
    }

    if (t.includes("vendor")) {
      if (!vendorList.length) return "You have no vendors yet. Add one from the Vendors tab.";
      const names = vendorList.slice(0, 3).map((v) => v.name).join(", ");
      return `You have ${vendorList.length} vendor(s). Recent: ${names || "N/A"}.`;
    }
    if (mentionsPO) {
      if (!poList.length) return "No purchase orders yet. Add one from the Purchase Orders tab.";
      const recent = poList.slice(0, 3).map((p) => `#${p.po} (${p.status})`).join(", ");
      return `You have ${poList.length} POs. Recent: ${recent}.`;
    }
    if (t.includes("help") || t.includes("how")) {
      return "Use the tabs above: Vendors to add/edit/delete vendors; Purchase Orders to manage POs. Each row has Edit/Delete. Status can be Open/Released/Closed/Archived.";
    }
    return "I can help with vendors and purchase orders. Try asking: “How do I add a PO?” or “How many vendors do I have?”";
  };

  const archivePo = async (id) => {
    try {
      const res = await fetch(`${API_URL}/pos/${id}/archive`, { method: "PUT" });
      if (res.ok) {
        setPos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "Archived" } : p))
        );
      }
    } catch (err) {
      console.error("Archive PO failed", err);
    }
  };

  const deletePo = async (id) => {
    if (!window.confirm("Delete this PO?")) return;
    try {
      const res = await fetch(`${API_URL}/pos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPos((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Delete PO failed", err);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Vendor & Purchase Order Control Center</p>
          <h1>Retail Management System</h1>
          <p className="lede">
            Manage Vendors and Purchase Orders with ease. 
          </p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={activeTab === "vendors" ? "tab active" : "tab"}
          onClick={() => setActiveTab("vendors")}
        >
          Vendors
        </button>
        <button
          className={activeTab === "pos" ? "tab active" : "tab"}
          onClick={() => setActiveTab("pos")}
        >
          Purchase Orders
        </button>
        {/* Assistant moved to floating icon (bottom-right) */}
      </div>

      <main className="content-grid">
        {activeTab === "vendors" && (
          <section className="card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Vendors</p>
                <h2>{editingVendorId ? "Edit Vendor" : "Add Vendor"}</h2>
              </div>
              {editingVendorId && (
                <button className="ghost-btn" onClick={resetVendorForm}>
                  Cancel edit
                </button>
              )}
            </div>
            <form className="form" onSubmit={handleVendorSubmit}>
              <div className="form-grid">
                <label>
                  <span>Name</span>
                  <input
                    name="name"
                    value={vendorForm.name}
                    onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                    required
                    placeholder="ex: Hemanth Supplies"
                  />
                </label>
                <label>
                  <span>Address</span>
                  <input
                    name="address"
                    value={vendorForm.address}
                    onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                    placeholder="ex: 123 Main Street, Anytown"
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    name="phone"
                    value={vendorForm.phone}
                    onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    name="email"
                    value={vendorForm.email}
                    onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                    placeholder="contact@vendor.com"
                  />
                </label>
              </div>
              <div className="actions">
                <button type="submit" className="primary">
                  {editingVendorId ? "Save Changes" : "Add Vendor"}
                </button>
              </div>
            </form>

            <div className="table-wrapper">
              <div className="section-head compact">
                <h3>Vendor Directory</h3>
                <span className="count-chip">{vendors.length} vendors</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v) => (
                    <tr key={v.id}>
                      <td>{v.name}</td>
                      <td>{v.address}</td>
                      <td>{v.phone}</td>
                      <td>{v.email}</td>
                      <td className="table-actions">
                        <button className="ghost-btn" onClick={() => startEditVendor(v)}>
                          Edit
                        </button>
                        <button className="danger-btn" onClick={() => deleteVendor(v.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "pos" && (
          <section className="card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Purchase Orders</p>
                <h2>{editingPoId ? "Edit PO" : "Add PO"}</h2>
              </div>
              {editingPoId && (
                <button className="ghost-btn" onClick={resetPoForm}>
                  Cancel edit
                </button>
              )}
            </div>
            <form className="form" onSubmit={handlePoSubmit}>
              <div className="form-grid three">
                <label>
                  <span>PO Number</span>
                  <input
                    name="po"
                    type="number"
                    value={poForm.po}
                    onChange={(e) => setPoForm({ ...poForm, po: e.target.value })}
                    required
                    placeholder="1001"
                  />
                </label>
                <label>
                  <span>Amount</span>
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    value={poForm.amount}
                    onChange={(e) => setPoForm({ ...poForm, amount: e.target.value })}
                    placeholder="1000.00"
                    required
                  />
                </label>
                <label>
                  <span>Vendor</span>
                  <select
                    name="vendor"
                    value={poForm.vendor}
                    onChange={(e) => setPoForm({ ...poForm, vendor: e.target.value })}
                    required
                  >
                    <option value="">Select vendor</option>
                    {vendorOptions.map((opt) => (
                      <option key={opt.value} value={opt.label}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    name="status"
                    value={poForm.status}
                    onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}
                  >
                    <option value="Open">Open</option>
                    <option value="Released">Released</option>
                    <option value="Closed">Closed</option>
                    <option value="Archived">Archived</option>
                  </select>
                </label>
              </div>
              <div className="actions">
                <button type="submit" className="primary">
                  {editingPoId ? "Save PO" : "Add PO"}
                </button>
              </div>
            </form>

            <div className="table-wrapper">
              <div className="section-head compact">
                <h3>Purchase Orders</h3>
                <span className="count-chip">{pos.length} records</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>PO #</th>
                    <th>Vendor</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map((p) => {
                    return (
                      <tr key={p.id}>
                        <td>{p.po}</td>
                        <td>{p.vendor || "—"}</td>
                        <td>${Number(p.amount || 0).toLocaleString()}</td>
                        <td>
                          <span className={`pill status-${(p.status || "Open").toLowerCase()}`}>
                            {p.status || "Open"}
                          </span>
                        </td>
                        <td className="table-actions">
                          <button className="ghost-btn" onClick={() => startEditPo(p)}>
                            Edit
                          </button>
                          <button className="danger-btn" onClick={() => archivePo(p.id)}>
                            Archive
                          </button>
                          <button className="danger-btn" onClick={() => deletePo(p.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* Floating assistant button and panel */}
      {showChat && (
        <div className="assistant-panel card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Assistant</p>
              <h2>Help & Guidance</h2>
            </div>
            <div>
              <button className="ghost-btn" onClick={() => setShowChat(false)}>Close</button>
            </div>
          </div>

          <div className="chat-window">
            {chatMessages.map((m, idx) => (
              <div key={idx} className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>
                <span>{m.text}</span>
              </div>
            ))}
            {isBotTyping && <div className="chat-bubble bot typing">Typing...</div>}
          </div>

          <form className="chat-input-row" onSubmit={handleSendChat}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about vendors or POs..."
            />
            <button type="submit" className="primary">Send</button>
          </form>
        </div>
      )}

      <button className="assistant-fab" title="Assistant" onClick={() => setShowChat(true)}>
        💬
      </button>
      </main>
    </div>
  );
}

export default App;
