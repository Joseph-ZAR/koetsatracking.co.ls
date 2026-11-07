#!/usr/bin/env python3
"""Apply the approved Koetsa pricing, SOS-response and imagery update.
Run from the root of the local koetsatracking.co.ls repository.
"""
from pathlib import Path
import re, shutil, sys

root = Path.cwd()
pricing_path = root / 'pricing.html'
js_path = root / 'assets/js/main.js'
if not pricing_path.exists() or not js_path.exists():
    sys.exit('Please run this script from the Koetsa repository root (the folder containing pricing.html).')

pricing = pricing_path.read_text(encoding='utf-8')
js = js_path.read_text(encoding='utf-8')

# Confirm this is the expected site version before changing anything.
required_html = ['M1500 PACKAGE', 'M2500 PACKAGE', 'M3000 PACKAGE', 'M3500 PACKAGE', 'id="package-calculator"', 'INCLUDED ACROSS ALL FOUR PACKAGES']
required_js = ['m1500: {name:"M1500 — Track & Trace", setup:800, monthly:99}', 'function updateCalculator()', 'function updateApplicationSummary()']
for item in required_html:
    if item not in pricing:
        sys.exit('Stopped safely: pricing.html did not contain expected marker: ' + item)
for item in required_js:
    if item not in js:
        sys.exit('Stopped safely: assets/js/main.js did not contain expected marker: ' + item)

# Add the two approved photographs to the existing assets folder.
assets = root / 'assets'
assets.mkdir(exist_ok=True)
image_sources = {
    'koetsa-operations-centre.jpg': Path(__file__).with_name('koetsa-operations-centre.jpg'),
    'koetsa-emergency-response.png': Path(__file__).with_name('koetsa-emergency-response.png'),
}
for dest, src in image_sources.items():
    if not src.exists():
        sys.exit(f'Missing image in update bundle: {src.name}')
    shutil.copy2(src, assets / dest)

# Pricing hero: explain what the subscription pays for.
pricing = pricing.replace(
    '<p>Clear once-off installation and administration fees, with a fixed monthly subscription over a 24-month contract.</p>',
    '<p>Choose a once-off package purchase for standard tracking, or an active monthly protection service backed by the Koetsa Operations Centre. Monthly subscribers pay for ongoing monitoring where applicable, SOS handling and coordinated emergency response — not simply instalments on equipment.</p>',
    1)

# Package cards: show both distinct prices, not a single monthly price.
card_replacements = [
('''<div class="package-price"><strong>M99</strong><span>/ month</span></div><p class="setup-fee">M800 once-off installation + administration</p>''',
 '''<div class="package-price"><strong>M1,500</strong><span>once-off package price</span></div><p class="setup-fee">Or M800 installation/admin + M75/month for 24 months (M2,600 total).</p>'''),
('''<div class="package-price"><strong>M120</strong><span>/ month</span></div><p class="setup-fee">M1,200 once-off installation + administration</p>''',
 '''<div class="package-price"><strong>M2,500</strong><span>once-off package price</span></div><p class="setup-fee">Or M1,200 installation/admin + M120/month for 24 months (M4,080 total).</p>'''),
('''<div class="package-price"><strong>M130</strong><span>/ month</span></div><p class="setup-fee">M1,300 once-off installation + administration</p>''',
 '''<div class="package-price"><strong>M3,000</strong><span>once-off package price</span></div><p class="setup-fee">Or M1,300 installation/admin + M130/month for 24 months (M4,420 total).</p>'''),
('''<div class="package-price"><strong>M150</strong><span>/ month</span></div><p class="setup-fee">M1,500 once-off installation + administration</p>''',
 '''<div class="package-price"><strong>M3,500</strong><span>once-off package price</span></div><p class="setup-fee">Or M1,500 installation/admin + M150/month for 24 months (M5,100 total).</p>'''),
]
for old, new in card_replacements:
    if old not in pricing:
        sys.exit('Stopped safely: expected package price card was not found: ' + old[:65])
    pricing = pricing.replace(old, new, 1)

