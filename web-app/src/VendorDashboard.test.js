import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VendorDashboard from "./VendorDashboard";
import VendorJobDetail from "./VendorJobDetail";

jest.mock("./TicketComments", () => () => <div data-testid="comments" />);

const job = (over = {}) => ({
  id: "t1", title: "HVAC issue", job_title: "HVAC Repair — Unit 102, Oak Residences",
  description: "AC not cooling", category: "HVAC", priority: "normal",
  status: "quote_requested", status_label: "Quote Requested",
  property_name: "Oak Residences", unit_number: "102", quote_amount: null,
  can_submit_quote: true, created_at: "2026-09-29T10:00:00", updated_at: "2026-09-29T10:00:00",
  ...over,
});

function mockFetch(routes) {
  global.fetch = jest.fn(async (url, opts = {}) => {
    const key = `${opts.method || "GET"} ${url.replace("http://localhost:8000", "")}`;
    const h = routes[key];
    if (!h) throw new Error(`unmocked ${key}`);
    const { status = 200, body } = typeof h === "function" ? h(opts) : h;
    return { ok: status < 400, status, json: async () => body };
  });
}

const renderApp = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/vendor/dashboard" element={<VendorDashboard />} />
      <Route path="/vendor/jobs/:id" element={<VendorJobDetail />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("token", "tok");
  localStorage.setItem("display_name", "vendor");
});

test("lists jobs grouped by need, sends bearer token, shows vendor name", async () => {
  mockFetch({
    "GET /vendor/jobs": { body: { vendor: { id: "v", name: "Raj Electricals" }, reason: null, jobs: [
      job(),
      job({ id: "t2", job_title: "Roof job", status: "quote_received", status_label: "Quote Received", can_submit_quote: false, quote_amount: 4500 }),
      job({ id: "t3", job_title: "Old job", status: "completed", status_label: "Completed", can_submit_quote: false }),
    ] } },
  });
  renderApp("/vendor/dashboard");

  expect(await screen.findByText("Welcome, Raj Electricals")).toBeInTheDocument();
  expect(screen.getByText("Needs your quote")).toBeInTheDocument();
  expect(screen.getByText("In progress")).toBeInTheDocument();
  expect(screen.getByText("Completed", { selector: "section h3" })).toBeInTheDocument();
  expect(screen.getByText("Upload your quote →")).toBeInTheDocument();
  expect(screen.getByText("Quote: 4,500")).toBeInTheDocument();
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
});

test("clicking a job opens its detail page", async () => {
  mockFetch({
    "GET /vendor/jobs": { body: { vendor: { name: "Raj" }, reason: null, jobs: [job()] } },
    "GET /vendor/jobs/t1": { body: { ...job(), property_address: "12 Oak St", photos: [], quotes: [], timeline: [], pm: { name: "Priya", phone: "+91 90000" } } },
  });
  renderApp("/vendor/dashboard");
  fireEvent.click(await screen.findByRole("button", { name: /Open job: HVAC Repair/ }));
  expect(await screen.findByText(/12 Oak St/)).toBeInTheDocument();
  expect(screen.getByText("Priya")).toBeInTheDocument();
  expect(screen.getByTestId("comments")).toBeInTheDocument();
});

test.each([
  ["no_vendor_profile", /isn't linked to a vendor profile/],
  ["vendor_inactive", /profile is inactive/],
  [null, /No jobs assigned yet/],
])("empty state for reason=%s", async (reason, text) => {
  mockFetch({ "GET /vendor/jobs": { body: { vendor: null, jobs: [], reason } } });
  renderApp("/vendor/dashboard");
  expect(await screen.findByText(text)).toBeInTheDocument();
});

test("API failure shows an error with retry, not a fake empty list", async () => {
  let calls = 0;
  mockFetch({ "GET /vendor/jobs": () => (++calls === 1
    ? { status: 500, body: { detail: "boom" } }
    : { body: { vendor: { name: "Raj" }, reason: null, jobs: [job()] } }) });
  renderApp("/vendor/dashboard");
  expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  expect(screen.queryByText(/No jobs assigned yet/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Try again"));
  expect(await screen.findByText("HVAC Repair — Unit 102, Oak Residences")).toBeInTheDocument();
});

describe("quote upload on the job page", () => {
  const detail = (over = {}) => ({ ...job(), property_address: "12 Oak St", photos: [], quotes: [], timeline: [{ status: "open", at: "2026-09-29T09:00:00" }], pm: { name: null, phone: null }, ...over });
  const pdf = new File(["%PDF-1.4"], "quote.pdf", { type: "application/pdf" });

  test("uploads PDF + amount, then shows the submitted quote", async () => {
    let state = detail();
    let posted;
    mockFetch({
      "GET /vendor/jobs/t1": () => ({ body: state }),
      "POST /vendor/jobs/t1/quote": (opts) => {
        posted = opts.body;
        state = detail({ status: "quote_received", status_label: "Quote Received", can_submit_quote: false, quote_amount: 4500,
          quotes: [{ id: "q1", url: "http://x/quote.pdf", filename: "quote.pdf", uploaded_at: "2026-09-29T11:00:00" }] });
        return { status: 201, body: { ok: true } };
      },
    });
    renderApp("/vendor/jobs/t1");
    await screen.findByText("Upload your quote");

    const submit = screen.getByRole("button", { name: "Submit quote" });
    expect(submit).toBeDisabled();                       // no file yet
    fireEvent.change(screen.getByLabelText("Quote PDF"), { target: { files: [pdf] } });
    fireEvent.change(screen.getByLabelText(/Quote amount/), { target: { value: "4500" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit quote" }));

    expect(await screen.findByText(/Quote submitted/)).toBeInTheDocument();
    expect(posted.get("file").name).toBe("quote.pdf");
    expect(posted.get("quote_amount")).toBe("4500");
    expect(screen.getByText("Your submitted quote")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quote\.pdf/ })).toHaveAttribute("href", "http://x/quote.pdf");
    expect(screen.queryByRole("button", { name: "Submit quote" })).not.toBeInTheDocument();
  });

  test("rejects non-PDF and bad amount client-side; surfaces server errors", async () => {
    mockFetch({
      "GET /vendor/jobs/t1": { body: detail() },
      "POST /vendor/jobs/t1/quote": { status: 400, body: { detail: "Please upload your quote as a PDF" } },
    });
    renderApp("/vendor/jobs/t1");
    await screen.findByText("Upload your quote");

    fireEvent.change(screen.getByLabelText("Quote PDF"), { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose a PDF file.");

    fireEvent.change(screen.getByLabelText("Quote PDF"), { target: { files: [pdf] } });
    fireEvent.change(screen.getByLabelText(/Quote amount/), { target: { value: "-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit quote" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid amount");
    expect(global.fetch.mock.calls.some(([, o]) => o && o.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText(/Quote amount/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit quote" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Please upload your quote as a PDF"));
  });

  test("no upload form once a quote is submitted; 404 shows job-not-found", async () => {
    mockFetch({ "GET /vendor/jobs/t1": { body: detail({ status: "quote_received", can_submit_quote: false }) } });
    const { unmount } = renderApp("/vendor/jobs/t1");
    await screen.findByText("HVAC Repair — Unit 102, Oak Residences");
    expect(screen.queryByText("Upload your quote")).not.toBeInTheDocument();
    unmount();

    mockFetch({ "GET /vendor/jobs/t1": { status: 404, body: { detail: "Job not found" } } });
    renderApp("/vendor/jobs/t1");
    expect(await screen.findByText("Job not found")).toBeInTheDocument();
  });
});
