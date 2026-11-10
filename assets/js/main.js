const toggle=document.querySelector('.menu-toggle');const nav=document.querySelector('.main-nav');if(toggle&&nav){toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});}const year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();

// Koetsa package calculator and customer enquiry form
(() => {
  const packages = {
    m1500: {name:"M1500 — Track & Trace", packagePrice:1500, setup:800, monthly:75},
    m2500: {name:"M2500 — Security & Control", packagePrice:2500, setup:1200, monthly:120},
    m3000: {name:"M3000 — Fleet & Driver Intelligence", packagePrice:3000, setup:1300, monthly:130},
    m3500: {name:"M3500 — Premium Recovery & Response", packagePrice:3500, setup:1500, monthly:150}
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
    const upfront = paymentPlan.value === "upfront";
    const monthlyTotal = p.setup + p.monthly * 24;
    document.getElementById("result-package").textContent = p.name;
    document.getElementById("result-setup").textContent = upfront ? "M0 — no extra fees" : money(p.setup);
    document.getElementById("result-monthly").textContent = upfront ? "None" : money(p.monthly) + " × 24";
    document.getElementById("result-total").textContent = money(upfront ? p.packagePrice : monthlyTotal);
    document.getElementById("total-label").textContent = upfront ? "One-time package price" : "Total over 24 months";
    document.getElementById("payment-explanation").textContent = upfront
      ? "Pay " + money(p.packagePrice) + " once. No additional installation/admin fee or monthly subscription. This option excludes Koetsa office monitoring and coordinated SOS emergency response."
      : "Pay " + money(p.setup) + " once, followed by 24 monthly payments of " + money(p.monthly) + ". This is an ongoing service subscription with SOS response coordination while your account is active.";
    if (appPackage) appPackage.value = calcPackage.value;
    if (appPayment) appPayment.value = paymentPlan.value;
    updateApplicationSummary();
  }
  function updateApplicationSummary() {
    if (!summary || !appPackage || !appPayment) return;
    const p = packages[appPackage.value];
    const upfront = appPayment.value === "upfront";
    summary.textContent = "Selected: " + p.name + " · " +
      (upfront ? "Package price paid once: " + money(p.packagePrice) + ". No monthly service or Koetsa-coordinated SOS response." :
      money(p.setup) + " once-off + " + money(p.monthly) + "/month for 24 months (" + money(p.setup + p.monthly*24) + " total). Active monthly subscription includes SOS response coordination.");
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
    const total = isUpfront ? p.packagePrice : p.setup + p.monthly * 24;
    const payload = {
      name:data.get("name"), phone:data.get("phone"), email:data.get("email"),
      town:data.get("address"), address:data.get("address"), package:data.get("package"),
      payment:data.get("payment"), vehicleCount:data.get("vehicleCount"), vehicle:data.get("vehicle"),
      vin:data.get("vin"), location:data.get("location"), date:data.get("date"),
      notes:data.get("notes"), consent:document.getElementById("contract-consent").checked,
      website:data.get("website") || ""
    };
    let applicationRef = null;
    let emailNotificationsSent = false;
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
        if (!applicationRef) throw new Error("Application reference was not returned.");
        try {
          const { data: emailResult, error: emailError } = await client.functions.invoke("koetsa-application-email", {
            body: { applicationRef, applicant: payload, packageName: p.name, paymentLabel: isUpfront ? "Full package price upfront" : "Monthly protection subscription — 24 months", setupAmount: isUpfront ? 0 : p.setup, monthlyAmount: isUpfront ? 0 : p.monthly, totalAmount: total }
          });
          if (emailError || !emailResult?.success) throw emailError || new Error("Email service did not confirm delivery.");
          emailNotificationsSent = true;
          if (status) status.textContent = "Application received successfully. Reference: " + applicationRef + ". A confirmation has been emailed to you and a copy sent to Koetsa. Opening WhatsApp…";
        } catch (emailErr) {
          console.error("Koetsa application email notification failed:", emailErr);
          if (status) status.textContent = "Your application has been saved (Reference: " + applicationRef + ") and WhatsApp is opening. Email confirmation could not be sent automatically; please contact Koetsa if you do not receive a response.";
        }
      } catch (err) {
        console.error("Koetsa application save failed:", err);
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
      "Payment option: " + (isUpfront ? "Full package price upfront — no extra fees" : "Monthly protection subscription for 24 months"),
      "Once-off installation + administration: " + (isUpfront ? "M0 — no extra fee" : money(p.setup)),
      "Monthly subscription: " + (isUpfront ? "None" : money(p.monthly)),
      (isUpfront ? "Package price paid once: " : "Total over 24 months: ") + money(total),
      "Service distinction: " + (isUpfront ? "No Koetsa office monitoring or coordinated SOS emergency response." : "Ongoing service and SOS emergency-response coordination while the account is active."),
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