# Replace the inaccurate shared-benefits block with real operations-centre and response information.
new_services = '''<section class="section soft">
  <div class="section-heading"><p class="eyebrow">THE VALUE OF A MONTHLY SUBSCRIPTION</p><h2>More than a tracking device. A team ready to respond.</h2><p>With an active monthly subscription, Koetsa provides an ongoing service relationship. Our Operations Centre receives SOS alerts, contacts the client, assesses the threat and coordinates the appropriate response.</p></div>
  <div class="operations-feature">
    <div><img src="assets/koetsa-operations-centre.jpg" alt="Koetsa operations-centre operator monitoring vehicle tracking systems" loading="lazy"></div>
    <div class="operations-copy"><p class="eyebrow">KOETSA OPERATIONS CENTRE</p><h3>Tracking and response managed by our team</h3><p>Security &amp; Control, Fleet &amp; Driver Intelligence and Premium Recovery &amp; Response include continuous vehicle monitoring by Koetsa. Track &amp; Trace is a customer-requested location service: call Koetsa when you need a location check. All four active monthly subscriptions include the SOS emergency-response protocol.</p><p><strong>Full upfront package purchases</strong> include the selected package's standard equipment and features, but do not include continuous monitoring by our office or Koetsa-coordinated panic-button emergency response.</p></div>
  </div>
  <div class="response-grid">
    <div class="response-copy"><p class="eyebrow">SOS PANIC-BUTTON PROTOCOL</p><h3>Press the button. We take it from there.</h3>
      <ol class="response-steps">
        <li><strong>Alert received</strong><span>The panic-button notification reaches our Operations Centre.</span></li>
        <li><strong>Client contacted</strong><span>Our team calls you to assess the threat and understand the situation.</span></li>
        <li><strong>Threat assessed</strong><span>We determine the appropriate escalation based on your location and circumstances.</span></li>
        <li><strong>Response teams coordinated</strong><span>Where appropriate, we alert SAPS, the Lesotho Defence Force (LDF), the Lesotho Mounted Police Service (LMPS), and/or our private armed recovery partners.</span></li>
        <li><strong>Follow-up and coordination</strong><span>We maintain communication as the response develops.</span></li>
      </ol>
      <p class="response-included">No additional Koetsa emergency-response activation fee for clients with an active monthly subscription.</p>
    </div>
    <div class="response-image"><img src="assets/koetsa-emergency-response.png" alt="Illustrative Koetsa-supported vehicle recovery scene with police and response vehicles" loading="lazy"><p class="image-caption">Illustrative response scenario. Actual response depends on the threat, location, jurisdiction and availability of the relevant authorities and response partners.</p></div>
  </div>
  <div class="notice"><strong>Important:</strong> Koetsa coordinates and initiates the agreed response protocol. Attendance by external authorities or response partners cannot be guaranteed and remains subject to their jurisdiction, operational procedures and availability.</div>
</section>

<section class="section">
  <div class="section-heading"><p class="eyebrow">SERVICE STATUS &amp; PAYMENT TERMS</p><h2>Keep your protection active.</h2><p>The monthly subscription keeps your tracking service and emergency-response eligibility active.</p></div>
  <div class="arrears-policy"><h3>More than two months in arrears</h3><p>If a monthly account remains unpaid for more than two months, Koetsa may deactivate the tracking device and suspend the associated subscription services. While the account is suspended, SOS notifications will not activate Koetsa's emergency-response protocol. Service and emergency-response eligibility are restored only after the account is brought fully up to date and Koetsa confirms reactivation.</p></div>
</section>'''
pattern = re.compile(r'<section class="section soft">\s*<div class="section-heading"><p class="eyebrow">INCLUDED ACROSS ALL FOUR PACKAGES</p>.*?</section>', re.S)
pricing, count = pattern.subn(new_services, pricing, count=1)
if count != 1:
    sys.exit('Stopped safely: could not locate the original shared-benefits section to replace.')

pricing = pricing.replace(
    '<div class="section-heading"><p class="eyebrow">YOUR 24-MONTH COST</p><h2>Choose how you want to pay.</h2><p>Both payment options provide the same package features and service benefits. There is no upfront-payment discount in this pricing schedule.</p></div>',
    '<div class="section-heading"><p class="eyebrow">TWO DISTINCT SERVICE OPTIONS</p><h2>Choose how you want to pay — and how you want to be supported.</h2><p>The upfront price buys the package without a monthly subscription. The monthly option pays for installation plus 24 months of ongoing service, monitoring where applicable and SOS emergency-response coordination.</p></div>', 1)
pricing = pricing.replace(
    '<select id="payment-plan"><option value="monthly">Monthly subscription for 24 months</option><option value="upfront">Pay the full 24-month amount upfront</option></select>',
    '<select id="payment-plan"><option value="monthly">Monthly protection subscription — 24 months</option><option value="upfront">Full package price upfront — no extra fees</option></select>', 1)
