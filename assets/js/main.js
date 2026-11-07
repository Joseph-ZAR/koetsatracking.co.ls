const toggle=document.querySelector('.menu-toggle');const nav=document.querySelector('.main-nav');if(toggle&&nav){toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});}const year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();

// Koetsa package calculator and customer enquiry form
(() => {
  const packages = {
    m1500: {name:"M1500 — Track & Trace", setup:800, monthly:99},
    m2500: {name:"M2500 — Security & Control", setup:1200, monthly:120},
    m3000: {name:"M3000 — Fleet & Driver Intelligence", setup:1300, monthly:130},
    m3500: {name:"M3500 — Premium Recovery & Response", setup:1500, monthly:150}
  };
  const money = n => "M" + Number(n).toLocaleString("en-US");
  const calcPackage = document.getElementById("calc-package");
  const paymentPlan = document.getElementById("payment-plan");
  const appPackage = document.getElementById("application-package");
  const appPayment = document.getElementById("application-payment");
  const summary = document.getElementById("application-summary");

  function updateCalculator() {
    if (!calcPackage || !paymentPlan) return;
    const p = packages[calcPackage.value];
    const full = p.setup + p.monthly * 24;
    const upfront = paymentPlan.value === "upfront";
    document.getElementById("result-package").textContent = p.name;
    document.getElementById("result-setup").textContent = money(p.setup);
    document.getElementById("result-monthly").textContent = money(p.monthly) + " × 24";
    document.getElementById("result-total").textContent = money(full);
    document.getElementById("total-label").textContent = upfront ? "Amount payable upfront" : "Total over 24 months";
    document.getElementById("payment-explanation").textContent = upfront
      ? "Pay " + money(p.setup) + " installation + administration and all 24 monthly subscriptions together."
      : "Pay " + money(p.setup) + " once-off, followed by 24 monthly payments of " + money(p.monthly) + ".";
    if (appPackage) appPackage.value = calcPackage.value;
    if (appPayment) appPayment.value = paymentPlan.value;
    updateApplicationSummary();
  }
  function updateApplicationSummary() {
    if (!summary || !appPackage || !appPayment) return;
    const p = packages[appPackage.value];
    const plan = appPayment.value === "upfront" ? "Full 24-month upfront payment" : "Monthly subscription";
    summary.textContent = "Selected: " + p.name + " · " + plan + " · 24-month contract · " +
      (appPayment.value === "upfront" ? money(p.setup + p.monthly*24) + " payable upfront." :
      money(p.setup) + " once-off + " + money(p.monthly) + " per month.");
  }
  if (calcPackage) calcPackage.addEventListener("change", updateCalculator);
  if (paymentPlan) paymentPlan.addEventListener("change", updateCalculator);
  if (appPackage) appPackage.addEventListener("change", updateApplicationSummary);
  if (appPayment) appPayment.addEventListener("change", updateApplicationSummary);

  document.querySelectorAll(".package-select").forEach(btn => btn.addEventListener("click", () => {
    if (calcPackage) calcPackage.value = btn.dataset.package;
    if (appPackage) appPackage.value = btn.dataset.package;
    updateCalculator();
    document.getElementById("package-calculator")?.scrollIntoView({behavior:"smooth"});
  }));

  const form = document.getElementById("application-form");
  if (form) form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const p = packages[data.get("package")];
    const isUpfront = data.get("payment") === "upfront";
    const total = p.setup + p.monthly * 24;
    const payload = {
      name:data.get("name"), phone:data.get("phone"), email:data.get("email"),
      town:data.get("address"), address:data.get("address"), package:data.get("package"),
      payment:data.get("payment"), vehicleCount:data.get("vehicleCount"), vehicle:data.get("vehicle"),
      vin:data.get("vin"), location:data.get("location"), date:data.get("date"),
      notes:data.get("notes"), consent:document.getElementById("contract-consent").checked,
      website:data.get("website") || ""
    };
    let applicationRef = null;
    const status = document.getElementById("application-submit-status");
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    const waWindow = window.open("about:blank", "_blank");
    if (window.KOETSA_PUBLIC_CONFIG?.supabaseUrl && window.KOETSA_PUBLIC_CONFIG?.supabaseAnonKey && window.supabase) {
      try {
        const client = window.supabase.createClient(window.KOETSA_PUBLIC_CONFIG.supabaseUrl, window.KOETSA_PUBLIC_CONFIG.supabaseAnonKey);
        const {data:result,error} = await client.rpc("submit_koetsa_application", {p_payload:payload});
        if (error) throw error;
        applicationRef = result?.application_ref || null;
        if (status) status.textContent = "Application saved securely. Reference: " + (applicationRef || "received") + ". Opening WhatsApp…";
      } catch (err) {
        if (status) status.textContent = "We could not save your application to the secure system. You can still send the enquiry by WhatsApp; Koetsa will need to register it manually.";
      }
    } else if (status) {
      status.textContent = "Secure application storage is not configured yet. This will send an enquiry by WhatsApp only; it will not create a database record.";
    }
    const message = [
      "KOETSA TRACKING SYSTEMS — CUSTOMER APPLICATION",
      ...(applicationRef ? ["Application reference: " + applicationRef] : []), "",
      "CUSTOMER DETAILS", "Full name: " + data.get("name"),
      "Phone / WhatsApp: " + data.get("phone"),
      "Email: " + (data.get("email") || "Not supplied"),
      "Town / address: " + (data.get("address") || "Not supplied"), "",
      "PACKAGE & PAYMENT", "Package: " + p.name,
      "Payment option: " + (isUpfront ? "Full 24-month amount upfront" : "Monthly subscription for 24 months"),
      "Once-off installation + administration: " + money(p.setup),
      "Monthly subscription: " + money(p.monthly), "24-month total: " + money(total),
      "Contract term: 24 months", "", "VEHICLE / INSTALLATION",
      "Number of vehicles: " + data.get("vehicleCount"),
      "Vehicle make, model and registration: " + data.get("vehicle"),
      "VIN / chassis: " + (data.get("vin") || "Not supplied"),
      "Preferred installation location: " + (data.get("location") || "Not supplied"),
      "Preferred installation date: " + (data.get("date") || "Not specified"),
      "Additional vehicles / notes: " + (data.get("notes") || "None"), "",
      "I acknowledge the 24-month contract and agree that Koetsa may contact me about this application."
    ].join("\n");
    const waUrl = "https://wa.me/26653430023?text=" + encodeURIComponent(message);
    if (submitButton) submitButton.disabled = false;
    if (waWindow) { waWindow.opener = null; waWindow.location.href = waUrl; }
    else window.location.href = waUrl;
  });
  updateCalculator();
})();