pricing = pricing.replace(
    '<div class="term-note"><strong>Contract term: 24 months</strong><span>Monthly option: pay the once-off installation + administration fee, then the monthly subscription for 24 months.</span><span>Upfront option: pay the once-off fee and all 24 monthly subscriptions together.</span></div>',
    '<div class="term-note"><strong>Two different service arrangements</strong><span><b>Full upfront:</b> pay only the package price once. No installation/admin add-on and no monthly subscription. Does not include Koetsa office monitoring or coordinated SOS emergency response.</span><span><b>Monthly:</b> pay the installation/admin fee once, then the monthly subscription for 24 months. This includes the ongoing service and SOS response protocol while the account is active.</span></div>', 1)
pricing = pricing.replace('<strong id="result-monthly">M99 × 24</strong>', '<strong id="result-monthly">M75 × 24</strong>', 1)
pricing = pricing.replace('<strong id="result-total">M3,176</strong>', '<strong id="result-total">M2,600</strong>', 1)
pricing = pricing.replace(
    '<option value="monthly">Monthly subscription — 24 months</option><option value="upfront">Full 24-month amount upfront</option>',
    '<option value="monthly">Monthly protection subscription — 24 months</option><option value="upfront">Full package price upfront — no extra fees</option>', 1)
pricing = pricing.replace(
    'I understand that the selected package is subject to a 24-month contract, and I agree that Koetsa may contact me about this application.',
    'I understand that the monthly option is a 24-month service subscription, that emergency-response eligibility requires an active account, and that arrears exceeding two months may result in device deactivation and suspension of emergency protocols. I agree that Koetsa may contact me about this application.', 1)

# JavaScript: package prices and calculator behaviour.
js = js.replace(
'''    m1500: {name:"M1500 — Track & Trace", setup:800, monthly:99},
    m2500: {name:"M2500 — Security & Control", setup:1200, monthly:120},
    m3000: {name:"M3000 — Fleet & Driver Intelligence", setup:1300, monthly:130},
    m3500: {name:"M3500 — Premium Recovery & Response", setup:1500, monthly:150}''',
'''    m1500: {name:"M1500 — Track & Trace", packagePrice:1500, setup:800, monthly:75},
    m2500: {name:"M2500 — Security & Control", packagePrice:2500, setup:1200, monthly:120},
    m3000: {name:"M3000 — Fleet & Driver Intelligence", packagePrice:3000, setup:1300, monthly:130},
    m3500: {name:"M3500 — Premium Recovery & Response", packagePrice:3500, setup:1500, monthly:150}''', 1)

old_calc = '''    const full = p.setup + p.monthly * 24;
    const upfront = paymentPlan.value === "upfront";
    document.getElementById("result-package").textContent = p.name;
    document.getElementById("result-setup").textContent = money(p.setup);
    document.getElementById("result-monthly").textContent = money(p.monthly) + " × 24";
    document.getElementById("result-total").textContent = money(full);
    document.getElementById("total-label").textContent = upfront ? "Amount payable upfront" : "Total over 24 months";
    document.getElementById("payment-explanation").textContent = upfront
      ? "Pay " + money(p.setup) + " installation + administration and all 24 monthly subscriptions together."
      : "Pay " + money(p.setup) + " once-off, followed by 24 monthly payments of " + money(p.monthly) + ".";'''
new_calc = '''    const upfront = paymentPlan.value === "upfront";
    const monthlyTotal = p.setup + p.monthly * 24;
    document.getElementById("result-package").textContent = p.name;
    document.getElementById("result-setup").textContent = upfront ? "M0 — no extra fees" : money(p.setup);
    document.getElementById("result-monthly").textContent = upfront ? "None" : money(p.monthly) + " × 24";
    document.getElementById("result-total").textContent = money(upfront ? p.packagePrice : monthlyTotal);
    document.getElementById("total-label").textContent = upfront ? "One-time package price" : "Total over 24 months";
    document.getElementById("payment-explanation").textContent = upfront
      ? "Pay " + money(p.packagePrice) + " once. No additional installation/admin fee or monthly subscription. This option excludes Koetsa office monitoring and coordinated SOS emergency response."
      : "Pay " + money(p.setup) + " once, followed by 24 monthly payments of " + money(p.monthly) + ". This is an ongoing service subscription with SOS response coordination while your account is active.";'''
if old_calc not in js:
    sys.exit('Stopped safely: expected calculator logic not found.')
js = js.replace(old_calc, new_calc, 1)

old_summary = '''    const plan = appPayment.value === "upfront" ? "Full 24-month upfront payment" : "Monthly subscription";
    summary.textContent = "Selected: " + p.name + " · " + plan + " · 24-month contract · " +
      (appPayment.value === "upfront" ? money(p.setup + p.monthly*24) + " payable upfront." :
      money(p.setup) + " once-off + " + money(p.monthly) + " per month.");'''
new_summary = '''    const upfront = appPayment.value === "upfront";
    summary.textContent = "Selected: " + p.name + " · " +
      (upfront ? "Package price paid once: " + money(p.packagePrice) + ". No monthly service or Koetsa-coordinated SOS response." :
      money(p.setup) + " once-off + " + money(p.monthly) + "/month for 24 months (" + money(p.setup + p.monthly*24) + " total). Active monthly subscription includes SOS response coordination.");'''
if old_summary not in js:
    sys.exit('Stopped safely: expected application-summary logic not found.')
js = js.replace(old_summary, new_summary, 1)

js = js.replace('const total = p.setup + p.monthly * 24;', 'const total = isUpfront ? p.packagePrice : p.setup + p.monthly * 24;', 1)
js = js.replace('''"Payment option: " + (isUpfront ? "Full 24-month amount upfront" : "Monthly subscription for 24 months"),
      "Once-off installation + administration: " + money(p.setup),
      "Monthly subscription: " + money(p.monthly), "24-month total: " + money(total),''',
'''"Payment option: " + (isUpfront ? "Full package price upfront — no extra fees" : "Monthly protection subscription for 24 months"),
      "Once-off installation + administration: " + (isUpfront ? "M0 — no extra fee" : money(p.setup)),
      "Monthly subscription: " + (isUpfront ? "None" : money(p.monthly)),
      (isUpfront ? "Package price paid once: " : "Total over 24 months: ") + money(total),
      "Service distinction: " + (isUpfront ? "No Koetsa office monitoring or coordinated SOS emergency response." : "Ongoing service and SOS emergency-response coordination while the account is active."),''', 1)

# Add responsive styling for the new service and response sections.
css_path = root / 'assets/css/style.css'
if not css_path.exists():
    sys.exit('Stopped safely: assets/css/style.css was not found.')
css = css_path.read_text(encoding='utf-8')
css_marker = '/* KOETSA OPERATIONS CENTRE AND SOS RESPONSE */'
css_addition = """

/* KOETSA OPERATIONS CENTRE AND SOS RESPONSE */
.operations-feature,.response-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:center;margin:30px 0}
.operations-feature img,.response-image img{display:block;width:100%;height:100%;max-height:440px;object-fit:cover;border-radius:10px;border:2px solid var(--red);box-shadow:0 15px 35px rgba(0,0,0,.14)}
.operations-copy,.response-copy,.arrears-policy{background:#fff;border:1px solid var(--line);border-radius:10px;padding:28px;box-shadow:0 12px 32px rgba(15,23,42,.05)}
.operations-copy h3,.response-copy h3,.arrears-policy h3{font-size:25px;line-height:1.2;margin:8px 0 12px;color:var(--ink)}
.response-steps{padding-left:22px;display:grid;gap:14px}
.response-steps li{padding-left:5px;color:var(--red-dark)}
.response-steps li strong,.response-steps li span{display:block;color:var(--ink)}
.response-steps li span{font-size:14px;color:#596579}
.response-included{padding:14px;background:#fff0f0;border-left:4px solid var(--red);font-weight:800;color:#7e1820}
.image-caption{font-size:11px;color:var(--muted);line-height:1.5}
.arrears-policy{max-width:900px;margin:auto;border-left:4px solid var(--red)}
@media(max-width:760px){.operations-feature,.response-grid{grid-template-columns:1fr}.operations-copy,.response-copy,.arrears-policy{padding:21px}}
"""
if css_marker not in css:
    css_path.with_suffix('.css.before-koetsa-service-update.bak').write_text(css, encoding='utf-8')
    css_path.write_text(css + css_addition, encoding='utf-8')

# Save backups and updated files only after every expected replacement succeeded.
shutil.copy2(pricing_path, pricing_path.with_suffix('.html.before-koetsa-service-update.bak'))
shutil.copy2(js_path, js_path.with_suffix('.js.before-koetsa-service-update.bak'))
pricing_path.write_text(pricing, encoding='utf-8')
js_path.write_text(js, encoding='utf-8')
print('Koetsa pricing and service update applied successfully.')
print('Images copied to assets/koetsa-operations-centre.jpg and assets/koetsa-emergency-response.png')
print('Responsive styling added to assets/css/style.css.')
print('Backups created beside pricing.html and assets/js/main.js.')
print('Please review the changes locally before committing and pushing to GitHub.')
